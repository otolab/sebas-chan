# プロンプトテストガイドライン

## 概要

このドキュメントは、sebas-chanプロジェクトにおけるmoduler-promptを使用したプロンプトテストの実装ガイドラインです。AI駆動ワークフローの品質を保証するため、プロンプトの構造と出力の両面から検証を行います。

## テストの目的

1. **プロンプト構造の検証**: コンテキストが正しくプロンプトに反映されることを確認
2. **出力形式の検証**: AIの出力が期待されるスキーマに準拠することを確認
3. **振る舞いの検証**: AIが期待される判断・分類を行うことを確認

## テスト構成

### ファイル配置

```
packages/core/src/workflows/{workflow-name}/
├── index.ts           # ワークフロー実装
├── prompts.ts         # プロンプトモジュール定義
├── prompts.test.ts    # プロンプトテスト（このガイドの対象）
└── {workflow}.test.ts # ワークフローロジックのテスト
```

### テストの2層構造

```typescript
describe('WorkflowName Prompts', () => {
  // 1. ユニットテスト（AI不要）
  describe('ユニットテスト（コンテキスト反映）', () => {
    // コンテキスト値の反映確認
    // 関連リソースの展開確認
    // エッジケース処理
  });

  // 2. AI実行テスト（AI必要）
  describe.skipIf(() => process.env.SKIP_AI_TESTS === 'true')('AI実行テスト', () => {
    // 実際のAI実行と出力検証
    // スキーマ準拠の確認
    // シナリオベースの振る舞い検証
  });
});
```

## ユニットテスト実装ガイド

### 1. 基本的なコンテキスト反映テスト

```typescript
it('入力コンテキストがプロンプトに正しく反映される', () => {
  const context: YourContextType = {
    field1: 'テスト値',
    field2: '別の値',
    // ...
  };

  const compiled = compile(yourPromptModule, context);
  const compiledString = JSON.stringify(compiled);

  // コンテキストの値が含まれていることを確認
  expect(compiledString).toContain('テスト値');
  expect(compiledString).toContain('別の値');
});
```

### 2. 関連リソースの展開テスト

```typescript
it('関連Issueがmaterialsセクションに正しく展開される', () => {
  const issue: Issue = {
    id: 'issue-001',
    title: 'テストIssue',
    // 正しい型定義に準拠したデータ
    status: 'open',
    priority: 'high',
    labels: ['test'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const context = {
    relatedIssues: [issue],
    // ...
  };

  const compiled = compile(promptModule, context);
  const materials = compiled.data.filter((item: any) => item.type === 'material');

  const issueMaterial = materials.find((m: any) => m.id === 'issue-issue-001');
  expect(issueMaterial).toBeDefined();
  expect(issueMaterial?.title).toContain('テストIssue');
});
```

### 3. エッジケース処理

```typescript
it('undefinedや空配列が適切に処理される', () => {
  const context = {
    content: undefined,
    relatedIssues: [],
    // ...
  };

  const compiled = compile(promptModule, context);

  // エラーが発生しないことを確認
  expect(compiled).toBeDefined();
  // デフォルト値が使用されることを確認
  expect(JSON.stringify(compiled)).toContain('（内容なし）');
});
```

## AI実行テスト実装ガイド

### 1. Zodバリデータの定義

```typescript
import { z } from 'zod';

// 出力スキーマのZodバリデータ
const outputSchemaValidator = z.object({
  field1: z.string(),
  field2: z.boolean(),
  field3: z.enum(['option1', 'option2', 'option3']),
  nestedField: z.object({
    subfield: z.string()
  }),
  arrayField: z.array(z.string())
});
```

### 2. AI実行とスキーマ検証

```typescript
describe.skipIf(() => process.env.SKIP_AI_TESTS === 'true')('AI実行テスト', () => {
  let aiService: AIService | null = null;

  beforeAll(async () => {
    aiService = await setupAIServiceForTest();
    if (!aiService) {
      throw new Error('AI Service is required for these tests');
    }
  });

  it('期待される分類・判定を行う', async () => {
    const context = {
      // テストシナリオのコンテキスト
    };

    const driver = await aiService!.createDriverFromCapabilities(['structured'], { lenient: true });
    const compiled = compile(promptModule, context);
    const result = await driver.query(compiled);

    // スキーマバリデーション
    const output = outputSchemaValidator.parse(result.structuredOutput);

    // ビジネスロジックの検証
    expect(output.field1).toBe('期待値');
    expect(output.field2).toBe(true);
  });
});
```

## 重要な注意点

### 1. 型定義の正確性

**問題**: テストデータが実際の型定義と不一致

```typescript
// ❌ 間違い：存在しないフィールドを使用
const knowledge: Knowledge = {
  id: 'know-001',
  title: 'タイトル',  // Knowledgeにtitleフィールドは存在しない
  // ...
};

// ✅ 正しい：実際の型定義に準拠
const knowledge: Knowledge = {
  id: 'know-001',
  type: 'process_manual',  // 正しいフィールド名
  content: '内容',
  reputation: { upvotes: 0, downvotes: 0 },
  sources: [],
  createdAt: new Date()
};
```

**対策**: shared-typesの型定義を必ず確認し、正確なテストデータを作成する

### 2. Material要素の数に注意

```typescript
// ❌ 間違い：固定数を期待
expect(materials).toHaveLength(3);

// ✅ 正しい：プロンプトモジュールが追加する固定要素を考慮
expect(materials.length).toBeGreaterThanOrEqual(5);
const materialIds = materials.map((m: any) => m.id);
expect(materialIds).toContain('issue-001');
expect(materialIds).toContain('event-types');  // 固定要素
expect(materialIds).toContain('action-types');  // 固定要素
```

### 3. AI実行テストの環境依存

```typescript
// 環境変数による制御
describe.skipIf(() => process.env.SKIP_AI_TESTS === 'true')('AI実行テスト', () => {
  // ...
});

// AIサービスの初期化チェック
beforeAll(async () => {
  aiService = await setupAIServiceForTest();
  if (!aiService) {
    throw new Error('AI Service is required for these tests');
  }
});
```

## テストシナリオの選定基準

### ユニットテストで検証すべきこと

1. **正常系**: 典型的な入力データでの動作
2. **境界値**: 空配列、undefined、null値の処理
3. **データ変換**: 複雑なオブジェクトの展開（MaterialElement変換など）
4. **複数リソース**: 複数の関連リソースが正しく含まれること

### AI実行テストで検証すべきこと

1. **分類精度**: 入力の種類を正しく分類（critical/high/medium/low など）
2. **判定ロジック**: ビジネスルールに基づく判定（新規作成 vs 更新など）
3. **関連性認識**: 既存リソースとの関連性を正しく判定
4. **出力完全性**: 必須フィールドがすべて含まれること

## ベストプラクティス

### 1. テストの独立性

各テストは独立して実行可能であるべき：

```typescript
// 各テストで新しいコンテキストを作成
it('テスト1', () => {
  const context = { /* ... */ };
  // ...
});

it('テスト2', () => {
  const context = { /* ... */ };  // 新しいコンテキスト
  // ...
});
```

### 2. 明確なアサーション

```typescript
// ❌ 曖昧なアサーション
expect(output).toBeTruthy();

// ✅ 具体的なアサーション
expect(output.severity).toBe('critical');
expect(output.needsNewIssue).toBe(true);
expect(output.labels).toContain('bug');
```

### 3. エラーメッセージの改善

```typescript
// カスタムエラーメッセージを提供
expect(
  objectiveSection,
  'Objective section not found in compiled prompt'
).toBeTruthy();
```

## CI/CD統合

### GitHub Actions設定

```yaml
- name: Run unit tests
  run: npm run test:unit

- name: Run AI tests (optional)
  if: ${{ secrets.OPENAI_API_KEY != '' }}
  run: npm run test:ai
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### ローカル開発

```bash
# ユニットテストのみ実行
SKIP_AI_TESTS=true npm test

# AI実行テストも含めて実行
npm test  # .env.localにAPI設定が必要
```

## トラブルシューティング

### 問題1: コンパイルエラー

**症状**: `compile()`関数でエラーが発生

**対策**:
1. PromptModuleの構造を確認
2. createContext()の戻り値がコンテキスト型と一致することを確認
3. DynamicContent関数の戻り値を確認

### 問題2: AI実行テストのタイムアウト

**症状**: AI実行テストが長時間応答しない

**対策**:
```typescript
// タイムアウトを延長
it('テスト', async () => {
  // ...
}, 30000);  // 30秒のタイムアウト
```

### 問題3: スキーマバリデーションエラー

**症状**: Zodバリデーションでエラー

**対策**:
1. AIの実際の出力をログで確認
2. スキーマ定義と実際の出力構造を比較
3. 必要に応じてスキーマを調整

## 参考実装

- [A-0: IngestInput](../../packages/core/src/workflows/a-0.ingest-input/prompts.test.ts)
- [A-1: ProcessUserRequest](../../packages/core/src/workflows/a-1.process-user-request/prompts.test.ts)

## 関連ドキュメント

- [テスト仕様](./SPECIFICATIONS.md)
- [ワークフローテスト戦略](../phases/phase4/WORKFLOW_TEST_STRATEGY.md)
- [Moduler Promptガイド](../ai/MODULER_PROMPT_GUIDE.md)

---
**作成日**: 2025-10-08
**最終更新**: 2025-10-08