# ワークフロー改善計画

## 現状の分析

### 1. ワークフロー実装の課題

- テストファイルに多数のモックワークフロー定義が散在
- 実際のワークフロー（`packages/core/src/workflows/impl-functional/`）が未活用
- ワークフローの自動登録メカニズムが存在しない

### 2. 動作チェックの課題

- ワークフロー実行の前提条件チェックが不足
- 実行結果の検証が表面的（success/failureのみ）
- 副作用（イベント発行、状態更新）の検証が不完全

### 3. テスト構造の課題

- E2E、統合、単体テストでワークフロー定義が重複
- テスト間でのワークフロー実装の一貫性がない

## 改善提案

### Phase 1: ワークフローカタログの作成

```typescript
// packages/core/src/workflows/catalog.ts
import { ingestInputWorkflow } from './impl-functional/ingest-input.js';
import { processUserRequestWorkflow } from './impl-functional/process-user-request.js';
import { analyzeIssueImpactWorkflow } from './impl-functional/analyze-issue-impact.js';
import { extractKnowledgeWorkflow } from './impl-functional/extract-knowledge.js';

export const WORKFLOW_CATALOG = {
  INGEST_INPUT: ingestInputWorkflow,
  PROCESS_USER_REQUEST: processUserRequestWorkflow,
  ANALYZE_ISSUE_IMPACT: analyzeIssueImpactWorkflow,
  EXTRACT_KNOWLEDGE: extractKnowledgeWorkflow,
} as const;

export type WorkflowType = keyof typeof WORKFLOW_CATALOG;
```

### Phase 2: ワークフロー実行の前提条件チェック

```typescript
// packages/core/src/workflows/validators.ts
export interface WorkflowPreConditions {
  requiredPayloadFields?: string[];
  requiredContextFields?: string[];
  statePattern?: RegExp;
}

export function validatePreConditions(
  event: AgentEvent,
  context: WorkflowContext,
  conditions: WorkflowPreConditions
): ValidationResult {
  // 実装
}
```

### Phase 3: ワークフロー実行結果の詳細検証

```typescript
// packages/core/src/workflows/verifiers.ts
export interface WorkflowPostConditions {
  expectedOutputFields?: string[];
  expectedStateChange?: boolean;
  expectedEvents?: string[];
}

export function verifyPostConditions(
  result: WorkflowResult,
  logger: WorkflowLogger,
  conditions: WorkflowPostConditions
): VerificationResult {
  // 実装
}
```

### Phase 4: テストヘルパーの統一

```typescript
// packages/core/src/test-utils/workflow-helpers.ts
export function createTestWorkflow(
  name: string,
  options?: {
    shouldFail?: boolean;
    shouldEmitEvents?: string[];
    shouldUpdateState?: boolean;
  }
): WorkflowDefinition {
  // 統一されたテスト用ワークフロー生成
}
```

## 実装優先順位

1. **即座に実装すべき項目**
   - ワークフローカタログの作成
   - CoreEngineでの自動登録

2. **次のフェーズで実装**
   - 前提条件・事後条件チェック
   - テストヘルパーの統一

3. **将来的な改善**
   - ワークフローのメトリクス収集
   - ワークフロー実行のトレーシング

## 期待される効果

1. **コードの重複削減**: 約30%のテストコード削減
2. **保守性向上**: ワークフロー定義の一元管理
3. **信頼性向上**: 包括的な動作チェック
4. **開発効率向上**: テスト作成の簡素化
