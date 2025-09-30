# 設計・アーキテクチャドキュメント

sebas-chanシステムの設計とアーキテクチャに関する文書です。

## 📚 ドキュメント一覧

| ドキュメント                                           | 内容                         | 対象読者             |
| ------------------------------------------------------ | ---------------------------- | -------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                     | システム全体のアーキテクチャ | 全員                 |
| [COMPONENTS.md](COMPONENTS.md)                         | 各コンポーネントの詳細設計   | 開発者               |
| [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md)       | 技術選定と設計方針           | アーキテクト、開発者 |
| [CORE_ENGINE_AGENT_SPEC.md](CORE_ENGINE_AGENT_SPEC.md) | Core Engine/Agent詳細仕様    | Core開発者           |

## 🎯 読む順序

### 新規参加者

1. **ARCHITECTURE.md** - システム全体像を理解
2. **TECHNICAL_DECISIONS.md** - 技術選定の背景を理解
3. **COMPONENTS.md** - 各コンポーネントの役割を把握

### システム設計者

1. **ARCHITECTURE.md** - 全体アーキテクチャ
2. **COMPONENTS.md** - コンポーネント設計
3. **CORE_ENGINE_AGENT_SPEC.md** - Core詳細

### Core開発者

1. **CORE_ENGINE_AGENT_SPEC.md** - Core仕様
2. **COMPONENTS.md** - 関連コンポーネント
3. **TECHNICAL_DECISIONS.md** - 設計原則

## 🔗 関連ドキュメント

- [ワークフロー開発](../workflows/) - ワークフロー実装
- [API仕様](../api/) - インターフェース定義
- [データ設計](../data/) - データモデル
- [AI統合](../ai/) - AI/プロンプト処理
