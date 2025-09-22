# ドキュメント構成最適化提案

## 1. 統合・削除対象

### 統合
1. **docs/README.md → docs/DOCUMENT_INDEX.md に統合**
   - DOCUMENT_INDEX.mdを主要なインデックスとして使用
   - README.mdの内容をDOCUMENT_INDEX.mdに移動

2. **architecture/SYSTEM_DESIGN.md → architecture/ARCHITECTURE.md に統合**
   - 両ファイルの内容が重複
   - ARCHITECTURE.mdに詳細設計を統合

3. **docs/CONCEPT.md → ルートのREADME.md（AGENTS.md）に統合**
   - プロジェクトのコンセプトはルートREADMEに記載すべき

### 削除
1. **features/ ディレクトリ全体**
   - Pond filtering機能は既に実装済み
   - 新機能の仕様はworkflows/に記載

## 2. 分割対象

### workflows/DEVELOPER_GUIDE.md（584行）を分割
- `DEVELOPER_GUIDE.md` - 概要とクイックスタート（100行程度）
- `IMPLEMENTATION_GUIDE.md` - 詳細な実装ガイド
- `TESTING_GUIDE.md` - テスト作成ガイド

### architecture/INTERFACES.md（308行）を分割
- `INTERFACES.md` - 概要とアーキテクチャ（100行程度）
- `API_ENDPOINTS.md` - REST APIエンドポイント詳細
- `INTERNAL_INTERFACES.md` - 内部インターフェース仕様

## 3. 構成の再編成

### 提案する新構成

```
docs/
├── README.md                     # ドキュメントインデックス（現DOCUMENT_INDEX.md）
├── ROADMAP.md                    # ロードマップ（維持）
├── IMPLEMENTATION_STATUS.md      # 実装状況（維持）
│
├── architecture/                 # アーキテクチャ
│   ├── README.md                # インデックス
│   ├── ARCHITECTURE.md          # 統合版（SYSTEM_DESIGNを吸収）
│   ├── INFORMATION_MODEL.md     # データモデル
│   ├── CORE_ENGINE_AGENT_SPEC.md # Core仕様
│   └── api/                     # API仕様（新規）
│       ├── README.md
│       ├── ENDPOINTS.md         # REST APIエンドポイント
│       └── INTERNAL.md          # 内部インターフェース
│
├── workflows/                    # ワークフロー
│   ├── README.md
│   ├── SPECIFICATION.md         # 技術仕様
│   ├── guides/                  # ガイド（新規）
│   │   ├── QUICK_START.md      # クイックスタート
│   │   ├── IMPLEMENTATION.md    # 実装ガイド
│   │   └── TESTING.md          # テストガイド
│   ├── ARCHITECTURE.md          # ワークフロー設計
│   ├── COGNITIVE_WORKFLOWS.md   # 認知ワークフロー
│   └── LOGGING_SPEC.md         # ログ仕様
│
├── testing/                      # テスト（維持）
│   ├── README.md
│   ├── STRATEGY.md
│   └── SPECIFICATIONS.md
│
└── phases/                       # フェーズ記録（維持）
    ├── README.md
    ├── phase0/                   # アーカイブ
    ├── phase3/                   # アーカイブ
    └── PHASE_*.md               # 各フェーズ記録
```

## 4. 実施優先順位

### 高優先度（すぐに実施）
1. features/ディレクトリ削除
2. docs/README.mdとDOCUMENT_INDEX.mdの統合

### 中優先度（段階的に実施）
1. architecture/SYSTEM_DESIGN.mdとARCHITECTURE.mdの統合
2. workflows/DEVELOPER_GUIDE.mdの分割

### 低優先度（必要に応じて実施）
1. architecture/INTERFACES.mdの分割
2. docs/CONCEPT.mdの移動

## 5. 影響と効果

### メリット
- ドキュメントの重複を解消
- ナビゲーションの改善
- ファイルサイズの適正化
- 保守性の向上

### デメリット・リスク
- 既存のリンクが切れる可能性
- 一時的な混乱

### 対策
- 移動・削除時はリダイレクト用のREADMEを残す
- DOCUMENT_INDEX.mdを最新に保つ
- 段階的に実施して影響を最小化