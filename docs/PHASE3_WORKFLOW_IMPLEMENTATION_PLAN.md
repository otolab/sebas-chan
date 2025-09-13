# Phase 3: ワークフロー実装計画書

## 概要

sebas-chanのPhase 3では、エージェントの思考ワークフローを実装します。ワークフローはイベントを処理する一連のハードコーディングされた処理フローで、必要に応じてModular Promptフレームワークを活用してAIを呼び出します。

## アーキテクチャ

### 全体構成

```
Engine (packages/server)
    ↓ AgentContextを提供
Agent (packages/core) - 思考ループ・イベント処理
    ↓ イベントをワークフローへ
ワークフロー層（TypeScriptハードコード）
    ↓ 必要に応じて
Modular Prompt Framework (@moduler-prompt)
    ↓
AIドライバー（OpenAI/Anthropic/Ollama）
```

### 主要コンポーネント

#### Engine (packages/server)
- Agentのインスタンスを生成・管理
- AgentContextを提供（DB接続、State管理、イベント発行）
- 外部システムとの接続を管理

#### Agent (packages/core)
- 思考ループ（イベントループ）の実装
- イベント種別に対するワークフロー割当
- ワークフローレジストリの管理
- ライブラリとして動作

#### ワークフロー（思考ワークフロー）
- イベントを処理する一連のハードコーディングされた流れ
- 複数回のAI呼び出し、DB操作、ログ記録が可能
- 次の思考ワークフローの実行予約（イベント発行）
- 実行記録の保存（WorkflowLogger）

#### AgentContext
- ワークフローが活動する環境
- Engineから提供される
- DBアクセス、State取得、イベント発行機能を含む

## WorkflowContextの仕様

```typescript
interface WorkflowContext {
  // トリガーイベント
  event: AgentEvent;

  // Engine提供の環境（DB、State、イベント発行）
  agentContext: AgentContext;

  // ワークフロー専用ロガー（実行IDを内部保持）
  logger: WorkflowLogger;

  // AIドライバー（@moduler-prompt/driver）
  driver?: any;

  // 実行時設定
  config?: {
    model?: string;
    temperature?: number;
    maxRetries?: number;
  };

  // 実行時メタデータ
  metadata?: Record<string, any>;
}
```

## ワークフローの基本構造

ワークフローは`BaseWorkflow`を継承し、以下の要素を持つ：

```typescript
class ConcreteWorkflow extends BaseWorkflow {
  async process(context: WorkflowContext): Promise<WorkflowResult> {
    const { logger, agentContext, driver } = context;

    // 1. 入力をログ
    await logger.logInput({
      event: context.event,
      metadata: context.metadata
    });

    // 2. DBからデータ取得
    const data = await agentContext.searchIssues(query);
    await logger.logDbQuery('searchIssues', query, data.map(d => d.id));

    // 3. AI呼び出し（必要に応じて複数回）
    if (driver) {
      const promptModule = this.buildPromptModule(data);
      const compiled = compile(promptModule, { data });
      const result = await driver.query(compiled);
      await logger.logAiCall('analyzeData', { module: 'analysis' }, result);
    }

    // 4. 結果の処理とDB更新
    const processed = this.processResult(data);
    await agentContext.addPondEntry(processed);

    // 5. 次のワークフロー予約
    const nextEvents = this.determineNextEvents(processed);

    // 6. 出力をログ
    await logger.logOutput({ processed, nextEvents });

    return { success: true, output: processed, nextEvents };
  }

  // ヘルパーメソッド
  private buildPromptModule(data: any): PromptModule {
    // @moduler-promptを使用してプロンプトモジュールを構築
  }

  private processResult(data: any): any {
    // 結果の処理ロジック
  }

  private determineNextEvents(result: any): AgentEvent[] {
    // 次のイベントを決定
  }
}
```

## ログシステム

ワークフローの実行履歴を記録し、デバッグ・分析を可能にする：

### WorkflowLoggerインターフェース
```typescript
interface WorkflowLogger {
  readonly executionId: string;       // 実行ID（自動生成）
  readonly workflowName: string;      // ワークフロー名

  // ログメソッド
  logInput(data: any): Promise<void>;
  logOutput(data: any): Promise<void>;
  logDbQuery(operation: string, query: any, resultIds: string[]): Promise<void>;
  logAiCall(module: string, params: any, response: any): Promise<void>;
  logError(error: Error, context?: any): Promise<void>;

  // サブワークフロー用
  createChildLogger(workflowName: string): WorkflowLogger;
}
```

詳細は[WORKFLOW_LOGGING_SPEC.md](./WORKFLOW_LOGGING_SPEC.md)を参照。

## 実装するワークフロー

### A-0: PROCESS_USER_REQUEST
**目的**: ユーザーリクエストの解釈と適切なワークフローへのルーティング

**処理フロー**:
1. リクエスト内容の解析
2. State文書の参照
3. 適切なワークフローの決定
4. 次のイベント発行

### A-1: INGEST_INPUT
**目的**: ReporterからのInputをPond/Issueに変換

**処理フロー**:
1. Input内容の解析
2. 既存Issue/Flowの検索
3. 関連性の判定
4. PondEntryの作成
5. 必要に応じてIssue作成/更新

### A-2: ANALYZE_ISSUE_IMPACT
**目的**: Issue更新時の影響分析

**処理フロー**:
1. 更新されたIssueの取得
2. 関連Flow/Issueの検索
3. 依存関係の分析
4. 影響範囲の特定
5. 通知イベントの発行

### A-3: EXTRACT_KNOWLEDGE
**目的**: 完了IssueからのKnowledge抽出

**処理フロー**:
1. 完了Issueの取得
2. パターンの認識
3. 一般化可能な知識の抽出
4. Knowledge形式への変換
5. DBへの保存

## Modular Promptフレームワークの活用

ワークフロー内でAI呼び出しが必要な場合、@moduler-promptを使用：

```typescript
import { compile, merge, createContext } from '@moduler-prompt/core';
import type { PromptModule } from '@moduler-prompt/core';

// プロンプトモジュールの定義
const analysisModule: PromptModule = {
  objective: ['データを分析して洞察を抽出'],
  instructions: [
    'データパターンの特定',
    '異常値の検出',
    '改善提案の生成'
  ],
  materials: [
    (ctx) => ctx.data.map(d => ({
      type: 'material',
      id: d.id,
      title: d.title,
      content: d.content
    }))
  ],
  cue: ['JSON形式で結果を出力']
};

// 実行
const context = createContext(analysisModule);
context.data = searchResults;
const compiled = compile(analysisModule, context);
const result = await driver.query(compiled);
```

## 実装手順

### Phase 3.1: 基盤構築
1. **WorkflowContext型の更新**
   - AIドライバーの追加
   - ログシステムの整備

2. **BaseWorkflowクラスの改善**
   - logId管理の見直し
   - processメソッドのシグネチャ変更

3. **WorkflowLoggerの実装**
   - 実行ID管理
   - ログメソッドの実装

### Phase 3.2: 個別ワークフロー実装
1. A-0: PROCESS_USER_REQUEST
2. A-1: INGEST_INPUT
3. A-2: ANALYZE_ISSUE_IMPACT
4. A-3: EXTRACT_KNOWLEDGE

### Phase 3.3: テストと統合
1. モックドライバーでのユニットテスト
2. 統合テスト
3. E2Eテスト

## ディレクトリ構造

```
packages/core/src/
├── workflows/
│   ├── types.ts                    # 型定義
│   ├── registry.ts                 # レジストリ
│   ├── logger.ts                   # ログシステム
│   ├── A0_ProcessUserRequest.ts    # A-0実装
│   ├── A1_IngestInput.ts          # A-1実装
│   ├── A2_AnalyzeIssueImpact.ts   # A-2実装
│   ├── A3_ExtractKnowledge.ts     # A-3実装
│   └── modules/                    # 共通プロンプトモジュール
│       ├── base.ts                # 基本モジュール
│       ├── state-reader.ts        # State読み取り
│       └── issue-manager.ts       # Issue管理
└── index.ts                        # Core Agent統合
```

## 設定管理

```typescript
// packages/core/src/config/workflow.config.ts
export const workflowConfig = {
  driver: {
    provider: process.env.AI_PROVIDER || 'openai',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    storage: process.env.LOG_STORAGE || 'file'
  },
  retry: {
    maxAttempts: 3,
    delay: 1000
  }
};
```

## リスクと対策

### リスク1: ワークフローの複雑化
**対策**: 単一責任の原則を守り、各ワークフローを簡潔に保つ

### リスク2: ログデータの肥大化
**対策**: 必要最小限の情報のみ記録、定期的なアーカイブ

### リスク3: AI呼び出しコスト
**対策**: キャッシュ機構、モデル選択の最適化

## 今後の拡張

### Phase 4で追加予定
- B系ワークフロー（横断的分析）
- C系ワークフロー（提案系）
- D系ワークフロー（自己調整）

### 長期的な拡張
- ワークフローのビジュアライザー
- パフォーマンス分析ツール
- 自動テスト生成

## まとめ

Phase 3では、Agentの思考ワークフローをTypeScriptでハードコード実装し、必要に応じてModular Promptフレームワークを活用します。各ワークフローは明確な責務を持ち、AgentContextを通じてEngineが提供する環境で動作します。

---

作成日: 2025-09-13
更新日: 2025-09-13
作成者: sebas-chan開発チーム