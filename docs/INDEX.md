# sebas-chan ドキュメントインデックス

## 📚 ドキュメント全体マップ

```
docs/
├── README.md                  # プロジェクト全体の概要
├── INDEX.md                   # このファイル（全ドキュメントのインデックス）
├── CONCEPT.md                 # プロジェクトの基本理念
├── ROADMAP.md                 # 開発ロードマップ
├── IMPLEMENTATION_STATUS.md   # 実装状況
├── DOCUMENT_ORGANIZATION_PLAN.md # ドキュメント整理計画
│
├── architecture/              # システムアーキテクチャ
│   ├── README.md             # アーキテクチャドキュメントのインデックス
│   ├── OVERVIEW.md           # システム全体像
│   ├── COMPONENTS.md         # コンポーネント詳細
│   ├── INTERFACES.md         # API仕様
│   ├── INFORMATION_MODEL.md  # 情報モデル（概念）
│   ├── LOW_LEVEL_SCHEMA.md   # 低レベルスキーマ（物理）
│   ├── TECHNICAL_DECISIONS.md # 技術的決定事項
│   └── CORE_ENGINE_AGENT_SPEC.md # Core仕様
│
├── workflows/                 # ワークフローシステム
│   ├── README.md             # ワークフロードキュメントのインデックス
│   ├── SPECIFICATION.md      # 技術仕様書（正式定義）
│   ├── DEVELOPER_GUIDE.md    # 開発者ガイド
│   ├── EVENT_CATALOG.md      # イベントカタログ
│   ├── WORKFLOW_PERSPECTIVE.md # ワークフローの世界観
│   ├── MODULER_PROMPT_GUIDE.md # AI処理ガイド
│   ├── ARCHITECTURE.md       # 実装アーキテクチャ
│   ├── COGNITIVE_WORKFLOWS.md # 認知ワークフロー
│   └── LOGGING_SPEC.md       # ログ仕様
│
├── testing/                   # テスト関連
│   ├── STRATEGY.md          # テスト戦略
│   └── SPECIFICATIONS.md    # テスト仕様
│
├── issues/                    # Issue関連ドキュメント
│   └── （個別Issue文書）
│
└── phases/                    # フェーズ別作業文書
    └── phase3/               # Phase 3作業
        ├── README.md         # Phase 3進捗管理
        ├── （各種設計文書）
        └── archive/          # アーカイブ済み文書

```

## 🎯 目的別ガイド

### 新規参加者向け

1. [CONCEPT.md](CONCEPT.md) - プロジェクトの理念を理解
2. [architecture/OVERVIEW.md](architecture/OVERVIEW.md) - システム全体像を把握
3. [ROADMAP.md](ROADMAP.md) - 開発計画を確認
4. [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) - 現在の実装状況

### ワークフロー開発者向け

1. [workflows/EVENT_CATALOG.md](workflows/EVENT_CATALOG.md) - イベント一覧を確認
2. [workflows/WORKFLOW_PERSPECTIVE.md](workflows/WORKFLOW_PERSPECTIVE.md) - ワークフローの制約と能力
3. [workflows/SPECIFICATION.md](workflows/SPECIFICATION.md) - 技術仕様を理解
4. [workflows/DEVELOPER_GUIDE.md](workflows/DEVELOPER_GUIDE.md) - 開発手順を学習
5. [workflows/MODULER_PROMPT_GUIDE.md](workflows/MODULER_PROMPT_GUIDE.md) - AI処理の実装

### API連携開発者向け

1. [architecture/OVERVIEW.md](architecture/OVERVIEW.md) - システム構成を理解
2. [architecture/INTERFACES.md](architecture/INTERFACES.md) - API仕様を確認
3. [architecture/INFORMATION_MODEL.md](architecture/INFORMATION_MODEL.md) - データモデルを理解

### データベース設計者向け

1. [architecture/INFORMATION_MODEL.md](architecture/INFORMATION_MODEL.md) - 概念モデル
2. [architecture/LOW_LEVEL_SCHEMA.md](architecture/LOW_LEVEL_SCHEMA.md) - 物理スキーマ
3. [phases/phase3/DATABASE_SCHEMA_SPECIFICATION.md](phases/phase3/DATABASE_SCHEMA_SPECIFICATION.md) - 詳細仕様

### Core開発者向け

1. [architecture/CORE_ENGINE_AGENT_SPEC.md](architecture/CORE_ENGINE_AGENT_SPEC.md) - Core仕様
2. [architecture/COMPONENTS.md](architecture/COMPONENTS.md) - コンポーネント詳細
3. [workflows/SPECIFICATION.md](workflows/SPECIFICATION.md) - ワークフロー仕様

## 🔑 重要な定義

### 正式定義の場所（Single Source of Truth）

- **WorkflowContextInterface**: [workflows/SPECIFICATION.md](workflows/SPECIFICATION.md#workflowcontext)
- **WorkflowDefinition**: [workflows/SPECIFICATION.md](workflows/SPECIFICATION.md#workflowdefinition)
- **Event Types**: [workflows/EVENT_CATALOG.md](workflows/EVENT_CATALOG.md)
- **Information Model**: [architecture/INFORMATION_MODEL.md](architecture/INFORMATION_MODEL.md)

### 用語集

| 用語            | 定義                   | 詳細                                                                |
| --------------- | ---------------------- | ------------------------------------------------------------------- |
| **Input**       | 外部からの入力データ   | [INFORMATION_MODEL.md](architecture/INFORMATION_MODEL.md#input)     |
| **Issue**       | 追跡事項・管理対象     | [INFORMATION_MODEL.md](architecture/INFORMATION_MODEL.md#issue)     |
| **Knowledge**   | 抽出された知識         | [INFORMATION_MODEL.md](architecture/INFORMATION_MODEL.md#knowledge) |
| **Pond**        | イベント/入力プール    | [INFORMATION_MODEL.md](architecture/INFORMATION_MODEL.md#pond)      |
| **Workflow**    | イベント駆動処理単位   | [SPECIFICATION.md](workflows/SPECIFICATION.md)                      |
| **Core Engine** | メインサーバープロセス | [CORE_ENGINE_AGENT_SPEC.md](architecture/CORE_ENGINE_AGENT_SPEC.md) |
| **Core Agent**  | 思考エンジン           | [CORE_ENGINE_AGENT_SPEC.md](architecture/CORE_ENGINE_AGENT_SPEC.md) |

## 📊 Phase 3の成果物

### 実装済みワークフロー

- A-0: ProcessUserRequest
- A-1: IngestInput
- A-2: AnalyzeIssueImpact
- A-3: ExtractKnowledge

詳細は[Phase 3 README](phases/phase3/README.md)を参照

### 新規作成ドキュメント

- [EVENT_CATALOG.md](workflows/EVENT_CATALOG.md) - 全イベントの定義
- [WORKFLOW_PERSPECTIVE.md](workflows/WORKFLOW_PERSPECTIVE.md) - ワークフローの世界観
- [LOW_LEVEL_SCHEMA.md](architecture/LOW_LEVEL_SCHEMA.md) - PyArrow/LanceDB仕様

## 🔄 更新履歴

- 2025-09-26: INDEX.md作成、WorkflowContextInterface重複解消
- 2025-09-26: Phase 3.5開始、ドキュメント整理

## 📝 メンテナンス指針

1. **単一情報源の原則**: 定義は一箇所のみ、他は参照
2. **階層的構造**: README → 各ドキュメント → 詳細仕様
3. **相互参照**: 関連ドキュメントへのリンクを明確に
4. **定期的な整理**: phase完了時にarchiveへ移動

---

最終更新: 2025-09-26
