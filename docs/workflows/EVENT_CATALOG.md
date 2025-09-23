# イベントカタログ

## 1. 概要

このドキュメントは、sebas-chanシステムで定義されているすべてのイベントの正式なカタログです。イベントは「システムで起きた具体的な出来事」を表現し、ワークフローをトリガーする重要な要素です。

## 2. イベント設計原則

### 2.1 命名規則
- **大文字スネークケース**: `USER_REQUEST_RECEIVED`
- **過去形/完了形**: 起きたことを表現
- **明確で具体的**: 何が起きたかが名前から明確

### 2.2 カテゴリ分類
- **外部イベント**: システム外部から発生
- **データイベント**: データの変更・追加
- **分析イベント**: 分析・処理の完了
- **システムイベント**: システム内部の状態変化

## 3. イベント定義

### データフローの基本原則
- **自動Pond保存**: 外部データ到着時（`DATA_ARRIVED`）は、システムが自動的にPondに保存
- **ワークフローの役割**: A-1 (IngestInput)は保存済みデータを分析し、必要に応じてIssue化
- **イベントの簡潔性**: `POND_ENTRY_ADDED`は`DATA_ARRIVED`に含まれるため、独立イベントとして不要

## 4. イベント定義詳細

### USER_REQUEST_RECEIVED
**カテゴリ**: 外部イベント
**説明**: ユーザーから自然言語のリクエストを受信した

```typescript
interface UserRequestReceivedEvent {
  type: 'USER_REQUEST_RECEIVED';
  payload: {
    userId: string;
    content: string;
    sessionId?: string;
    timestamp: string;
    metadata?: {
      source: 'web' | 'api' | 'cli';
      ip?: string;
    };
  };
}
```

**トリガーするワークフロー**:
- A-0: ProcessUserRequest (優先度: 60)

**発生元**: Web UI, API, CLI

---

### DATA_ARRIVED
**カテゴリ**: 外部イベント
**説明**: 外部システムからデータが到着した（自動的にPondに保存される）

```typescript
interface DataArrivedEvent {
  type: 'DATA_ARRIVED';
  payload: {
    source: string;      // Reporter名など
    content: string;     // 生データ
    format?: string;     // データ形式
    pondEntryId: string; // 保存されたPondエントリのID
    metadata?: Record<string, unknown>;
    timestamp: string;
  };
}
```

**トリガーするワークフロー**:
- A-1: IngestInput (優先度: 40)

**発生元**: Reporters, Webhooks, 外部API

**備考**: データ到着時にシステムが自動的にPondに保存し、そのIDをpayloadに含める

---

### ISSUE_CREATED
**カテゴリ**: データイベント
**説明**: 新しいIssueが作成された

```typescript
interface IssueCreatedEvent {
  type: 'ISSUE_CREATED';
  payload: {
    issueId: string;
    issue: Issue;
    createdBy: 'user' | 'system' | 'workflow';
    sourceWorkflow?: string;
  };
}
```

**トリガーするワークフロー**:
- A-2: AnalyzeIssueImpact (優先度: 30)
- B-2: UpdateFlowRelations (優先度: 15)

**発生元**: A-1: IngestInput, ユーザー操作

---

### ISSUE_UPDATED
**カテゴリ**: データイベント
**説明**: 既存のIssueが更新された

```typescript
interface IssueUpdatedEvent {
  type: 'ISSUE_UPDATED';
  payload: {
    issueId: string;
    updates: {
      before: Partial<Issue>;
      after: Partial<Issue>;
      changedFields: string[];
    };
    updatedBy: string;
  };
}
```

**トリガーするワークフロー**:
- A-2: AnalyzeIssueImpact (condition: 重要な更新のみ)
- B-3: UpdateFlowPriorities (優先度: 15)

**発生元**: 各種ワークフロー、ユーザー操作

---

### ISSUE_STATUS_CHANGED
**カテゴリ**: データイベント
**説明**: Issueのステータスが変更された

```typescript
interface IssueStatusChangedEvent {
  type: 'ISSUE_STATUS_CHANGED';
  payload: {
    issueId: string;
    from: IssueStatus;
    to: IssueStatus;
    reason?: string;
    issue: Issue;
  };
}
```

**トリガーするワークフロー**:
- A-3: ExtractKnowledge (condition: status === 'resolved')
- C-1: SuggestNextFlow (優先度: 25)

**発生元**: ワークフロー、ユーザー操作

---

### ERROR_DETECTED
**カテゴリ**: 分析イベント
**説明**: エラーが検出された

```typescript
interface ErrorDetectedEvent {
  type: 'ERROR_DETECTED';
  payload: {
    errorType: 'system' | 'application' | 'user';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    stackTrace?: string;
    affectedComponent?: string;
    sourceData?: {
      pondEntryId?: string;
      issueId?: string;
    };
  };
}
```

**トリガーするワークフロー**:
- A-2: AnalyzeIssueImpact (優先度: 30)
- A-1: IngestInput (condition: 新規エラーの場合)

**発生元**: A-1: IngestInput, 監視システム

---

### PATTERN_FOUND
**カテゴリ**: 分析イベント
**説明**: パターンが発見された

```typescript
interface PatternFoundEvent {
  type: 'PATTERN_FOUND';
  payload: {
    patternType: 'error' | 'behavior' | 'performance' | 'usage';
    pattern: {
      description: string;
      occurrences: number;
      confidence: number;
      examples: string[];
    };
    relatedIssues: string[];
    suggestedAction?: string;
  };
}
```

**トリガーするワークフロー**:
- A-3: ExtractKnowledge (優先度: 20)
- B-1: ClusterIssues (優先度: 10)

**発生元**: B-1: ClusterIssues, B-4: SalvageFromPond

---

### KNOWLEDGE_EXTRACTABLE
**カテゴリ**: 分析イベント
**説明**: 知識抽出可能な情報が特定された

```typescript
interface KnowledgeExtractableEvent {
  type: 'KNOWLEDGE_EXTRACTABLE';
  payload: {
    sourceType: 'issue' | 'pattern' | 'resolution' | 'feedback';
    sourceId: string;
    confidence: number;
    reason: string;
    suggestedCategory?: KnowledgeCategory;
  };
}
```

**トリガーするワークフロー**:
- A-3: ExtractKnowledge (優先度: 20)

**発生元**: A-2: AnalyzeIssueImpact

---

### KNOWLEDGE_CREATED
**カテゴリ**: データイベント
**説明**: 新しい知識が作成された

```typescript
interface KnowledgeCreatedEvent {
  type: 'KNOWLEDGE_CREATED';
  payload: {
    knowledgeId: string;
    knowledge: Knowledge;
    sourceWorkflow: string;
    extractedFrom: {
      type: string;
      id: string;
    };
  };
}
```

**トリガーするワークフロー**:
- なし（終端イベント）

**発生元**: A-3: ExtractKnowledge

---

### HIGH_PRIORITY_DETECTED
**カテゴリ**: 分析イベント
**説明**: 高優先度の事項が検出された

```typescript
interface HighPriorityDetectedEvent {
  type: 'HIGH_PRIORITY_DETECTED';
  payload: {
    entityType: 'issue' | 'flow' | 'task';
    entityId: string;
    priority: number;  // 80-100
    reason: string;
    requiredAction?: string;
  };
}
```

**トリガーするワークフロー**:
- C-2: SuggestNextAction (優先度: 25)
- 通知システム（将来実装）

**発生元**: A-2: AnalyzeIssueImpact, B-3: UpdateFlowPriorities

---

### SCHEDULE_TRIGGERED
**カテゴリ**: システムイベント
**説明**: スケジュールされた時刻に達してタスクが実行された

```typescript
interface ScheduleTriggeredEvent {
  type: 'SCHEDULE_TRIGGERED';
  payload: {
    issueId: string;        // 関連Issue（必須）
    scheduleId: string;     // スケジュールID
    action: ScheduleAction; // 実行するアクション
    originalRequest: string; // 元の自然言語リクエスト
    metadata?: {
      occurrences: number;  // 実行回数
      nextRun?: string;     // 次回実行時刻（繰り返しの場合）
    };
  };
}

type ScheduleAction =
  | 'reminder'        // リマインダー通知
  | 'escalate'        // エスカレーション
  | 'auto_close'      // 自動クローズ
  | 'follow_up'       // フォローアップ
  | 'check_progress'; // 進捗確認
```

**トリガーするワークフロー**:
- C-4: HandleScheduledTask (優先度: 35)

**発生元**: WorkflowScheduler（システムコンポーネント）

**備考**:
- すべてのスケジュールは必ずIssueに紐付く
- Issue closeでスケジュールも自動キャンセルされる
- 自然言語での時刻指定をModulerPromptで解釈

---

### ANALYSIS_COMPLETE
**カテゴリ**: 分析イベント
**説明**: 分析処理が完了した

```typescript
interface AnalysisCompleteEvent {
  type: 'ANALYSIS_COMPLETE';
  payload: {
    analysisType: string;
    targetId: string;
    results: {
      summary: string;
      findings: unknown[];
      confidence: number;
    };
    nextSteps?: string[];
  };
}
```

**トリガーするワークフロー**:
- 結果に応じて動的に決定

**発生元**: 各種分析ワークフロー

---

### SCHEDULED_TIME_REACHED
**カテゴリ**: システムイベント
**説明**: スケジュールされた時刻に到達した

```typescript
interface ScheduledTimeReachedEvent {
  type: 'SCHEDULED_TIME_REACHED';
  payload: {
    scheduleName: string;
    scheduledTime: string;
    actualTime: string;
    metadata?: Record<string, unknown>;
  };
}
```

**トリガーするワークフロー**:
- B-1: ClusterIssues (condition: 日次実行)
- B-4: SalvageFromPond (condition: 週次実行)
- その他の定期タスク

**発生元**: スケジューラー

## 4. イベント発行マトリクス

| ワークフロー | 発行するイベント |
|-------------|-----------------|
| システム（データ受信時） | `DATA_ARRIVED` (Pond保存済み) |
| A-0: ProcessUserRequest | (動的: ユーザーリクエストに応じて各種イベント) |
| A-1: IngestInput | `ERROR_DETECTED`, `ISSUE_CREATED` |
| A-2: AnalyzeIssueImpact | `KNOWLEDGE_EXTRACTABLE`, `HIGH_PRIORITY_DETECTED`, `ISSUE_UPDATED` |
| A-3: ExtractKnowledge | `KNOWLEDGE_CREATED` |
| B-1: ClusterIssues | `PATTERN_FOUND`, `ISSUE_CREATED` (Flow提案) |
| B-4: SalvageFromPond | `PATTERN_FOUND`, `KNOWLEDGE_EXTRACTABLE` |

## 5. イベント購読マトリクス

| イベント | 購読するワークフロー | 条件 |
|---------|-------------------|------|
| `USER_REQUEST_RECEIVED` | A-0 | 常に |
| `DATA_ARRIVED` | A-1 | 常に |
| `ISSUE_CREATED` | A-2, B-2 | 常に |
| `ISSUE_UPDATED` | A-2 | 重要な更新のみ |
| `ERROR_DETECTED` | A-2 | 常に |
| `KNOWLEDGE_EXTRACTABLE` | A-3 | 常に |
| `HIGH_PRIORITY_DETECTED` | C-2 | 常に |
| `PATTERN_FOUND` | A-3, B-1 | パターンタイプによる |

## 6. イベント実装ガイドライン

### 6.1 新しいイベントを追加する場合

1. **必要性の確認**: 既存のイベントで表現できないか検討
2. **命名**: 明確で具体的な名前を付ける
3. **payload設計**: 必要十分な情報を含める
4. **ドキュメント**: このカタログに追加

### 6.2 イベント発行のベストプラクティス

```typescript
// 良い例: 明確な条件でイベント発行
if (issue.priority > 80 && !issue.acknowledged) {
  emitter.emit({
    type: 'HIGH_PRIORITY_DETECTED',
    payload: {
      entityType: 'issue',
      entityId: issue.id,
      priority: issue.priority,
      reason: 'Unacknowledged high priority issue',
      requiredAction: 'Immediate attention required'
    }
  });
}

// 悪い例: 曖昧なイベント
emitter.emit({
  type: 'SOMETHING_HAPPENED',
  payload: { data: issue }
});
```

### 6.3 イベント購読のベストプラクティス

```typescript
// 良い例: 具体的な条件で購読
const workflow: WorkflowDefinition = {
  name: 'ProcessHighPriorityIssue',
  triggers: {
    eventTypes: ['ISSUE_CREATED', 'ISSUE_UPDATED'],
    condition: (event) => {
      const issue = event.payload.issue;
      return issue && issue.priority > 80;
    },
    priority: 50
  },
  executor: processHighPriority
};
```

## 7. 設計の簡潔性

### イベント統合の原則
- **データ到着 = Pond保存**: `DATA_ARRIVED`イベントは、Pond保存が完了した状態を表す
- **独立イベントの最小化**: 自明な処理（Pond保存など）は独立イベントにしない
- **ワークフローの単純化**: 1つのイベントを1つのワークフローが処理することを基本とする

## 8. 今後の拡張

### 計画中のイベント

- `FLOW_CREATED`: 新しいFlowが作成された
- `FLOW_COMPLETED`: Flowが完了した
- `USER_FEEDBACK_RECEIVED`: ユーザーフィードバックを受信
- `SYSTEM_HEALTH_CHANGED`: システムヘルス状態が変化
- `THRESHOLD_EXCEEDED`: 閾値を超過した

## 9. まとめ

イベントはsebas-chanシステムの神経系です。明確に定義され、文書化されたイベントにより：

1. **予測可能性**: どのような出来事が起きるかが明確
2. **追跡可能性**: イベントの流れを追跡可能
3. **拡張性**: 新しいワークフローの追加が容易
4. **保守性**: イベントとワークフローの関係が明確

このカタログは、システムの成長とともに継続的に更新される必要があります。