# ドキュメント再構成計画

## 実施日: 2025-09-19

## 1. 現在の構造の問題点
- ワークフロー関連ドキュメントが散在
- テスト関連ドキュメントが散在
- アーキテクチャ関連ドキュメントが散在
- ルートディレクトリにファイルが多すぎる

## 2. 提案する新構造

```
docs/
├── README.md                    # ドキュメントナビゲーション
├── DOCUMENT_INDEX.md            # 全ドキュメント一覧
├── CONCEPT.md                   # プロジェクトコンセプト（ルートに残す）
├── ROADMAP.md                   # ロードマップ（ルートに残す）
├── IMPLEMENTATION_STATUS.md     # 実装状況（ルートに残す）
│
├── architecture/                # アーキテクチャ関連
│   ├── README.md               # アーキテクチャドキュメントの概要
│   ├── ARCHITECTURE.md         # システムアーキテクチャ
│   ├── SYSTEM_DESIGN.md        # システム設計詳細
│   ├── INTERFACES.md           # インターフェース仕様
│   ├── INFORMATION_MODEL.md    # データモデル
│   └── CORE_ENGINE_AGENT_SPEC.md # Core仕様
│
├── workflows/                   # ワークフロー関連
│   ├── README.md               # ワークフロードキュメントの概要
│   ├── SPECIFICATION.md        # 技術仕様書
│   ├── DEVELOPER_GUIDE.md      # 開発者ガイド
│   ├── ARCHITECTURE.md         # ワークフローアーキテクチャ（移動）
│   ├── LOGGING_SPEC.md         # ログ仕様（移動）
│   └── COGNITIVE_WORKFLOWS.md  # 認知ワークフロー（移動）
│
├── testing/                     # テスト関連
│   ├── README.md               # テストドキュメントの概要
│   ├── STRATEGY.md             # テスト戦略（移動）
│   ├── SPECIFICATIONS.md       # テスト仕様（移動）
│   └── ANALYSIS.md             # テスト分析（移動）
│
├── features/                    # 機能仕様
│   └── pond-filtering-spec.md  # Pondフィルタリング
│
└── phases/                      # フェーズ別作業記録（既存）
    ├── README.md
    ├── PHASE_001_*.md
    ├── PHASE_002_*.md
    ├── PHASE_003_*.md
    └── phase3/
```

## 3. 移動対象ファイル

### workflows/ディレクトリへ
- `WORKFLOW_ARCHITECTURE.md` → `workflows/ARCHITECTURE.md`
- `WORKFLOW_LOGGING_SPEC.md` → `workflows/LOGGING_SPEC.md`
- `COGNITIVE_WORKFLOWS.md` → `workflows/COGNITIVE_WORKFLOWS.md`

### testing/ディレクトリへ
- `TESTING_STRATEGY.md` → `testing/STRATEGY.md`
- `TEST_SPECIFICATIONS.md` → `testing/SPECIFICATIONS.md`
- `TEST_ANALYSIS.md` → `testing/ANALYSIS.md`

### architecture/ディレクトリへ
- `ARCHITECTURE.md` → `architecture/ARCHITECTURE.md`
- `SYSTEM_DESIGN.md` → `architecture/SYSTEM_DESIGN.md`
- `INTERFACES.md` → `architecture/INTERFACES.md`
- `INFORMATION_MODEL.md` → `architecture/INFORMATION_MODEL.md`
- `CORE_ENGINE_AGENT_SPEC.md` → `architecture/CORE_ENGINE_AGENT_SPEC.md`

### features/ディレクトリへ
- `pond-filtering-spec.md` → `features/pond-filtering-spec.md`

## 4. 更新が必要な参照

- docs/README.md のパス更新
- docs/DOCUMENT_INDEX.md のパス更新
- 各ドキュメント内の相互参照パス更新

## 5. 期待される効果

- **カテゴリ別整理**: 関連ドキュメントが同じディレクトリに
- **ナビゲーション改善**: 各カテゴリにREADME.mdで案内
- **保守性向上**: 新規ドキュメント追加時の配置が明確
- **ルートディレクトリの整理**: 重要なドキュメントのみがルートに

## 6. 実施手順

1. ディレクトリ作成
2. ファイル移動
3. 各カテゴリのREADME.md作成
4. パス参照の更新
5. DOCUMENT_INDEX.mdの更新
6. コミット