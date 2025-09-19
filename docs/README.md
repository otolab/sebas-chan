# sebas-chan ドキュメント

## 概要

このディレクトリには、sebas-chanプロジェクトの技術ドキュメントが含まれています。

## ドキュメント構成

### 🎯 はじめに読むべきドキュメント

1. **[CONCEPT.md](CONCEPT.md)** - プロジェクトのコンセプトと目的
2. **[ARCHITECTURE.md](ARCHITECTURE.md)** - システムアーキテクチャの全体像
3. **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - 現在の実装状況

### 📚 カテゴリ別ガイド

#### 開発者向け
- **[workflows/DEVELOPER_GUIDE.md](workflows/DEVELOPER_GUIDE.md)** - ワークフロー開発の実践ガイド
- **[INTERFACES.md](INTERFACES.md)** - API仕様とインターフェース定義
- **[TESTING_STRATEGY.md](TESTING_STRATEGY.md)** - テスト戦略と方法

#### 設計・仕様
- **[workflows/SPECIFICATION.md](workflows/SPECIFICATION.md)** - ワークフロー技術仕様書
- **[CORE_ENGINE_AGENT_SPEC.md](CORE_ENGINE_AGENT_SPEC.md)** - Core Engine/Agent仕様
- **[INFORMATION_MODEL.md](INFORMATION_MODEL.md)** - データモデル定義

#### プロジェクト管理
- **[ROADMAP.md](ROADMAP.md)** - 開発ロードマップ
- **[phases/](phases/)** - フェーズ別の作業記録と進捗

### 📁 ディレクトリ構造

```
docs/
├── README.md                    # このファイル
├── DOCUMENT_INDEX.md            # 全ドキュメントの詳細一覧
│
├── 【概要・計画】
│   ├── CONCEPT.md              # プロジェクトコンセプト
│   ├── ROADMAP.md              # ロードマップ
│   └── IMPLEMENTATION_STATUS.md # 実装状況
│
├── 【設計・アーキテクチャ】
│   ├── ARCHITECTURE.md         # システムアーキテクチャ
│   ├── SYSTEM_DESIGN.md        # システム設計詳細
│   ├── INTERFACES.md           # インターフェース仕様
│   └── INFORMATION_MODEL.md    # データモデル
│
├── 【機能仕様】
│   ├── CORE_ENGINE_AGENT_SPEC.md # Core仕様
│   ├── COGNITIVE_WORKFLOWS.md    # 認知ワークフロー
│   └── pond-filtering-spec.md    # Pondフィルタリング
│
├── workflows/                   # ワークフロー関連
│   ├── SPECIFICATION.md        # 技術仕様書
│   └── DEVELOPER_GUIDE.md      # 開発者ガイド
│
├── 【テスト】
│   ├── TESTING_STRATEGY.md     # テスト戦略
│   ├── TEST_SPECIFICATIONS.md  # テスト仕様
│   └── TEST_ANALYSIS.md        # テスト分析
│
├── phases/                      # フェーズ別作業記録
│   ├── README.md               # フェーズ記録の概要
│   ├── PHASE_001_*.md          # Phase 1記録
│   ├── PHASE_002_*.md          # Phase 2記録
│   ├── PHASE_003_*.md          # Phase 3記録
│   └── phase3/                 # Phase 3作業メモ
│       ├── design-decisions.md
│       ├── implementation-status.md
│       └── ...
│
└── ideas/                       # アーカイブ（初期設計メモ）
    ├── 1.設計仕様書.md
    ├── 2.実装メモ.md
    └── 3.実装に向けた設計方針.md
```

## 📝 ドキュメント管理方針

### 正式ドキュメント vs 作業メモ

- **正式ドキュメント**: ルートディレクトリ直下に配置
  - プロジェクトの公式仕様・設計書
  - 長期的に維持・更新される

- **作業メモ**: `phases/`ディレクトリ以下に配置
  - フェーズ別の作業記録
  - 一時的な設計メモや課題管理
  - 完了後は記録として保存

### 更新ルール

1. **正式ドキュメントの更新時**
   - 関連する他のドキュメントとの整合性を確認
   - IMPLEMENTATION_STATUS.mdに変更を記録

2. **新機能追加時**
   - 該当する仕様書を更新
   - 必要に応じて開発者ガイドに例を追加

3. **フェーズ完了時**
   - 作業メモから重要な内容を正式ドキュメントへ移行
   - フェーズ記録を完了状態に更新

## 🔍 クイックリファレンス

| 知りたいこと | 参照ドキュメント |
|------------|----------------|
| プロジェクトの目的は？ | [CONCEPT.md](CONCEPT.md) |
| システムの全体構成は？ | [ARCHITECTURE.md](ARCHITECTURE.md) |
| ワークフローの作り方は？ | [workflows/DEVELOPER_GUIDE.md](workflows/DEVELOPER_GUIDE.md) |
| APIの仕様は？ | [INTERFACES.md](INTERFACES.md) |
| 現在の開発状況は？ | [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) |
| テストの書き方は？ | [TESTING_STRATEGY.md](TESTING_STRATEGY.md) |
| データモデルは？ | [INFORMATION_MODEL.md](INFORMATION_MODEL.md) |
| 全ドキュメント一覧は？ | [DOCUMENT_INDEX.md](DOCUMENT_INDEX.md) |

## 📋 関連リンク

- [プロジェクトREADME](../README.md)
- [Issue一覧](https://github.com/otolab/sebas-chan/issues)
- [実装コード](../packages/)