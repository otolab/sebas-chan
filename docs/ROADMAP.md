# sebas-chan 実装ロードマップ

## 現在のステータス

**フェーズ**: Phase 3（ワークフロー実装）完了

### 完了項目

#### Phase 1（最小構成）

- [x] プロジェクト構成（npm workspaces モノレポ）
- [x] 設計ドキュメント作成
- [x] システムアーキテクチャ確定
- [x] shared-types パッケージ作成
- [x] Core Agent基本実装（エラーハンドリング含む）
- [x] Server パッケージ作成（REST API、CLI、設定管理）
- [x] インメモリイベントキュー（優先度付き）
- [x] 包括的なユニットテスト（118テスト全て成功）

#### Phase 2（基本機能実装）

- [x] DB Bridge実装（TypeScript + Python）
  - LanceDB統合完了
  - Python環境（uv）セットアップ
  - JSON-RPC通信レイヤー実装
  - TypeScriptラッパー作成
  - 日本語向けベクトル埋め込みモデル（Ruri）統合
  - 包括的なテストスイート（23テスト全て成功）
- [x] Reporter SDK実装完了
- [x] Web UI実装（SvelteKit）
  - State表示ページ
  - Knowledge一覧ページ
  - Issue詳細ページ
  - ログ表示（一覧・詳細）
  - Pond検索機能

#### Phase 3（ワークフロー実装）

- [x] 関数ベースワークフローアーキテクチャ実装
- [x] 基本ワークフロー実装（A-0〜A-3）
- [x] WorkflowRegistry/Logger実装
- [x] ワークフロー仕様書作成
- [x] 開発者ガイド作成
- [x] REST API拡張（state, knowledge, issues, logs）

### 次のフェーズ

Phase 4: MCP統合と高度なワークフロー

## 実装フェーズ概要

### Phase 1: 最小構成（PoC基盤）

**目標**: コアシステムの基本動作確認

**実装内容**:

- Server パッケージ（メインプロセス、REST API、設定管理）
- Core API + Core Agent
- DB Bridge（Python子プロセス）
- インメモリイベントキュー
- 基本的なワークフロー（A-0: PROCESS_USER_REQUEST）
- State文書の基本管理

**テスト方法**:

- curlでREST APIを直接呼び出し
- 手動でのデータ投入とレスポンス確認

**成果物**:

- `/request`エンドポイントで自然言語リクエストを処理できる
- State文書の読み書きが可能
- DB Bridgeを通じたLanceDBアクセスが動作

### Phase 2: 基本機能実装

**目標**: 基本的な情報管理フローの実現

**実装内容**:

- Reporter SDK（TypeScript）の作成
- Manual Input Reporter（最初のReporter）
- 簡易Web UI（SvelteKit、読み取り専用）
- 主要ワークフロー追加:
  - A-1: INGEST_INPUT
  - A-2: ANALYZE_ISSUE_IMPACT
  - A-3: EXTRACT_KNOWLEDGE
- Issue/Flow/Knowledgeの基本CRUD

**テスト方法**:

- Web UIでシステム状態を確認
- Manual Reporterから情報を投入
- Issue作成からKnowledge抽出までのフロー確認

**成果物**:

- Web UIダッシュボードでシステム状態を可視化
- Reporter SDKによる情報収集の基盤
- 基本的な情報管理サイクルの動作

### Phase 3: ワークフロー基盤実装 【完了】

**目標**: ワークフローアーキテクチャの確立と基本ワークフローの実装

**実装内容**:

- 関数ベースワークフローアーキテクチャ
- WorkflowDefinition型定義
- WorkflowRegistry/Logger実装
- 基本ワークフロー（A-0〜A-3）
- ワークフロー仕様書・開発者ガイド

### Phase 4: MCP統合と高度なワークフロー

**目標**: 外部AIエージェントとの連携とシステムの自律性向上

**実装内容**:

- MCP Server（独立コマンド）
  - stdio通信の実装
  - REST APIクライアント機能
- 横断的ワークフロー（B系）:
  - B-1: CLUSTER_ISSUES
  - B-2: UPDATE_FLOW_RELATIONS
  - B-3: UPDATE_FLOW_PRIORITIES
- 提案系ワークフロー（C系）:
  - C-1: SUGGEST_NEXT_FLOW
  - C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE
- Web UIの機能拡張（編集機能追加）

**テスト方法**:

- Claude等のMCP対応AIからの接続テスト
- 複数Issueの関連性分析の動作確認
- 優先度自動調整の検証

**成果物**:

- MCP対応AIエージェントから利用可能
- システムが自律的に情報を整理・提案
- PoCとしての完成度

### Phase 5: 実用化準備

**目標**: プロダクション利用に向けた機能完成

**実装内容**:

- 複数Reporter実装:
  - Gmail Reporter
  - Slack Reporter
  - Calendar Reporter
- 自己調整機能（D系ワークフロー）:
  - D-1: TUNE_SYSTEM_PARAMETERS
  - D-2: COLLECT_SYSTEM_STATS
- Pondサルベージ機能:
  - B-4: SALVAGE_FROM_POND
- システム運用機能:
  - 認証・認可（JWT）
  - ログ管理・モニタリング
  - バックアップ・リストア

**テスト方法**:

- 実際の外部サービスとの連携テスト
- 長期運用シミュレーション
- パフォーマンステスト

**成果物**:

- 実用レベルのシステム完成
- 外部サービスとの本格的な連携
- 自己最適化機能の実装

## 技術的決定事項

### アーキテクチャ

- **プロセス構成**: 単一Node.jsプロセス（初期実装）
- **通信プロトコル**: HTTP（REST API）+ stdio（MCP）
- **永続化戦略**:
  - State文書: メモリキャッシュ + DB永続化
  - イベントキュー: インメモリ（永続化なし）
- **デプロイ方法**:
  - 開発: npm scripts
  - 本番: PM2（後にDocker化検討）

### パッケージ構成

```
packages/
├── server/         # メインサーバープロセス
│   ├── api/       # REST APIエンドポイント
│   ├── config/    # 設定管理
│   ├── cli/       # CLIコマンド
│   └── main.ts    # エントリーポイント
├── core/           # Core Agent + Core API
├── db/             # DB Bridge (TypeScript + Python)
├── mcp-server/     # MCP Server (独立コマンド)
├── reporter-sdk/   # Reporter用クライアントSDK
├── reporters/      # 各種Reporter実装
│   ├── manual/
│   ├── gmail/
│   ├── slack/
│   └── calendar/
├── web-ui/         # SvelteKit管理画面
└── shared-types/   # 共有型定義
```

## 実装優先順位の根拠

### なぜREST APIを先に作るか

- MCPサーバーよりもシンプルで汎用的
- Web UI、Reportersなど他コンポーネントもREST APIを使用
- デバッグとテストが容易（curl、Postman等）
- MCPサーバーはREST APIのクライアントとして後から追加可能

### なぜReporter SDKを早期に作るか

- 複数のReporter実装で共通利用
- REST APIとの通信を標準化
- 早期に作ることで後のReporter開発を効率化

### なぜMCPサーバーはPhase 3か

- REST APIがあれば基本的な実験は可能
- 実装は比較的簡単だが必須ではない
- PoCとしての価値は高いため、基本機能の後に実装

## 各フェーズの期間目安

- **Phase 1**: 1-2週間
- **Phase 2**: 2-3週間
- **Phase 3**: 2-3週間
- **Phase 4**: 3-4週間

**合計**: 約2-3ヶ月でPoCから実用レベルまで到達

## リスクと対策

### 技術的リスク

1. **LanceDBとPythonブリッジの安定性**
   - 対策: 早期にDB Bridgeを実装し、問題を洗い出す

2. **ワークフローの複雑性管理**
   - 対策: 段階的に追加し、各段階でテストを徹底

3. **パフォーマンス問題**
   - 対策: Phase 1-2では機能優先、Phase 3-4で最適化

### スケジュールリスク

1. **外部サービス連携の遅延**
   - 対策: Manual Reporterで基本フローを確立

2. **MCP仕様の変更**
   - 対策: REST APIを主軸とし、MCPは追加機能として扱う

## 成功指標

### Phase 1完了条件

- [x] REST APIが起動し、`/request`エンドポイントが動作
- [x] Core Agentがイベント駆動で動作
- [x] エラーハンドリングとリトライ機構が実装
- [x] State文書のインメモリ実装

### Phase 2完了条件

- [x] DB BridgeがLanceDBと通信可能
- [x] State文書の永続化（DB Bridge経由）
- [x] Web UIでシステム状態を確認可能
- [x] ReporterからInputを投入し、Issueが作成される
- [x] Issue → Knowledgeの変換フローが動作

### Phase 3完了条件

- [x] 関数ベースワークフローの実装
- [x] ワークフロー仕様書の完成
- [x] 基本ワークフロー（A系）の動作確認
- [x] REST APIによるワークフロー管理

### Phase 4完了条件

- [ ] 3種類以上のReporterが稼働
- [ ] システムが自己調整パラメータを更新
- [ ] 1週間以上の連続稼働テストをクリア

## 次のアクション（Phase 4準備）

1. **MCP Server実装** 【優先度: 高】
   - stdio通信の実装
   - REST APIクライアント機能
   - MCP仕様準拠

2. **横断的ワークフロー（B系）** 【優先度: 高】
   - B-1: CLUSTER_ISSUES（Issue群のクラスタリング）
   - B-2: UPDATE_FLOW_RELATIONS（Flow関係更新）
   - B-3: UPDATE_FLOW_PRIORITIES（優先度更新）

3. **提案系ワークフロー（C系）** 【優先度: 中】
   - C-1: SUGGEST_NEXT_FLOW（次のFlow提案）
   - C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE（Issue対応提案）

4. **外部Reporter実装** 【優先度: 中】
   - Gmail Reporter
   - Slack Reporter
   - Calendar Reporter

この計画に従って、段階的かつ着実にsebas-chanシステムを構築していきます。
