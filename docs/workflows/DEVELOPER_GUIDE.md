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
  name: string; // 一意の識別子
  description: string; // 目的の明確な説明
  triggers: WorkflowTrigger;
  executor: WorkflowExecutor;
}
```

### WorkflowTrigger

```typescript
interface WorkflowTrigger {
  eventTypes: string[]; // 反応するイベントタイプ
  condition?: (event: AgentEvent) => boolean; // 追加の実行条件
  priority?: number; // -100 ~ 100（デフォルト: 0）
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
  context: WorkflowContextInterface; // 更新されたコンテキスト（特にstateが更新される）
  output?: unknown; // 処理結果
  error?: Error; // エラー情報
}
```

## 3. context.stateの継続的更新

### 3.1 原則

1. **常に更新**: すべてのワークフローはcontext.stateを更新する責任がある
2. **1回のAI呼び出しで完結**: 分析とState更新を同時に実行（効率化）
3. **updateStatePromptModuleの活用**: mergeして統合されたプロンプトを作成
4. **簡潔で有用**: 重要な情報のみを保持し、古い情報は適切に削除

### 3.2 実装パターン（推奨）

**ポイント**: `updateStatePromptModule`は既に`statePromptModule`を含んでいるため、直接mergeできます。

```typescript
import { merge } from '@moduler-prompt/core';
import { updateStatePromptModule } from '../shared/prompts/state.js';

// updateStatePromptModuleをマージして、分析とState更新を同時に実行
export const myWorkflowPromptModule = merge(
  updateStatePromptModule, // State表示、更新指示、updatedStateスキーマを提供
  {
    // ワークフロー固有の定義
    objective: ['タスクの目的'],
    instructions: ['分析の指示'],

    // スキーマはマージされる（両方のJSONElementが保持される）
    schema: [
      {
        type: 'json',
        content: {
          type: 'object',
          properties: {
            // ワークフロー固有の出力
            result: { type: 'string' },
            // updatedStateはupdateStatePromptModuleから自動的に含まれる
          },
          required: ['result'],
        },
      },
    ],
  }
);

// ワークフロー実行
async function executeWorkflow(
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const driver = await context.createDriver({
    requiredCapabilities: ['structured'],
  });

  // 1回のAI呼び出しで分析とState更新を実行
  const compiled = compile(myWorkflowPromptModule, {
    // ワークフロー固有のデータ
    inputData: event.payload,
    // 現在のStateを必ず含める
    currentState: context.state,
  });

  const result = await driver.query(compiled);

  if (!result.structuredOutput) {
    throw new Error('構造化出力の取得に失敗');
  }

  // 分析結果とupdatedStateが両方含まれている
  const output = result.structuredOutput as {
    result: string;
    updatedState: string; // updateStatePromptModuleから
  };

  return {
    success: true,
    context: {
      ...context,
      state: output.updatedState, // 更新されたState
    },
    output,
  };
}
```

## 4. 重要な実装パターン

### 4.1 トリガー設計パターン

**単純トリガー**: 特定イベントタイプに反応

```typescript
triggers: {
  eventTypes: ['USER_INPUT'];
}
```

**条件付きトリガー**: payloadの内容を検証

```typescript
triggers: {
  eventTypes: ['USER_INPUT'],
  condition: (event) => event.payload?.text !== undefined,
  priority: 10  // 優先度設定
}
```

### 4.2 エラー処理パターン

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
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
};
```

### 4.3 記録パターン

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

### 4.1 Moduler Promptの重要な理解ポイント

#### 必ず確認すべきこと

1. **仕様書を読む**: 作業前に必ず[Moduler Promptドキュメント](https://github.com/otolab/moduler-prompt/docs)を確認
   - 特に`CREATING_MODULES.md`の型定義とセクション仕様
   - 存在しない型（`type: 'list'`など）を使わない

2. **merge関数の理解**:
   - 同名セクションの要素は配列として結合される
   - schemaセクションも他のセクションと同様にマージされる
   - `updateStatePromptModule`は`statePromptModule`を既に含む

3. **正しいセクション選択**:
   - `materials`: 参考資料（関連Issue、ドキュメント等）
     - 文字列配列または`MaterialElement`型を使用
     - 詳細な分析対象には`MaterialElement`推奨
   - `chunks`: 分割データ（大量テキストの部分処理等）
   - `inputs`: シンプルな入力データ
     - 読みやすさのため`.join('\n')`を活用

#### 設計原則

1. **責務の分離**:
   - 各PromptModuleは単一の責任を持つ
   - 共通機能は専用モジュール化（例：`updateStatePromptModule`）
   - mergeによる組み合わせで複雑な処理を構築

2. **PromptModuleは静的定義**:
   - 関数外で定義（コンパイル時に静的）
   - 実行時の値はコンテキスト経由で注入
   - テンプレート関数 `(ctx) => ...` で値を展開

3. **3大セクション構造**:
   - instructions: 静的な指示（objective, terms, instructions等）
   - data: コンテキストベースの情報（state, inputs, materials, chunks等）
   - output: 出力定義（cue, schema）

4. **型安全性**: TypeScriptの型定義を活用
5. **構造化出力の前提**: 常にstructuredOutputを使用

### 4.2 実装時のチェックリスト

#### リファクタリング時の確認事項

1. **不要な抽象化を削除**:
   - シンプルなデータ取得を関数化しない（例: `fetchIssueData`は不要）
   - 条件チェックはconditionに、データ取得は直接実行

2. **ドライバーの共有**:
   - 1つのワークフローで複数回AI呼び出しする場合は、ドライバーを共有
   - 複数の応答が必要な場合でも、可能な限り1回の呼び出しにまとめる

3. **関数の配置**:
   - ヘルパー関数は意味のある名前のファイルに（`helpers.ts`より`actions.ts`）
   - 関連する関数は同じファイルに集約

4. **テストの簡潔性**:
   - TestDriverの使用時は、responses配列に必要な応答を順番に設定
   - setupユーティリティ関数でモックの重複を削減

### 4.3 実践的な実装例

```typescript
import { merge, compile } from '@moduler-prompt/core';
import { updateStatePromptModule } from '../shared/prompts/state.js';

// 1. 分析結果の型定義（updatedStateを必ず含める）
interface AnalysisResult {
  shouldProcess: boolean;
  priority: number;
  recommendations: string[];
  updatedState: string; // 必須
}

// 2. コンテキスト型（currentStateは必須）
interface AnalysisContext {
  inputData: string;
  relatedItems: Item[];
  currentState: string; // statePromptModule要件
}

// 3. PromptModuleの定義（updateStatePromptModuleをマージ）
const analysisPromptModule = merge(
  updateStatePromptModule, // State管理機能を組み込み
  {
    objective: ['入力を分析して処理方針を決定する'],

    inputs: [(ctx: AnalysisContext) => `入力: ${ctx.inputData}`],

    // 関連データは参考資料として（MaterialElement型で構造化）
    materials: [
      // 関数が配列を返し、ModulerPromptが自動的に平坦化
      (ctx: AnalysisContext) =>
        ctx.relatedItems.map((item) => ({
          type: 'material' as const,
          id: `item-${item.id}`,
          title: item.name,
          content: [
            `ID: ${item.id}`,
            `説明: ${item.description}`,
            `優先度: ${item.priority}`,
            // その他の重要な属性
          ].filter(Boolean).join('\n'), // 読みやすい形式で提供
        })),
    ],

    schema: [
      {
        type: 'json',
        content: {
          type: 'object',
          properties: {
            shouldProcess: { type: 'boolean' },
            priority: { type: 'number', minimum: 0, maximum: 100 },
            recommendations: {
              type: 'array',
              items: { type: 'string' },
            },
            // updatedStateはupdateStatePromptModuleから提供
          },
          required: ['shouldProcess', 'priority', 'recommendations'],
        },
      },
    ],
  }
);

// 4. 分析関数（ドライバーを引数で受け取る）
export async function analyzeInput(
  driver: AIDriver,
  inputData: string,
  relatedItems: Item[],
  currentState: string
): Promise<AnalysisResult> {
  const context: AnalysisContext = {
    inputData,
    relatedItems,
    currentState,
  };

  const compiled = compile(analysisPromptModule, context);
  const result = await driver.query(compiled, { temperature: 0.3 });

  if (!result.structuredOutput) {
    throw new Error('構造化出力の取得に失敗しました');
  }

  return result.structuredOutput as AnalysisResult;
}

// 5. ワークフロー実行関数
async function executeWorkflow(
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, createDriver, recorder } = context;

  try {
    // 単一のドライバーインスタンスを作成
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'fast'],
    });

    // 関連データ取得
    const relatedItems = await storage.searchItems(event.payload.text);

    // 分析実行（State更新も同時に実行）
    const analysis = await analyzeInput(driver, event.payload.text, relatedItems, context.state);

    // 後続処理...

    return {
      success: true,
      context: {
        ...context,
        state: analysis.updatedState, // 更新されたState
      },
      output: analysis,
    };
  } catch (error) {
    recorder.record(RecordType.ERROR, { error });
    return {
      success: false,
      context,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
```

### 4.4 AIドライバーのCapability

AIドライバーは能力（capability）に基づいて選択されます：

| Capability    | 説明                   |
| ------------- | ---------------------- |
| structured    | 構造化出力（JSON）対応 |
| fast          | 高速応答               |
| local         | ローカル実行可能       |
| japanese      | 日本語特化             |
| reasoning     | 推論・思考特化         |
| large-context | 大規模コンテキスト対応 |
| streaming     | ストリーミング応答     |
| vision        | 画像認識可能           |

使用方法：

```typescript
const driver = await context.createDriver({
  requiredCapabilities: ['structured'], // 必須
  preferredCapabilities: ['japanese', 'fast'], // 優先
});
```

## 5. 優先度の設計

| 優先度   | 範囲    | 用途                   | 例                           |
| -------- | ------- | ---------------------- | ---------------------------- |
| Critical | 80-100  | システム重要処理       | エラー処理、緊急アラート     |
| High     | 50-79   | ユーザー操作の即時応答 | ユーザー入力処理             |
| Normal   | 0-49    | 通常の業務処理         | データ分析、レポート生成     |
| Low      | -100--1 | バックグラウンド処理   | 定期クリーンアップ、統計収集 |

```typescript
triggers: {
  eventTypes: ['USER_INPUT'],
  priority: 60 // 高優先度：ユーザー応答
}
```

## 6. リファレンス実装

### A-2: ANALYZE_ISSUE_IMPACT ワークフロー

新しいワークフローを実装する際のリファレンス実装として、A-2ワークフローを参照してください：

📖 **[A-2実装ガイド](../../packages/core/src/workflows/a-2.analyze-issue-impact/README.md)**

このリファレンス実装では以下のパターンが学べます：
- ファイル構成とモジュール分割
- PromptModuleの設計とmerge関数の活用
- 単一ドライバーインスタンスの共有
- State管理の自動化（updateStatePromptModule）
- エラーハンドリングとログ記録
- テストの設計とモック戦略

## 7. テスト戦略

包括的なテスト戦略については以下を参照してください：

- **テスト戦略と分類**: [../testing/STRATEGY.md](../testing/STRATEGY.md)
  - ユニットテスト、統合テスト、E2Eテストの定義と実装方針
  - 共通セットアップとCI/CDでの実行順序

- **テスト仕様**: [../testing/SPECIFICATIONS.md](../testing/SPECIFICATIONS.md)
  - 各モジュールのテストケース詳細
  - エッジケースとエラーハンドリングのテスト

## 8. WorkflowRegistryの仕様

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

## 9. 記録と検証可能性

### 9.1 記録の本質的な役割

**context.recorderは単なるデバッグツールではありません。** これはワークフローシステムの検証可能性を保証する重要な機能です。

```typescript
// すべての重要な処理ステップを記録
// これらのログはDBに永続化され、Webコンソールから検証可能
context.recorder.record(RecordType.INFO, {
  step: 'processing_start',
  eventType: event.type,
  payload: event.payload,
});

context.recorder.record(RecordType.DB_QUERY, {
  operation: 'createIssue',
  issueId: result.issueId,
  title: result.title,
});

context.recorder.record(RecordType.OUTPUT, {
  step: 'processing_complete',
  duration: Date.now() - startTime,
  success: true,
});
```

**重要**: 暗黙的に実行されるワークフローの動作を追跡・検証するため、すべての重要なステップをログに記録します。これにより、問題の特定と正常動作の確認が可能になります。

### 9.2 必須記録ポイント

全てのワークフローは以下のポイントで記録が必須です：

1. **INPUT**: 処理開始時のペイロード
2. **DB_QUERY**: データベース操作
3. **AI_CALL**: AI処理の呼び出し
4. **OUTPUT**: 処理結果
5. **ERROR**: エラー発生時

## 10. イベント連携パターン

### 10.1 チェーンパターン

処理完了後に次のワークフローをトリガー

### 10.2 条件分岐パターン

分析結果に応じて異なるイベントを発行

## 11. Issueの概念と実装例

### Issueとは

**Issue = ユーザーに代わってAIが追跡・管理すべき事項**

システムの課題やバグではなく、ユーザーが忘れたくない・追跡したい事項全般を表します。

### 具体例

#### 良い例（ユーザーの追跡事項）
```typescript
// ミーティングの準備
const meetingIssue = await storage.createIssue({
  title: '月曜日の企画会議の準備',
  description: 'プレゼン資料の作成と参加者への事前共有が必要',
  labels: ['meeting', 'preparation'],
  priority: 70,
});

// プロジェクトの進捗
const projectIssue = await storage.createIssue({
  title: 'プロジェクトXのマイルストーン確認',
  description: '今月末までに第一段階を完了させる必要がある',
  labels: ['project', 'milestone'],
  priority: 60,
});

// 個人的なタスク
const personalIssue = await storage.createIssue({
  title: '健康診断の予約',
  description: '来月中に健康診断を受ける必要がある',
  labels: ['personal', 'health'],
  priority: 40,
});
```

#### 避けるべき例（システムの技術的問題）
```typescript
// ❌ これらはsebas-chanのIssueではありません
// システムバグ → GitHubのIssueなどで管理すべき
// const bugIssue = await storage.createIssue({
//   title: 'APIのエラー処理が不適切',
//   description: 'エラーコード500が返される',
// });
```

### ワークフローでのIssue処理パターン

```typescript
// ユーザーの入力から追跡すべき事項を判定
async function analyzeUserInput(content: string): Promise<boolean> {
  // AIがユーザーにとって重要で追跡すべきかを判断
  const analysis = await ai.analyze(content);

  // 追跡すべき事項の特徴：
  // - 締切や期限がある
  // - 後で確認が必要
  // - 繰り返し発生する可能性がある
  // - 忘れると困る
  return analysis.shouldTrack;
}
```

## 12. トラブルシューティング

### ワークフローがトリガーされない場合

1. eventTypesが正しく設定されているか確認
2. conditionが常にfalseを返していないか確認
3. WorkflowRegistryへの登録を確認

### パフォーマンス問題

- 大量データ処理時はストリーミング処理を使用
- Promise.allで並列処理を活用
- 不要なawaitを避ける

## 12. スケジューラー統合

### スケジューラーの主要機能

1. **自然言語でのスケジュール設定**: "3日後の朝9時"などの表現をサポート
2. **自動重複排除**: Issue ID + dedupeKeyでユニーク管理
3. **Issue連動**: Issue closeで自動キャンセル
4. **SCHEDULE_TRIGGEREDイベント**: スケジュール実行時に発行

使用方法：

```typescript
const schedule = await context.scheduler.schedule(issueId, '3日後の朝9時', 'reminder', {
  timezone: 'Asia/Tokyo',
  dedupeKey: 'daily-check',
});
```

## 13. セキュリティ原則

1. **入力検証**: 全ての外部入力をスキーマ検証
2. **機密情報の保護**: ログに機密情報を含めない
3. **エラー情報の制限**: スタックトレースを本番環境で公開しない
4. **権限の最小化**: 必要最小限の権限で実行

## 14. 参照

- [ワークフロー仕様書](./SPECIFICATION.md) - 詳細な技術仕様
- [Moduler Prompt利用ガイド](./MODULER_PROMPT_GUIDE.md) - AI処理フレームワーク
- [イベントカタログ](./EVENT_CATALOG.md) - 利用可能なイベント一覧
- [テスト戦略](../testing/STRATEGY.md) - テスト分類と実装方針
