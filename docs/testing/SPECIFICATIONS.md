# テスト仕様書

## 1. CoreEngine と CoreAgent の統合テスト

### 目的

CoreEngineとCoreAgentが正しく連携して、イベント駆動型の処理を実行できることを確認する。

### テスト項目

#### 1.1 初期化と接続

- **TEST-INIT-001**: CoreEngineがCoreAgentとDBClientを正しく初期化できる
  - 前提条件: なし
  - 期待結果: initialize()成功後、両モジュールが利用可能になる

- **TEST-INIT-002**: DB接続エラー時にCoreAgentを初期化しない
  - 前提条件: DBClientの接続が失敗する
  - 期待結果: エラーが発生し、CoreAgentは作成されない

#### 1.2 イベント処理の流れ

- **TEST-EVENT-001**: InputからINGEST_INPUTイベントが生成される
  - 前提条件: システムが初期化済み
  - 入力: createInput()でInputを作成
  - 期待結果: INGEST_INPUTイベントがキューに追加される

- **TEST-EVENT-002**: イベントがWorkflowRegistryから適切なワークフローを取得して実行される
  - 前提条件: ワークフローが登録済み
  - 入力: イベントをキューに追加
  - 期待結果: 対応するワークフローのexecutorが実行される

- **TEST-EVENT-003**: 未知のイベントタイプは警告を出して無視される
  - 前提条件: システムが初期化済み
  - 入力: 未登録のイベントタイプ
  - 期待結果: 警告ログが出力され、処理がスキップされる

#### 1.3 WorkflowContext の提供

- **TEST-CONTEXT-001**: WorkflowContextにstorageが正しく提供される
  - 前提条件: ワークフロー実行中
  - 期待結果: context.storageでDB操作が可能

- **TEST-CONTEXT-002**: WorkflowContextにloggerが正しく提供される
  - 前提条件: ワークフロー実行中
  - 期待結果: context.loggerでログ出力が可能

- **TEST-CONTEXT-003**: WorkflowContextにstate管理機能が提供される
  - 前提条件: ワークフロー実行中
  - 期待結果: getState/setStateで状態管理が可能

- **TEST-CONTEXT-004**: WorkflowContextにDriverFactory経由でドライバーが提供される
  - 前提条件: ワークフロー実行中
  - 期待結果: createDriverでドライバーインスタンスを作成可能

#### 1.4 複数イベントの処理

- **TEST-MULTI-001**: 複数のイベントが順次処理される
  - 前提条件: システムが初期化済み
  - 入力: 3つの異なるイベント
  - 期待結果: 全てのイベントが処理される

- **TEST-MULTI-002**: イベント優先度に従って処理される
  - 前提条件: システムが初期化済み
  - 入力: 異なる優先度のイベント
  - 期待結果: high → normal → lowの順で処理

## 2. CoreEngine と DBClient の統合テスト

### 目的

CoreEngineがDBClientを通じてデータ永続化を正しく行えることを確認する。

### テスト項目

#### 2.1 Pond操作

- **TEST-POND-001**: createInputからPondへの保存フロー
  - 前提条件: DB接続済み
  - 入力: Input作成
  - 期待結果: PondEntryがDBに保存される

- **TEST-POND-002**: Pond検索が正しく動作する
  - 前提条件: Pondにデータが存在
  - 入力: 検索クエリ
  - 期待結果: 関連するエントリが返される

#### 2.2 エラーハンドリング

- **TEST-ERROR-001**: DB切断時の graceful degradation
  - 前提条件: DB接続後に切断
  - 期待結果: エラーを記録し、空の結果を返す

## 3. Input処理フローの統合テスト

### 目的

Inputの投稿から処理、保存までの一連の流れが正しく動作することを確認する。

### テスト項目

#### 3.1 基本フロー

- **TEST-FLOW-001**: Input投稿 → イベント生成 → ワークフロー実行 → Pond保存
  - 前提条件: 全システム初期化済み
  - 入力: テキストInput
  - 期待結果: Pondに保存され、検索可能になる

#### 3.2 エラー検出フロー

- **TEST-FLOW-002**: エラーキーワードを含むInputが分析イベントをトリガー
  - 前提条件: IngestInputワークフロー登録済み
  - 入力: "エラー"を含むInput
  - 期待結果: ANALYZE_ISSUE_IMPACTイベントが生成される

## 4. 実装優先度

### Phase 1: 基本的な連携（必須）

- TEST-INIT-001
- TEST-EVENT-001
- TEST-EVENT-002
- TEST-CONTEXT-001

### Phase 2: エラーハンドリング（重要）

- TEST-INIT-002
- TEST-EVENT-003
- TEST-ERROR-001

### Phase 3: 完全な統合（推奨）

- TEST-FLOW-001
- TEST-FLOW-002
- TEST-MULTI-001
- TEST-MULTI-002

## 5. テストの実装方針

### モックの使用方針

- **最小限のモック**: 統合テストでは実際のモジュールを使用
- **必要な場合のみモック**: 外部システム（DB、ネットワーク）のみ
- **振る舞いの検証**: スパイを使って相互作用を確認

### アサーション方針

- **明確な期待値**: 曖昧な検証を避ける
- **段階的な検証**: 各ステップで状態を確認
- **エラーメッセージ**: 失敗時に原因が分かるメッセージ

### テストの独立性

- **各テストは独立**: 他のテストに依存しない
- **セットアップ/クリーンアップ**: beforeEach/afterEachで状態をリセット
- **並行実行可能**: テスト間で状態を共有しない
