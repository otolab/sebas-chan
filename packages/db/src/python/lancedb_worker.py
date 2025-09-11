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
# 30m固定で使用
from embedding import create_embedding_model



class LanceDBWorker:
    def __init__(self, db_path: str = "./data/lancedb"):
        """LanceDBワーカーの初期化"""
        Path(db_path).mkdir(parents=True, exist_ok=True)
        self.db = lancedb.connect(db_path)
        self.embedding_model = self._init_embedding_model()
        self.vector_dimension = self.embedding_model.dimension if hasattr(self.embedding_model, 'dimension') else 256
        self.init_tables()
        
    def _init_embedding_model(self):
        """日本語特化のRuriモデルを初期化
        コマンドライン引数または環境変数でモデルを選択
        """
        import os
        # コマンドライン引数から取得（--model=xxx形式）
        model_name = None
        for arg in sys.argv[1:]:
            if arg.startswith('--model='):
                model_name = arg.split('=', 1)[1]
                break
        
        # 環境変数から取得
        if not model_name:
            model_name = os.environ.get('RURI_MODEL', 'cl-nagoya/ruri-v3-30m')
        
        return create_embedding_model(model_name)
    
    def get_issues_schema(self):
        """Issuesテーブルのスキーマを返す"""
        return pa.schema([
            pa.field("id", pa.string()),
            pa.field("title", pa.string()),
            pa.field("description", pa.string()),
            pa.field("status", pa.string()),
            pa.field("labels", pa.list_(pa.string())),
            pa.field("updates", pa.string()),  # JSON文字列として保存
            pa.field("relations", pa.string()),  # JSON文字列として保存
            pa.field("source_input_ids", pa.list_(pa.string())),
            pa.field("vector", pa.list_(pa.float32(), self.vector_dimension))  # ベクトル
        ])
    
    def init_tables(self):
        """必要なテーブルを初期化"""
        # Issues テーブル
        if "issues" not in self.db.table_names():
            self.db.create_table("issues", schema=self.get_issues_schema())
        
        # State文書テーブル
        if "state" not in self.db.table_names():
            schema = pa.schema([
                pa.field("id", pa.string()),
                pa.field("content", pa.string()),
                pa.field("updated_at", pa.timestamp('ms'))
            ])
            self.db.create_table("state", schema=schema)
            # 初期State文書を作成
            self.db.open_table("state").add([{
                "id": "main",
                "content": "",
                "updated_at": pd.Timestamp.now().floor('ms')
            }])
    
    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """JSON-RPCリクエストを処理"""
        method = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id")
        
        try:
            if method == "addIssue":
                result = self.add_issue(params)
            elif method == "getIssue":
                result = self.get_issue(params.get("id"))
            elif method == "searchIssues":
                result = self.search_issues(params.get("query"))
            elif method == "getState":
                result = self.get_state()
            elif method == "updateState":
                result = self.update_state(params.get("content"))
            elif method == "clearAllIssues":
                result = self.clear_all_issues()
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
    
    def add_issue(self, issue_data: Dict[str, Any]) -> str:
        """Issueを追加"""
        # 必須フィールドの検証
        required_fields = ['id', 'title', 'description', 'status', 'labels', 'updates', 'relations', 'source_input_ids']
        missing_fields = [field for field in required_fields if field not in issue_data]
        
        if missing_fields:
            raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")
        
        # フィールドの型検証
        if not isinstance(issue_data.get('title'), str):
            raise TypeError("Field 'title' must be a string")
        if not isinstance(issue_data.get('description'), str):
            raise TypeError("Field 'description' must be a string")
        if issue_data.get('status') not in ['open', 'closed']:
            raise ValueError("Field 'status' must be 'open' or 'closed'")
        if not isinstance(issue_data.get('labels'), list):
            raise TypeError("Field 'labels' must be a list")
        
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
    
    def clear_all_issues(self) -> bool:
        """すべてのIssueを削除（テスト用）"""
        # 既存のテーブルを削除して再作成
        if "issues" in self.db.table_names():
            self.db.drop_table("issues")
        
        # テーブルを再作成（共通のスキーマを使用）
        self.db.create_table("issues", schema=self.get_issues_schema())
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