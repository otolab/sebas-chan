# Issue #32: TestDriverとAIServiceの適切な使用パターン統一 - 完了報告

## 作業概要
日付: 2025-10-07
作業者: Claude + @otolab
ステータス: **完了** (PR #36作成済み)

TestDriverの二重モックパターンを解消し、フレームワークの意図に沿った適切な実装に修正。

## 問題点

### 修正前の問題のあるパターン
```typescript
// 二重モック（vi.fn()でモック化した関数がTestDriverを返す）
mockContext.createDriver = vi.fn().mockResolvedValue(
  new TestDriver({ responses: [...] })
);
```

この実装の問題：
- `createDriver`自体がモック関数である必要がない
- DriverFactoryパターン `(criteria) => AIDriver | Promise<AIDriver>` の誤解
- 不要な複雑性

## 実施した修正

### 1. 修正後のパターン

#### パターンA: createCustomMockContextを活用（推奨）
```typescript
// beforeEachで初期設定した場合、各テストで上書き
mockContext = createCustomMockContext({
  driverResponses: [JSON.stringify({
    // レスポンス内容
  })],
  storageOverrides: {
    // 必要なストレージモックの設定
  }
});
mockEmitter = createMockWorkflowEmitter();
```

#### パターンB: シンプルな関数として実装
```typescript
// setupDriverMocksのような関数内で
mockContext.createDriver = async () =>
  new TestDriver({
    responses: [JSON.stringify(analyzeIssueResponse)],
  });
```

### 2. 修正したファイル（完了 - 2025-10-07）

#### a系ワークフロー（全4ファイル完了）
- ✅ `packages/core/src/workflows/a-0.ingest-input/ingest-input.test.ts`
  - 全6テストを修正
  - mockContextの再作成時にストレージモックの設定順序も修正

- ✅ `packages/core/src/workflows/a-1.process-user-request/process-user-request.test.ts`
  - 全6テストを修正
  - 重複した`responses`配列の構文エラーも修正

- ✅ `packages/core/src/workflows/a-2.analyze-issue-impact/analyze-issue-impact.test.ts`
  - setupDriverMocks関数を修正（vi.fn().mockResolvedValueパターンを廃止）

- ✅ `packages/core/src/workflows/a-3.extract-knowledge/extract-knowledge.test.ts`
  - 10テスト中7箇所でcreateDriverを直接上書きしていた箇所を修正
  - test-utils.jsのインポート追加
  - createCustomMockContextパターンに統一
  - updateKnowledgeモックの追加で全テスト成功

#### b系ワークフロー
- ✅ `packages/core/src/workflows/b-1.cluster-issues/cluster-issues.test.ts`
  - 既に正しく実装済み（修正不要）

- ✅ `packages/core/src/workflows/b-2.update-flow-relations/update-flow-relations.test.ts`
  - **新規作成**: 13の包括的なテストケースを実装
  - コードカバレッジに焦点を当てたユニットテスト
  - createCustomMockContextパターンを使用
  - トリガー条件のロジックも修正

#### d系ワークフロー
- ✅ `packages/core/src/workflows/d-2.collect-system-stats/collect-system-stats.test.ts`
  - TestDriverの使用なし（createCustomMockContextを使用）
  - 修正不要

### 3. B-2ワークフローの実装修正
- ✅ `packages/core/src/workflows/b-2.update-flow-relations/index.ts`
  - トリガー条件を正しいイベント構造に修正
  - ISSUE_STATUS_CHANGEDイベントの`to`フィールドを使用
  - ISSUE_UPDATEDイベントの`updates.after.priority`を参照

## Phase 2: 統合テストのAIService活用（未着手）

### 計画
```typescript
// test/integration/setup-ai.js の参考実装
import { AIService } from '@moduler-prompt/driver';

const aiService = new AIService({
  models: [
    { model: 'test', provider: 'test', capabilities: ['structured'] },
    // macOS環境ではMLXも利用可能
    ...(process.platform === 'darwin' ? [
      { model: 'mlx-community/gemma-3-27b-it-qat-4bit', provider: 'mlx' }
    ] : [])
  ]
});

// capability-drivenなドライバー取得
const driver = await aiService.createDriverFromCapabilities(
  ['structured'],
  { preferLocal: true, lenient: true }
);
```

## 確認事項

### テスト実行結果（最終）
- ユニットテスト: **92/92 成功**（B-2テスト13件追加）
- 型チェック: エラーなし（warningは既存）
- リント: エラーなし（warningは既存）

### 注意点
1. `createCustomMockContext`を使用する場合、ストレージモックの設定は**後**に行う
2. 各テストケースでmockContextを再作成する場合、mockEmitterも再作成する
3. イベント構造は`@sebas-chan/shared-types`の定義に厳密に従う

## 完了した作業（2025-10-07）

### 1. TestDriverパターンの統一
- **a系ワークフロー（全4ファイル）**: 二重モックパターンを解消
- **b-1.cluster-issues**: 既に正しく実装済み
- **d-2.collect-system-stats**: TestDriver未使用

### 2. B-2ワークフローテストの新規実装
- 13の包括的なテストケースを作成
- コードカバレッジ重視のユニットテスト
- トリガー条件のロジックも同時に修正

### 3. ドキュメント更新
- テスト戦略（STRATEGY.md）にベストプラクティスを追加
- ワークフローテスト戦略（WORKFLOW_TEST_STRATEGY.md）を更新

### 4. PR作成
- **PR #36**: https://github.com/otolab/sebas-chan/pull/36
- Issue #32をクローズ予定

## 今後の課題（新規Issueとして検討）

### 1. C系ワークフローのテスト作成
- C-1 SuggestNextFlow
- C-2 SuggestNextAction
- 現在テストが存在しない

### 2. 統合テストのAIService活用
- test/integration配下でのcapability-driven実装
- 実際のDBClient/CoreAgent使用への移行

### 3. エラーケースのvi.fn()パターン改善
- a-1, a-2, a-3の一部エラーケースで残存（3箇所）
- 影響は限定的だが、一貫性のため修正検討

## 学んだこと

1. **DriverFactoryパターンの正しい理解**
   - `(criteria) => AIDriver | Promise<AIDriver>`
   - vi.fn()でのモック化は不要

2. **テストコードの保守性**
   - createCustomMockContextの活用で一貫性のあるテスト
   - 二重モックを避けることでシンプルで理解しやすいコード

3. **フレームワーク機能の適切な活用**
   - TestDriverの機能を最大限活用
   - 将来的にはAIServiceによるcapability-driven選択

## コミット履歴（PR #36）
1. `89fba0c`: TestDriverの二重モックパターンを解消（a-0, a-1, a-2の修正）
2. `3add987`: a-3テストのTestDriverパターンを統一
3. `f8c33bf`: B-2 UpdateFlowRelationsワークフローのユニットテストを追加
4. `775a650`: B-2テストの型エラーを修正
5. `5d6c3b5`: B-2ワークフローのトリガー条件を正しいイベント構造に修正
6. `b2ddd55`: Issue #32の作業記録とテスト戦略の更新

## 参考資料
- Issue #32: https://github.com/otolab/sebas-chan/issues/32
- PR #36: https://github.com/otolab/sebas-chan/pull/36
- 親Issue #27: フレームワーク統合の全体計画