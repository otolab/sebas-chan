#!/usr/bin/env python3
"""
LanceDB JSON-RPC Worker
標準入出力を介してTypeScriptと通信するPythonワーカー
"""

import sys
import json
import traceback
from typing import Any, Dict, Optional, List
import lancedb
import pyarrow as pa
import pandas as pd
from pathlib import Path

# 埋め込みモデルをインポート
from embedding import create_embedding_model
# スキーマ定義をインポート
from schemas import (
    get_issues_schema, get_state_schema, get_pond_schema,
    ISSUES_TABLE, STATE_TABLE, POND_TABLE, ALL_TABLES,
    validate_issue
)



class LanceDBWorker:
    def __init__(self, db_path: str = "./data/lancedb"):
        """LanceDBワーカーの初期化"""
        Path(db_path).mkdir(parents=True, exist_ok=True)
        self.db = lancedb.connect(db_path)
        
        # モデルを初期化（まだロードしない）
        model_name = self._get_model_name()
        self.embedding_model = create_embedding_model(model_name)
        self.vector_dimension = self.embedding_model.dimension if hasattr(self.embedding_model, 'dimension') else 256
        self.init_tables()
        
    def _get_model_name(self):
        """モデル名を取得
        
        Returns:
            モデル名
        """
        # コマンドライン引数からモデル名を取得（--model=xxx形式）
        model_name = None
        for arg in sys.argv[1:]:
            if arg.startswith('--model='):
                model_name = arg.split('=', 1)[1]
                break
        
        # デフォルトモデル名
        if not model_name:
            model_name = 'cl-nagoya/ruri-v3-30m'
        
        return model_name
    
    def init_tables(self):
        """必要なテーブルを初期化"""
        # Issues テーブル
        if ISSUES_TABLE not in self.db.table_names():
            self.db.create_table(ISSUES_TABLE, schema=get_issues_schema(self.vector_dimension))
        
        # State文書テーブル  
        if STATE_TABLE not in self.db.table_names():
            self.db.create_table(STATE_TABLE, schema=get_state_schema())
            # 初期State文書を作成
            self.db.open_table(STATE_TABLE).add([{
                "id": "main",
                "content": "",
                "updated_at": pd.Timestamp.now().floor('ms')
            }])
        else:
            # State文書テーブルが既に存在する場合、mainレコードがなければ作成
            table = self.db.open_table(STATE_TABLE)
            result = table.search().where("id = 'main'").limit(1).to_list()
            if not result:
                table.add([{
                    "id": "main",
                    "content": "",
                    "updated_at": pd.Timestamp.now().floor('ms')
                }])
        
        # Pond テーブル
        if POND_TABLE not in self.db.table_names():
            self.db.create_table(POND_TABLE, schema=get_pond_schema(self.vector_dimension))
    
    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """JSON-RPCリクエストを処理"""
        method = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id")
        
        try:
            if method == "initModel":
                result = self.init_model()
            elif method == "addIssue":
                result = self.add_issue(params)
            elif method == "getIssue":
                result = self.get_issue(params.get("id"))
            elif method == "searchIssues":
                result = self.search_issues(params.get("query"))
            elif method == "getState":
                result = self.get_state()
            elif method == "updateState":
                result = self.update_state(params.get("content"))
            elif method == "addPondEntry":
                result = self.add_pond_entry(params)
            elif method == "getPondEntry":
                result = self.get_pond_entry(params.get("id"))
            elif method == "searchPond":
                result = self.search_pond(params.get("query", ""), params.get("limit", 10))
            elif method == "clearDatabase":
                result = self.clear_database()
            else:
                raise ValueError(f"Unknown method: {method}")
            
            return {
                "jsonrpc": "2.0",
                "result": result,
                "id": request_id
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32603,
                    "message": str(e),
                    "data": traceback.format_exc()
                },
                "id": request_id
            }
    
    def init_model(self) -> bool:
        """モデルを初期化
        
        Returns:
            初期化に成功した場合True
        """
        success = self.embedding_model.initialize()
        if success:
            sys.stderr.write("Model initialized successfully\n")
        else:
            sys.stderr.write("Model initialization failed\n")
        return success
    
    def add_issue(self, issue_data: Dict[str, Any]) -> str:
        """Issueを追加"""
        # バリデーション
        validate_issue(issue_data)
        
        # titleとdescriptionを結合してベクトル化
        text_to_embed = f"{issue_data['title']} {issue_data['description']}"
        issue_data["vector"] = self.embedding_model.encode(text_to_embed)
        
        table = self.db.open_table("issues")
        table.add([issue_data])
        return issue_data["id"]
    
    def get_issue(self, issue_id: str) -> Optional[Dict[str, Any]]:
        """IDでIssueを取得"""
        table = self.db.open_table("issues")
        results = table.search().where(f"id = '{issue_id}'").limit(1).to_list()
        if results:
            result = results[0]
            # ndarrayをリストに変換
            if 'vector' in result and hasattr(result['vector'], 'tolist'):
                result['vector'] = result['vector'].tolist()
            if 'labels' in result and hasattr(result['labels'], 'tolist'):
                result['labels'] = result['labels'].tolist()
            if 'source_input_ids' in result and hasattr(result['source_input_ids'], 'tolist'):
                result['source_input_ids'] = result['source_input_ids'].tolist()
            return result
        return None
    
    def search_issues(self, query: str, use_vector: bool = True, limit: int = 10) -> list:
        """Issueを検索（ベクトル検索またはテキスト検索）"""
        table = self.db.open_table("issues")
        
        if query and use_vector:
            # ベクトル検索
            try:
                # クエリをベクトル化
                query_vector = self.embedding_model.encode(query)
                
                # LanceDBのベクトル検索（距離も含む）
                results = table.search(query_vector).limit(limit).to_list()
            except Exception as e:
                # ベクトル検索が失敗したらテキスト検索にフォールバック
                sys.stderr.write(f"Vector search failed, falling back to text search: {e}\n")
                results = self._text_search(table, query)
        else:
            # テキスト検索
            results = self._text_search(table, query)
        
        # ndarrayをリストに変換
        for record in results:
            # vectorフィールドをリストに変換
            if 'vector' in record and hasattr(record['vector'], 'tolist'):
                record['vector'] = record['vector'].tolist()
            # labelsフィールドをリストに変換
            if 'labels' in record and hasattr(record['labels'], 'tolist'):
                record['labels'] = record['labels'].tolist()
            # source_input_idsフィールドをリストに変換
            if 'source_input_ids' in record and hasattr(record['source_input_ids'], 'tolist'):
                record['source_input_ids'] = record['source_input_ids'].tolist()
        
        return results
    
    def _text_search(self, table, query: str) -> list:
        """テキストベースの検索（フォールバック）"""
        results = table.to_pandas()
        if query:
            mask = results['title'].str.contains(query, case=False, na=False)
            results = results[mask]
        return results.to_dict('records')
    
    def get_state(self) -> str:
        """State文書を取得"""
        table = self.db.open_table("state")
        result = table.search().where("id = 'main'").limit(1).to_list()
        return result[0]["content"] if result else ""
    
    def update_state(self, content: str) -> bool:
        """State文書を更新"""
        table = self.db.open_table("state")
        # LanceDBは更新をサポートしないため、削除して再挿入
        table.delete("id = 'main'")
        # ミリ秒精度のタイムスタンプに変換
        table.add([{
            "id": "main",
            "content": content,
            "updated_at": pd.Timestamp.now().floor('ms')
        }])
        return True
    
    def add_pond_entry(self, entry_data: dict) -> bool:
        """Pondエントリーを追加"""
        # テキストコンテンツからベクトルを生成
        if self.embedding_model.is_loaded:
            vector = self.embedding_model.encode(entry_data["content"])
            entry_data["vector"] = vector.tolist() if hasattr(vector, 'tolist') else vector
        else:
            # モデルが読み込まれていない場合はダミーベクトル
            entry_data["vector"] = [0.0] * self.vector_dimension
        
        # タイムスタンプをパース
        if isinstance(entry_data.get("timestamp"), str):
            entry_data["timestamp"] = pd.Timestamp(entry_data["timestamp"]).floor('ms')
        
        table = self.db.open_table(POND_TABLE)
        table.add([entry_data])
        return True
    
    def get_pond_entry(self, entry_id: str) -> Optional[dict]:
        """PondエントリーをIDで取得"""
        table = self.db.open_table(POND_TABLE)
        result = table.search().where(f"id = '{entry_id}'").limit(1).to_list()
        if result:
            entry = result[0]
            # ベクトルをリストに変換
            if 'vector' in entry and hasattr(entry['vector'], 'tolist'):
                entry['vector'] = entry['vector'].tolist()
            # タイムスタンプをISO形式に変換
            if 'timestamp' in entry:
                entry['timestamp'] = entry['timestamp'].isoformat()
            return entry
        return None
    
    def search_pond(self, query: str, limit: int = 10) -> list:
        """Pondエントリーを検索"""
        table = self.db.open_table(POND_TABLE)
        
        # ベクトル検索
        if query and self.embedding_model.is_loaded:
            try:
                query_vector = self.embedding_model.encode(query)
                results = table.search(query_vector).limit(limit).to_list()
            except Exception as e:
                # ベクトル検索が失敗したらテキスト検索にフォールバック
                sys.stderr.write(f"Vector search failed, falling back to text search: {e}\n")
                results = self._pond_text_search(table, query, limit)
        else:
            # テキスト検索
            results = self._pond_text_search(table, query, limit)
        
        # 結果を整形
        for record in results:
            # vectorフィールドをリストに変換
            if 'vector' in record and hasattr(record['vector'], 'tolist'):
                record['vector'] = record['vector'].tolist()
            # タイムスタンプをISO形式に変換
            if 'timestamp' in record:
                record['timestamp'] = record['timestamp'].isoformat()
        
        return results
    
    def _pond_text_search(self, table, query: str, limit: int) -> list:
        """Pondテーブルのテキストベース検索"""
        results = table.to_pandas()
        if query:
            mask = results['content'].str.contains(query, case=False, na=False)
            results = results[mask]
        results = results.head(limit)
        return results.to_dict('records')
    
    def clear_database(self) -> bool:
        """データベース全体をクリア（テスト用）"""
        # すべてのテーブルを削除
        for table_name in ALL_TABLES:
            if table_name in self.db.table_names():
                self.db.drop_table(table_name)
        
        # テーブルを再作成
        self.init_tables()
        return True
    
    def run(self):
        """メインループ - stdinからリクエストを読み取り、stdoutに応答を書き込む"""
        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                
                request = json.loads(line.strip())
                response = self.handle_request(request)
                
                sys.stdout.write(json.dumps(response) + "\n")
                sys.stdout.flush()
                
            except json.JSONDecodeError:
                # 不正なJSONは無視
                continue
            except KeyboardInterrupt:
                break
            except Exception as e:
                # エラーをログに記録
                sys.stderr.write(f"Error: {e}\n")
                sys.stderr.flush()

if __name__ == "__main__":
    worker = LanceDBWorker()
    worker.run()