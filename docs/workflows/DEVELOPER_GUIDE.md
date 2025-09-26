# ワークフロー開発者ガイド

## 1. はじめに

このガイドでは、sebas-chanのワークフローを開発するための実践的な手順を説明します。ワークフローは、特定のイベントに反応して実行される独立した処理単位です。

## 2. クイックスタート

### 2.1 最小限のワークフロー

```typescript
import type { WorkflowDefinition } from '@sebas-chan/core';
import { RecordType } from '@sebas-chan/core';

export const myWorkflow: WorkflowDefinition = {
  name: 'my-workflow',
  description: 'シンプルなワークフローの例',
  triggers: {
    eventTypes: ['USER_INPUT']
  },
  executor: async (event, context, emitter) => {
    context.recorder.record(RecordType.INFO, {
      message: 'ワークフロー実行開始',
      eventType: event.type
    });

    // 処理を実装
    const result = await processInput(event.payload);

    return {
      success: true,
      context,
      output: result
    };
  }
};
```

## 3. ステップバイステップガイド

### Step 1: ワークフローの目的を定義

まず、ワークフローが何を達成するのかを明確にします。

```typescript
// 目的: ユーザー入力を処理してIssueを作成する
const PURPOSE = {
  trigger: 'ユーザーが新しい入力を送信したとき',
  action: '入力を分析してIssueとして保存',
  output: '作成されたIssueオブジェクト'
};
```

### Step 2: トリガー条件を設計

#### 基本的なトリガー

```typescript
triggers: {
  eventTypes: ['USER_INPUT']
}
```

#### 条件付きトリガー

```typescript
triggers: {
  eventTypes: ['USER_INPUT', 'SYSTEM_ALERT'],
  condition: (event) => {
    // payloadにtextフィールドが存在する場合のみ実行
    return event.payload &&
           typeof event.payload === 'object' &&
           'text' in event.payload;
  },
  priority: 10 // 他のワークフローより優先
}
```

### Step 3: 実行関数を実装

#### 基本構造

```typescript
executor: async (event, context, emitter) => {
  try {
    // 1. 入力検証
    const validated = validateInput(event.payload);

    // 2. メイン処理
    const result = await processData(validated, context);

    // 3. 副作用（必要に応じて）
    if (result.needsFollowUp) {
      emitter.emit({
        type: 'FOLLOW_UP_REQUIRED',
        payload: { issueId: result.id }
      });
    }

    // 4. 成功を返す
    return {
      success: true,
      context,
      output: result
    };

  } catch (error) {
    // 5. エラーハンドリング
    context.recorder.record(RecordType.ERROR, { error });
    return {
      success: false,
      context,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}
```

### Step 4: データ操作

#### Storageを使った操作

```typescript
// Issue作成
const issue = await context.storage.createIssue({
  title: 'ユーザーからの要望',
  description: event.payload.text,
  status: 'open',
  labels: [],
  updates: [],
  relations: [],
  sourceInputIds: []
});

// 検索
const relatedIssues = await context.storage.searchIssues(
  `関連: ${issue.title}`
);

// 更新
await context.storage.updateIssue(issue.id, {
  status: 'in_progress'
});
```

### Step 5: AI処理の統合（Moduler Prompt）

ワークフローでのAI処理には、Moduler Promptフレームワークを使用します。

#### 基本的な使い方

```typescript
import { compile } from '@moduler-prompt/core';
import type { PromptModule } from '@moduler-prompt/core';

// コンテキストを使用したプロンプトモジュール定義
interface AnalysisContext {
  text: string;
  priority: number;
}

const analysisModule: PromptModule<AnalysisContext> = {
  createContext: () => ({
    text: event.payload.text,
    priority: event.payload.priority || 0
  }),
  objective: [(ctx) =>
    ctx.priority > 50 ? '緊急分析を実施' : 'テキストを分析する'
  ],
  instructions: ['要点を抽出', '感情を判定'],
  inputs: [(ctx) => ctx.text]
};

// AIドライバーの作成
const driver = await context.createDriver({
  capabilities: ['japanese', 'text-generation']
});

// コンテキストを渡してコンパイルし、実行
const moduleContext = {
  text: event.payload.text,
  priority: event.payload.priority || 0
};
const compiled = compile(analysisModule, moduleContext);
const response = await driver.query(compiled);

// driver.queryはQueryResult型を返します
// structuredOutputフィールドで構造化データ取得可能
const parsedResponse = response.structuredOutput || JSON.parse(response.content);
```

詳細な使い方については [Moduler Prompt利用ガイド](MODULER_PROMPT_GUIDE.md) を参照してください。

### 3.5 AIドライバーの選択と利用

sebas-chanでは、moduler-promptのAIServiceを使用してドライバーを管理しています。

#### AIServiceによるドライバー管理

ワークフローのコンテキストは内部でAIServiceを使用してドライバーを選択・作成します：

```typescript
// context.createDriverの内部実装
const driver = await context.createDriver({
  requiredCapabilities: ['structured'],    // 必須の能力
  preferredCapabilities: ['japanese', 'fast'] // 優先する能力
});
```

#### DriverCapabilityの種類

以下の能力（capability）が利用可能です：

- `'structured'` - 構造化出力対応（JSON形式での応答）
- `'fast'` - 高速応答
- `'local'` - ローカル実行可能
- `'japanese'` - 日本語特化
- `'reasoning'` - 推論・思考特化
- `'large-context'` - 大規模コンテキスト対応
- `'streaming'` - ストリーミング応答対応
- `'vision'` - 画像認識可能

#### 実装例

```typescript
// 構造化出力が必要な場合
const driver = await context.createDriver({
  requiredCapabilities: ['structured'],
  preferredCapabilities: ['fast', 'local']
});

// スキーマを定義してプロンプトモジュールを作成
const promptModule = {
  instructions: ['データを分析してJSON形式で返してください'],
  output: {
    schema: {
      type: 'object',
      properties: {
        analysis: { type: 'string' },
        confidence: { type: 'number' },
        suggestions: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['analysis', 'confidence']
    }
  }
};

const compiled = compile(promptModule);
const result = await driver.query(compiled);

// structuredOutputが利用可能な場合は型安全に取得
if (result.structuredOutput) {
  const { analysis, confidence, suggestions } = result.structuredOutput;
  // 型安全な処理
}
```

## 4. ベストプラクティス

### 4.1 エラーハンドリング

```typescript
executor: async (event, context, emitter) => {
  try {
    // バリデーション
    if (!isValidPayload(event.payload)) {
      throw new ValidationError('Invalid payload structure');
    }

    // タイムアウト設定
    const result = await Promise.race([
      performOperation(event, context),
      timeout(5000) // 5秒でタイムアウト
    ]);

    return { success: true, context, output: result };

  } catch (error) {
    // エラーの種類に応じた処理
    if (error instanceof ValidationError) {
      context.recorder.record(RecordType.WARN, {
        message: 'Validation failed',
        error
      });
      // リトライ不要
    } else if (error instanceof NetworkError) {
      context.recorder.record(RecordType.ERROR, {
        message: 'Network error',
        error
      });
      // リトライ可能
    }

    return {
      success: false,
      context,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}
```

### 4.2 ログ記録

```typescript
// 構造化ログを使用（timestamp、workflowNameは自動挿入）
context.recorder.record(RecordType.INFO, {
  step: 'processing_start',
  eventType: event.type
  // timestamp、workflowNameはロガーが自動的に追加
});

// 重要なステップをログ
context.recorder.record(RecordType.DEBUG, {
  operation: 'createIssue',
  issueId: issue.id,
  title: issue.title
});

// エラーは詳細に記録
context.recorder.record(RecordType.ERROR, {
  error: error.message,
  stack: error.stack,
  eventPayload: event.payload
});
```

### 4.3 優先度の設計

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

## 5. テスト

### ワークフロー固有のテスト例

```typescript
import { describe, it, expect, vi } from 'vitest';
import { myWorkflow } from './my-workflow';

describe('MyWorkflow', () => {
  it('should handle specific business logic', async () => {
    // ワークフロー固有のビジネスロジックをテスト
    const result = await myWorkflow.executor(
      { type: 'USER_INPUT', payload: { text: 'test' } },
      mockContext,
      mockEmitter
    );

    expect(result.output.category).toBe('urgent');
  });
});
```

### テスト戦略の詳細

包括的なテスト戦略については以下を参照してください：

- **テスト戦略と分類**: [../testing/STRATEGY.md](../testing/STRATEGY.md)
  - ユニットテスト、統合テスト、E2Eテストの定義と実装方針
  - 共通セットアップとCI/CDでの実行順序

- **テスト仕様**: [../testing/SPECIFICATIONS.md](../testing/SPECIFICATIONS.md)
  - 各モジュールのテストケース詳細
  - エッジケースとエラーハンドリングのテスト

## 6. 記録と検証可能性

### 6.1 ログの本質的な役割

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

### 6.2 実行トレースの記録

```typescript
// context.recorderを使って直接トレースを記録
context.recorder.record(RecordType.INFO, {
  step: 'validation_start',
  input: event.payload
});

const validationResult = await validate(event.payload);

context.recorder.record(RecordType.INFO, {
  step: 'validation_complete',
  result: validationResult,
  duration: Date.now() - stepStart
});
```

## 7. よくあるパターン

### 7.1 チェーンワークフロー

```typescript
// 最初のワークフロー
executor: async (event, context, emitter) => {
  const result = await processStep1(event.payload);

  // 次のワークフローをトリガー
  emitter.emit({
    type: 'STEP1_COMPLETED',
    payload: {
      originalEvent: event.type,
      step1Result: result
    }
  });

  return { success: true, context, output: result };
}
```

### 7.2 条件分岐

```typescript
executor: async (event, context, emitter) => {
  const analysis = await analyzeContent(event.payload);

  if (analysis.category === 'urgent') {
    emitter.emit({
      type: 'URGENT_ISSUE_DETECTED',
      payload: analysis
    });
  } else if (analysis.category === 'question') {
    emitter.emit({
      type: 'USER_QUESTION',
      payload: analysis
    });
  }

  return { success: true, context, output: analysis };
}
```


## 8. 一般的な問題と対処法

### 問題: ワークフローがトリガーされない

**確認項目:**
1. eventTypesが正しく設定されているか
2. conditionが常にfalseを返していないか
3. ワークフローが正しく登録されているか

```typescript
// デバッグ用ログを追加
triggers: {
  eventTypes: ['MY_EVENT'],
  condition: (event) => {
    const result = checkCondition(event);
    console.log('Condition check:', { event: event.type, result });
    return result;
  }
}
```

**注**: 運用実績が蓄積されたら、より具体的なトラブルシューティングガイドを作成予定です。

### 問題: メモリ使用量が増大する

**解決策:**
```typescript
// ストリーミング処理を使用
executor: async (event, context, emitter) => {
  const stream = createReadStream(event.payload.filePath);
  let processedCount = 0;

  for await (const chunk of stream) {
    await processChunk(chunk, context);
    processedCount++;

    // 定期的にガベージコレクションを促す
    if (processedCount % 100 === 0) {
      if (global.gc) global.gc();
    }
  }

  return { success: true, context, output: { processedCount } };
}
```

## 9. パフォーマンス最適化

### 9.1 キャッシュについて

ワークフローはstatelessであるべきなので、現時点ではキャッシュ機能は実装しません。将来的にシステムレベルでのキャッシュ機構を導入する可能性がありますが、個別のワークフロー内ではキャッシュを保持しないようにしてください。

### 9.2 並列処理

```typescript
executor: async (event, context, emitter) => {
  // 独立した処理を並列実行
  const [issues, knowledge, pondEntries] = await Promise.all([
    context.storage.searchIssues(event.payload.query),
    context.storage.searchKnowledge(event.payload.query),
    context.storage.searchPond(event.payload.query)
  ]);

  return {
    success: true,
    context,
    output: { issues, knowledge, pondEntries }
  };
}
```

## 10. スケジューラーの使用

### 10.1 基本的な使い方

ワークフロー内でIssueに関連するタスクをスケジュールできます。

```typescript
executor: async (event, context, emitter) => {
  const issue = await context.storage.createIssue({
    title: '重要なタスク',
    description: '緊急対応が必要なタスク',
    status: 'open',
    labels: ['urgent'],
    updates: [],
    relations: [],
    sourceInputIds: []
  });

  // リマインダーを設定
  const schedule = await context.scheduler.schedule(
    issue.id,
    "3日後の朝9時",
    'reminder',
    { timezone: 'Asia/Tokyo' }
  );

  context.recorder.record(RecordType.INFO, {
    message: 'リマインダー設定',
    scheduleId: schedule.scheduleId,
    nextRun: schedule.nextRun
  });

  return { success: true, context, output: { issue, schedule } };
}
```

### 10.2 スケジュールイベントの処理

SCHEDULE_TRIGGEREDイベントを処理するワークフローの例：

```typescript
export const handleScheduledTask: WorkflowDefinition = {
  name: 'handle-scheduled-task',
  description: 'スケジュールされたタスクを処理',
  triggers: {
    eventTypes: ['SCHEDULE_TRIGGERED']
  },
  executor: async (event, context, emitter) => {
    const { issueId, action, originalRequest } = event.payload;
    const issue = await context.storage.getIssue(issueId);

    switch (action) {
      case 'reminder':
        // リマインダー通知を送信
        await sendReminder(issue, originalRequest);
        break;

      case 'escalate':
        // 優先度を上げる
        await context.storage.updateIssue(issueId, {
          priority: Math.min(100, issue.priority + 10)
        });
        emitter.emit({
          type: 'HIGH_PRIORITY_DETECTED',
          payload: { issueId, priority: issue.priority + 10 }
        });
        break;

      case 'auto_close':
        // 自動クローズ
        await context.storage.updateIssue(issueId, {
          status: 'closed',
          closedAt: new Date()
        });
        // スケジュールも自動でキャンセルされる
        await context.scheduler.cancelByIssue(issueId);
        break;
    }

    return { success: true, context };
  }
};
```

### 10.3 重複防止とキャンセル

```typescript
executor: async (event, context, emitter) => {
  const issueId = event.payload.issueId;

  // 同じIssue内で同じdedupeKeyを使うと古いものは自動キャンセル
  await context.scheduler.schedule(
    issueId,
    "毎日午後3時",
    'check_progress',
    {
      dedupeKey: 'daily-check',  // Issue ID + dedupeKeyでユニーク判定
      maxOccurrences: 7           // 最大7回まで
    }
  );
  // 注: 異なるIssueでは同じdedupeKeyを使用可能

  // Issue closeと連動して自動キャンセル
  if (event.payload.action === 'close') {
    await context.scheduler.cancelByIssue(issueId);
  }

  return { success: true, context };
}
```

## 11. セキュリティ考慮事項

### 11.1 入力検証

```typescript
import { z } from 'zod';

const InputSchema = z.object({
  text: z.string().min(1).max(1000),
  userId: z.string().uuid(),
  timestamp: z.string().datetime()
});

executor: async (event, context, emitter) => {
  // スキーマ検証
  const validation = InputSchema.safeParse(event.payload);
  if (!validation.success) {
    return {
      success: false,
      context,
      error: new Error(`Validation failed: ${validation.error.message}`)
    };
  }

  const validatedInput = validation.data;
  // 安全に処理を続行
}
```

### 11.2 機密情報の扱い

```typescript
executor: async (event, context, emitter) => {
  // 機密情報をログに含めない
  const sanitizedPayload = {
    ...event.payload,
    apiKey: '[REDACTED]',
    password: '[REDACTED]'
  };

  context.recorder.record(RecordType.INFO, {
    message: 'Processing request',
    payload: sanitizedPayload
  });

  // 処理...
}
```

## 12. まとめ

ワークフロー開発の重要なポイント：

1. **明確な目的**: 各ワークフローは単一の明確な責任を持つ
2. **適切なトリガー**: イベントタイプと条件を正確に設定
3. **エラー処理**: すべての例外を適切にハンドリング
4. **ログ記録**: デバッグと監視のための十分な情報を記録
5. **テスト**: 単体テストと統合テストで品質を保証
6. **パフォーマンス**: 必要に応じて最適化を実施
7. **セキュリティ**: 入力検証と機密情報の保護

詳細な仕様については、[SPECIFICATION.md](./SPECIFICATION.md)を参照してください。