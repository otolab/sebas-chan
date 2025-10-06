# Phase 4 新規イベント妥当性評価

## 評価基準
- ○: 必要（明確な受信者とユースケースあり）
- △: 検討必要（代替案があるか、設計見直しが必要）
- ×: 不要（既存イベントで代替可能、または問題の先送り）

## 1. UNCLUSTERED_ISSUES_EXCEEDED
**評価: △**

### 現状分析
- event-workflow-catalog.mdに既に定義済み
- B-1 (ClusterIssues)のトリガーとして使用
- D-2から発火される

### 問題点
- 名前が冗長（EXCEEDEDは暗黙的）
- 閾値超過の通知だけでは受動的

### 改善案
- 既存定義をそのまま使用
- D-2内で閾値監視を実装

>>> これを使う必要があるかちょっとわからないですね。unclusteredなIssueという概念は明確に定義されていない気がします。flowに含まれていないという意味？
>>> issue_stalledが正しく実行される方が重要であるように思えます。


## 2. ISSUE_STALLED
**評価: ○**

### 現状分析
- event-workflow-catalog.mdに既に定義済み
- C-2 (SuggestNextActionForIssue)のトリガー
- D-2から発火される

### 妥当性
- 停滞検出は重要な機能
- 受信ワークフローが明確
- ユーザー価値が高い

### 結論
- **採用**: 既存定義をそのまま使用

>>> これはいいですね。必要です。

## 3. POND_CAPACITY_WARNING
**評価: ○**

### 現状分析
- event-workflow-catalog.mdに既に定義済み
- B-4 (SalvageFromPond)のトリガー
- D-2から発火

### 妥当性
- 容量管理は必要
- 自動的な価値抽出のトリガーとして有効

### 結論
- **採用**: 既存定義をそのまま使用

>>> 実はpondの内容を削除することがあるのは想定していなくて、基本全部残すつもりでいたので...。
>>> サルベージされたからと言ってpondが減るわけじゃないので、この作用は不要です。消しましょう。

## 4. MAINTENANCE_REQUIRED
**評価: ×**

### 現状分析
- SYSTEM_MAINTENANCE_DUEが既に存在
- 受信ワークフローが不明確

### 問題点
- 既存イベントと重複
- 「メンテナンス要求」の定義が曖昧

### 結論
- **不要**: SYSTEM_MAINTENANCE_DUEを使用

>>> 消しましょう。

## 5. FLOW_RELATIONS_CHANGED
**評価: △**

### 現状分析
- B-2から発火される想定
- 変更の記録として使用

### 問題点
- FLOW_UPDATEDと重複する可能性
- 変更の粒度が不明確

### 改善案
- FLOW_UPDATEDに統合
- ペイロードで変更内容を詳細化

### 結論
- **不要**: FLOW_UPDATEDで代替

>>> 代替で大丈夫です。

## 6. FLOW_ARCHIVED
**評価: ×**

### 現状分析
- アーカイブ完了の通知
- 受信ワークフローが不明

### 問題点
- FLOW_COMPLETEDまたはFLOW_STATUS_CHANGEDで代替可能
- アーカイブは状態変更の一種

### 結論
- **不要**: FLOW_STATUS_CHANGEDを新規追加して対応

>>> 不要で大丈夫

## 7. FLOW_CREATED
**評価: ○**

### 現状分析
- event-workflow-catalog.mdに既に定義済み
- B-2等のトリガーとして必要
- Flow作成は重要なイベント

### 妥当性
- 新規Flow作成の通知は必須
- 複数のワークフローが関心を持つ

### 結論
- **採用**: 既存定義をそのまま使用

>>> 明確にイベントを受けるワークフローが思いつかないですが、対称性も大事なので残します

## 8. ISSUES_CLUSTER_DETECTED
**評価: △**

### 現状分析
- B-1から発火
- Flow作成の提案として使用

### 問題点
- FLOW_CREATION_SUGGESTEDと重複
- 「検出」と「提案」の違いが不明確

### 改善案
- FLOW_CREATION_SUGGESTEDに統合
- B-1内でクラスター情報を含めて発火

### 結論
- **不要**: FLOW_CREATION_SUGGESTEDで代替

>>> どちらかというと、create suggestedよりcluster detectedのほうが名前と意味としては良いと思うのですよね。
>>> 統合はするとして、issue cluster detectedに変更しましょう。名称の変更になります。

## 9. ESCALATION_REQUIRED
**評価: △**

### 現状分析
- 緊急対応の通知
- 受信ワークフローが不明確

### 問題点
- HIGH_PRIORITY_ISSUE/FLOW_DETECTEDと重複
- 「エスカレーション」の定義が曖昧

### 改善案
- 優先度の高いIssue/Flowとして扱う
- 通知はシステム外部への出力として処理

### 結論
- **不要**: HIGH_PRIORITY系イベントで代替

>>> 消しましょう。

## 10. PERSPECTIVE_TRIGGERED
**評価: ○**

### 現状分析
- event-workflow-catalog.mdに既に定義済み
- C-1から発火
- 重要な観点の発見を通知

### 妥当性
- ユーザーへの気づきの提供
- Flow管理の重要な機能

### 結論
- **採用**: 既存定義をそのまま使用

>>> cluster detectedとparspective triggerdで自動でFlowが作られる感じですかね。
>>> C-1だけじゃなく、ユーザリクエストから作成されても良さそう

## 11. KNOWLEDGE_APPLIED
**評価: △**

### 現状分析
- 知識適用の追跡
- A-3での学習に使用想定

### 問題点
- 適用の記録はログで十分の可能性
- イベントとして発火する必要性が不明確

### 改善案
- WorkflowContextのログ機能で記録
- 統計情報として集計

### 結論
- **不要**: ログ記録で代替

>>> 消すので大丈夫そう。

---

## 最終評価結果

### 採用（既存定義をそのまま使用）: 4個
1. ISSUE_STALLED
2. POND_CAPACITY_WARNING
3. FLOW_CREATED
4. PERSPECTIVE_TRIGGERED

### 条件付き採用（名前変更・統合）: 1個
1. UNCLUSTERED_ISSUES_EXCEEDED（既存のまま使用）

### 不採用（既存イベントで代替）: 6個
1. MAINTENANCE_REQUIRED → SYSTEM_MAINTENANCE_DUE
2. FLOW_RELATIONS_CHANGED → FLOW_UPDATED
3. FLOW_ARCHIVED → FLOW_STATUS_CHANGED（新規追加検討）
4. ISSUES_CLUSTER_DETECTED → FLOW_CREATION_SUGGESTED
5. ESCALATION_REQUIRED → HIGH_PRIORITY_*_DETECTED
6. KNOWLEDGE_APPLIED → ログ記録

## 追加が必要な既存イベントの拡張

### FLOW_STATUS_CHANGED（新規追加提案）
```typescript
export interface FlowStatusChangedEvent {
  type: 'FLOW_STATUS_CHANGED';
  payload: {
    flowId: string;
    oldStatus: FlowStatus;
    newStatus: FlowStatus;  // archived, active, completed等
    reason?: string;
  };
}
```

>>> これは確かにあっても良さそうですね。issueとの対称性としても良さそうです。


## 結論

11個の新規イベントのうち：
- **5個は既存定義で対応可能**（採用）
- **6個は不要または既存イベントで代替可能**（不採用）
- **1個の新規イベント追加を提案**（FLOW_STATUS_CHANGED）

これにより、イベントの複雑性を大幅に削減し、システムの保守性を向上させる。