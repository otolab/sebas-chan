# Issue: Phase 3 - ワークフローカタログと自動登録の実装

## 概要
現在、ワークフロー定義がテストファイルに散在しており、実際の実装（`impl-functional/`）が活用されていない。これを改善し、ワークフローの一元管理と自動登録を実現する。

## 背景と課題

### 現状の問題点
1. **重複実装**: テストファイルごとにモックワークフローを定義
2. **手動登録**: 各テストで`registry.register()`を個別に呼び出し
3. **実装の未活用**: `impl-functional/`の本番ワークフローが未使用
4. **チェック不足**: ワークフロー実行の前提条件・事後条件の検証が最小限

### 影響
- テストコードの約30%が重複定義
- ワークフロー追加時の作業量増加
- 実装とテストの乖離リスク

## 提案する解決策

### 1. ワークフローカタログの作成
```typescript
// packages/core/src/workflows/catalog.ts
export const WORKFLOW_CATALOG = {
  INGEST_INPUT: ingestInputWorkflow,
  PROCESS_USER_REQUEST: processUserRequestWorkflow,
  ANALYZE_ISSUE_IMPACT: analyzeIssueImpactWorkflow,
  EXTRACT_KNOWLEDGE: extractKnowledgeWorkflow,
} as const;
```

### 2. CoreEngineでの自動登録
```typescript
// packages/server/src/core/engine.ts
private registerDefaultWorkflows(): void {
  Object.entries(WORKFLOW_CATALOG).forEach(([type, workflow]) => {
    this.coreAgent.registerWorkflow(workflow);
  });
}
```

### 3. ワークフロー実行検証の強化
```typescript
// packages/core/src/workflows/validators.ts
export interface WorkflowValidator {
  validatePreConditions(event, context): ValidationResult;
  validatePostConditions(result, logger): ValidationResult;
}
```

## 実装タスク

### Phase 3-1: 基盤整備
- [ ] ワークフローカタログの作成
- [ ] 型定義の整理（WorkflowType）
- [ ] エクスポート構造の整理

### Phase 3-2: 自動登録実装
- [ ] CoreEngineに自動登録メソッド追加
- [ ] 初期化時の自動登録実装
- [ ] 既存テストの修正

### Phase 3-3: 検証機能強化
- [ ] 前提条件バリデーター実装
- [ ] 事後条件バリデーター実装
- [ ] WorkflowLoggerとの統合

### Phase 3-4: テスト整理
- [ ] モックワークフローの削除
- [ ] 実ワークフローを使用したテスト更新
- [ ] テストヘルパーの統一

## 期待される成果
1. **コード削減**: テストコード約30%削減
2. **保守性向上**: ワークフロー定義の一元管理
3. **品質向上**: 包括的な動作検証
4. **開発効率**: 新規ワークフロー追加の簡素化

## 技術的詳細

### ワークフロー名とイベントタイプのマッピング
現在の実装では、ワークフロー名がそのままイベントタイプとして使用されている：
- `IngestInput` → `INGEST_INPUT`イベント
- `ProcessUserRequest` → `PROCESS_USER_REQUEST`イベント

この命名規則を維持しつつ、カタログで明示的にマッピングを管理する。

### 影響範囲
- `packages/core/src/workflows/`
- `packages/server/src/core/engine.ts`
- 全テストファイル（E2E、統合、単体）

## 受け入れ条件
1. 全ての本番ワークフローがカタログに登録されている
2. CoreEngine初期化時に自動登録される
3. テストでモックワークフローの重複定義が削除されている
4. 前提条件・事後条件の検証が実装されている
5. 全テストがパスする

## 参考リンク
- [WORKFLOW_IMPROVEMENT_PLAN.md](../WORKFLOW_IMPROVEMENT_PLAN.md)
- [実装状況](../IMPLEMENTATION_STATUS.md)