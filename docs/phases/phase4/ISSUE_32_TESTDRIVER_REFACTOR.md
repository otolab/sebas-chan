# Issue #32: TestDriverとAIServiceの適切な使用パターン統一 - 作業メモ

## 作業概要
日付: 2025-10-07
作業者: Claude + @otolab

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

### 2. 修正したファイル（Phase 1完了 - 2025-10-07）

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

## 残作業

### Phase 1: ユニットテストのTestDriver修正（完了）

✅ **全a系ワークフローテスト修正完了**

#### 修正不要（正しく実装済み）
- ✅ `packages/core/src/workflows/d-2.collect-system-stats/collect-system-stats.test.ts`
  - TestDriverの使用なし（createCustomMockContextを使用）

### 存在しないワークフロー（確認済み）
- b-2系: 存在しない
- c系: 存在しない
- d-1系: 存在しない

### その他のテストファイル
- [ ] `packages/server/src/**/*.test.ts` で同様のパターンがある場合

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

### テスト実行結果
- ユニットテスト: 79/79 成功
- 型チェック: エラーなし（warningは既存）
- リント: エラーなし（warningは既存）

### 注意点
1. `createCustomMockContext`を使用する場合、ストレージモックの設定は**後**に行う
2. 各テストケースでmockContextを再作成する場合、mockEmitterも再作成する
3. a-3.extract-knowledgeは多数のテストケースがあるため、別途検討が必要

## まとめ

### 完了した作業（2025-10-07）
1. **a系ワークフロー（全4ファイル完了）**
   - ✅ a-0.ingest-input: 全6テスト修正完了
   - ✅ a-1.process-user-request: 全6テスト修正完了
   - ✅ a-2.analyze-issue-impact: setupDriverMocks関数修正完了
   - ✅ a-3.extract-knowledge: 10テスト中7箇所を修正完了

2. **b系ワークフロー**
   - ✅ b-1.cluster-issues: 既に正しく実装済み（修正不要）

3. **d系ワークフロー**
   - ✅ d-2.collect-system-stats: TestDriver未使用（修正不要）

4. **serverパッケージ**
   - ✅ 二重モックパターンなし（修正不要）

### テスト実行結果
- **ユニットテスト**: 79/79 成功
- **型チェック**: エラーなし
- **リント**: エラーなし

### 残作業の優先順位

#### 優先度中（Phase 2）
2. **統合テストへのAIService導入**
   - test/integration配下でのAIService活用
   - capability-drivenなドライバー選択の実装

#### 優先度低
3. **動的レスポンスパターンの活用**
   - TestDriverの動的レスポンス機能の利用検討
   - より柔軟なテストシナリオの実装

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

## コミット履歴
- `bba09d1`: TestDriverの二重モックパターンを解消（a-0, a-1, a-2の修正）
- 今回の修正: a-3.extract-knowledgeの修正完了（全a系ワークフロー完了）

## 参考資料
- Issue #32: https://github.com/otolab/sebas-chan/issues/32
- 親Issue #27: フレームワーク統合の全体計画