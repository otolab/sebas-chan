# ワークフロー トリガーイベント仕様

## 1. 概要

本文書は、sebas-chanシステムの全ワークフローがどのイベントによってトリガーされるかを定義します。

## 2. イベント分類

### 外部イベント（External Events）
システム外部から発生するイベント

| イベント名 | 説明 | 発生元 |
|-----------|------|--------|
| `USER_REQUEST_RECEIVED` | ユーザーからの自然言語リクエスト | Web UI, API |
| `DATA_ARRIVED` | 外部システムからのデータ到着 | Reporters |
| `SCHEDULED_TIME_REACHED` | スケジュール時刻到達 | スケジューラー |
| `WEBHOOK_RECEIVED` | 外部サービスからのWebhook | 外部API |

### 状態変化イベント（State Change Events）
システム内部の状態変化を表すイベント

| イベント名 | 説明 | 発生元ワークフロー |
|-----------|------|------------------|
| `ISSUE_CREATED` | 新しいIssueが作成された | A-1, A-2 |
| `ISSUE_UPDATED` | Issueが更新された | 各種ワークフロー |
| `ISSUE_CLOSED` | Issueがクローズされた | ユーザー操作 |
| `KNOWLEDGE_STORED` | 知識が保存された | A-3 |
| `KNOWLEDGE_UPDATED` | 知識が更新された | A-3 |
| `FLOW_CREATED` | 新しいFlowが作成された | B-1 |
| `FLOW_PRIORITY_CHANGED` | Flowの優先度が変更された | B-3 |

### 分析・発見イベント（Discovery Events）
分析や処理の結果として発見されたイベント

| イベント名 | 説明 | 発生元ワークフロー |
|-----------|------|------------------|
| `ERROR_DETECTED` | エラーを検出 | A-1 |
| `ANOMALY_DETECTED` | 異常を検出 | A-1, B-4 |
| `PATTERN_FOUND` | パターンを発見 | B-1, B-4 |
| `KNOWLEDGE_EXTRACTABLE` | 知識抽出可能 | A-2 |
| `CONFLICT_DETECTED` | 競合を検出 | S-3 |
| `THRESHOLD_EXCEEDED` | 閾値超過 | 監視系 |

### 意図理解イベント（Intent Events）
ユーザーリクエストから理解された意図

| イベント名 | 説明 | 発生元ワークフロー |
|-----------|------|------------------|
| `SCHEDULE_REQUEST_IDENTIFIED` | スケジュール登録の意図 | A-0 |
| `REMINDER_REQUEST_IDENTIFIED` | リマインダー設定の意図 | A-0 |
| `QUESTION_ASKED` | 質問の意図 | A-0 |
| `ISSUE_REPORTED` | 問題報告の意図 | A-0 |
| `FEEDBACK_PROVIDED` | フィードバックの意図 | A-0 |
| `ACTION_REQUESTED` | アクション要求の意図 | A-0 |

## 3. ワークフロー別トリガーイベント

### A系列: 個別要素の処理

#### A-0: ProcessUserRequest
- **トリガー**: `USER_REQUEST_RECEIVED`
- **条件**: なし（すべてのユーザーリクエストを処理）
- **優先度**: 60（高）

#### A-1: IngestInput
- **トリガー**:
  - `DATA_ARRIVED`
  - `ISSUE_REPORTED`（A-0から）
- **条件**: データが構造化可能
- **優先度**: 40（標準）

#### A-2: AnalyzeIssueImpact
- **トリガー**:
  - `ISSUE_CREATED`
  - `ISSUE_UPDATED`
  - `ERROR_DETECTED`
- **条件**: Issueが分析未実施
- **優先度**: 30（標準）

#### A-3: ExtractKnowledge
- **トリガー**:
  - `KNOWLEDGE_EXTRACTABLE`
  - `ISSUE_CLOSED`
  - `QUESTION_ASKED`（A-0から）
  - `FEEDBACK_PROVIDED`（A-0から）
- **条件**: 知識化の価値がある
- **優先度**: 20（標準）

### B系列: 横断的な分析と整理

#### B-1: ClusterIssues
- **トリガー**:
  - `SCHEDULED_TIME_REACHED`（定期実行）
  - `THRESHOLD_EXCEEDED`（Issue数が閾値超過）
- **条件**: 未クラスタリングのIssueが3件以上
- **優先度**: 10（低）

#### B-2: UpdateFlowRelations
- **トリガー**:
  - `FLOW_CREATED`
  - `ISSUE_CREATED`
  - `SCHEDULED_TIME_REACHED`（定期実行）
- **条件**: 関係性の更新が必要
- **優先度**: 15（低）

#### B-3: UpdateFlowPriorities
- **トリガー**:
  - `FLOW_CREATED`
  - `ISSUE_UPDATED`
  - `SCHEDULED_TIME_REACHED`（定期実行）
- **条件**: 優先度の再計算が必要
- **優先度**: 15（低）

#### B-4: SalvageFromPond
- **トリガー**:
  - `SCHEDULED_TIME_REACHED`（定期実行）
  - `THRESHOLD_EXCEEDED`（Pondサイズが閾値超過）
- **条件**: 未処理のPondエントリが存在
- **優先度**: 5（最低）

### C系列: 提案系

#### C-1: SuggestNextFlow
- **トリガー**:
  - `ACTION_REQUESTED`（A-0から）
  - `FLOW_PRIORITY_CHANGED`
  - `USER_REQUEST_RECEIVED`（特定の質問）
- **条件**: ユーザーがアクティブ
- **優先度**: 25（標準）

#### C-2: SuggestNextAction
- **トリガー**:
  - `ISSUE_CREATED`
  - `ISSUE_UPDATED`
  - `ACTION_REQUESTED`（A-0から）
- **条件**: Issueに対する提案が未生成
- **優先度**: 25（標準）

### S系列: スケジュール管理（例）

#### S-1: ScheduleRegistration
- **トリガー**: `SCHEDULE_REQUEST_IDENTIFIED`
- **条件**: なし
- **優先度**: 50（高）

#### S-2: ReminderSetup
- **トリガー**: `REMINDER_REQUEST_IDENTIFIED`
- **条件**: なし
- **優先度**: 40（標準）

#### S-3: ConflictCheck
- **トリガー**: `SCHEDULE_CREATED`
- **条件**: なし
- **優先度**: 30（標準）

#### S-4: ReminderExecution
- **トリガー**: `SCHEDULED_TIME_REACHED`
- **条件**: リマインダー時刻に一致
- **優先度**: 70（高）

## 4. イベント発行マトリクス

どのワークフローがどのイベントを発行するか

| ワークフロー | 発行するイベント |
|-------------|----------------|
| A-0 | `SCHEDULE_REQUEST_IDENTIFIED`, `REMINDER_REQUEST_IDENTIFIED`, `QUESTION_ASKED`, `ISSUE_REPORTED`, `FEEDBACK_PROVIDED`, `ACTION_REQUESTED` |
| A-1 | `ERROR_DETECTED`, `ANOMALY_DETECTED`, `ISSUE_CREATED` |
| A-2 | `KNOWLEDGE_EXTRACTABLE`, `ISSUE_UPDATED` |
| A-3 | `KNOWLEDGE_STORED`, `KNOWLEDGE_UPDATED` |
| B-1 | `PATTERN_FOUND`, `FLOW_CREATED` |
| B-2 | `FLOW_RELATIONS_UPDATED` |
| B-3 | `FLOW_PRIORITY_CHANGED` |
| B-4 | `PATTERN_FOUND`, `ANOMALY_DETECTED` |
| S-1 | `SCHEDULE_CREATED` |
| S-2 | `REMINDER_CONFIGURED` |
| S-3 | `CONFLICT_DETECTED`, `SCHEDULE_CONFIRMED` |
| S-4 | `REMINDER_TRIGGERED`, `NOTIFICATION_SENT` |

## 5. イベント設計原則

### 命名規則
- **過去形/完了形**: 起きたことを表現（`CREATED`, `DETECTED`, `RECEIVED`）
- **明確性**: イベント名から何が起きたかが明確
- **一貫性**: 同じ種類のイベントは同じパターン

### ペイロード設計
- **事実のみ**: 処理指示を含まない
- **完全性**: 後続処理に必要な情報をすべて含む
- **不変性**: イベント発行後は変更不可

### トリガー条件
- **明確性**: いつトリガーされるかが明確
- **独立性**: 他のワークフローの実装に依存しない
- **冪等性**: 同じイベントを複数回処理しても安全

## 6. 実装ガイドライン

### WorkflowTriggerの実装例

```typescript
// A-2: AnalyzeIssueImpact
const analyzeIssueImpactWorkflow: WorkflowDefinition = {
  name: 'AnalyzeIssueImpact',
  description: 'Issueの影響範囲を分析',
  triggers: {
    eventTypes: ['ISSUE_CREATED', 'ISSUE_UPDATED', 'ERROR_DETECTED'],
    condition: (event) => {
      // 分析済みでないIssueのみ処理
      if (event.type === 'ISSUE_CREATED') return true;
      if (event.type === 'ISSUE_UPDATED') {
        return !event.payload.issue?.analyzed;
      }
      return true;
    },
    priority: 30
  },
  executor: executeAnalyzeIssueImpact
};
```

### イベント発行の実装例

```typescript
// ワークフロー内でのイベント発行
emitter.emit({
  type: 'KNOWLEDGE_EXTRACTABLE',
  payload: {
    sourceType: 'issue',
    sourceId: issueId,
    confidence: 0.85,
    reason: 'High impact issue with solution',
    timestamp: new Date().toISOString()
  }
});
```

## 7. まとめ

このトリガーイベント仕様により：

1. **明確なトリガー条件**: 各ワークフローがいつ動くかが明確
2. **イベントの追跡**: どのイベントがどこから発生するか追跡可能
3. **疎結合**: ワークフロー間の依存を最小化
4. **拡張性**: 新しいイベントとワークフローの追加が容易

この仕様に基づいてワークフローを実装することで、保守性と拡張性の高いシステムが実現できます。