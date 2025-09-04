# sebas-chan

## 概要

「安全なフォーゲッタ」 - ユーザーが安心して情報を忘れることを可能にするAIエージェントシステム。

ユーザーの認知的負荷をAIが肩代わりし、「今、集中すべきこと」に専念できる環境を提供します。

## クイックスタート

```bash
# 開発環境のセットアップ
npm install

# 開発サーバーの起動
npm run dev
```

## プロジェクト構成

- **packages/** - モノレポ配下のパッケージ群
  - **core/** - Core Agentと基本ロジック
  - **db/** - データベースブリッジ層
  - **mcp-server/** - MCPサーバー実装
  - **web/** - SvelteKit Web UI

## ドキュメント

### 設計・アーキテクチャ
- [設計仕様書](docs/ideas/1.設計仕様書.md) - システム全体の設計思想
- [実装に向けた設計方針](docs/ideas/3.実装に向けた設計方針.md) - 実装方針と詳細設計
- [アーキテクチャ詳細](docs/ARCHITECTURE.md) - エージェント構成と通信仕様

### 開発ガイド
- [README](README.md) - プロジェクト概要と開発環境
- [実装状況](docs/IMPLEMENTATION_STATUS.md) - 各フェーズの進捗状況

### 作業指針
- [ドキュメント同期管理](prompts/DOCUMENT_CODE_SYNC.md) - ドキュメントとコードの整合性管理

## 主要コンポーネント

- **Core Agent**: イベントキュー型思考エンジン
- **Reporters**: 情報収集モジュール群
- **MCP Server**: 標準化された通信インターフェース
- **Web UI**: ユーザー向けインターフェース

## 現在の状態

Phase 1: 基盤構築（進行中）

詳細は[実装状況](docs/IMPLEMENTATION_STATUS.md)を参照してください。