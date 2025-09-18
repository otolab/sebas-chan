# テストケース分析と再設計

## 現在のテストケースの意図

### engine-integration.test.ts のテストケース一覧

#### 1. CoreAgent initialization
- **目的**: CoreEngineがCoreAgentを正しく初期化することを確認
- **検証内容**:
  - CoreAgentインスタンスが作成される
  - WorkflowRegistryが利用可能である

#### 2. Event forwarding to CoreAgent
- **目的**: CoreEngineがイベントをCoreAgentに正しく転送することを確認
- **検証内容**:
  - INGEST_INPUTイベントがexecuteWorkflowに渡される
  - 複数の異なるイベントタイプが正しく処理される
  - イベントのペイロードが正しく渡される

#### 3. WorkflowContext functionality
- **目的**: WorkflowContextが必要な機能を提供することを確認
- **検証内容**:
  - storage経由でDB操作ができる（addPondEntry）
  - stateの取得と更新ができる
  - loggerが提供される
  - createDriverが提供される
  - DBエラーが適切にハンドリングされる

#### 4. DB Client integration
- **目的**: DBClientの初期化と接続管理を確認
- **検証内容**:
  - DBClientが正しく初期化される
  - 接続エラーが適切にハンドリングされる
  - モデル初期化エラーが適切にハンドリングされる

#### 5. Input to Pond flow
- **目的**: Input作成からPondへの保存までの一連の流れを確認
- **検証内容**:
  - createInputでInputが作成される
  - INGEST_INPUTイベントが生成される
  - CoreAgentでイベントが処理される
  - 複数のInputが順次処理される

#### 6. Search operations through context
- **目的**: WorkflowContext経由での検索機能を確認
- **検証内容**:
  - Pond検索が実行できる
  - Issue検索が実行できる
  - 検索結果が正しく返される

#### 7. Error handling without CoreAgent
- **目的**: CoreAgentが利用不可能な場合のエラーハンドリングを確認
- **検証内容**:
  - ワークフローがない場合の処理
  - イベントキューの管理

## テストケースの分類

### ユニットテスト（単一モジュールのテスト）

#### CoreEngineのユニットテスト（packages/server/src/core/engine.test.ts）
1. **初期化とライフサイクル管理**
   - initialize()でDB接続とCoreAgent作成
   - start()でイベント処理ループ開始
   - stop()でリソースクリーンアップ
   - getStatus()で状態取得

2. **イベント管理**
   - enqueueEvent()でイベント追加
   - dequeueEvent()でイベント取得
   - イベント優先度による処理順序

3. **API実装**
   - createInput()でInput作成とイベント生成
   - addToPond()でPondEntry作成
   - searchPond()でPond検索
   - その他CRUD操作

#### CoreAgentのユニットテスト（packages/core/src/index.test.ts）
1. **Workflow実行**
   - executeWorkflow()でワークフロー実行
   - 成功/失敗ケースのハンドリング
   - contextとemitterの受け渡し

2. **WorkflowRegistry管理**
   - registerWorkflow()でワークフロー登録
   - getWorkflowRegistry()でレジストリ取得

### インテグレーションテスト（2つのモジュール連携）

#### CoreEngine + DBClient（test/integration/engine-db.test.ts）
1. **DB接続管理**
   - CoreEngineからDBClientの初期化
   - 接続エラーのハンドリング
   - 再接続処理

2. **データ操作の連携**
   - CoreEngine APIからDBへのデータ保存
   - 検索クエリの実行と結果変換

#### CoreEngine + CoreAgent（test/integration/engine-agent.test.ts）
1. **イベント処理の連携**
   - CoreEngineのイベントキューからCoreAgentへの転送
   - ワークフロー実行結果の処理
   - エラーハンドリング

2. **WorkflowContext生成**
   - CoreEngineがWorkflowContextを正しく構築
   - 必要な依存関係の注入

### システムテスト（実際のDB/プロセス使用）

#### DB統合テスト（test/integration/db-client.test.ts, pond-operations.test.ts）
- 実際のLanceDB/Pythonプロセスとの通信
- ベクトル検索の動作確認
- データ永続化の確認

### E2Eテスト（全体シナリオ）

#### Input処理フロー（test/e2e/input-flow.test.ts）
1. **完全なInput処理シナリオ**
   - APIエンドポイントからInput投稿
   - ワークフロー実行
   - Pondへの保存
   - 検索での確認

## 不足しているテストケース

### ユニットテスト
1. **CoreEngine**
   - StateManagerとの連携
   - DriverRegistryの動作
   - イベント優先度処理の詳細
   - 各APIメソッドの境界値テスト

2. **CoreAgent**
   - WorkflowRegistryの詳細動作
   - エラーワークフローの実行

### インテグレーションテスト
1. **CoreEngine + StateManager**
   - 状態の永続化と復元
   - 並行アクセスの制御

2. **CoreEngine + DriverRegistry**
   - ドライバー選択ロジック
   - ドライバー作成とキャッシング

### システムテスト
1. **並行処理**
   - 複数イベントの並行処理
   - リソース競合の回避

2. **パフォーマンス**
   - 大量データ処理
   - メモリリーク検証

## 実装方針

1. **既存テストの整理**
   - engine-integration.test.tsを分割
   - モックを最小限に
   - テスト名を説明的に

2. **新規テストの追加**
   - 不足しているユニットテストを追加
   - 実際のモジュールを使った統合テスト

3. **テストの階層化**
   - ユニット → インテグレーション → システム → E2E
   - 各レベルで適切な粒度でテスト