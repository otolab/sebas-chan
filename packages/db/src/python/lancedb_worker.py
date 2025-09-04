#!/usr/bin/env python3
"""
LanceDB JSON-RPC Worker
標準入出力を介してTypeScriptと通信するPythonワーカー
"""

import sys
import json
import traceback
from typing import Any, Dict, Optional
import lancedb
import pyarrow as pa
import pandas as pd
from pathlib import Path

class LanceDBWorker:
    def __init__(self, db_path: str = "./data/lancedb"):
        """LanceDBワーカーの初期化"""
        Path(db_path).mkdir(parents=True, exist_ok=True)
        self.db = lancedb.connect(db_path)
        self.init_tables()
    
    def init_tables(self):
        """必要なテーブルを初期化"""
        # Issues テーブル
        if "issues" not in self.db.table_names():
            schema = pa.schema([
                pa.field("id", pa.string()),
                pa.field("title", pa.string()),
                pa.field("description", pa.string()),
                pa.field("status", pa.string()),
                pa.field("labels", pa.list_(pa.string())),
                pa.field("updates", pa.string()),  # JSON文字列として保存
                pa.field("relations", pa.string()),  # JSON文字列として保存
                pa.field("source_input_ids", pa.list_(pa.string())),
                pa.field("vector", pa.list_(pa.float32(), 384))  # ベクトル
            ])
            self.db.create_table("issues", schema=schema)
        
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
                "updated_at": pd.Timestamp.now()
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
        # TODO: ベクトル化の実装
        issue_data["vector"] = [0.0] * 384  # 仮のベクトル
        
        table = self.db.open_table("issues")
        table.add([issue_data])
        return issue_data["id"]
    
    def get_issue(self, issue_id: str) -> Optional[Dict[str, Any]]:
        """IDでIssueを取得"""
        table = self.db.open_table("issues")
        results = table.search().where(f"id = '{issue_id}'").limit(1).to_list()
        return results[0] if results else None
    
    def search_issues(self, query: str) -> list:
        """Issueを検索"""
        table = self.db.open_table("issues")
        # TODO: ベクトル検索の実装
        # 現在はタイトルの部分一致検索
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
        table.add([{
            "id": "main",
            "content": content,
            "updated_at": pd.Timestamp.now()
        }])
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