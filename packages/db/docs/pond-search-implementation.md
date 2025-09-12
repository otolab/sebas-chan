# Pond検索実装仕様

## 概要
Pondデータの検索機能において、ベクトル検索とフィルタリングを組み合わせた高度な検索を実装。

## 技術スタック
- **データベース**: LanceDB (Apache Arrow形式)
- **クエリエンジン**: DataFusion SQL
- **埋め込みモデル**: ruri-v3-30m (256次元)
- **ベクトル検索**: コサイン類似度ベース

## 検索フロー

### 1. フィルタリング（LanceDBレベル）
全てのフィルタはDataFusion SQL構文を使用してデータベースレベルで適用：

```python
# ソースフィルタ
where_conditions.append(f"source = '{source}'")

# 日付フィルタ（CAST関数使用）
where_conditions.append(f"timestamp >= CAST('{date_from}' AS TIMESTAMP)")
where_conditions.append(f"timestamp <= CAST('{date_to}' AS TIMESTAMP)")
```

### 2. ベクトル検索
クエリが指定された場合、埋め込みベクトルを生成して類似度検索：

```python
query_vector = self.embedding_model.encode(query)
search_results = table.search(query_vector)
if where_clause:
    search_results = search_results.where(where_clause)
```

### 3. スコア計算
フィルタリング後のデータセット内で距離を正規化：

```python
# _distanceフィールドから実際の距離を取得
df['distance'] = df['_distance']

# フィルタ後のデータ内での最小・最大値で正規化
min_dist = df['distance'].min()
max_dist = df['distance'].max()
if max_dist > min_dist:
    # 距離を0-1に正規化して反転（近いほど高スコア）
    df['score'] = 1 - ((df['distance'] - min_dist) / (max_dist - min_dist))
else:
    df['score'] = 1.0
```

## 重要な仕様詳細

### スコアと距離の違い
- **distance**: ベクトル間の実際の距離値（生の値）
- **score**: 0-1に正規化された類似度スコア（1が最も類似）

### フィルタ適用のタイミング
- **重要**: 全フィルタはベクトル検索と同時にLanceDBレベルで適用
- これにより、フィルタ後のデータセット内でスコアが適切に正規化される
- パフォーマンスも向上（必要なデータのみ取得）

### DataFusion SQL構文の注意点
- タイムスタンプ比較には`CAST`関数または`TIMESTAMP`関数が必要
- 単純な文字列比較 `timestamp > '2024-01-01'` は動作しない
- 正しい構文：
  - `CAST('2024-01-01T00:00:00' AS TIMESTAMP)`
  - `TIMESTAMP '2024-01-01 00:00:00'`

### ソート順
- ベクトル検索時：スコア順（類似度の高い順）を維持
- 通常検索時：タイムスタンプ降順（新しいものが上）

## UI表示仕様

### 検索UI構成
```
第1行: [検索ボックス] [検索ボタン] [表示件数セレクタ]
第2行: [ソースセレクタ] [開始日] [終了日]
```

### 結果表示
各エントリーに以下を表示：
- ID、ソース、タイムスタンプ
- **スコア**: パーセンテージ表示（例: 🎯 85.3%）
- **距離**: 実数値表示（例: 📏 0.234）

## パフォーマンス最適化

1. **データベースレベルフィルタリング**: 全フィルタをLanceDBで適用
2. **適切なlimit設定**: ベクトル検索時は2000件まで取得
3. **インデックス活用**: LanceDBの内部インデックスを活用

## 今後の改善可能性

1. **ハイブリッド検索**: ベクトル検索とキーワード検索の組み合わせ
2. **フィルタのキャッシング**: 頻繁に使用されるフィルタ結果のキャッシュ
3. **より高度な埋め込みモデル**: ruri-v3-310m（768次元）への切り替え

## 参考資料
- [LanceDB Filtering Documentation](https://lancedb.com/docs/search/filtering/)
- [DataFusion SQL Data Types](https://datafusion.apache.org/user-guide/sql/data_types.html)
- [LanceDB Multivector Search](https://lancedb.com/docs/search/multivector-search/)