# @sebas-chan/db

sebas-chanシステムのLanceDB統合パッケージ

## 概要

このパッケージは、LanceDBを使用したベクトルストレージと検索機能を提供します。TypeScriptクライアントインターフェースを通じて、Pythonワーカープロセスがで、LanceDB操作を実行します。

## セットアップ

### 依存関係

このパッケージは`uv`を使用してPython依存関係を管理しています。

```bash
# Python依存関係のインストール
cd packages/db
uv sync
```

これにより以下が実行されます：
1. `.venv`に仮想環境を作成
2. `pyproject.toml`からすべてのPython依存関係をインストール
3. Pythonワーカーを使用可能な状態に設定

### 必要なPythonパッケージ

- lancedb: ベクトルデータベース
- pyarrow: データシリアライゼーション
- pandas: データ操作
- numpy: 数値演算
- pydantic: データバリデーション

## アーキテクチャ

```
TypeScriptクライアント (index.ts)
    ↓ JSON-RPC (stdio経由)
Pythonワーカー (lancedb_worker.py)
    ↓ LanceDB API
LanceDBデータベース
```

## テスト

```bash
# 全テストの実行
npm test

# 特定のテストスイートの実行
npm test -- src/db-client.test.ts    # CRUD操作
npm test -- test/python-integration.test.ts  # Python統合
```

### テストカバレッジ

1. **CRUD操作**: Issueの基本的な作成・読み取り・更新・削除操作
2. **スキーマ検証**: データ整合性とスキーマ準拠の確認
3. **ベクトル検索**: 類似度検索機能のテスト（embedding実装後に有効化）
4. **Python統合**: JSON-RPCによるTypeScript-Python通信の検証
5. **エラーハンドリング**: 適切なエラー回復のテスト

## 使用方法

```typescript
import { DBClient } from '@sebas-chan/db';

const client = new DBClient();
await client.connect();

// Issueの作成
const issueId = await client.addIssue({
  title: 'テストIssue',
  description: '説明',
  status: 'open',
  labels: ['bug'],
  updates: [],
  relations: [],
  sourceInputIds: []
});

// Issueの取得
const issue = await client.getIssue(issueId);

// Issueの検索
const results = await client.searchIssues('bug');

// 終了時の切断
await client.disconnect();
```

## 開発

### Pythonワーカー

Pythonワーカー (`src/python/lancedb_worker.py`) の機能：
- LanceDB接続管理
- テーブル管理
- ベクトル操作
- JSON-RPC通信

### TypeScriptクライアント

TypeScriptクライアント (`src/index.ts`) の機能：
- Pythonワーカーのプロセス管理
- 型安全なAPI
- エラーハンドリング
- 自動再接続

## トラブルシューティング

### Python依存関係が見つからない場合

`ModuleNotFoundError: No module named 'lancedb'` が表示される場合：

```bash
cd packages/db
uv sync
```

### Pythonバージョンの問題

このパッケージはPython 3.11以上が必要です。Pythonバージョンを確認：

```bash
python3 --version
```

pyenvを使用している場合、Pythonが利用可能か確認：

```bash
pyenv versions
pyenv global 3.11.13  # または好みのバージョン
```

## 今後の改善予定

- [ ] 実際のembeddingモデルの統合（現在はダミーベクトル使用）
- [ ] ベクトル類似度検索の実装
- [ ] データ永続化の最適化
- [ ] Pythonワーカーのコネクションプーリング
- [ ] より良いエラー回復メカニズム