# Pond フィルタリング・検索仕様

## 概要
Pondエントリの検索・フィルタリング機能を全レイヤーで統一的に実装する。

## 検索・フィルタリング要件

### 検索条件
1. **テキスト検索** (`q: string`)
   - 対象フィールド: content, id, source
   - 部分一致検索（大文字小文字を区別しない）

2. **ソースフィルタ** (`source: string`)
   - 特定のReporter種類でフィルタリング
   - 完全一致

3. **日付範囲フィルタ** 
   - `dateFrom: Date | string` - 開始日時（含む）
   - `dateTo: Date | string` - 終了日時（含む）

4. **ページネーション**
   - `limit: number` - 取得件数（デフォルト: 20）
   - `offset: number` - スキップ件数（デフォルト: 0）

### ソート
- タイムスタンプ降順（新しいものが上）

### レスポンス形式
```typescript
{
  data: PondEntry[],     // フィルタリング・ページング適用後のデータ
  meta: {
    total: number,       // フィルタリング後の総件数
    limit: number,       // 適用されたlimit
    offset: number,      // 適用されたoffset
    hasMore: boolean     // 次のページがあるか
  }
}
```

## 実装レイヤー

### 1. DB層 (packages/db)
- `PondDatabase.searchWithFilters()` メソッドを追加
- Python DBドライバにも同等の機能を実装

### 2. Core層 (packages/core)
- `CoreEngine.searchPondWithFilters()` メソッドを追加
- フィルタリングオプションをDBに委譲

### 3. Server層 (packages/server)
- `GET /api/pond` - 高度なフィルタリング機能付き
- `GET /api/pond/sources` - 利用可能なソース一覧

### 4. Web UI層
- サーバーサイドフィルタリングを使用
- クライアントサイドフィルタリングは廃止

## 互換性
- 既存の `searchPond(query, limit)` メソッドは維持
- 新しいフィルタリング機能は追加メソッドとして実装