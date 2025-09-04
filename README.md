# sebas-chan

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Node](https://img.shields.io/badge/Node.js-20-green)

「安全なフォーゲッタ」 - ユーザーが安心して情報を忘れることを可能にするAIエージェントシステム

## 🎯 コンセプト

**sebas-chan**は、ユーザーの認知的負荷をAIが肩代わりし、「今、集中すべきこと」に専念できる環境を提供します。受動的なリマインダーではなく、外部脳として能動的に情報を管理し、最適なタイミングで対話を行う思考パートナーとして振る舞います。

### 主な特徴

- 🧠 **イベントキュー型思考エンジン** - 優先度に基づいた自律的な情報処理
- 📚 **知識の自動構造化** - Input → Issue → Knowledgeの階層的管理
- 🔄 **継続的な学習と最適化** - フィードバックによる自己改善
- 🤝 **自然言語インターフェース** - MCP（Model Context Protocol）による標準化された対話

## 🚀 クイックスタート

### 必要環境

- Node.js 20以上
- npm 10以上
- Python 3.10以上（DBブリッジ層用）

### インストール

```bash
# リポジトリのクローン
git clone https://github.com/yourusername/sebas-chan.git
cd sebas-chan

# 依存関係のインストール
npm install

# Python環境のセットアップ（DBブリッジ層）
cd packages/db
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 開発環境の起動

```bash
# 開発サーバーの起動
npm run dev

# 個別パッケージの起動
npm run dev:core    # Core Agent
npm run dev:mcp     # MCP Server
npm run dev:web     # Web UI
```

## 📁 プロジェクト構成

```
sebas-chan/
├── packages/               # モノレポ配下のパッケージ群
│   ├── core/              # Core Agentと基本ロジック
│   ├── db/                # データベースブリッジ層（LanceDB）
│   ├── mcp-server/        # MCPサーバー実装
│   └── web/               # SvelteKit Web UI
├── docs/                  # ドキュメント
│   ├── ideas/            # 設計思想と仕様
│   ├── ARCHITECTURE.md   # システムアーキテクチャ
│   └── IMPLEMENTATION_STATUS.md  # 実装状況
├── prompts/              # AI作業指針
└── AGENTS.md            # エージェント向けインデックス
```

## 🏗️ アーキテクチャ

### 情報管理モデル

```
Input（生データ）
  ↓
Issue（課題管理）→ Pond（未整理情報）
  ↓
Knowledge（永続的知識）
```

### 主要コンポーネント

- **Core Agent**: イベントキュー型の思考処理エンジン
- **Reporters**: 外部情報を収集するモジュール群
- **MCP Server**: 標準化された通信インターフェース
- **Web UI**: ユーザー向けダッシュボード

詳細は[アーキテクチャドキュメント](docs/ARCHITECTURE.md)を参照してください。

## 📊 開発状況

### 現在: Phase 1 - 最小構成（準備中）

- ✅ プロジェクト構成（npm workspaces モノレポ）
- ✅ システム設計確定
- 🔄 shared-types作成中
- 🔄 DB Bridge実装準備

### ロードマップ

- **Phase 1**: 最小構成 - Core API、REST API、DB Bridge
- **Phase 2**: 基本機能 - Reporter SDK、Web UI、主要ワークフロー
- **Phase 3**: MCP統合 - MCPサーバー、拡張ワークフロー
- **Phase 4**: 実用化 - 複数Reporter、自己調整機能

詳細は[ロードマップ](docs/ROADMAP.md)を参照してください。

## 📚 ドキュメント

### 設計・仕様
- [設計仕様書](docs/ideas/1.設計仕様書.md) - システム全体の設計思想
- [実装メモ](docs/ideas/2.実装メモ.md) - 技術的な実装詳細
- [実装に向けた設計方針](docs/ideas/3.実装に向けた設計方針.md) - 開発の具体的な方針

### 開発者向け
- [AGENTS.md](AGENTS.md) - エージェント向けシステム概要
- [アーキテクチャ](docs/ARCHITECTURE.md) - 詳細な技術構成
- [ドキュメント同期管理](prompts/DOCUMENT_CODE_SYNC.md) - ドキュメントとコードの整合性

## 🧪 テスト

```bash
# ユニットテスト
npm test

# E2Eテスト
npm run test:e2e

# カバレッジレポート
npm run test:coverage
```

## 🤝 コントリビューション

コントリビューションは歓迎します！以下のガイドラインに従ってください：

1. Issueで議論を開始
2. Forkしてfeatureブランチを作成
3. テストを含めてコードを実装
4. Pull Requestを作成

## 📄 ライセンス

MITライセンス - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

## 🔗 関連リンク

- [プロジェクトロードマップ](https://github.com/yourusername/sebas-chan/projects)
- [Issue Tracker](https://github.com/yourusername/sebas-chan/issues)
- [Discussions](https://github.com/yourusername/sebas-chan/discussions)

---

**sebas-chan** - あなたの外部脳として、より良い思考と集中を