# ワークフロー開発者ガイド

## 1. 原則

### 基本原則
1. **単一責任**: 1つのワークフローは1つの明確な目的を持つ
2. **冪等性**: 同じ入力に対して同じ結果を返す
3. **独立性**: 他のワークフローに依存しない
4. **トレーサビリティ**: WorkflowRecorderで全ての重要な処理を記録
5. **エラー耐性**: 部分的な失敗を適切に処理

### 設計原則
1. **作らない**: 既存のものを再定義しない（shared-types、recorder等）
2. **シンプルに**: 過度な抽象化を避ける
3. **AI活用**: 判断・分析はAIに委ね、二重実装しない
4. **型安全**: TypeScriptの型システムを最大限活用

## 2. ワークフローの構成要素（仕様）

### WorkflowDefinition
```typescript
interface WorkflowDefinition {
  name: string;        // 一意の識別子
  description: string; // 目的の明確な説明
  triggers: WorkflowTrigger;
  executor: WorkflowExecutor;
}
```

### WorkflowTrigger
```typescript
interface WorkflowTrigger {
  eventTypes: string[];                         // 反応するイベントタイプ
  condition?: (event: AgentEvent) => boolean;   // 追加の実行条件
  priority?: number;                             // -100 ~ 100（デフォルト: 0）
}
```

### WorkflowExecutor
```typescript
type WorkflowExecutor = (
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
) => Promise<WorkflowResult>;
```

### WorkflowResult
```typescript
interface WorkflowResult {
  success: boolean;
  context: WorkflowContextInterface;  // 更新されたコンテキスト
  output?: unknown;                    // 処理結果
  error?: Error;                       // エラー情報
}
```

## 2. 実装パターン

## 3. 重要な実装パターン

### 3.1 トリガー設計パターン

**単純トリガー**: 特定イベントタイプに反応
```typescript
triggers: { eventTypes: ['USER_INPUT'] }
```

**条件付きトリガー**: payloadの内容を検証
```typescript
triggers: {
  eventTypes: ['USER_INPUT'],
  condition: (event) => event.payload?.text !== undefined,
  priority: 10  // 優先度設定
}
```

### 3.2 エラー処理パターン

全ての例外を適切に捕捉し、WorkflowResultとして返す：
```typescript
executor: async (event, context, emitter) => {
  try {
    // メイン処理
    return { success: true, context, output: result };
  } catch (error) {
    context.recorder.record(RecordType.ERROR, { error });
    return {
      success: false,
      context,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}
```

### 3.3 記録パターン

処理の重要なポイントで必ず記録を残す：
```typescript
// 入力記録
context.recorder.record(RecordType.INPUT, { payload });
// DB操作記録
context.recorder.record(RecordType.DB_QUERY, { operation, result });
// AI呼び出し記録
context.recorder.record(RecordType.AI_CALL, { model, prompt });
// 出力記録
context.recorder.record(RecordType.OUTPUT, { success, output });
```

## 4. AI処理の統合

### 4.1 Moduler Promptの原則

Moduler Promptフレームワークの正しい理解：

1. **PromptModuleは静的**: プログラム言語的意味で常に静的
   - 関数外で定義（ローカル変数を参照しない）
   - 動的な値はコンテキスト経由で渡す
   - compile時に動的な値が解決される

2. **3大セクション構造**: 標準セクションが最終的に3つに分類
   - instructions大セクション： 静的指示
   - data大セクション： 動的データ
   - output大セクション： 出力定義

3. **セキュリティモデル**: ユーザーデータと指示を分離
4. **型安全性**: コンテキストとスキーマ定義による構造化

詳細は[Moduler Prompt利用ガイド](MODULER_PROMPT_GUIDE.md)を参照。

### 4.2 AI処理の実装パターン

```typescript
import { compile } from '@moduler-prompt/core';
import type { PromptModule } from '@moduler-prompt/core';
import type { AIDriver } from '@moduler-prompt/driver';
import { RecordType } from '../recorder.js';

// 1. コンテキスト型を定義
interface MyWorkflowContext {
  inputData: string;
  relatedItems: Item[];
}

// 2. PromptModuleを関数外で静的に定義
export const myWorkflowPromptModule: PromptModule<MyWorkflowContext> = {
  createContext: () => ({
    inputData: '',
    relatedItems: []
  }),

  objective: ['データを分析して適切な処理を判定する'],

  instructions: [
    '以下の点を分析してください：',
    '1. データの特徴',
    '2. 関連項目との関係',
    '3. 推奨されるアクション'
  ],

  // 動的な値はコンテキストから取得
  inputs: [
    (ctx) => `入力データ: ${ctx.inputData}`,
    (ctx) => `関連項目: ${ctx.relatedItems.length}件`,
    (ctx) => ctx.relatedItems.map(item => `  - ${item.name}`)
  ],

  output: {
    schema: {
      type: 'object',
      properties: {
        analysis: { type: 'string' },
        recommendations: { type: 'array', items: { type: 'string' } }
      },
      required: ['analysis', 'recommendations']
    }
  }
};

// 3. ワークフロー内での使用
async function processWithAI(
  inputData: string,
  context: WorkflowContextInterface
): Promise<AnalysisResult> {
  const { storage, createDriver, recorder } = context;

  // 関連データを取得
  const relatedItems = await storage.searchItems(inputData);

  // コンテキストを作成
  const promptContext: MyWorkflowContext = {
    inputData,
    relatedItems
  };

  // AIドライバーを作成
  const driver = await createDriver({
    requiredCapabilities: ['structured'],
    preferredCapabilities: ['japanese']
  });

  // AI呼び出しを記録
  recorder.record(RecordType.AI_CALL, {
    step: 'analyzeWithAI',
    model: driver.modelId
  });

  // コンパイルと実行
  const compiled = compile(myWorkflowPromptModule, promptContext);
  const result = await driver.query(compiled, { temperature: 0.3 });

  // 結果を記録
  recorder.record(RecordType.INFO, {
    step: 'analysisComplete',
    hasStructuredOutput: !!result.structuredOutput
  });

  return result.structuredOutput || JSON.parse(result.content);
}
```

### 4.3 AIドライバーのCapability

AIドライバーは能力（capability）に基づいて選択されます：

| Capability | 説明 |
|------------|------|
| structured | 構造化出力（JSON）対応 |
| fast | 高速応答 |
| local | ローカル実行可能 |
| japanese | 日本語特化 |
| reasoning | 推論・思考特化 |
| large-context | 大規模コンテキスト対応 |
| streaming | ストリーミング応答 |
| vision | 画像認識可能 |

使用方法：
```typescript
const driver = await context.createDriver({
  requiredCapabilities: ['structured'],      // 必須
  preferredCapabilities: ['japanese', 'fast'] // 優先
});
```

## 5. 優先度の設計

| 優先度 | 範囲 | 用途 | 例 |
|--------|------|------|-----|
| Critical | 80-100 | システム重要処理 | エラー処理、緊急アラート |
| High | 50-79 | ユーザー操作の即時応答 | ユーザー入力処理 |
| Normal | 0-49 | 通常の業務処理 | データ分析、レポート生成 |
| Low | -100--1 | バックグラウンド処理 | 定期クリーンアップ、統計収集 |

```typescript
triggers: {
  eventTypes: ['USER_INPUT'],
  priority: 60 // 高優先度：ユーザー応答
}
```

## 6. テスト戦略

包括的なテスト戦略については以下を参照してください：

- **テスト戦略と分類**: [../testing/STRATEGY.md](../testing/STRATEGY.md)
  - ユニットテスト、統合テスト、E2Eテストの定義と実装方針
  - 共通セットアップとCI/CDでの実行順序

- **テスト仕様**: [../testing/SPECIFICATIONS.md](../testing/SPECIFICATIONS.md)
  - 各モジュールのテストケース詳細
  - エッジケースとエラーハンドリングのテスト

## 7. WorkflowRegistryの仕様

### CoreEngineにおけるワークフロー登録

CoreEngineは独立したWorkflowRegistryを持っており、CoreAgentのレジストリとは別管理されています。

#### 重要な設計ポイント

1. **CoreEngineのWorkflowRegistry**: CoreEngineインスタンスが独自のレジストリを保持
2. **CoreAgentのWorkflowRegistry**: CoreAgent内部で使用される別のレジストリ
3. **ワークフロー解決**: CoreEngineがイベントを受け取った際、自身のレジストリからワークフローを解決

#### テストでの注意点

CoreEngineのWorkflowRegistryは独立管理されているため、テストではCoreEngineのレジストリに直接登録する必要があります：

```typescript
// CoreEngineのレジストリに登録（privateプロパティへのアクセス）
// @ts-ignore
engine.workflowRegistry.register(testWorkflow);
```

#### プロダクションコードでの登録

プロダクションコードでは、CoreEngineの初期化時にデフォルトワークフローが自動登録されます：

```typescript
// CoreEngine内部での自動登録
private registerDefaultWorkflows(): void {
  // 基本ワークフロー（A-0〜A-3）の登録
  this.workflowRegistry.register(ingestInputWorkflow);
  this.workflowRegistry.register(processUserRequestWorkflow);
  this.workflowRegistry.register(analyzeIssueImpactWorkflow);
  this.workflowRegistry.register(extractKnowledgeWorkflow);
}
```

#### 注意事項

1. **イベントタイプの一致**: `createInput()`は`INGEST_INPUT`イベントを発生させるため、ワークフローのトリガーも`INGEST_INPUT`に設定する必要があります
2. **タイミング**: ワークフローは`engine.start()`を呼ぶ前に登録する必要があります
3. **プライベートアクセス**: テストでは`@ts-ignore`を使用してプライベートプロパティにアクセスする必要があります

## 8. 記録と検証可能性

### 8.1 記録の本質的な役割

**context.recorderは単なるデバッグツールではありません。** これはワークフローシステムの検証可能性を保証する重要な機能です。

```typescript
// すべての重要な処理ステップを記録
// これらのログはDBに永続化され、Webコンソールから検証可能
context.recorder.record(RecordType.INFO, {
  step: 'processing_start',
  eventType: event.type,
  payload: event.payload
});

context.recorder.record(RecordType.DB_QUERY, {
  operation: 'createIssue',
  issueId: result.issueId,
  title: result.title
});

context.recorder.record(RecordType.OUTPUT, {
  step: 'processing_complete',
  duration: Date.now() - startTime,
  success: true
});
```

**重要**: 暗黙的に実行されるワークフローの動作を追跡・検証するため、すべての重要なステップをログに記録します。これにより、問題の特定と正常動作の確認が可能になります。

### 8.2 必須記録ポイント

全てのワークフローは以下のポイントで記録が必須です：
1. **INPUT**: 処理開始時のペイロード
2. **DB_QUERY**: データベース操作
3. **AI_CALL**: AI処理の呼び出し
4. **OUTPUT**: 処理結果
5. **ERROR**: エラー発生時

## 9. イベント連携パターン

### 9.1 チェーンパターン
処理完了後に次のワークフローをトリガー

### 9.2 条件分岐パターン
分析結果に応じて異なるイベントを発行


## 10. トラブルシューティング

### ワークフローがトリガーされない場合
1. eventTypesが正しく設定されているか確認
2. conditionが常にfalseを返していないか確認
3. WorkflowRegistryへの登録を確認

### パフォーマンス問題
- 大量データ処理時はストリーミング処理を使用
- Promise.allで並列処理を活用
- 不要なawaitを避ける


## 11. スケジューラー統合

### スケジューラーの主要機能

1. **自然言語でのスケジュール設定**: "3日後の朝9時"などの表現をサポート
2. **自動重複排除**: Issue ID + dedupeKeyでユニーク管理
3. **Issue連動**: Issue closeで自動キャンセル
4. **SCHEDULE_TRIGGEREDイベント**: スケジュール実行時に発行

使用方法：
```typescript
const schedule = await context.scheduler.schedule(
  issueId,
  "3日後の朝9時",
  'reminder',
  { timezone: 'Asia/Tokyo', dedupeKey: 'daily-check' }
);
```

## 12. セキュリティ原則

1. **入力検証**: 全ての外部入力をスキーマ検証
2. **機密情報の保護**: ログに機密情報を含めない
3. **エラー情報の制限**: スタックトレースを本番環境で公開しない
4. **権限の最小化**: 必要最小限の権限で実行

## 13. 参照

- [ワークフロー仕様書](./SPECIFICATION.md) - 詳細な技術仕様
- [Moduler Prompt利用ガイド](./MODULER_PROMPT_GUIDE.md) - AI処理フレームワーク
- [イベントカタログ](./EVENT_CATALOG.md) - 利用可能なイベント一覧
- [テスト戦略](../testing/STRATEGY.md) - テスト分類と実装方針