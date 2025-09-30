# 1イベント対nワークフロー アーキテクチャ設計

## 現在の構造の問題点

### 現状

```
Event Queue → Event処理 → 1つのWorkflow実行
```

- EventとWorkflowが1対1で固定
- `registry.get(eventType)`で単一のワークフローを取得

### 問題

- 複数のワークフローが同じイベントに反応できない
- 条件に応じた実行制御ができない
- イベントとワークフローが密結合

## 新しいアーキテクチャ

### 概念的な流れ

```
Event投入 → Workflow解決 → Workflow Queue → 順次実行
```

### 詳細設計

#### 1. WorkflowDefinitionの拡張

```typescript
interface WorkflowDefinition {
  name: string;
  description: string;

  // 新規追加：マッチング条件
  triggers: {
    eventTypes: string[]; // 反応するイベントタイプ
    condition?: (event: AgentEvent) => boolean; // 追加条件
    priority?: number; // 実行優先度
  };

  executor: WorkflowExecutor;
}
```

#### 2. WorkflowQueueItemの定義

```typescript
interface WorkflowQueueItem {
  id: string;
  workflow: WorkflowDefinition;
  event: AgentEvent; // トリガーとなったイベント
  priority: number; // 実行優先度
  timestamp: Date;
}
```

#### 3. WorkflowResolverの新規作成

```typescript
class WorkflowResolver {
  constructor(private registry: WorkflowRegistry) {}

  /**
   * イベントにマッチする全ワークフローを解決
   */
  resolve(event: AgentEvent): WorkflowDefinition[] {
    const allWorkflows = this.registry.getAll();

    return Array.from(allWorkflows.values())
      .filter((workflow) => {
        // イベントタイプがマッチ
        if (!workflow.triggers.eventTypes.includes(event.type)) {
          return false;
        }

        // 追加条件があればチェック
        if (workflow.triggers.condition) {
          return workflow.triggers.condition(event);
        }

        return true;
      })
      .sort((a, b) => {
        // 優先度でソート
        const priorityA = a.triggers.priority ?? 0;
        const priorityB = b.triggers.priority ?? 0;
        return priorityB - priorityA;
      });
  }
}
```

#### 4. CoreEngineの変更

```typescript
class CoreEngine {
  private workflowQueue: WorkflowQueue; // EventQueueから変更
  private workflowResolver: WorkflowResolver;

  private async processEvent(event: AgentEvent): Promise<void> {
    // イベントから実行すべきワークフローを解決
    const workflows = this.workflowResolver.resolve(event);

    // 各ワークフローをキューに追加
    for (const workflow of workflows) {
      this.workflowQueue.enqueue({
        id: generateId(),
        workflow,
        event,
        priority: workflow.triggers.priority ?? event.priority,
        timestamp: new Date(),
      });
    }
  }

  private async processNextWorkflow(): Promise<void> {
    const item = this.workflowQueue.dequeue();
    if (!item) return;

    // ワークフロー実行
    await this.coreAgent.executeWorkflow(item.workflow, item.event, context, emitter);
  }
}
```

## 実装例

### 複数ワークフローが同じイベントに反応

```typescript
const logWorkflow: WorkflowDefinition = {
  name: 'LogInput',
  triggers: {
    eventTypes: ['INGEST_INPUT'],
    priority: 10, // 高優先度
  },
  executor: async (event, context) => {
    // ログ記録
  },
};

const analyzeWorkflow: WorkflowDefinition = {
  name: 'AnalyzeInput',
  triggers: {
    eventTypes: ['INGEST_INPUT'],
    condition: (event) => event.payload.input.content.includes('error'),
    priority: 5,
  },
  executor: async (event, context) => {
    // エラー分析
  },
};
```

## 移行計画

### Phase 3-A: 基盤実装

1. WorkflowDefinitionの拡張
2. WorkflowResolverの実装
3. WorkflowQueueの実装

### Phase 3-B: 既存コードの移行

1. 既存ワークフローのtriggers追加
2. CoreEngineの改修
3. テストの更新

### Phase 3-C: 検証と最適化

1. 統合テストの実施
2. パフォーマンス測定
3. ドキュメント更新

## 影響範囲

### 変更が必要なファイル

- `packages/core/src/workflows/functional-types.ts` - 型定義
- `packages/core/src/workflows/functional-registry.ts` - レジストリ
- `packages/core/src/workflows/resolver.ts` - 新規作成
- `packages/server/src/core/engine.ts` - キュー処理の変更
- `packages/server/src/core/workflow-queue.ts` - 新規作成
- 全ワークフロー定義ファイル - triggers追加
- 全テストファイル - 新構造対応

## 後方互換性

移行期間中の互換性のため：

```typescript
// 旧形式のサポート
if (!workflow.triggers) {
  workflow.triggers = {
    eventTypes: [workflow.name.toUpperCase()], // 従来の1対1マッピング
  };
}
```

## メリット

1. **柔軟性**: 1つのイベントで複数の処理を起動可能
2. **拡張性**: 条件付き実行や優先度制御が可能
3. **疎結合**: イベントとワークフローの関係が柔軟に
4. **保守性**: ワークフロー追加が容易に

## デメリット・課題

1. **複雑性増加**: 実行順序の把握が困難に
2. **デバッグ**: ワークフロー連鎖の追跡が複雑
3. **パフォーマンス**: 解決処理のオーバーヘッド
