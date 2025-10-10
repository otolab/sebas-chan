# sebas-chan

## 概要

「安全なフォーゲッタ」 - ユーザーが安心して情報を忘れることを可能にするAIエージェントシステム。

ユーザーの認知的負荷をAIが肩代わりし、「今、集中すべきこと」に専念できる環境を提供します。

## 開発原則 - 「作りながら考える」

このプロジェクトの開発は、一見矛盾する2つの前提に基づいています：

### 2つの前提

1. **仕様のとおりに作ってください** - 実装は必ず文章化された仕様から作成される（絶対原則）
2. **仕様は確定ではありません** - 仕様は完全ではなく、開発しながら改善される

### 矛盾への対処方法

この矛盾は「作りながら考える」という開発プロセスで解決します：

1. **実装時に問題に直面したら**：
   - 勝手に解決しようとしない（第1原則違反）
   - 作業の手を止める
   - ユーザに相談する

2. **仕様の検討フェーズ**：
   - 実装で発見した問題を報告
   - 仕様の曖昧さ・矛盾・実装不可能な点を明確化
   - ユーザと協議して仕様を改善

3. **改善後の実装フェーズ**：
   - 更新された仕様に従って実装
   - 第1原則「仕様のとおりに作る」に戻る

### 重要な注意点

- **推測での実装は禁止**: 仕様が曖昧な場合は必ず確認
- **創造的解釈は避ける**: 仕様にないものを勝手に追加しない
- **問題の早期報告**: 実装が困難・不可能と判明したら即座に報告

この循環的なプロセスにより、実装と仕様の両方が段階的に改善されます。

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