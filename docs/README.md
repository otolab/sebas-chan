# sebas-chan ドキュメント

## 概要

このディレクトリには、sebas-chanプロジェクトの技術ドキュメントが含まれています。

## 🎯 はじめに読むべきドキュメント

1. **[CONCEPT.md](CONCEPT.md)** - プロジェクトのコンセプトと目的
2. **[design/ARCHITECTURE.md](design/ARCHITECTURE.md)** - システムアーキテクチャの全体像
3. **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - 現在の実装状況

## 📂 ディレクトリ構成

### [design/](design/)

**システム設計・アーキテクチャ**

- システム全体のアーキテクチャ
- コンポーネント設計
- 技術的決定事項

### [workflows/](workflows/)

**ワークフロー開発**

- ワークフロー技術仕様
- 開発者ガイド
- イベントカタログ

### [api/](api/)

**API・インターフェース**

- 内部インターフェース仕様
- REST API（今後追加）

### [data/](data/)

**データ設計**

- 情報モデル（概念）
- LanceDBスキーマ（物理）

### [ai/](ai/)

**AI・プロンプト統合**

- Moduler Prompt利用ガイド
- AIドライバー仕様（今後追加）

### [testing/](testing/)

**テスト**

- テスト戦略
- テスト仕様

### [operations/](operations/)

**運用（将来拡張用）**

- プレースホルダー

### [phases/](phases/)

**フェーズ別作業記録**

- 各フェーズの作業メモ
- 設計文書のアーカイブ

## 👥 読者別ガイド

### ワークフロー開発者

1. [workflows/EVENT_CATALOG.md](workflows/EVENT_CATALOG.md) - イベント一覧
2. [workflows/SPECIFICATION.md](workflows/SPECIFICATION.md) - 技術仕様
3. [workflows/DEVELOPER_GUIDE.md](workflows/DEVELOPER_GUIDE.md) - 開発手順
4. [ai/MODULER_PROMPT_GUIDE.md](ai/MODULER_PROMPT_GUIDE.md) - AI処理

### API連携開発者

1. [api/INTERNAL_INTERFACES.md](api/INTERNAL_INTERFACES.md) - 内部インターフェース
2. [data/INFORMATION_MODEL.md](data/INFORMATION_MODEL.md) - データモデル

### システム設計者

1. [design/ARCHITECTURE.md](design/ARCHITECTURE.md) - 全体設計
2. [design/COMPONENTS.md](design/COMPONENTS.md) - コンポーネント詳細
3. [design/TECHNICAL_DECISIONS.md](design/TECHNICAL_DECISIONS.md) - 技術選定

## 📊 プロジェクト状況

- **現在のフェーズ**: Phase 3完了
- **次のフェーズ**: Phase 4（MCP統合と高度なワークフロー）

詳細は[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)を参照。

## 🔄 更新履歴

### 2025-09-27

- ドキュメント構造を機能別に再編成
- アーキテクチャ関連文書の統合
- 各ディレクトリにREADME.mdを追加

### 2025-09-26

- ワークフロー仕様書の完成
- Moduler Promptガイドの更新

### 2025-09-19

- 初期ドキュメント構造の確立
