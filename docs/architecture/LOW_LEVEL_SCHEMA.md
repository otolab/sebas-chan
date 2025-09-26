# 低レベルスキーマ仕様

## 概要

sebas-chanのデータベース実装における低レベルスキーマの詳細仕様。PyArrow、LanceDB、Python/TypeScriptブリッジ層の技術的詳細を記述します。

## アーキテクチャ概要

```
┌────────────────────────────────────────┐
│     TypeScript Application Layer        │
│         (@sebas-chan/core)              │
└────────────────────────────────────────┘
                    │
                    │ JSON over stdio
                    ↓
┌────────────────────────────────────────┐
│        Python Bridge Layer              │
│      (lancedb_worker.py)                │
└────────────────────────────────────────┘
                    │
                    │ PyArrow Tables
                    ↓
┌────────────────────────────────────────┐
│           LanceDB Engine                │
│     (Vector DB + DataFusion SQL)        │
└────────────────────────────────────────┘
```

## PyArrowスキーマ定義

### 1. 型マッピング規則

| PyArrow型 | TypeScript型 | 説明 |
|-----------|-------------|------|
| `pa.string()` | `string` | UTF-8文字列 |
| `pa.int32()` | `number` | 32ビット整数 |
| `pa.float32()` | `number` | 32ビット浮動小数点 |
| `pa.timestamp('ms')` | `Date` | ミリ秒精度のタイムスタンプ |
| `pa.list_(pa.string())` | `string[]` | 文字列配列 |
| `pa.list_(pa.float32(), N)` | `number[]` | 固定長ベクトル |

### 2. Issues Tableスキーマ

```python
def get_issues_schema(vector_dimension: int = 256) -> pa.Schema:
    return pa.schema([
        pa.field("id", pa.string()),
        pa.field("title", pa.string()),
        pa.field("description", pa.string()),
        pa.field("status", pa.string()),
        pa.field("priority", pa.int32()),  # 0-100の整数
        pa.field("labels", pa.list_(pa.string())),
        pa.field("updates", pa.string()),  # JSON文字列
        pa.field("relations", pa.string()),  # JSON文字列
        pa.field("source_input_ids", pa.list_(pa.string())),
        pa.field("created_at", pa.timestamp('ms')),
        pa.field("updated_at", pa.timestamp('ms')),
        pa.field("vector", pa.list_(pa.float32(), vector_dimension))
    ])
```

#### JSON文字列フィールドの構造

**updates (IssueUpdate[])**:
```json
[
  {
    "timestamp": "2025-09-26T12:00:00.000Z",
    "content": "更新内容",
    "author": "user"
  }
]
```

**relations (IssueRelation[])**:
```json
[
  {
    "type": "blocks",
    "targetIssueId": "issue-123"
  }
]
```

### 3. Pond Tableスキーマ

```python
def get_pond_schema(vector_dimension: int = 256) -> pa.Schema:
    return pa.schema([
        pa.field("id", pa.string()),
        pa.field("content", pa.string()),
        pa.field("source", pa.string()),
        pa.field("context", pa.string()),  # nullable
        pa.field("metadata", pa.string()),  # JSON文字列, nullable
        pa.field("timestamp", pa.timestamp('ms')),
        pa.field("vector", pa.list_(pa.float32(), vector_dimension))
    ])
```

#### metadataフィールドの例

```json
{
  "channel": "general",
  "userId": "U123456",
  "sessionId": "sess-789",
  "workflowId": "wf-001",
  "eventType": "DATA_ARRIVED"
}
```

### 4. Knowledge Tableスキーマ

```python
def get_knowledge_schema(vector_dimension: int = 256) -> pa.Schema:
    return pa.schema([
        pa.field("id", pa.string()),
        pa.field("type", pa.string()),
        pa.field("content", pa.string()),
        pa.field("upvotes", pa.int32()),
        pa.field("downvotes", pa.int32()),
        pa.field("sources", pa.string()),  # JSON文字列
        pa.field("created_at", pa.timestamp('ms')),
        pa.field("vector", pa.list_(pa.float32(), vector_dimension))
    ])
```

#### sourcesフィールドの構造

```json
[
  {"type": "issue", "issueId": "issue-123"},
  {"type": "pond", "pondEntryId": "pond-456"},
  {"type": "user_direct"},
  {"type": "knowledge", "knowledgeId": "know-789"}
]
```

### 5. Schedules Tableスキーマ

```python
def get_schedules_schema() -> pa.Schema:
    return pa.schema([
        pa.field("id", pa.string()),
        pa.field("issue_id", pa.string()),
        pa.field("request", pa.string()),
        pa.field("action", pa.string()),
        pa.field("next_run", pa.timestamp('ms')),  # nullable
        pa.field("last_run", pa.timestamp('ms')),  # nullable
        pa.field("pattern", pa.string()),  # nullable
        pa.field("occurrences", pa.int32()),
        pa.field("max_occurrences", pa.int32()),  # nullable
        pa.field("dedupe_key", pa.string()),  # nullable
        pa.field("status", pa.string()),
        pa.field("created_at", pa.timestamp('ms')),
        pa.field("updated_at", pa.timestamp('ms'))
    ])
```

## LanceDB特有の設定

### 1. ベクトルインデックス

```python
# ベクトルインデックスの作成
table.create_index(
    metric="cosine",  # コサイン類似度
    num_partitions=256,
    num_sub_vectors=96,
    index_cache_size=1024
)
```

### 2. ベクトル検索設定

```python
# 検索時の設定
results = table.search(
    query_vector,
    vector_column_name="vector"
).metric("cosine") \
 .nprobes(20) \
 .refine_factor(10) \
 .limit(limit) \
 .to_pandas()
```

### 3. DataFusion SQLサポート

```python
# SQLクエリの例
df = conn.sql("""
    SELECT id, title, description, status, priority
    FROM issues
    WHERE status = 'open'
      AND priority > 50
    ORDER BY priority DESC, created_at DESC
    LIMIT 10
""").to_pandas()
```

## Python/TypeScriptブリッジ層

### 1. 通信プロトコル

```typescript
// TypeScript側 (DBClient)
interface DBRequest {
  action: 'search' | 'insert' | 'update' | 'delete' | 'execute';
  table: string;
  data?: any;
  filter?: any;
  limit?: number;
}

interface DBResponse {
  success: boolean;
  data?: any;
  error?: string;
}
```

### 2. データ変換処理

```python
# Python側 (lancedb_worker.py)
def convert_to_pyarrow(data: dict, schema: pa.Schema) -> dict:
    """TypeScriptデータをPyArrow形式に変換"""
    converted = {}
    for field in schema:
        field_name = field.name
        field_type = field.type

        if field_name in data:
            value = data[field_name]

            # タイムスタンプの変換
            if pa.types.is_timestamp(field_type):
                if isinstance(value, str):
                    value = pd.to_datetime(value)
                elif isinstance(value, (int, float)):
                    value = pd.to_datetime(value, unit='ms')

            # JSON文字列の変換
            elif field_name in ['updates', 'relations', 'metadata', 'sources']:
                if not isinstance(value, str):
                    value = json.dumps(value, ensure_ascii=False)

            converted[field_name] = value

    return converted
```

### 3. ベクトル生成処理

```python
def generate_vector(text: str, model_name: str = "intfloat/multilingual-e5-small") -> List[float]:
    """テキストからベクトルを生成"""
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(model_name)
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()
```

## エラーハンドリング

### 1. スキーマバリデーション

```python
def validate_data(data: dict, schema: pa.Schema) -> None:
    """データがスキーマに適合するか検証"""
    for field in schema:
        if not field.nullable and field.name not in data:
            raise ValueError(f"Required field '{field.name}' is missing")

        if field.name in data:
            value = data[field.name]
            expected_type = field.type

            # 型チェック
            if not is_compatible_type(value, expected_type):
                raise TypeError(
                    f"Field '{field.name}' expects {expected_type}, "
                    f"got {type(value)}"
                )
```

### 2. トランザクション処理

```python
def execute_with_retry(operation, max_retries=3):
    """リトライ機能付きトランザクション実行"""
    for attempt in range(max_retries):
        try:
            return operation()
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(2 ** attempt)  # Exponential backoff
```

## パフォーマンス最適化

### 1. バッチ処理

```python
def batch_insert(table, records: List[dict], batch_size: int = 1000):
    """大量データの効率的な挿入"""
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        df = pd.DataFrame(batch)
        table.add(df)
```

### 2. インデックスの活用

```python
# 複合インデックスの作成
conn.sql("""
    CREATE INDEX idx_issues_status_priority
    ON issues(status, priority DESC)
""")

# カバリングインデックス
conn.sql("""
    CREATE INDEX idx_schedules_issue_status
    ON schedules(issue_id, status)
    INCLUDE (next_run, action)
""")
```

### 3. ベクトル検索の最適化

```python
def optimized_vector_search(table, query_vector, filters=None):
    """最適化されたベクトル検索"""
    search = table.search(query_vector)

    # プレフィルタリングで検索空間を削減
    if filters:
        for key, value in filters.items():
            search = search.where(f"{key} = '{value}'")

    # 段階的な検索
    # 1. 粗い検索で候補を絞る
    coarse_results = search.nprobes(5).limit(100).to_pandas()

    # 2. 候補に対して精密検索
    if len(coarse_results) > 0:
        refined_results = search.nprobes(50).refine_factor(20).limit(10).to_pandas()
        return refined_results

    return coarse_results
```

## メンテナンス

### 1. データベース統計の更新

```python
def update_statistics():
    """テーブル統計の更新"""
    conn.sql("ANALYZE issues")
    conn.sql("ANALYZE pond")
    conn.sql("ANALYZE knowledge")
    conn.sql("ANALYZE schedules")
```

### 2. インデックスの再構築

```python
def rebuild_vector_index(table_name: str):
    """ベクトルインデックスの再構築"""
    table = conn.open_table(table_name)
    table.create_index(
        metric="cosine",
        replace=True,  # 既存インデックスを置換
        num_partitions=256,
        num_sub_vectors=96
    )
```

### 3. データ整合性チェック

```python
def check_data_integrity():
    """データ整合性の検証"""
    # 孤立したScheduleの検出
    orphaned = conn.sql("""
        SELECT s.id
        FROM schedules s
        LEFT JOIN issues i ON s.issue_id = i.id
        WHERE i.id IS NULL
    """).to_pandas()

    if len(orphaned) > 0:
        logger.warning(f"Found {len(orphaned)} orphaned schedules")

    # 重複IDの検出
    duplicates = conn.sql("""
        SELECT id, COUNT(*) as cnt
        FROM issues
        GROUP BY id
        HAVING COUNT(*) > 1
    """).to_pandas()

    if len(duplicates) > 0:
        raise IntegrityError(f"Duplicate IDs found: {duplicates['id'].tolist()}")
```

## 今後の拡張計画

1. **パーティショニング**
   - 時系列データ（Pond）の月次パーティション
   - ステータス別のIssueパーティション

2. **圧縮**
   - 古いPondエントリのZstd圧縮
   - ベクトルの量子化（float32 → int8）

3. **キャッシング**
   - Redis統合による頻繁アクセスデータのキャッシュ
   - ベクトル検索結果のキャッシュ

---

作成日: 2025年9月26日
バージョン: 1.0.0