# API・インターフェースドキュメント

sebas-chanシステムのAPI仕様とインターフェース定義です。

## 📚 ドキュメント一覧

| ドキュメント                                     | 内容                             | 対象読者 |
| ------------------------------------------------ | -------------------------------- | -------- |
| [INTERNAL_INTERFACES.md](INTERNAL_INTERFACES.md) | 内部モジュール間インターフェース | 開発者   |

## 🎯 今後追加予定

### Phase 4以降

- **REST_API.md** - REST APIエンドポイント仕様
- **CLIENT_SDK.md** - クライアントSDK使用方法
- **MCP_INTERFACE.md** - MCP (Model Context Protocol) 仕様

## 📍 現在のAPIエンドポイント

### ヘルス・状態管理

- `GET /api/health` - ヘルスチェック
- `GET /api/state` - システム状態取得

### データ操作

- `GET /api/pond` - Pond検索
- `POST /api/inputs` - 入力投稿
- `GET /api/knowledge` - Knowledge検索
- `GET /api/issues/:id` - Issue詳細取得

### システム管理

- `GET /api/logs` - ワークフローログ取得
- `POST /api/request` - 自然言語リクエスト処理

## 🔗 関連ドキュメント

- [システム設計](../design/) - アーキテクチャ全体像
- [ワークフロー](../workflows/) - ワークフロー仕様
- [データ設計](../data/) - データモデル定義
