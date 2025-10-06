# イベント送信・受信マトリクス分析

## 問題の発見

`ISSUE_REPORTED`という名前の使用から、このシステムにおける「Issue」の概念が誤解されている可能性が高い。

### Issueの正しい定義（shared-types/index.ts）
```typescript
/**
 * Issue: ユーザーに代わってAIが追跡・管理すべき事項
 * システムの課題ではなく、ユーザーが忘れたくない・追跡したい事項全般を表す
 */
```

**Issue** = ユーザーが追跡したい事項（タスク、懸念、アイデア等）
**NOT** = バグレポート、問題報告

`ISSUE_REPORTED`という命名は、Issueを「問題報告」と誤解している証拠。

## Phase 4設計文書との比較

### event-workflow-catalog.md（設計）との差異

設計文書（docs/phases/phase4/workflows/event-workflow-catalog.md）には詳細なイベント・ワークフローマトリクスが存在する。

#### 設計で定義されているが実装されていないイベント
- SCHEDULED_TIME_REACHED → SCHEDULE_TRIGGEREDとして部分実装
- USER_RESPONSE_RECEIVED → 未実装
- ISSUE_CLOSED → ISSUE_STATUS_CHANGEDで代替可能
- CONTRADICTION_DETECTED → 未実装
- PERFORMANCE_DEGRADED → 未実装
- DEADLINE_APPROACHING → 未実装
- ACTION_REQUESTED → 未実装
- ISSUES_CLUSTER_DETECTED → B-1で発火されているが未定義

#### 設計にないが実装で使われているイベント
- **ISSUE_REPORTED** → 設計には存在しない（Issueの誤解）
- SEARCH_REQUESTED → 設計には存在しない
- SCHEDULE_REQUESTED → 設計には存在しない
- KNOWLEDGE_APPLIED → 設計には存在しない

## 現在のイベント送受信マトリクス

### 既存イベント（shared-types定義済み）

| イベント | 発信ワークフロー | 受信ワークフロー |
|---------|---------------|---------------|
| USER_REQUEST_RECEIVED | API/外部 | A-1 (ProcessUserRequest) |
| DATA_ARRIVED | A-0, A-1 | A-0 (IngestInput) |
| ISSUE_CREATED | A-1 | A-2 (AnalyzeIssueImpact) |
| ISSUE_UPDATED | A-1, A-2 | A-2 (AnalyzeIssueImpact) |
| ISSUE_STATUS_CHANGED | （未実装） | A-3 (ExtractKnowledge) |
| PATTERN_FOUND | （未実装） | A-3 (ExtractKnowledge) |
| KNOWLEDGE_EXTRACTABLE | A-2 | A-3 (ExtractKnowledge) |
| KNOWLEDGE_CREATED | A-3 | （リスナーなし） |
| HIGH_PRIORITY_ISSUE_DETECTED | A-2 | （リスナーなし） |
| HIGH_PRIORITY_FLOW_DETECTED | （未実装） | （リスナーなし） |
| SCHEDULE_TRIGGERED | Scheduler | （リスナーなし） |

### 新規イベント（Phase 4で発火されているが未定義）

| イベント | 発信元 | 受信先 | 問題点 |
|---------|-------|-------|--------|
| **ISSUE_REPORTED** | A-1 | なし | ❌ Issueの誤解。ISSUE_CREATEDで十分 |
| **SEARCH_REQUESTED** | A-1 | なし | ❌ 処理するワークフローなし |
| **SCHEDULE_REQUESTED** | A-1 | なし | ❌ 処理するワークフローなし |
| **KNOWLEDGE_APPLIED** | A-1 | なし | ⚠️ 学習に使える可能性あり |
| **UNCLUSTERED_ISSUES_EXCEEDED** | D-2 | なし | ⚠️ B-1をトリガーすべき |
| **ISSUE_STALLED** | D-2 | なし | ⚠️ 通知が必要 |
| **POND_CAPACITY_WARNING** | D-2 | なし | ⚠️ 警告が必要 |
| **ISSUES_CLUSTER_DETECTED** | B-1 | なし | ⚠️ Flow作成のトリガーになるべき |
| **FLOW_RELATIONS_CHANGED** | B-2 | なし | ✅ 記録用として妥当 |
| **PERSPECTIVE_TRIGGERED** | C-1 | なし | ⚠️ 重要な気づきの通知 |
| **ESCALATION_REQUIRED** | C-2 | なし | ⚠️ 緊急対応が必要 |
| **IDLE_TIME_DETECTED** | C-2 | なし | ⚠️ アイドル検出の通知 |

### SUGGESTED系イベント（問題の先送り）

以下はすべて「提案」を発火するだけで処理されない：

- FLOW_ARCHIVE_SUGGESTED
- PERSPECTIVE_UPDATE_REQUIRED
- FLOW_MERGE_SUGGESTED
- FLOW_SPLIT_SUGGESTED
- FLOW_CREATION_SUGGESTED
- FLOW_ISSUE_ADDITION_SUGGESTED
- FLOW_ISSUE_REMOVAL_SUGGESTED
- FLOW_SUGGESTION_READY
- ACTION_SUGGESTION_READY
- ISSUE_SPLIT_SUGGESTED

**これらはワークフロー内で直接実行すべき**

## 問題点のまとめ

### 1. リスナー不在のイベント
多くのイベントが発火されているが、それを処理するワークフローが存在しない。

### 2. Issueの概念の誤解
- `ISSUE_REPORTED`は「問題報告」ではなく「追跡事項の作成」
- 正しくは`ISSUE_CREATED`を使用すべき

### 3. 提案の先送り
- SUGGESTED系イベントは処理されない
- ワークフロー内で直接実行すべき

### 4. ワークフロー間の連携不足
- D-2が検出した問題をB-1が処理すべき
- B-1が検出したクラスターからFlowを作成すべき

## 設計文書マトリクスとの照合

### 設計で期待されているイベント送受信（event-workflow-catalog.md）

| ワークフロー | 設計で発行すべきイベント | 実装での発行 | 差異 |
|------------|------------------------|------------|------|
| A-1 (IngestInput) | DATA_ARRIVED, CONTRADICTION_DETECTED | DATA_ARRIVED | ⚠️ CONTRADICTION_DETECTED未実装 |
| A-2 (AnalyzeIssueImpact) | ISSUE_CREATED/UPDATED, KNOWLEDGE_EXTRACTABLE | 同じ | ✅ 一致 |
| B-1 (ClusterIssues) | FLOW_CREATION_SUGGESTED, ISSUES_CLUSTER_DETECTED | ISSUES_CLUSTER_DETECTED | ⚠️ FLOW_CREATION_SUGGESTEDなし |
| B-2 (UpdateFlowRelations) | FLOW_RELATIONS_CHANGED, PERSPECTIVE_UPDATE_REQUIRED | 多数のSUGGESTED系 | ❌ 設計と大きく乖離 |
| B-3 (UpdateFlowPriorities) | HIGH_PRIORITY_FLOW_DETECTED, FLOW_PRIORITY_CHANGED | 未実装 | ❌ ワークフロー自体が未実装 |
| B-4 (SalvageFromPond) | PATTERN_FOUND, KNOWLEDGE_CREATED | 未実装 | ❌ ワークフロー自体が未実装 |
| B-5 (InferBehaviorPatterns) | （設計なし） | 未実装 | - |
| C-1 (SuggestNextFlow) | PERSPECTIVE_TRIGGERED | FLOW_SUGGESTION_READY, PERSPECTIVE_TRIGGERED | ⚠️ 余分なイベント |
| C-2 (SuggestNextAction) | ISSUE_SPLIT_SUGGESTED | ACTION_SUGGESTION_READY等 | ❌ 設計と異なる |
| D-2 (CollectSystemStats) | UNCLUSTERED_ISSUES_EXCEEDED, POND_CAPACITY_WARNING, ISSUE_STALLED | 同じ | ✅ 一致 |

### 設計で期待されているイベント受信

| イベント | 設計での受信ワークフロー | 実装での受信 | 差異 |
|---------|----------------------|------------|------|
| DATA_ARRIVED | A-1 → A-2 | A-0 (IngestInput) | ⚠️ チェーン構造が異なる |
| ISSUE_CREATED | B-1, B-2 | A-2 | ❌ B系が受信していない |
| ISSUE_STALLED | C-2 | なし | ❌ 受信ワークフローなし |
| FLOW_COMPLETED | C-1 | なし | ❌ イベント自体が未定義 |
| PATTERN_FOUND | B-5, A-3 | A-3 | ⚠️ B-5未実装 |
| HIGH_PRIORITY_FLOW_DETECTED | C-1 | なし | ❌ 受信ワークフローなし |
| UNCLUSTERED_ISSUES_EXCEEDED | B-1 | なし | ❌ B-1がトリガーされない |

## 改善提案

### 1. 即座に必要な修正

#### A-1 (ProcessUserRequest)
- `ISSUE_REPORTED`を削除、`ISSUE_CREATED`を使用
- `SEARCH_REQUESTED`を削除、直接検索を実行
- `SCHEDULE_REQUESTED`を削除、直接スケジュールを作成

#### B-2 (UpdateFlowRelations)
- SUGGESTED系イベントを削除
- 直接storage.updateFlowで実行
- 変更完了後に`FLOW_RELATIONS_CHANGED`を発火

#### C-1, C-2 (Suggest系)
- 提案を直接Issueのupdatesに追加
- ISSUE_UPDATEDイベントで通知

### 2. ワークフロートリガーの追加

```typescript
// B-1 (ClusterIssues)
triggers: {
  eventTypes: ['UNCLUSTERED_ISSUES_EXCEEDED', 'SCHEDULE_TRIGGERED']
}

// 新規ワークフロー: HandleStalled
triggers: {
  eventTypes: ['ISSUE_STALLED']
}

// 新規ワークフロー: CreateFlowFromCluster
triggers: {
  eventTypes: ['ISSUES_CLUSTER_DETECTED']
}
```

### 3. 必要最小限の新規イベント

実際に必要なものだけに絞る：

1. **システム監視**
   - UNCLUSTERED_ISSUES_EXCEEDED
   - ISSUE_STALLED
   - POND_CAPACITY_WARNING

2. **Flow管理（完了通知）**
   - FLOW_RELATIONS_CHANGED
   - FLOW_CREATED
   - FLOW_ARCHIVED

3. **クラスタリング**
   - ISSUES_CLUSTER_DETECTED

4. **エスカレーション**
   - ESCALATION_REQUIRED
   - PERSPECTIVE_TRIGGERED

5. **知識活用**
   - KNOWLEDGE_APPLIED

合計：11個（29個から62%削減）