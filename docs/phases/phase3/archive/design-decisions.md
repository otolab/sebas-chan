# Phase 3 設計判断事項

## 1. ワークフロー名の命名規則

### 現状の混在
- **イベントタイプ**: `INGEST_INPUT`, `PROCESS_USER_REQUEST` (大文字スネークケース)
- **ワークフロー名**: `IngestInput`, `ProcessUserRequest` (パスカルケース)
- **実行関数名**: `executeIngestInput`, `executeProcessUserRequest` (キャメルケース)

### 提案
**パスカルケースで統一**
- イベントタイプとワークフロー名を分離する思想に基づく
- ワークフローは「クラス相当」の概念として扱う
- 実行関数は「メソッド」として小文字開始のキャメルケース

```typescript
// 統一案
const workflow: WorkflowDefinition = {
  name: 'IngestInput',  // パスカルケース
  eventTypes: ['INGEST_INPUT'],  // 対応するイベント（複数可）
  executor: executeIngestInput,  // キャメルケース
};
```

## 2. テスト構造の明確化

### 二層のテスト戦略
1. **ワークフロー機構のテスト** (packages/core/src/index.test.ts)
   - CoreAgentの動作確認
   - イベント処理の仕組み
   - テスト用モックワークフローを使用

2. **個別ワークフローのユニットテスト** (impl-functional/*.test.ts)
   - 各ワークフローのロジック検証
   - 実際のワークフロー実装をテスト
   - モックコンテキストで独立実行

## 3. 1イベント対nワークフローの設計

### 現在の制約
- 1イベントタイプ = 1ワークフロー（registry.get(eventType)）

### 提案する拡張
```typescript
interface WorkflowDefinition {
  name: string;
  eventMatcher: {
    type: string | string[];  // 複数イベントタイプ対応
    condition?: (event: AgentEvent) => boolean;  // 条件付き実行
  };
  priority?: number;  // 実行順序
  executor: WorkflowExecutor;
}

// レジストリは配列で管理
class WorkflowRegistry {
  private workflows: Map<string, WorkflowDefinition[]>;

  getMatchingWorkflows(event: AgentEvent): WorkflowDefinition[] {
    // イベントにマッチする全ワークフローを返す
  }
}
```

## 4. ワークフロー登録方法

### 現状維持の理由
- 明示的な登録で制御が明確
- テスタビリティが高い
- 外部からの登録も可能

### 改善案
```typescript
// packages/core/src/workflows/defaults.ts
export function registerDefaultWorkflows(agent: CoreAgent): void {
  agent.registerWorkflow(ingestInputWorkflow);
  agent.registerWorkflow(processUserRequestWorkflow);
  agent.registerWorkflow(analyzeIssueImpactWorkflow);
  agent.registerWorkflow(extractKnowledgeWorkflow);
}

// 使用側
const agent = new CoreAgent();
registerDefaultWorkflows(agent);  // 必要に応じて
agent.registerWorkflow(customWorkflow);  // カスタムも追加可能
```

## 5. パッケージ名の変更（将来課題）

### 提案
- `packages/core` → `packages/agent`
- `packages/server` → `packages/engine`

### 影響範囲が大きいため、別Issueで対応を検討

## まとめ

Phase 3では以下を実装：
1. ワークフロー名をパスカルケースで統一
2. テスト構造を明確に分離
3. 1対nマッピングの基盤を準備（Phase 4で本実装）
4. 登録ヘルパー関数の提供（自動登録ではなく）