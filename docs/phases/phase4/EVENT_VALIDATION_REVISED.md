# Phase 4 新規イベント妥当性評価（改訂版）

## ユーザーフィードバックの要点
1. **UNCLUSTERED_ISSUES_EXCEEDED**: 「unclusteredなIssue」の定義が不明確。削除検討
2. **ISSUE_STALLED**: 必要。重要な機能
3. **POND_CAPACITY_WARNING**: Pondは全部残す方針なので不要
4. **FLOW_CREATION_SUGGESTED → ISSUES_CLUSTER_DETECTED**: 名前を変更して統合
5. **PERSPECTIVE_TRIGGERED**: ユーザーリクエストからも作成可能にすべき
6. **FLOW_STATUS_CHANGED**: 追加すべき（Issueとの対称性）

## 改訂後の評価結果

### ✅ 採用するイベント（3個）

#### 1. ISSUE_STALLED
- **理由**: 停滞検出は重要な機能
- **受信者**: C-2 (SuggestNextActionForIssue)
- **発火元**: D-2 (CollectSystemStats)

#### 2. FLOW_CREATED
- **理由**: 対称性の観点から必要
- **受信者**: 将来的な拡張を想定
- **発火元**: Flow管理システム

#### 3. PERSPECTIVE_TRIGGERED
- **理由**: 重要な観点の発見を通知
- **受信者**: Flow作成ワークフロー（新規追加必要）
- **発火元**: C-1, ユーザーリクエスト処理

### 🔄 名前変更して採用（1個）

#### 4. ISSUES_CLUSTER_DETECTED（旧: FLOW_CREATION_SUGGESTED）
- **理由**: クラスター検出の方が意味が明確
- **受信者**: Flow作成ワークフロー（新規追加必要）
- **発火元**: B-1 (ClusterIssues)
- **注**: FLOW_CREATION_SUGGESTEDを廃止し、この名前に統一

### ➕ 新規追加すべきイベント（1個）

#### 5. FLOW_STATUS_CHANGED
- **理由**: Issueとの対称性、状態管理の明確化
- **ペイロード**:
  ```typescript
  {
    type: 'FLOW_STATUS_CHANGED';
    payload: {
      flowId: string;
      oldStatus: FlowStatus;
      newStatus: FlowStatus;  // active, completed, archived等
      reason?: string;
    };
  }
  ```

### ❌ 削除するイベント（7個）

1. **UNCLUSTERED_ISSUES_EXCEEDED**
   - 理由: 「unclustered Issue」の定義が不明確
   - 代替: ISSUE_STALLEDで十分

2. **POND_CAPACITY_WARNING**
   - 理由: Pondは全データ保持方針
   - 代替: 不要

3. **MAINTENANCE_REQUIRED**
   - 理由: 既存と重複
   - 代替: SYSTEM_MAINTENANCE_DUE

4. **FLOW_RELATIONS_CHANGED**
   - 理由: 粒度が細かすぎる
   - 代替: FLOW_UPDATED

5. **FLOW_ARCHIVED**
   - 理由: 状態変更の一種
   - 代替: FLOW_STATUS_CHANGED

6. **ESCALATION_REQUIRED**
   - 理由: 定義が曖昧
   - 代替: HIGH_PRIORITY_*_DETECTED

7. **KNOWLEDGE_APPLIED**
   - 理由: ログで十分
   - 代替: ログ記録

## 重要な設計変更

### Flow作成の自動化
ISSUES_CLUSTER_DETECTEDとPERSPECTIVE_TRIGGEREDを受信して自動的にFlowを作成するワークフローが必要：

```typescript
// 新規ワークフロー案
interface CreateFlowWorkflow {
  triggers: [
    'ISSUES_CLUSTER_DETECTED',  // クラスターからFlow作成
    'PERSPECTIVE_TRIGGERED'      // 観点からFlow作成
  ];
  actions: [
    'Flow作成',
    'FLOW_CREATEDイベント発火'
  ];
}
```

### PERSPECTIVE_TRIGGEREDの拡張
- C-1からの発火に加え、ユーザーリクエスト処理（A-0/A-1）からも発火可能に
- ユーザーが明示的に観点を指定した場合のFlow作成をサポート

## 最終的なイベント体系（Phase 4完了時）

### 既存イベント（変更なし）
- USER_REQUEST_RECEIVED
- DATA_ARRIVED
- ISSUE_CREATED
- ISSUE_UPDATED
- ISSUE_STATUS_CHANGED
- KNOWLEDGE_CREATED
- PATTERN_FOUND
- KNOWLEDGE_EXTRACTABLE
- HIGH_PRIORITY_ISSUE_DETECTED
- HIGH_PRIORITY_FLOW_DETECTED
- SCHEDULE_TRIGGERED
- SYSTEM_MAINTENANCE_DUE

### Phase 4で追加/変更されるイベント
- ISSUE_STALLED（既存定義を使用）
- FLOW_CREATED（既存定義を使用）
- FLOW_STATUS_CHANGED（新規追加）
- FLOW_UPDATED（既存、拡張使用）
- ISSUES_CLUSTER_DETECTED（名前変更）
- PERSPECTIVE_TRIGGERED（既存、拡張使用）

### 削除されるイベント
- FLOW_CREATION_SUGGESTED（ISSUES_CLUSTER_DETECTEDに変更）
- その他のSUGGESTED系イベント全般

## 実装への影響

### 1. B-1 (ClusterIssues)
- FLOW_CREATION_SUGGESTED → ISSUES_CLUSTER_DETECTEDに変更
- イベント名の変更のみ、ロジックは変更不要

### 2. C-1 (SuggestNextFlow)
- PERSPECTIVE_TRIGGEREDの発火を維持
- 提案内容はIssue更新として直接反映

### 3. D-2 (CollectSystemStats)
- UNCLUSTERED_ISSUES_EXCEEDEDの削除
- POND_CAPACITY_WARNINGの削除
- ISSUE_STALLEDの発火は維持

### 4. 新規ワークフロー追加の必要性
- Flow自動作成ワークフロー（ISSUES_CLUSTER_DETECTED, PERSPECTIVE_TRIGGERED受信）
- 実装優先度: 高（Phase 4.1で実装）

## まとめ

ユーザーフィードバックを反映した結果：
- **採用**: 3個（ISSUE_STALLED, FLOW_CREATED, PERSPECTIVE_TRIGGERED）
- **名前変更**: 1個（ISSUES_CLUSTER_DETECTED）
- **新規追加**: 1個（FLOW_STATUS_CHANGED）
- **削除**: 7個

これにより、イベント体系がよりシンプルかつ明確になり、「問題の先送り」を避ける設計が実現される。