# ワークフロー記録システム仕様

## 概要

ワークフローの実行履歴を記録し、デバッグ・分析・再現を可能にする記録システム。

## 設計方針

### 1. コンテキストベースの記録管理
- WorkflowContextにrecorderインスタンスを含める
- 各ワークフロー実行ごとに専用のrecorderインスタンスを生成
- recorderインスタンス自体が実行IDを保持

### 2. 記録する情報
ワークフローの入力と出力を再現できる最小限の情報：
- **入力データ**: イベント、パラメータ
- **DB操作**: クエリ、取得したID一覧（データ本体は不要）
- **AI呼び出し**: プロンプト、パラメータ、レスポンス
- **出力データ**: 結果、次のイベント
- **メタデータ**: タイムスタンプ、実行時間、エラー情報

### 3. 記録スキーマ
```typescript
interface WorkflowRecord {
  executionId: string;      // 実行ID（UUID）
  workflowName: string;     // ワークフロー名
  type: RecordType;        // 記録タイプ
  timestamp: Date;         // タイムスタンプ（自動生成）
  data: unknown;           // 記録データ（type毎に型が決まる）
}

enum RecordType {
  INPUT = 'input',         // 入力データ
  OUTPUT = 'output',       // 出力データ
  ERROR = 'error',         // エラー情報
  DB_QUERY = 'db_query',   // DB操作
  AI_CALL = 'ai_call',     // AI呼び出し
  INFO = 'info',           // 一般情報
  DEBUG = 'debug',         // デバッグ情報
  WARN = 'warn'            // 警告
}
```

注意: 実行の記録が目的のため、すべての記録を保存します。レベルによるフィルタリングは行いません。

## インターフェース設計

### WorkflowRecorder
```typescript
interface WorkflowRecorder {
  // 実行ID（自動生成）
  readonly executionId: string;

  // ワークフロー名
  readonly workflowName: string;

  // 統一記録メソッド
  record(type: RecordType, data: unknown): void;
}
```

### WorkflowContextInterface
```typescript
interface WorkflowContextInterface {
  state: string;
  storage: WorkflowStorageInterface;
  createDriver: DriverFactory;

  // ワークフロー記録システム
  recorder: WorkflowRecorder;

  config?: WorkflowConfig;
  metadata?: Record<string, unknown>;
}
```

## 記録の流れ

### 1. Recorder生成（Engine側）
```typescript
// Engineがワークフロー実行時に生成
const recorder = new WorkflowRecorder(workflow.name);
const context = createWorkflowContext(
  engine,
  stateManager,
  dbClient,
  driverFactory,
  recorder  // ここでコンテキストに渡される
);
```

### 2. 記録の収集（ワークフロー側）
```typescript
executor: async (event, context, emitter) => {
  // 自動的に入力を記録
  context.recorder.record(RecordType.INPUT, { event });

  try {
    // DB操作を記録
    context.recorder.record(RecordType.DB_QUERY, {
      operation: 'searchIssues',
      query: 'エラー'
    });
    const issues = await context.storage.searchIssues('エラー');

    // 重要な処理を記録
    context.recorder.record(RecordType.INFO, {
      message: 'Issues found',
      count: issues.length,
      ids: issues.map(i => i.id)  // IDのみ記録
    });

    // AI呼び出しを記録
    const driver = await context.createDriver({ modelId: 'claude-3.5-sonnet' });
    const prompt = 'エラーを分析';
    context.recorder.record(RecordType.AI_CALL, {
      prompt,
      modelId: 'claude-3.5-sonnet'
    });
    const response = await driver.query(prompt);

    // 出力を記録
    const output = { analyzed: true, result: response };
    context.recorder.record(RecordType.OUTPUT, output);

    return { success: true, context, output };
  } catch (error) {
    // エラーを記録
    context.recorder.record(RecordType.ERROR, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}
```

### 3. 記録の永続化（Engine側）
```typescript
// ワークフロー完了後にEngineが実行
const records = recorder.getBuffer();
await dbClient.saveWorkflowRecords(records);
```

## 記録データの型詳細

### INPUT
```typescript
{
  type: RecordType.INPUT,
  data: {
    event: AgentEvent;
    context?: {
      state: string;
      metadata?: Record<string, unknown>;
    }
  }
}
```

### DB_QUERY
```typescript
{
  type: RecordType.DB_QUERY,
  data: {
    operation: 'searchIssues' | 'createIssue' | 'updateIssue' | ...;
    params?: Record<string, unknown>;
    resultIds?: string[];  // IDのみ記録
  }
}
```

### AI_CALL
```typescript
{
  type: RecordType.AI_CALL,
  data: {
    modelId: string;
    prompt: string;
    response?: string;
    streaming?: boolean;
    error?: string;
  }
}
```

### ERROR
```typescript
{
  type: RecordType.ERROR,
  data: {
    error: string;
    stack?: string;
    context?: Record<string, unknown>;
  }
}
```

## 実装ガイドライン

### DO
- ✅ 実行の開始と終了を必ず記録
- ✅ DB操作は操作名とIDのみ記録（データ本体は不要）
- ✅ エラーは詳細に記録（スタックトレース含む）
- ✅ AI呼び出しは入力と出力を記録

### DON'T
- ❌ データ本体を記録しない（IDで参照可能）
- ❌ パスワードやトークンを記録しない
- ❌ 大量のデータを記録しない（要約やカウントに留める）

## 検証ツール

### ワークフロー実行の再現
```typescript
async function replayWorkflow(executionId: string) {
  const records = await dbClient.getWorkflowRecords(executionId);

  for (const record of records) {
    console.log(`[${record.timestamp}] ${record.type}:`, record.data);
  }
}
```

### 実行パスの可視化
```typescript
function visualizeExecutionPath(records: WorkflowRecord[]) {
  const path = records
    .filter(r => r.type === RecordType.INFO)
    .map(r => r.data.step)
    .filter(Boolean);

  return path.join(' → ');
}
```

## 将来の拡張

- リアルタイムストリーミング対応
- 分散トレーシング（OpenTelemetry統合）
- パフォーマンスメトリクス収集
- 視覚的な実行フロー表示