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
    get_issues_schema, get_state_schema, get_pond_schema, get_schedules_schema,
    ISSUES_TABLE, STATE_TABLE, POND_TABLE, SCHEDULES_TABLE, ALL_TABLES,
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
        try:
            # テーブル名を再取得して最新の状態を確認
            existing_tables = self.db.table_names()

            # Issues テーブル
            if ISSUES_TABLE not in existing_tables:
                try:
                    self.db.create_table(ISSUES_TABLE, schema=get_issues_schema(self.vector_dimension))
                except ValueError as e:
                    if "already exists" not in str(e):
                        raise
                    # テーブルが既に存在する場合は無視（並行実行時の競合状態対策）
                    sys.stderr.write(f"Warning: Table {ISSUES_TABLE} already exists, skipping creation\n")
                    sys.stderr.flush()

            # State文書テーブル
            if STATE_TABLE not in existing_tables:
                try:
                    self.db.create_table(STATE_TABLE, schema=get_state_schema())
                    # 初期State文書を作成
                    self.db.open_table(STATE_TABLE).add([{
                        "id": "main",
                        "content": "",
                        "updated_at": pd.Timestamp.now().floor('ms')
                    }])
                except ValueError as e:
                    if "already exists" not in str(e):
                        raise
                    # テーブルが既に存在する場合、mainレコードがなければ作成
                    sys.stderr.write(f"Warning: Table {STATE_TABLE} already exists, checking main record\n")
                    sys.stderr.flush()
                    table = self.db.open_table(STATE_TABLE)
                    result = table.search().where("id = 'main'").limit(1).to_list()
                    if not result:
                        table.add([{
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
            if POND_TABLE not in existing_tables:
                try:
                    self.db.create_table(POND_TABLE, schema=get_pond_schema(self.vector_dimension))
                except ValueError as e:
                    if "already exists" not in str(e):
                        raise
                    # テーブルが既に存在する場合は無視（並行実行時の競合状態対策）
                    sys.stderr.write(f"Warning: Table {POND_TABLE} already exists, skipping creation\n")
                    sys.stderr.flush()

            # Schedules テーブル
            if SCHEDULES_TABLE not in existing_tables:
                try:
                    self.db.create_table(SCHEDULES_TABLE, schema=get_schedules_schema())
                except ValueError as e:
                    if "already exists" not in str(e):
                        raise
                    # テーブルが既に存在する場合は無視（並行実行時の競合状態対策）
                    sys.stderr.write(f"Warning: Table {SCHEDULES_TABLE} already exists, skipping creation\n")
                    sys.stderr.flush()

        except Exception as e:
            # テーブル初期化エラーをログに出力してから再raise
            sys.stderr.write(f"Error initializing tables: {str(e)}\n")
            sys.stderr.write(f"Traceback: {traceback.format_exc()}\n")
            sys.stderr.flush()
            raise
    
    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """JSON-RPCリクエストを処理"""
        method = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id")
        
        try:
            if method == "ping":
                result = self.ping()
            elif method == "initModel":
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
                result = self.search_pond(params)
            elif method == "getPondSources":
                result = self.get_pond_sources()
            elif method == "addSchedule":
                result = self.add_schedule(params)
            elif method == "getSchedule":
                result = self.get_schedule(params.get("id"))
            elif method == "updateSchedule":
                result = self.update_schedule(params.get("id"), params.get("updates", {}))
            elif method == "searchSchedules":
                result = self.search_schedules(params)
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
    
    def ping(self) -> Dict[str, Any]:
        """ヘルスチェック用のping
        
        Returns:
            ステータス情報を含む辞書
        """
        return {
            "status": "ok",
            "model_loaded": self.embedding_model.is_loaded if hasattr(self.embedding_model, 'is_loaded') else False,
            "tables": self.db.table_names(),
            "vector_dimension": self.vector_dimension
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
        # contextを含めてベクトル生成用のテキストを構築
        if self.embedding_model.is_loaded:
            # contextがある場合は含めてベクトル化
            if entry_data.get("context"):
                text_to_embed = f"Context: {entry_data['context']}\nContent: {entry_data['content']}"
            else:
                text_to_embed = entry_data["content"]

            vector = self.embedding_model.encode(text_to_embed)
            entry_data["vector"] = vector.tolist() if hasattr(vector, 'tolist') else vector
        else:
            # モデルが読み込まれていない場合はダミーベクトル
            entry_data["vector"] = [0.0] * self.vector_dimension

        # タイムスタンプをパース
        if isinstance(entry_data.get("timestamp"), str):
            entry_data["timestamp"] = pd.Timestamp(entry_data["timestamp"]).floor('ms')

        # metadataがdict型の場合はJSON文字列に変換
        if isinstance(entry_data.get("metadata"), dict):
            import json
            entry_data["metadata"] = json.dumps(entry_data["metadata"], ensure_ascii=False)

        # contextとmetadataのデフォルト値を設定（nullableフィールド）
        if "context" not in entry_data:
            entry_data["context"] = ""
        if "metadata" not in entry_data:
            entry_data["metadata"] = "{}"

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
            # metadataをJSONからdictに変換
            if 'metadata' in entry and isinstance(entry['metadata'], str):
                import json
                try:
                    entry['metadata'] = json.loads(entry['metadata'])
                except json.JSONDecodeError:
                    entry['metadata'] = {}
            return entry
        return None
    
    def search_pond(self, filters: dict) -> dict:
        """Pondエントリーを高度なフィルタで検索（ベクトル検索優先）
        
        LanceDBはDataFusionクエリエンジンを使用しているため、
        where句でDataFusion SQLの構文が利用可能：
        - 文字列比較: source = 'value'
        - IN句: source IN ('a', 'b', 'c')
        - タイムスタンプ比較: CAST('2024-01-01T00:00:00' AS TIMESTAMP)
        - TIMESTAMP関数: TIMESTAMP '2024-01-01 00:00:00'
        - その他のSQL関数: https://datafusion.apache.org/user-guide/sql/
        """
        table = self.db.open_table(POND_TABLE)
        
        # パラメータの取得
        query = filters.get('q', '')
        source = filters.get('source')
        context = filters.get('context')  # contextフィルタを追加
        date_from = filters.get('dateFrom')
        date_to = filters.get('dateTo')
        limit = filters.get('limit', 20)
        offset = filters.get('offset', 0)

        # ベクトル検索かどうかのフラグ
        is_vector_search = False

        # ステップ1: LanceDBレベルでのフィルタリング（DataFusion SQL構文使用）
        where_conditions = []
        if source:
            where_conditions.append(f"source = '{source}'")
        if context:
            # contextの部分一致検索（LIKE句）
            where_conditions.append(f"context LIKE '%{context}%'")
        if date_from:
            # CAST関数を使用してタイムスタンプを比較
            where_conditions.append(f"timestamp >= CAST('{date_from}' AS TIMESTAMP)")
        if date_to:
            # CAST関数を使用してタイムスタンプを比較
            where_conditions.append(f"timestamp <= CAST('{date_to}' AS TIMESTAMP)")

        where_clause = " AND ".join(where_conditions) if where_conditions else None

        # ステップ2: ベクトル検索またはテーブル全体の取得
        if query and self.embedding_model.is_loaded:
            try:
                # contextがある場合は検索クエリに含める
                if context:
                    query_text = f"Context: {context}\nContent: {query}"
                else:
                    query_text = query

                # ベクトル検索で類似度の高い順に多めに取得
                query_vector = self.embedding_model.encode(query_text)
                # フィルタを適用してベクトル検索
                search_results = table.search(query_vector)
                if where_clause:
                    search_results = search_results.where(where_clause)
                # 十分な件数を取得（日付フィルタ後の件数を確保するため）
                search_results = search_results.limit(2000)
                
                # to_pandas()を使って距離情報を含むデータフレームを取得
                df = search_results.to_pandas()
                is_vector_search = True
                
                # _distanceフィールドが存在する場合はそれを使用
                if '_distance' in df.columns:
                    df['distance'] = df['_distance']
                else:
                    # 距離情報がない場合は順位ベースで推定
                    df['distance'] = df.index * 0.1  # 順位に基づく仮の距離
            except Exception as e:
                sys.stderr.write(f"Vector search failed, falling back to full data: {e}\n")
                df = table.to_pandas()
                if source:
                    df = df[df['source'] == source]
                is_vector_search = False
        else:
            # 全データを取得（LanceDBのフィルタ適用）
            try:
                # LanceDBのsearchメソッドを使用してフィルタリング
                search_results = table.search()
                if where_clause:
                    search_results = search_results.where(where_clause)
                # 十分な件数を取得
                df = search_results.limit(2000).to_pandas()
            except:
                # フォールバック：通常のpandasフィルタリング
                df = table.to_pandas()
                if source:
                    df = df[df['source'] == source]
            is_vector_search = False
        
        # ステップ3: スコア計算（フィルタリング後のデータセットに対して）
        if is_vector_search and 'distance' in df.columns and len(df) > 0:
            # 距離の最小値と最大値で正規化してスコアを計算
            # フィルタリング後のデータセット内での正規化
            min_dist = df['distance'].min()
            max_dist = df['distance'].max()
            if max_dist > min_dist:
                # 距離を0-1に正規化して反転（近いほど高スコア）
                df['score'] = 1 - ((df['distance'] - min_dist) / (max_dist - min_dist))
            else:
                # 全て同じ距離の場合
                df['score'] = 1.0
        elif is_vector_search:
            # ベクトル検索だが距離情報がない場合
            if len(df) > 1:
                df['score'] = 1 - (df.index / (len(df) - 1)) * 0.5  # 最低でも0.5
            elif len(df) == 1:
                df['score'] = 1.0
            else:
                df['score'] = pd.Series(dtype=float)  # 空のSeries
        
        # ステップ4: ソート（ベクトル検索の場合はスコア順を維持、それ以外はタイムスタンプ順）
        if not is_vector_search:
            # タイムスタンプで降順ソート（新しいものが上）
            df = df.sort_values('timestamp', ascending=False)
        
        # 総件数を保持
        total_count = len(df)
        
        # ページネーション適用
        df_paginated = df.iloc[offset:offset + limit]
        
        # 結果を辞書のリストに変換
        results = df_paginated.to_dict('records')
        
        # 結果を整形
        for record in results:
            # vectorフィールドをリストに変換
            if 'vector' in record and hasattr(record['vector'], 'tolist'):
                record['vector'] = record['vector'].tolist()
            # タイムスタンプをISO形式に変換
            if 'timestamp' in record:
                record['timestamp'] = record['timestamp'].isoformat()
            # metadataをJSONからdictに変換
            if 'metadata' in record and isinstance(record['metadata'], str):
                import json
                try:
                    record['metadata'] = json.loads(record['metadata'])
                except json.JSONDecodeError:
                    record['metadata'] = {}
            # _distanceフィールドは除去しない（デバッグ用に残す）
        
        return {
            'data': results,
            'meta': {
                'total': total_count,
                'limit': limit,
                'offset': offset,
                'hasMore': offset + limit < total_count
            }
        }
    
    def get_pond_sources(self) -> list:
        """利用可能なPondソース一覧を取得"""
        table = self.db.open_table(POND_TABLE)
        df = table.to_pandas()

        # ユニークなソース一覧を取得してソート
        sources = sorted(df['source'].unique().tolist())
        return sources

    def add_schedule(self, schedule_data: Dict[str, Any]) -> str:
        """スケジュールを追加

        Args:
            schedule_data: スケジュールデータ

        Returns:
            追加されたスケジュールのID
        """
        table = self.db.open_table(SCHEDULES_TABLE)

        # IDが指定されていない場合は生成
        if 'id' not in schedule_data:
            schedule_data['id'] = f"schedule-{pd.Timestamp.now().value}"

        # タイムスタンプフィールドの処理
        for field in ['next_run', 'last_run', 'created_at', 'updated_at']:
            if field in schedule_data and schedule_data[field]:
                if isinstance(schedule_data[field], str):
                    schedule_data[field] = pd.Timestamp(schedule_data[field])

        # デフォルト値の設定
        if 'created_at' not in schedule_data:
            schedule_data['created_at'] = pd.Timestamp.now().floor('ms')
        if 'updated_at' not in schedule_data:
            schedule_data['updated_at'] = pd.Timestamp.now().floor('ms')

        # テーブルに追加
        table.add([schedule_data])
        return schedule_data['id']

    def get_schedule(self, schedule_id: str) -> Optional[Dict[str, Any]]:
        """スケジュールを取得

        Args:
            schedule_id: スケジュールID

        Returns:
            スケジュールデータ（見つからない場合はNone）
        """
        table = self.db.open_table(SCHEDULES_TABLE)
        result = table.search().where(f"id = '{schedule_id}'").limit(1).to_list()

        if result:
            schedule = result[0]
            # タイムスタンプフィールドをISO形式に変換
            for field in ['next_run', 'last_run', 'created_at', 'updated_at']:
                if field in schedule and schedule[field]:
                    schedule[field] = schedule[field].isoformat()
            return schedule
        return None

    def update_schedule(self, schedule_id: str, updates: Dict[str, Any]) -> bool:
        """スケジュールを更新

        Args:
            schedule_id: スケジュールID
            updates: 更新するフィールド

        Returns:
            更新に成功した場合True
        """
        table = self.db.open_table(SCHEDULES_TABLE)

        # 既存のスケジュールを取得
        existing = self.get_schedule(schedule_id)
        if not existing:
            return False

        # 更新データを準備
        for key, value in updates.items():
            existing[key] = value

        # タイムスタンプフィールドの処理
        for field in ['next_run', 'last_run', 'created_at', 'updated_at']:
            if field in existing and existing[field]:
                if isinstance(existing[field], str):
                    existing[field] = pd.Timestamp(existing[field])

        # 更新日時を更新
        existing['updated_at'] = pd.Timestamp.now().floor('ms')

        # テーブルを更新（LanceDBは直接更新をサポートしないため、削除して再追加）
        df = table.to_pandas()
        df = df[df['id'] != schedule_id]

        # 新しいテーブルを作成
        self.db.drop_table(SCHEDULES_TABLE)
        self.db.create_table(SCHEDULES_TABLE, data=[existing] if len(df) == 0 else pd.concat([df, pd.DataFrame([existing])], ignore_index=True))

        return True

    def search_schedules(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        """スケジュールを検索

        Args:
            filters: 検索フィルタ

        Returns:
            マッチするスケジュールのリスト
        """
        table = self.db.open_table(SCHEDULES_TABLE)
        df = table.to_pandas()

        # フィルタリング
        if 'issue_id' in filters and filters['issue_id']:
            df = df[df['issue_id'] == filters['issue_id']]
        if 'status' in filters and filters['status']:
            df = df[df['status'] == filters['status']]
        if 'action' in filters and filters['action']:
            df = df[df['action'] == filters['action']]

        # ソート（created_atの降順）
        df = df.sort_values('created_at', ascending=False)

        # limitとoffsetの適用
        limit = filters.get('limit', 100)
        offset = filters.get('offset', 0)
        df = df.iloc[offset:offset + limit]

        # 結果を辞書のリストに変換
        results = df.to_dict('records')

        # タイムスタンプフィールドをISO形式に変換
        for record in results:
            for field in ['next_run', 'last_run', 'created_at', 'updated_at']:
                if field in record and record[field]:
                    if hasattr(record[field], 'isoformat'):
                        record[field] = record[field].isoformat()

        return results

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
    # 起動時のデバッグ情報を出力
    import os
    sys.stderr.write(f"[DEBUG] Python worker starting...\n")
    sys.stderr.write(f"[DEBUG] Python version: {sys.version}\n")
    sys.stderr.write(f"[DEBUG] Script path: {__file__}\n")
    sys.stderr.write(f"[DEBUG] Working directory: {os.getcwd()}\n")
    sys.stderr.write(f"[DEBUG] Command line args: {sys.argv}\n")
    sys.stderr.flush()

    try:
        worker = LanceDBWorker()
        sys.stderr.write(f"[DEBUG] Worker initialized successfully\n")
        sys.stderr.flush()
        worker.run()
    except Exception as e:
        sys.stderr.write(f"[ERROR] Failed to initialize worker: {e}\n")
        sys.stderr.write(f"[ERROR] Traceback: {traceback.format_exc()}\n")
        sys.stderr.flush()
        sys.exit(1)