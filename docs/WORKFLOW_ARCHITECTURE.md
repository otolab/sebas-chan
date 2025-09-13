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
  driver: any;                     // AIドライバー（@moduler-prompt/driver）
  metadata?: Record<string, any>;  // 実行時メタデータ
}
```

### WorkflowStorage

DB操作のインターフェース：

```typescript
interface WorkflowStorage {
  // Pond操作
  addPondEntry(entry: Partial<PondEntry>): Promise<PondEntry>;
  searchPondEntries(query: string): Promise<PondEntry[]>;

  // Issue操作
  addIssue(issue: Partial<Issue>): Promise<Issue>;
  searchIssues(query: string): Promise<Issue[]>;
  updateIssue(id: string, update: Partial<Issue>): Promise<void>;

  // Knowledge操作
  addKnowledge(knowledge: Partial<Knowledge>): Promise<Knowledge>;
  searchKnowledge(query: string): Promise<Knowledge[]>;
  updateKnowledge(id: string, update: Partial<Knowledge>): Promise<void>;
}
```

### WorkflowEventEmitter

次のワークフローを起動するためのイベント発行：

```typescript
interface WorkflowEventEmitter {
  emit(event: AgentEvent): void;
}
```

## 実装されたワークフロー

### 関数ベースワークフロー一覧

1. **ingestInputWorkflow** (A-1)
   - InputデータをPondに取り込み
   - エラーキーワード検出時にIssue分析を起動

2. **processUserRequestWorkflow** (A-0)
   - ユーザーリクエストの分類（issue/question/feedback）
   - 適切な後続ワークフローへのルーティング

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

共通のログ処理を提供するラッパー関数：

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
    await logger.logInput({ event, state: context.state });

    // ワークフロー実行
    const result = await workflow.executor(event, context, emitter);

    // 出力ログ
    await logger.logOutput(result.output);

    return result;
  } catch (error) {
    // エラーログ
    await logger.logError(error as Error, { event, context });

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
import { registerAllWorkflows } from '@sebas-chan/core/workflows';

// 全ワークフローを一括登録
registerAllWorkflows();

// または個別登録
const registry = getWorkflowRegistry();
registry.register('INGEST_INPUT', ingestInputWorkflow);
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
import { createTestDriver } from '@moduler-prompt/driver/test';
import { createEchoDriver } from '@moduler-prompt/driver/echo';

// テストドライバー（設定された応答を返す）
const testDriver = createTestDriver({
  responses: ['応答1', '応答2']
});

// エコードライバー（入力をそのまま返す）
const echoDriver = createEchoDriver();
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
      driver: createTestDriver({ responses: ['test response'] }),
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

### クラスベースから関数ベースへの移行

**Before (クラスベース):**
```typescript
class MyWorkflow extends BaseWorkflow {
  protected async process(event, context, emitter) {
    // 処理
  }
}
```

**After (関数ベース):**
```typescript
const myWorkflow: WorkflowDefinition = {
  name: 'MyWorkflow',
  executor: async (event, context, emitter) => {
    // 処理
  }
};
```

## パフォーマンス最適化

1. **ツリーシェイキング**: 関数ベースにより不要なコードの除外が容易
2. **遅延読み込み**: 必要なワークフローのみを動的にインポート可能
3. **並列実行**: 状態を持たないため、複数のワークフローを安全に並列実行可能

## 今後の拡張

- ワークフローの動的登録
- ワークフロー実行のメトリクス収集
- ビジュアルワークフローエディタ
- ワークフローのバージョニング

---

作成日: 2025-09-13
更新日: 2025-09-13
バージョン: 2.0.0 (関数ベースアーキテクチャ)