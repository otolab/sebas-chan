# ワークフローアーキテクチャ仕様書

## 概要

sebas-chanのワークフローシステムは、関数ベースのアーキテクチャを採用しています。各ワークフローは純粋な関数として実装され、状態を持たずに実行されます。

## アーキテクチャ設計

### 設計原則

1. **関数ベース**: ワークフローは状態を持たない純粋な関数
2. **型安全**: TypeScriptの型システムを最大限活用
3. **テスタブル**: 依存注入により単体テストが容易
4. **再利用可能**: 共通処理はユーティリティ関数として分離

### コア型定義

```typescript
// ワークフロー実行関数の型
type WorkflowExecutor = (
  event: AgentEvent,
  context: WorkflowContext,
  emitter: WorkflowEventEmitter
) => Promise<WorkflowResult>;

// ワークフロー定義
interface WorkflowDefinition {
  name: string;
  executor: WorkflowExecutor;
}

// 実行結果
interface WorkflowResult<T = any> {
  success: boolean;
  context: WorkflowContext;
  output?: T;
  error?: Error;
}
```

## WorkflowContext

ワークフローが実行される環境を表現：

```typescript
interface WorkflowContext {
  state: string;                    // システムの現在状態
  storage: WorkflowStorage;         // DB操作インターフェース
  logger: WorkflowLogger;          // ログ記録
  createDriver: DriverFactory;      // AIドライバーファクトリ
  metadata?: Record<string, any>;  // 実行時メタデータ
}

// ドライバーファクトリの型
// @moduler-prompt/utilsのDriverSelectionCriteriaを使用
import type { DriverSelectionCriteria } from '@moduler-prompt/utils';
type DriverFactory = (criteria: DriverSelectionCriteria) => AIDriver | Promise<AIDriver>;
```

### WorkflowStorage

DB操作のインターフェース：

```typescript
interface WorkflowStorage {
  // 検索操作
  searchIssues(query: string): Promise<Issue[]>;
  searchKnowledge(query: string): Promise<Knowledge[]>;
  searchPond(query: string): Promise<PondEntry[]>;

  // Issue操作
  getIssue(id: string): Promise<Issue | null>;
  createIssue(issue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Issue>;
  updateIssue(id: string, update: Partial<Issue>): Promise<Issue>;

  // Pond操作
  addPondEntry(entry: Omit<PondEntry, 'id' | 'timestamp'>): Promise<PondEntry>;

  // Knowledge操作
  createKnowledge(knowledge: Omit<Knowledge, 'id' | 'createdAt'>): Promise<Knowledge>;
  updateKnowledge(id: string, update: Partial<Knowledge>): Promise<Knowledge>;
}
```

### WorkflowEventEmitter

次のワークフローを起動するためのイベント発行：

```typescript
interface WorkflowEventEmitter {
  emit(event: {
    type: string;
    priority?: 'high' | 'normal' | 'low';
    payload: unknown;
  }): void;
}
```

## 実装されたワークフロー

### 関数ベースワークフロー一覧

1. **ingestInputWorkflow** (A-1)
   - InputデータをPondに取り込み
   - エラーキーワード検出時にIssue分析を起動

2. **processUserRequestWorkflow** (A-0)
   - ユーザーリクエストの分類（issue/question/feedback）
   - AIによるリクエスト内容の理解と分析
   - 適切な後続ワークフローを選択してイベント発行

3. **analyzeIssueImpactWorkflow** (A-2)
   - Issueの影響範囲分析
   - 関連Issue検索と影響度スコア計算
   - 高影響度時に知識抽出を起動

4. **extractKnowledgeWorkflow** (A-3)
   - 情報から再利用可能な知識を抽出
   - 知識タイプの自動分類
   - 重複チェックと評価更新

## ワークフロー実行

### executeWorkflow関数

ワークフロー実行のヨントリポイントとなる関数：

```typescript
async function executeWorkflow(
  workflow: WorkflowDefinition,
  event: AgentEvent,
  context: WorkflowContext,
  emitter: WorkflowEventEmitter
): Promise<WorkflowResult> {
  const { logger } = context;

  try {
    // 入力ログ
    logger.log(LogType.INPUT, {
      event,
      state: context.state,
      metadata: context.metadata,
    });

    // ワークフロー実行
    const result = await workflow.executor(event, context, emitter);

    // 出力ログ
    logger.log(LogType.OUTPUT, result.output);

    return result;
  } catch (error) {
    // エラーログ
    logger.log(LogType.ERROR, {
      message: (error as Error).message,
      stack: (error as Error).stack,
      context: { event, context },
    });

    return {
      success: false,
      context,
      error: error as Error,
    };
  }
}
```

## レジストリ

### WorkflowRegistry

ワークフローの登録と管理：

```typescript
class WorkflowRegistry {
  register(eventType: string, workflow: WorkflowDefinition): void;
  get(eventType: string): WorkflowDefinition | undefined;
  getAll(): Map<string, WorkflowDefinition>;
  clear(): void;
  getEventTypes(): string[];
}
```

### 登録例

```typescript
import { getWorkflowRegistry } from '@sebas-chan/core';
import { ingestInputWorkflow } from '@sebas-chan/core/workflows/impl-functional';

// 個別登録のみ使用
const registry = getWorkflowRegistry();
registry.register('INGEST_INPUT', ingestInputWorkflow);
registry.register('PROCESS_USER_REQUEST', processUserRequestWorkflow);
// 他のワークフローも同様に個別登録
```

## ディレクトリ構造

```
packages/core/src/workflows/
├── functional-types.ts         # 関数ベースの型定義
├── functional-registry.ts      # レジストリ実装
├── context.ts                  # Context型定義
├── logger.ts                   # Logger実装
└── impl-functional/           # ワークフロー実装
    ├── ingest-input.ts
    ├── process-user-request.ts
    ├── analyze-issue-impact.ts
    ├── extract-knowledge.ts
    ├── index.ts               # 一括エクスポート
    └── *.test.ts              # テスト
```

## テスト戦略

### テストドライバーの使用

@moduler-prompt/driverのテストドライバーを使用：

```typescript
import { TestDriver, EchoDriver } from '@moduler-prompt/driver';

// テスト用のドライバーファクトリ
function createTestDriverFactory(responses: string[]): DriverFactory {
  return (capabilities) => {
    return new TestDriver({
      responses,
      delay: 0
    });
  };
}

// エコードライバーファクトリ
function createEchoDriverFactory(): DriverFactory {
  return (capabilities) => new EchoDriver();
}
```

### テスト例

```typescript
describe('IngestInput Workflow', () => {
  let mockContext: WorkflowContext;

  beforeEach(() => {
    mockContext = {
      state: 'Initial state',
      storage: createMockStorage(),
      logger: createMockLogger(),
      createDriver: createTestDriverFactory(['test response']),
      metadata: {}
    };
  });

  it('should ingest input successfully', async () => {
    const result = await executeWorkflow(
      ingestInputWorkflow,
      testEvent,
      mockContext,
      mockEmitter
    );

    expect(result.success).toBe(true);
  });
});
```

## 移行ガイド

### 関数ベースワークフローの実装

**推奨パターン:**
```typescript
const myWorkflow: WorkflowDefinition = {
  name: 'MyWorkflow',
  executor: async (event, context, emitter) => {
    // ドライバーの作成
    const driver = await context.createDriver({
      requiredCapabilities: ['reasoning'],
      preferredCapabilities: ['japanese']
    });

    // プロンプトのコンパイル
    const compiledPrompt = compile({ instructions: [prompt] });

    // AI処理
    const result = await driver.query(compiledPrompt, { temperature: 0.3 });

    // 次のワークフローをイベント発行で起動（サブワークフローは使用しない）
    emitter.emit({
      type: 'NEXT_WORKFLOW',
      priority: 'normal',
      payload: result
    });

    // ログ記録
    context.logger.log(LogType.OUTPUT, { result });

    return { success: true, context, output: result };
  }
};
```

**重要**: クラスベースのワークフロー（BaseWorkflow）は使用しません。

## パフォーマンス最適化

1. **ツリーシェイキング**: 関数ベースにより不要なコードの除外が容易
2. **遅延読み込み**: 必要なワークフローのみを動的にインポート可能
3. **並列実行**: 状態を持たないため、複数のワークフローを安全に並列実行可能

## 今後の拡張

- ワークフローの動的登録
- ワークフロー実行のメトリクス収集
- ビジュアルワークフローエディタ
- ワークフローのバージョニング

## 実装の詳細

### AgentEvent

ワークフローをトリガーするイベント：

```typescript
interface AgentEvent {
  type: string;
  priority: 'high' | 'normal' | 'low';
  payload: unknown;
  timestamp: Date;
}
```

### WorkflowLogger

ワークフロー実行のログ記録（簡素化されたスキーマ）：

```typescript
interface WorkflowLog {
  executionId: string;      // 実行ID（UUID）
  workflowName: string;     // ワークフロー名
  type: LogType;           // ログタイプ
  timestamp: Date;         // タイムスタンプ（自動生成）
  data: unknown;           // ログデータ
}

enum LogType {
  INPUT = 'input',
  OUTPUT = 'output',
  ERROR = 'error',
  DB_QUERY = 'db_query',
  AI_CALL = 'ai_call',
  INFO = 'info',
  DEBUG = 'debug',
  WARN = 'warn'
}

class WorkflowLogger {
  constructor(
    private executionId: string,
    private workflowName: string
  ) {}

  // ログメソッド（サブワークフロー機能なし）
  log(type: LogType, data: unknown): Promise<void>;
}
```

### 型の共有

共通型は`@sebas-chan/shared-types`に定義：

```typescript
// ログエントリ
export interface LogEntry {
  executionId: string;
  workflowType: string;
  timestamp: string | Date;
  level: string;
  message: string;
  phase?: string;
  data?: unknown;
}

// ログ詳細
export interface LogDetail {
  executionId: string;
  workflowType: string;
  status: string;
  startTime: string | Date;
  endTime: string | Date;
  input?: unknown;
  output?: unknown;
  logs?: LogEntry[];
}
```

---

作成日: 2025-09-13
更新日: 2025-09-15
バージョン: 3.0.0 (ドライバーファクトリ導入、ログスキーマ簡素化、サブワークフロー廃止)