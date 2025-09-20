# アーキテクチャドキュメント

sebas-chanシステムのアーキテクチャに関する技術文書です。

## ドキュメント構成

### 📋 [OVERVIEW.md](OVERVIEW.md)
システム全体のアーキテクチャ概要
- システム構成図
- 主要コンポーネントの概要
- 通信フローとデータフロー
- 情報管理モデル（Input → Issue → Knowledge）

### 🔧 [COMPONENTS.md](COMPONENTS.md)
各コンポーネントの詳細設計
- Core Agent/Core Engine詳細
- Reporters詳細
- DB Bridge詳細
- MCP Server（予定）
- Web UI

### 📌 [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md)
技術的決定事項と選定理由
- 技術スタック
- パッケージ構成
- 設計原則と方針
- 開発ガイドライン

### 🔌 [INTERFACES.md](INTERFACES.md)
インターフェース仕様
- REST APIエンドポイント詳細
- 内部通信プロトコル
- データモデル定義

### 💾 [INFORMATION_MODEL.md](INFORMATION_MODEL.md)
情報モデル定義
- Input、Issue、Knowledge、Flowの定義
- データ構造と関係性
- 永続化戦略

### ⚙️ [CORE_ENGINE_AGENT_SPEC.md](CORE_ENGINE_AGENT_SPEC.md)
Core EngineとCore Agentの詳細仕様
- イベントループ設計
- WorkflowContext仕様
- エラーハンドリング

## クイックリファレンス

| ドキュメント | 内容 | 対象読者 |
|------------|------|---------|
| OVERVIEW | システム全体像 | 全員 |
| COMPONENTS | コンポーネント詳細 | 開発者 |
| TECHNICAL_DECISIONS | 技術選定と方針 | アーキテクト、開発者 |
| INTERFACES | API仕様 | 開発者、連携システム開発者 |
| INFORMATION_MODEL | データモデル | 開発者、データ設計者 |
| CORE_ENGINE_AGENT_SPEC | Core仕様 | Core開発者 |

## 読む順序

1. **新規参加者**: OVERVIEW → TECHNICAL_DECISIONS → COMPONENTS
2. **API連携開発者**: OVERVIEW → INTERFACES
3. **Core開発者**: OVERVIEW → CORE_ENGINE_AGENT_SPEC → COMPONENTS
4. **ワークフロー開発者**: OVERVIEW → [../workflows/](../workflows/)へ

## 関連ドキュメント

- [ワークフロー仕様](../workflows/) - ワークフローアーキテクチャ
- [実装状況](../IMPLEMENTATION_STATUS.md) - 現在の実装状態
- [コンセプト](../CONCEPT.md) - プロジェクトの基本理念