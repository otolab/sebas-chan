# ワークフローから見える世界

## 1. 概要

ワークフローは独立した純粋関数として、限定された窓口を通じてシステムと対話します。この文書は、ワークフローが「何を見ることができ」「何を操作でき」「どのように世界を理解するか」を定義します。

## 2. ワークフローの入力

### 2.1 AgentEvent - 起きたことの通知

```typescript
interface AgentEvent {
  /** イベントタイプ（大文字スネークケース） */
  type: string;

  /** イベント固有のデータ */
  payload: unknown;

  /** イベントのメタデータ */
  metadata?: {
    timestamp: string;
    sourceWorkflow?: string;
    correlationId?: string;
    userId?: string;
    sessionId?: string;
  };
}
```

#### イベントの多態性

同じイベントタイプでも、payloadの内容によって異なる意味を持たせることができます：

```typescript
// 例：DATA_ARRIVEDイベントの多態性
interface DataArrivedEvent extends AgentEvent {
  type: 'DATA_ARRIVED';
  payload:
    | { source: 'user'; data: UserInput }
    | { source: 'reporter'; data: ReporterData }
    | { source: 'webhook'; data: WebhookPayload };
}

// ワークフローはconditionで特定のパターンのみに反応
triggers: {
  eventTypes: ['DATA_ARRIVED'],
  condition: (event) => event.payload.source === 'reporter'
}
```

### 2.2 WorkflowContext - 実行環境

ワークフローは`context`を通じてシステムリソースにアクセスします。

```typescript
interface WorkflowContextInterface {
  /** システム状態（読み取り専用の文字列） */
  state: string;

  /** データベースアクセス */
  storage: WorkflowStorageInterface;

  /** AI処理能力 */
  createDriver: DriverFactory;

  /** 実行記録 */
  recorder: WorkflowRecorder;

  /** 設定値 */
  config?: WorkflowConfig;

  /** 実行時情報 */
  metadata?: Record<string, unknown>;
}
```

## 3. データストレージへのアクセス

### 3.1 WorkflowStorageInterface

ワークフローは`context.storage`を通じてデータベースにアクセスします。

#### Issue管理

```typescript
// Issue: 問題・課題・タスクを表現
interface Issue {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  labels: string[];
  priority?: number;

  // 履歴
  updates: IssueUpdate[];

  // 関係性
  relations: IssueRelation[];
  sourceInputIds: string[];

  // タイムスタンプ
  createdAt: Date;
  updatedAt: Date;
}

// 利用可能な操作
storage.getIssue(id: string): Promise<Issue | null>
storage.searchIssues(query: string): Promise<Issue[]>
storage.createIssue(issue: IssueInput): Promise<Issue>
storage.updateIssue(id: string, update: Partial<Issue>): Promise<Issue>
```

**ワークフローが知ることができること**:
- Issueの現在の状態と履歴
- 他のIssueとの関係性
- 優先度とラベル

**できないこと**:
- 直接的な削除（論理削除のみ）
- 他のワークフローの実行状態

#### Pond（データレイク）

```typescript
// PondEntry: 生データの永続化
interface PondEntry {
  id: string;
  content: string;
  source: string;

  // ベクトル検索用
  embedding?: number[];

  // メタデータ
  metadata?: Record<string, unknown>;

  timestamp: Date;
}

// 利用可能な操作
storage.searchPond(query: string): Promise<PondEntry[]>
storage.addPondEntry(entry: PondEntryInput): Promise<PondEntry>
```

**特徴**:
- Pondは追記専用（immutable）
- ベクトル検索が可能
- 生データの完全な保存

#### Knowledge（知識ベース）

```typescript
// Knowledge: 再利用可能な知識
interface Knowledge {
  id: string;
  type: 'solution' | 'pattern' | 'best_practice' | 'reference';
  content: string;

  // 評価
  reputation: {
    upvotes: number;
    downvotes: number;
  };

  // 出所
  sources: KnowledgeSource[];

  createdAt: Date;
}

// 利用可能な操作
storage.getKnowledge(id: string): Promise<Knowledge | null>
storage.searchKnowledge(query: string): Promise<Knowledge[]>
storage.createKnowledge(knowledge: KnowledgeInput): Promise<Knowledge>
storage.updateKnowledge(id: string, update: Partial<Knowledge>): Promise<Knowledge>
```

### 3.2 検索と取得の戦略

#### 検索時に考慮すべきこと

```typescript
// ワークフローでの検索戦略例
async function findRelatedIssues(
  storage: WorkflowStorageInterface,
  currentIssue: Issue
): Promise<Issue[]> {
  // 1. キーワード検索
  const keywordMatches = await storage.searchIssues(currentIssue.title);

  // 2. ラベルでフィルタリング
  const labelMatches = keywordMatches.filter(issue =>
    issue.labels.some(label => currentIssue.labels.includes(label))
  );

  // 3. 時間的近接性を考慮
  const recentMatches = labelMatches.filter(issue => {
    const daysDiff = (Date.now() - issue.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff < 30;
  });

  return recentMatches;
}
```

## 4. AI処理能力

### 4.1 DriverFactory

```typescript
interface DriverFactory {
  (config: DriverConfig): Promise<AIDriver>;
}

interface DriverConfig {
  requiredCapabilities: string[];  // 必須能力
  preferredCapabilities?: string[]; // 推奨能力
}

// 利用例
const driver = await context.createDriver({
  requiredCapabilities: ['structured_output'],
  preferredCapabilities: ['japanese', 'fast']
});
```

### 4.2 ModulerPromptとの統合

```typescript
import { compile } from '@moduler-prompt/core';

// ワークフロー内でのAI処理
async function analyzeWithAI(
  context: WorkflowContextInterface,
  input: string
): Promise<StructuredOutput> {
  const driver = await context.createDriver({
    requiredCapabilities: ['structured_output']
  });

  const promptModule = {
    objective: ['入力を分析する'],
    instructions: ['重要な情報を抽出'],
    schema: OutputSchema  // JSONSchema
  };

  const compiled = compile(promptModule);
  const result = await driver.query(compiled);

  return result.structured; // 構造化された出力
}
```

## 5. イベント発行

### 5.1 WorkflowEventEmitterInterface

```typescript
interface WorkflowEventEmitterInterface {
  emit(event: {
    type: string;
    payload: unknown;
  }): void;
}
```

### 5.2 イベント設計の原則

#### データ変更に基づくイベント

```typescript
// Issueが更新されたときのイベント発行
async function handleIssueUpdate(
  storage: WorkflowStorageInterface,
  emitter: WorkflowEventEmitterInterface,
  issueId: string,
  update: IssueUpdate
): Promise<void> {
  const issue = await storage.updateIssue(issueId, {
    updates: [...issue.updates, update]
  });

  // 状態変化に応じて異なるイベントを発行
  if (update.statusChange?.to === 'resolved') {
    emitter.emit({
      type: 'ISSUE_RESOLVED',
      payload: { issueId, resolution: update.content }
    });
  } else if (update.priorityChange?.to > 80) {
    emitter.emit({
      type: 'HIGH_PRIORITY_ISSUE',
      payload: { issueId, priority: update.priorityChange.to }
    });
  } else {
    emitter.emit({
      type: 'ISSUE_UPDATED',
      payload: { issueId, updateType: 'general' }
    });
  }
}
```

## 6. ワークフローが知らないこと

### 6.1 他のワークフローの存在

ワークフローは他のワークフローの存在を直接知りません：
- どのワークフローが実行中か
- 次にどのワークフローが実行されるか
- 自分が発行したイベントを誰が処理するか

### 6.2 システムの全体状態

ワークフローは部分的な視点しか持ちません：
- システム全体のパフォーマンス
- 他のユーザーの活動
- インフラストラクチャの状態

### 6.3 未来の情報

ワークフローは現在と過去のみを知ります：
- 将来のスケジュール（別途管理）
- 予定されたメンテナンス
- 他のワークフローの計画

## 7. ワークフロー設計のベストプラクティス

### 7.1 データの活用

```typescript
// 良い例：必要な情報のみを取得
async function processIssue(
  event: AgentEvent,
  context: WorkflowContextInterface
): Promise<void> {
  const { issueId } = event.payload as { issueId: string };

  // 1. 必要な情報のみ取得
  const issue = await context.storage.getIssue(issueId);
  if (!issue) return;

  // 2. 関連情報を効率的に検索
  const relatedIssues = await context.storage.searchIssues(
    issue.labels.join(' OR ')
  );

  // 3. 処理結果を記録
  await context.storage.updateIssue(issueId, {
    metadata: {
      relatedCount: relatedIssues.length,
      processedAt: new Date().toISOString()
    }
  });
}
```

### 7.2 イベントの適切な発行

```typescript
// 良い例：意味のあるイベントを発行
function emitMeaningfulEvents(
  emitter: WorkflowEventEmitterInterface,
  analysis: AnalysisResult
): void {
  // 閾値を超えた場合のみイベント発行
  if (analysis.severity > 0.8) {
    emitter.emit({
      type: 'CRITICAL_ISSUE_DETECTED',
      payload: {
        issueId: analysis.issueId,
        severity: analysis.severity,
        requiredAction: analysis.suggestedAction
      }
    });
  }

  // パターンを発見した場合
  if (analysis.patterns.length > 0) {
    emitter.emit({
      type: 'PATTERN_DISCOVERED',
      payload: {
        patterns: analysis.patterns,
        confidence: analysis.confidence
      }
    });
  }
}
```

### 7.3 エラー処理とレジリエンス

```typescript
// 良い例：適切なエラー処理
async function resilientWorkflow(
  event: AgentEvent,
  context: WorkflowContextInterface
): Promise<WorkflowResult> {
  try {
    // データ取得の失敗に備える
    const data = await context.storage.searchPond(query).catch(() => []);

    // AI処理の失敗に備える
    let analysis;
    try {
      analysis = await analyzeWithAI(context, data);
    } catch (aiError) {
      // フォールバック処理
      analysis = basicAnalysis(data);
    }

    return {
      success: true,
      context,
      output: analysis
    };
  } catch (error) {
    // エラーを適切に記録
    await context.recorder.log({
      level: 'error',
      message: `Workflow failed: ${error.message}`,
      workflowName: 'resilientWorkflow'
    });

    return {
      success: false,
      context,
      error: error as Error
    };
  }
}
```

## 8. まとめ

ワークフローから見える世界は：

1. **入力**: イベントとコンテキストを通じた限定的な情報
2. **データアクセス**: storage経由での構造化されたデータ操作
3. **AI能力**: createDriver経由でのインテリジェント処理
4. **出力**: イベント発行による次の処理のトリガー

この制約された環境により：
- **予測可能性**: 副作用が限定的
- **テスト可能性**: 依存関係が明確
- **保守性**: 責任範囲が明確
- **拡張性**: 新しいワークフローの追加が容易

ワークフローは「限定された視点から、明確な責任を持って、予測可能な方法で動作する」ことが重要です。