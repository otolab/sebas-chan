# ドキュメント整理計画

## 現状の分析

### 1. 発見された問題点

#### 1.1 重複定義
- **WorkflowContextInterface**が5箇所で定義されている
  - workflows/LOGGING_SPEC.md
  - workflows/SPECIFICATION.md
  - workflows/WORKFLOW_PERSPECTIVE.md
  - architecture/COMPONENTS.md
  - architecture/CORE_ENGINE_AGENT_SPEC.md

#### 1.2 相互参照の不整合
- 一部のドキュメントで古いパスを参照
- READMEファイルが3箇所に分散（workflows/, architecture/, phases/phase3/）
- 新規作成ドキュメントへのリンクが不完全

#### 1.3 情報の分散
- スキーマ定義が複数箇所に分散
  - LOW_LEVEL_SCHEMA.md（新規）
  - DATABASE_SCHEMA_SPECIFICATION.md（phase3）
  - INFORMATION_MODEL.md（architecture）

### 2. ドキュメント構造の現状

```
docs/
├── architecture/          # システムアーキテクチャ
│   ├── README.md         # インデックス
│   ├── OVERVIEW.md       # 概要
│   ├── COMPONENTS.md     # コンポーネント詳細
│   ├── INTERFACES.md     # API仕様
│   ├── INFORMATION_MODEL.md  # データモデル
│   ├── LOW_LEVEL_SCHEMA.md   # 低レベルスキーマ（新規）
│   └── ...
├── workflows/            # ワークフロー関連
│   ├── README.md        # インデックス
│   ├── SPECIFICATION.md # 技術仕様
│   ├── DEVELOPER_GUIDE.md # 開発ガイド
│   ├── EVENT_CATALOG.md  # イベントカタログ（新規）
│   ├── WORKFLOW_PERSPECTIVE.md # ワークフローの世界観（新規）
│   └── ...
└── phases/phase3/       # Phase 3作業文書
    ├── README.md        # 進捗管理
    ├── A_SERIES_WORKFLOW_IMPROVEMENT.md
    ├── DATABASE_SCHEMA_SPECIFICATION.md
    └── archive/         # 古い文書
```

## 整理提案

### 1. 重複の解消

#### WorkflowContextInterfaceの統一
- **正式定義**: `workflows/SPECIFICATION.md`に一本化
- 他のドキュメントからは参照のみ
- 変更箇所：
  ```markdown
  # 各ドキュメントで
  WorkflowContextの詳細は[ワークフロー技術仕様書](../workflows/SPECIFICATION.md#workflowcontext)を参照
  ```

### 2. スキーマドキュメントの統合

#### 提案構造
```
architecture/
├── INFORMATION_MODEL.md     # 概念モデル（Input→Issue→Knowledge）
├── DATABASE_SCHEMA.md       # 論理スキーマ（テーブル定義）
└── LOW_LEVEL_SCHEMA.md      # 物理スキーマ（PyArrow/LanceDB）
```

- DATABASE_SCHEMA_SPECIFICATION.mdの内容をDATABASE_SCHEMA.mdに移動
- phase3のドキュメントはarchiveへ

### 3. 相互参照の改善

#### 3.1 マスターインデックスの作成
`docs/INDEX.md`を新規作成：
- 全ドキュメントの一覧
- 目的別の読み方ガイド
- 用語集へのリンク

#### 3.2 各READMEの役割明確化
- `docs/README.md`: プロジェクト全体の入口
- `docs/architecture/README.md`: アーキテクチャドキュメントのインデックス
- `docs/workflows/README.md`: ワークフロードキュメントのインデックス

### 4. 新規ドキュメントの位置づけ

#### Phase 3で作成された重要ドキュメント
- **EVENT_CATALOG.md**: ✅ 適切な位置（workflows/）
- **WORKFLOW_PERSPECTIVE.md**: ✅ 適切な位置（workflows/）
- **LOW_LEVEL_SCHEMA.md**: ✅ 適切な位置（architecture/）
- **A_SERIES_WORKFLOW_IMPROVEMENT.md**: → workflows/improvements/へ移動を検討

### 5. アクションアイテム

#### 優先度: 高
1. [ ] WorkflowContextInterfaceの重複を解消
2. [ ] 各READMEの相互リンクを整備
3. [ ] docs/INDEX.mdを作成

#### 優先度: 中
4. [ ] スキーマドキュメントを統合
5. [ ] phase3の作業文書をアーカイブまたは正式文書へ昇格
6. [ ] 壊れたリンクを修正

#### 優先度: 低
7. [ ] 用語集（GLOSSARY.md）の作成
8. [ ] ドキュメントテンプレートの作成
9. [ ] 自動リンクチェッカーの導入

## 実装順序

### Phase 1: 即座に実行可能
- WorkflowContextInterface重複の解消
- 壊れたリンクの修正

### Phase 2: 構造改善
- docs/INDEX.mdの作成
- READMEファイルの整理

### Phase 3: 内容統合
- スキーマドキュメントの統合
- phase3文書の整理

## 期待される効果

1. **開発者の生産性向上**
   - 必要な情報への迅速なアクセス
   - 矛盾のない一貫した情報

2. **保守性の向上**
   - 単一情報源の原則（Single Source of Truth）
   - 更新箇所の明確化

3. **新規参加者の学習効率向上**
   - 明確な読み進め方
   - 段階的な理解の促進

---
作成日: 2025-09-26