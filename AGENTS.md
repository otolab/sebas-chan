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

### 設計・アーキテクチャ
- [設計仕様書](docs/ideas/1.設計仕様書.md) - システム全体の設計思想
- [実装に向けた設計方針](docs/ideas/3.実装に向けた設計方針.md) - 実装方針と詳細設計
- [アーキテクチャ詳細](docs/ARCHITECTURE.md) - エージェント構成と通信仕様
- [インターフェース仕様](docs/INTERFACES.md) - モジュール間の詳細な接続仕様

### 開発ガイド
- [README](README.md) - プロジェクト概要と開発環境
- [実装状況](docs/IMPLEMENTATION_STATUS.md) - 各フェーズの進捗状況

### 作業指針
- [ドキュメント同期管理](prompts/DOCUMENT_CODE_SYNC.md) - ドキュメントとコードの整合性管理

## 主要コンポーネント

- **Core Agent**: イベントキュー型思考エンジン
- **Reporters**: 情報収集モジュール群
- **MCP Server**: 標準化された通信インターフェース
- **Web UI**: ユーザー向けインターフェース（Pond検索機能実装済み）
- **Pond**: ベクトルDB（LanceDB）による知識ベース
  - 日本語対応ベクトル検索（ruri-v3モデル、256次元）
  - DataFusion SQLクエリサポート

## アクセスURL

- **Web UI**: http://localhost:5173
  - Pond検索: http://localhost:5173/pond
- **API**: http://localhost:3001
  - ヘルスチェック: GET /api/health
  - Pond検索: GET /api/pond
  - 入力投稿: POST /api/inputs

## 現在の状態

Phase 2: DBブリッジとReporter SDK実装（進行中）

## 実装計画

詳細は[ロードマップ](docs/ROADMAP.md)を参照してください。