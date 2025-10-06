# Phase 4 新規イベント提案（改訂版）

## 概要

Phase 4のワークフロー実装で必要になった新規イベントの提案書。
これらのイベントは現在shared-typesに定義されておらず、ワークフロー内でas SystemEventとしてキャストして使用されている。

## 重要な設計原則

**ワークフロー内で完結すべき処理は、イベントとして外部に投げるのではなく、その場で実行する。**
- 「SUGGESTED」系イベントの多くは問題の先送りであり、処理するワークフローが存在しない
- ユーザー承認が必要な場合は、Issueとして作成する
- 他のワークフローをトリガーする必要がある場合のみ、イベントを発火する

## 新規イベント一覧

### システム監視イベント

```typescript
// D-2 (CollectSystemStats) から発火
export interface UnclusteredIssuesExceededEvent {
  type: 'UNCLUSTERED_ISSUES_EXCEEDED';
  payload: {
    count: number;
    threshold: number;
    issueIds: string[];
  };
}

export interface IssueStalledEvent {
  type: 'ISSUE_STALLED';
  payload: {
    issueId: string;
    stalledDays: number;
    lastUpdate: Date;
  };
}

export interface PondCapacityWarningEvent {
  type: 'POND_CAPACITY_WARNING';
  payload: {
    usage: number;
    ratio: number;
    threshold: number;
  };
}

export interface MaintenanceRequiredEvent {  // SYSTEM_MAINTENANCE_DUE から改名
  type: 'MAINTENANCE_REQUIRED';
  payload: {
    reason: string;
    requiredActions: string[];
  };
}
```

### Flow管理イベント

```typescript
// 実際に完了した変更のみをイベントとして発火
export interface FlowRelationsChangedEvent {
  type: 'FLOW_RELATIONS_CHANGED';
  payload: {
    flowId: string;
    changes: {
      added: string[];      // 追加されたIssue ID
      removed: string[];    // 削除されたIssue ID
      updated: string[];    // 更新されたFlow ID
    };
  };
}

export interface FlowArchivedEvent {
  type: 'FLOW_ARCHIVED';
  payload: {
    flowId: string;
    archivedAt: Date;
    reason: string;
  };
}

export interface FlowCreatedEvent {
  type: 'FLOW_CREATED';
  payload: {
    flowId: string;
    perspective: string;
    issueIds: string[];
    createdBy: 'system' | 'user';
  };
}
```

**削除理由**：
- `FLOW_ARCHIVE_SUGGESTED` → ワークフロー内で直接アーカイブするか、承認が必要ならIssueを作成
- `PERSPECTIVE_UPDATE_REQUIRED` → ワークフロー内で直接更新
- `FLOW_MERGE_SUGGESTED` → ワークフロー内で直接マージするか、複雑な場合はIssueを作成
- `FLOW_SPLIT_SUGGESTED` → ワークフロー内で直接分割するか、複雑な場合はIssueを作成
- `FLOW_CREATION_SUGGESTED` → ワークフロー内で直接作成
- `FLOW_ISSUE_ADDITION_SUGGESTED` → ワークフロー内で直接追加
- `FLOW_ISSUE_REMOVAL_SUGGESTED` → ワークフロー内で直接削除

### 提案・推奨イベント

```typescript
// 本当に他のワークフローに通知が必要なもののみ
export interface PerspectiveTriggeredEvent {
  type: 'PERSPECTIVE_TRIGGERED';
  payload: {
    flowId: string;
    perspective: string;
    triggerReason: string;
  };
}

export interface EscalationRequiredEvent {
  type: 'ESCALATION_REQUIRED';
  payload: {
    issueId?: string;
    reason: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface IdleTimeDetectedEvent {
  type: 'IDLE_TIME_DETECTED';
  payload: {
    duration: number;  // ミリ秒
    lastActivity: Date;
  };
}
```

**削除理由**：
- `FLOW_SUGGESTED` → C-1内で直接Issueを更新するか、通知が必要ならIssue更新イベントを使用
- `ACTION_SUGGESTED` → C-2内で直接Issueを更新し、ISSUE_UPDATEDイベントを発火
- `ISSUE_SPLIT_SUGGESTED` → ワークフロー内で直接分割するか、複雑な場合はIssueを作成

### クラスタリングイベント

```typescript
// B-1 (ClusterIssues) から発火
export interface IssuesClusterDetectedEvent {
  type: 'ISSUES_CLUSTER_DETECTED';
  payload: {
    clusterId: string;
    issueIds: string[];
    similarity: number;
    suggestedPerspective?: string;
  };
}
```

### リクエスト処理イベント

```typescript
// 他のワークフローとの連携が必要なもののみ
export interface KnowledgeAppliedEvent {
  type: 'KNOWLEDGE_APPLIED';
  payload: {
    knowledgeId: string;
    targetId: string;  // Issue IDなど
    targetType: 'issue' | 'flow' | 'request';
  };
}
```

**削除理由**：
- `SEARCH_REQUESTED` → A-1内で直接検索を実行し、結果をIssueやレスポンスに含める
- `SCHEDULE_REQUESTED` → A-1内で直接スケジュールを作成（schedulerインターフェース使用）
- `ISSUE_REPORTED` → 既存の`ISSUE_CREATED`で十分

## 最終的な新規イベント一覧（絞り込み後）

### 必要なイベントのみに絞り込んだ結果

```typescript
export type EventType =
  // === 既存イベント ===
  // 外部イベント
  | 'USER_REQUEST_RECEIVED'
  | 'DATA_ARRIVED'

  // データイベント
  | 'ISSUE_CREATED'
  | 'ISSUE_UPDATED'
  | 'ISSUE_STATUS_CHANGED'
  | 'KNOWLEDGE_CREATED'

  // 分析イベント
  | 'PATTERN_FOUND'
  | 'KNOWLEDGE_EXTRACTABLE'
  | 'HIGH_PRIORITY_ISSUE_DETECTED'
  | 'HIGH_PRIORITY_FLOW_DETECTED'

  // システムイベント
  | 'SCHEDULE_TRIGGERED'

  // === 新規イベント（必要最小限） ===

  // システム監視イベント
  | 'UNCLUSTERED_ISSUES_EXCEEDED'  // B-1をトリガー
  | 'ISSUE_STALLED'                 // 停滞Issueの通知
  | 'POND_CAPACITY_WARNING'         // 容量警告の通知
  | 'MAINTENANCE_REQUIRED'          // メンテナンス要求

  // Flow管理イベント（完了通知のみ）
  | 'FLOW_RELATIONS_CHANGED'        // Flow関係変更の完了通知
  | 'FLOW_ARCHIVED'                 // Flowアーカイブ完了通知
  | 'FLOW_CREATED'                  // Flow作成完了通知

  // クラスタリングイベント
  | 'ISSUES_CLUSTER_DETECTED'       // クラスター検出（Flow作成トリガー）

  // エスカレーションイベント
  | 'ESCALATION_REQUIRED'           // 緊急対応が必要
  | 'PERSPECTIVE_TRIGGERED'         // 観点トリガー（重要な気づき）

  // 知識活用イベント
  | 'KNOWLEDGE_APPLIED';            // 知識が適用された（学習のため）
```

## ワークフロー実装の改善点

### B-2 (UpdateFlowRelations) の改善案
現在の問題：
- 提案イベントを発火するだけで、実際の処理を行っていない

改善案：
```typescript
// 変更前：提案イベントを発火
emitter.emit({ type: 'FLOW_ISSUE_REMOVAL_SUGGESTED', ... });

// 変更後：直接実行
await storage.updateFlow(flowId, {
  issueIds: flow.issueIds.filter(id => id !== issueId)
});
emitter.emit({
  type: 'FLOW_RELATIONS_CHANGED',
  payload: { flowId, changes: { removed: [issueId] } }
});
```

### C-1, C-2 の改善案
現在の問題：
- 提案を作成するが、それをどう活用するか不明確

改善案：
- 提案内容を直接Issueのupdatesに追加
- 重要な提案の場合は新規Issueを作成
- ISSUE_UPDATEDイベントで他のワークフローに通知

## 実装優先度（改訂版）

### 即座に必要（Phase 4.1）
1. **システム監視イベント**
   - `UNCLUSTERED_ISSUES_EXCEEDED` - B-1のトリガーとして必要
   - `ISSUE_STALLED` - 停滞検出の通知

2. **Flow完了通知イベント**
   - `FLOW_RELATIONS_CHANGED` - 変更の追跡
   - `ISSUES_CLUSTER_DETECTED` - Flow作成のトリガー

### 次フェーズで検討（Phase 4.2）
1. **エスカレーション系**
   - `ESCALATION_REQUIRED` - 緊急度の高い状況の通知
   - `PERSPECTIVE_TRIGGERED` - 重要な観点の発見

2. **システム保守系**
   - `POND_CAPACITY_WARNING` - 容量管理
   - `MAINTENANCE_REQUIRED` - メンテナンス通知

## 次のステップ

1. **ワークフロー実装の修正**
   - B-2: 提案イベントを削除し、直接実行に変更
   - C-1, C-2: 提案をIssue更新として直接適用

2. **必要最小限のイベント追加**
   - shared-types/events.tsに11個の新規イベントを追加
   - 29個から11個に削減（62%削減）

3. **ドキュメント更新**
   - EVENT_CATALOG.mdに新規イベントを追記
   - 各ワークフローのトリガー定義を更新