# sebas-chan

## 概要

「安全なフォーゲッタ」 - ユーザーが安心して情報を忘れることを可能にするAIエージェントシステム。

ユーザーの認知的負荷をAIが肩代わりし、「今、集中すべきこと」に専念できる環境を提供します。

## クイックスタート

```bash
# 開発環境のセットアップ
npm install

# 開発サーバーの起動（別ターミナルで実行）
PORT=3001 npm run dev -w @sebas-chan/server  # APIサーバー（ポート3001）
npm run dev -w @sebas-chan/web-ui             # Web UI（ポート5173）

# ビルド
npm run build

# テスト実行
npm test                                      # 全パッケージ
npm test -w @sebas-chan/server               # 特定パッケージ

# 型チェック・リント
npm run typecheck
npm run lint
```

## プロジェクト構成

- **packages/** - モノレポ配下のパッケージ群
  - **server/** - メインサーバープロセス（REST API、設定管理）
  - **core/** - Core Agentと基本ロジック
  - **db/** - データベースブリッジ層（LanceDB + Python）
  - **shared-types/** - 共通型定義
  - **reporter-sdk/** - レポーターSDK
  - **mcp-server/** - MCPサーバー実装
  - **web-ui/** - SvelteKit Web UI

## ドキュメント

詳細は @docs/README.md を参照してください。

## 主要コンポーネント

### コアシステム
- **Core Agent**: イベントキュー型思考エンジン（@sebas-chan/core）
- **Core Engine**: CoreAgentのラッパー、REST API提供、ワークフロー実行管理（@sebas-chan/server）

### データ層
- **Pond (LanceDB)**: ベクトルDB、イベントストア
  - 日本語対応ベクトル検索（ruri-v3モデル、256次元）
  - DataFusion SQLクエリサポート
  - 全イベント・入力の永続化
- **DB Bridge**: Python/TypeScript間のブリッジ層
- **WorkflowContext**: DB操作の統一インターフェース

### 情報収集・連携
- **Reporters**: 情報収集モジュール群
- **Reporter SDK**: レポーター開発用SDK
- **MCP Server**: 標準化された通信インターフェース（MCP）

### ユーザーインターフェース
- **Web UI**: SvelteKit実装（Pond検索機能実装済み）
- **REST API Server**: エンドポイント提供（ポート3001）

### 共通基盤
- **shared-types**: 共通型定義パッケージ
- **Event System**: 非同期メッセージング基盤

## アクセスURL

- **Web UI**: http://localhost:5173
  - Pond検索: http://localhost:5173/pond
- **API**: http://localhost:3001
  - ヘルスチェック: GET /api/health
  - Pond検索: GET /api/pond
  - 入力投稿: POST /api/inputs

## 現在の状態

Phase 3: ワークフロー実装（完了）
- 関数ベースワークフローアーキテクチャ実装
- 基本ワークフロー実装（A-0〜A-3）
- ワークフロー仕様書・開発者ガイド作成完了

次フェーズ: Phase 4（MCP統合と高度なワークフロー）

## 実装計画

詳細は[ロードマップ](docs/ROADMAP.md)を参照してください。