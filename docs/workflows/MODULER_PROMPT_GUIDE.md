# ワークフロー開発におけるModuler Prompt利用ガイド

## 概要

sebas-chanのワークフローでは、AI処理に[Moduler Prompt](https://github.com/otolab/moduler-prompt)を使用します。Moduler Promptは、プロンプトを再利用可能なモジュールとして管理するTypeScriptフレームワークで、sebas-chanと一体として設計されています。

## 基本概念

### プロンプトの3セクション構造
Moduler Promptは、セキュリティと構造化のためにプロンプトを3つのセクションに分離します：

- **Instructions**: AIへの指示（システムが提供）
- **Data**: 処理対象データ（プロンプトインジェクション対策）
- **Output**: 出力形式の指定

### Module（静的）とContext（動的）の分離
- **Module**: 再利用可能なプロンプトテンプレート
- **Context**: 実行時のデータと状態

## クイックスタート

### 基本的な使い方

```typescript
import type { WorkflowDefinition } from '@sebas-chan/core';
import { compile } from '@moduler-prompt/core';
import type { PromptModule } from '@moduler-prompt/core';

export const analyzeIssueWorkflow: WorkflowDefinition = {
  name: 'analyze-issue',
  description: 'Issueを分析して優先度を判定',
  triggers: {
    eventTypes: ['ISSUE_CREATED']
  },
  executor: async (event, context, emitter) => {
    // 1. プロンプトモジュールを定義
    const analysisModule: PromptModule = {
      objective: ['Issueの緊急度と影響範囲を分析する'],
      instructions: [
        '以下の観点で評価してください：',
        '- 緊急度（critical/high/normal/low）',
        '- 影響範囲（全体/一部/個別）',
        '- 必要なアクション'
      ],
      inputs: [
        JSON.stringify({
          issue: event.payload.issue,
          context: context.state
        })
      ],
      output: ['JSON形式で出力：{ urgency, impact, actions }']
    };

    // 2. ドライバーを作成
    const driver = await context.createDriver({
      capabilities: ['japanese', 'json_mode']
    });

    // 3. コンパイルして実行
    const compiled = compile(analysisModule, {});
    const result = await driver.query(compiled);

    // 4. 結果を処理
    const analysis = JSON.parse(result.content);

    return {
      success: true,
      context,
      output: analysis
    };
  }
};
```

## よく使うパターン

### モジュール合成

複数のモジュールを組み合わせて使用できます：

```typescript
import { merge } from '@moduler-prompt/core';

const baseModule: PromptModule = {
  objective: ['データを分析する'],
  instructions: ['論理的に分析']
};

const issueModule: PromptModule = {
  instructions: ['Issueの優先度を判定']
};

// 2つのモジュールを合成
const merged = merge(baseModule, issueModule);
```

### 動的コンテキスト

実行時の状態に応じてプロンプトを動的生成：

```typescript
interface MyContext {
  issueCount: number;
  mode: 'detailed' | 'summary';
}

const module: PromptModule<MyContext> = {
  createContext: () => ({ issueCount: 0, mode: 'summary' }),

  // コンテキストに応じて動的に内容を変更
  objective: [(ctx) =>
    ctx.mode === 'detailed' ? '詳細な分析' : '要約のみ'
  ],

  state: [(ctx) => `現在のIssue数: ${ctx.issueCount}`]
};
```

### JSONレスポンスの取得

```typescript
const module: PromptModule = {
  objective: ['データを分析してJSON形式で返す'],
  instructions: ['構造化された分析結果を生成'],
  inputs: [JSON.stringify(data)],
  output: ['JSON形式で出力']
};

const driver = await context.createDriver({
  capabilities: ['json_mode']  // JSON出力を保証
});
```

### エラーハンドリング

```typescript
try {
  const driver = await context.createDriver({
    capabilities: ['japanese']
  });
  const result = await driver.query(compiled);

  if (!result.content) {
    throw new Error('Empty response from AI');
  }

  return { success: true, context, output: result };

} catch (error) {
  context.logger.error('AI processing failed', { error });
  return {
    success: false,
    context,
    error: error instanceof Error ? error : new Error('Unknown error')
  };
}
```

### コスト最適化

```typescript
// タスクの複雑さに応じてモデルを選択
const driver = await context.createDriver({
  capabilities: event.payload.isSimple
    ? ['basic']
    : ['advanced', 'japanese'],
  preferCheaper: true  // コストを優先
});
```

## 実装例の参照先

実際の実装例は以下を参照してください：

- `packages/core/src/workflows/impl-functional/process-user-request.ts`
- `packages/core/src/workflows/impl-functional/analyze-issue-impact.ts`
- `packages/core/src/workflows/impl-functional/extract-knowledge.ts`

## 詳細ドキュメント

より高度な使い方（モジュール合成、ストリーミング、カスタムドライバー等）については、Moduler Prompt公式ドキュメントを参照してください：

- [コンセプトと設計思想](https://github.com/otolab/moduler-prompt/blob/main/docs/CONCEPTS.md)
- [アーキテクチャ](https://github.com/otolab/moduler-prompt/blob/main/docs/ARCHITECTURE.md)
- [モジュールの作り方](https://github.com/otolab/moduler-prompt/blob/main/docs/CREATING_MODULES.md)
- [ドライバーAPI](https://github.com/otolab/moduler-prompt/blob/main/docs/DRIVER_API.md)

## まとめ

1. **基本を押さえる**: Instructions/Data/Outputの3セクション構造を理解
2. **型安全に実装**: TypeScriptの型定義を活用
3. **実例から学ぶ**: 既存のワークフロー実装を参考に
4. **必要に応じて深掘り**: 高度な機能は公式ドキュメントで学習