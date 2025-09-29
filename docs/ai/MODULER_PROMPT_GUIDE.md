# Moduler Prompt利用ガイド

## 目的と原則

Moduler Promptは、プロンプトの構造化と安全性を提供するTypeScriptフレームワークです。sebas-chanのワークフローでAI処理を実装する際の標準的な方法です。

### 設計原則

1. **セキュリティファースト**: ユーザーデータとシステム指示を分離
2. **型安全性**: TypeScriptによる型定義と検証
3. **再利用性**: モジュール化による共通パターンの再利用
4. **明確な構造**: 3セクション構造による役割の明確化

## アーキテクチャ

### 標準セクション構造

Moduler Promptの標準セクションは、最終的に **instructions/data/output** の3つの大セクションに分類・合成されます。

#### 標準セクションと分類先

| 標準セクション      | 役割           | 大セクション | セクションタイトル          |
| ------------------- | -------------- | ------------ | --------------------------- |
| **objective**       | 目的と役割     | instructions | 'Objective and Role'        |
| **terms**           | 用語定義       | instructions | 'Term Explanations'         |
| **methodology**     | 処理方法論     | instructions | 'Processing Methodology'    |
| **instructions**    | 具体的指示     | instructions | 'Instructions'              |
| **guidelines**      | ガイドライン   | instructions | 'Guidelines'                |
| **preparationNote** | 応答準備ノート | instructions | 'Response Preparation Note' |
| **state**           | 現在の状態     | data         | 'Current State'             |
| **inputs**          | 入力データ     | data         | 'Input Data'                |
| **materials**       | 参考資料       | data         | 'Prepared Materials'        |
| **chunks**          | データチャンク | data         | 'Input Chunks'              |
| **messages**        | 対話履歴       | data         | 'Messages'                  |
| **cue**             | 出力開始合図   | output       | (カスタム)                  |
| **schema**          | 出力形式定義   | output       | (JSONスキーマ)              |

#### 最終的な3大セクション構造

| 大セクション     | 役割                       | セキュリティ                   |
| ---------------- | -------------------------- | ------------------------------ |
| **instructions** | AIへの静的指示             | プロンプトインジェクション対策 |
| **data**         | コンテキストベースのデータ | ユーザーデータを分離           |
| **output**       | 出力定義                   | 構造化出力の保証               |

### 重要な特徴：行単位の解釈

**配列の各要素は独立した行として解釈されます。** これにより：

- 自然な箇条書き形式のプロンプトが生成される
- 静的指示とコンテキストデータが視覚的に明確に分離される
- 可読性と保守性が向上する

**注意**: `instructions`は標準セクション名であり、同時に大セクション名でもあるため、文脈に注意が必要です。

### モジュールとコンテキスト

**PromptModule<T>**: 再利用可能なプロンプトテンプレート

- 静的な構造定義
- コンテキスト型パラメータTで型安全性を保証

**Context**: 実行時のデータ

- ユーザー入力
- ワークフロー状態
- 環境依存情報

## 実装原則

### PromptModuleは静的に定義

**重要**: PromptModuleはプログラム言語的な意味で常に静的です。

- 関数外で定義する（ローカル変数を参照しない）
- 実行時の値はコンテキスト経由で渡す
- compile時にコンテキストの値が解決される

## 実装仕槗

### 正しい実装パターン

```typescript
import { compile, createContext } from '@moduler-prompt/core';
import type { PromptModule } from '@moduler-prompt/core';
import { RecordType } from '../recorder.js';

// コンテキストの型定義
interface AnalysisContext {
  userInput: string | undefined;
  relatedData: {
    issues: Issue[];
    knowledge: Knowledge[];
  };
}

// PromptModuleを関数外で静的に定義
export const analysisModule: PromptModule<AnalysisContext> = {
  createContext: () => ({
    userInput: undefined,
    relatedData: {
      issues: [],
      knowledge: [],
    },
  }),

  // instructions大セクションに分類される標準セクション
  objective: ['ユーザーリクエストを分析して適切に分類する'],

  terms: [
    'Issue: 解決すべき問題やタスク',
    'Pond: 一時的なデータ保管場所',
    'Knowledge: 抽出された知識',
  ],

  instructions: [
    // 標準セクション名（instructions大セクションに分類）
    '以下の観点で判定してください：',
    '- リクエストの種類',
    '- 必要なアクション',
    '- 発行すべきイベント',
  ],

  // data大セクションに分類される標準セクション
  state: [`現在時刻: ${new Date().toISOString()}`, `セッションID: ${sessionId}`],

  // コンテキストから値を取得
  inputs: [
    (ctx) => `ユーザーリクエスト: ${ctx.userInput || '（内容なし）'}`,
    '',
    (ctx) => `関連Issue: ${ctx.relatedData.issues.length}件`,
    (ctx) => ctx.relatedData.issues.map((i) => `  - ${i.title}`),
  ],

  materials: [
    'リクエスト種類の例: issue, question, action, feedback',
    'イベントタイプの例: ISSUE_CREATED, DATA_ARRIVED',
  ],

  // schemaセクション（output大セクションに分類）
  schema: [
    {
      type: 'json',
      content: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['category', 'confidence'],
      },
    },
  ],
};

// 2. コンテキストを作成してコンパイル
const context: AnalysisContext = {
  userInput: 'ユーザーからの入力',
  relatedData: {
    issues: await storage.searchIssues(userInput),
    knowledge: await storage.searchKnowledge(userInput),
  },
};

const compiled = compile(analysisModule, context);
const result = await driver.query(compiled);

// 3. WorkflowRecorderで記録
context.recorder.record(RecordType.AI_CALL, {
  model: driver.modelId,
  temperature: 0.3,
});

// 3. 構造化出力の取得
if (result.structuredOutput) {
  // 型安全な取得
  const data = result.structuredOutput;
} else {
  // フォールバック
  const data = JSON.parse(result.content);
}
```

### 間違った実装パターン（避けるべき）

```typescript
// ❌ 関数内でPromptModuleを作成し、ローカル変数を参照
function createPromptModule(content: string, issues: Issue[]) {
  return {
    instructions: [
      `ユーザーリクエスト: ${content}`, // ローカル変数を直接参照
      `関連Issue: ${issues.length}件`,
    ],
  };
}

// ❌ スプレッド構文でモジュールを結合（上書きになる）
const module = {
  ...baseModule,
  inputs: dynamicInputs, // 上書きされる
};

// ❌ 全てをinstructionsに入れる（セキュリティリスク）
const module = {
  instructions: [
    '以下のデータを分析してください',
    userInput, // ユーザーデータを直接混入
  ],
};
```

## QueryResult仕様

### 型定義

```typescript
interface QueryResult {
  content: string; // 生のテキストレスポンス
  structuredOutput?: unknown; // 構造化出力（スキーマ指定時）
  usage?: {
    // トークン使用量
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'length' | 'error';
}
```

### 構造化出力のサポート

| ドライバー | structuredOutput | 備考              |
| ---------- | ---------------- | ----------------- |
| OpenAI     | ✅               | ネイティブJSON    |
| Anthropic  | ✅               | ネイティブJSON    |
| VertexAI   | ✅               | ネイティブJSON    |
| TestDriver | ⚠️               | extractJSON使用   |
| その他     | ❌               | content手動パース |

## 高度な機能

### モジュール合成

`merge()`関数は異なる**責務**を持つモジュールを合成するためのものです。

```typescript
import { merge } from '@moduler-prompt/core';
import { updateStatePromptModule } from '../shared/prompts/state.js';

// 正しい使い方：異なる責務のモジュールを合成
const myWorkflowModule = merge(
  updateStatePromptModule, // State管理の責務
  baseWorkflowModule // ワークフロー固有の責務
);
```

**重要な仕様**:

- 同じセクションがある場合、内容が**配列として結合**されます（上書きではない）
- schemaセクションも同様にマージされる（複数のJSONElementが保持される）
- `updateStatePromptModule`は`statePromptModule`を既に含んでいる

**設計の利点**:

- **責務の分離**: 各モジュールが単一の責任を持つ
- **再利用性**: 共通モジュール（updateStatePromptModule等）を複数のワークフローで利用
- **段階的構築**: 複雑なプロンプトも小さなモジュールから構築可能

### コンテキストの活用

PromptModule<T>の型パラメータでコンテキストを型安全に管理：

```typescript
interface MyContext {
  items: string[];
  config: { maxItems: number };
}

const myModule: PromptModule<MyContext> = {
  createContext: () => ({
    items: [],
    config: { maxItems: 10 },
  }),

  inputs: [
    (ctx) => `処理対象: ${ctx.items.length}件`,
    (ctx) => ctx.items.slice(0, ctx.config.maxItems),
  ],
};
```

### ストリーミング

`streaming` capabilityを持つドライバーでリアルタイム応答が可能

## エラーハンドリング仕様

### 必須チェック項目

1. **result.content**: 空レスポンスのチェック
2. **finishReason**: 'stop'以外は警告記録
3. **structuredOutput**: スキーマ指定時の検証
4. **JSONパース**: エラー時のフォールバック処理

## 実装例

実装済みワークフローでの使用例：

- process-user-request: ユーザーリクエスト分析
- analyze-issue-impact: Issue影響分析
- extract-knowledge: 知識抽出

## 参照

- [Moduler Prompt公式ドキュメント](https://github.com/otolab/moduler-prompt/blob/main/docs/)
- [ワークフロー開発者ガイド](./DEVELOPER_GUIDE.md)
- [ワークフロー仕様書](./SPECIFICATION.md)

## チェックリスト

### 実装時の必須確認事項

- [ ] 標準セクションを正しい大セクションに分類しているか
  - instructions大セクション: objective, terms, methodology, instructions, guidelines, preparationNote
  - data大セクション: state, inputs, materials, chunks, messages
  - output大セクション: cue, schema
- [ ] **PromptModuleを関数外で静的に定義しているか**
- [ ] **ローカル変数を直接参照していないか**
- [ ] **動的な値はコンテキスト経由で渡しているか**
- [ ] **配列の各要素を独立した行として記述しているか（長文を避ける）**
- [ ] **各標準セクションを箇条書き形式で記述しているか**
- [ ] ユーザーデータをdata大セクションの標準セクション（inputs/materials/chunks/messages）に隔離しているか
- [ ] schemaセクションで構造化出力を定義しているか
- [ ] structuredOutputの有無を確認してフォールバック処理を実装しているか
- [ ] エラーハンドリングを適切に実装しているか
- [ ] WorkflowRecorderで AI_CALL を記錄しているか
