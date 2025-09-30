# Phase 4 ギャップ分析（更新版）

## Phase 3の詳細調査結果

### 実装済み

#### A系ワークフロー（基本ワークフロー）
- ✅ A-0: IngestInput - DATA_ARRIVEDイベントを処理
- ✅ A-1: ProcessUserRequest - USER_REQUEST_RECEIVEDイベントを処理
- ✅ A-2: AnalyzeIssueImpact - Issue影響分析
- ✅ A-3: ExtractKnowledge - 知識抽出

### 設計済み（Phase 3で完了、未実装）

#### B系ワークフロー（横断的ワークフロー）
Phase 3のWORKFLOW_IMPLEMENTATION_PLAN.mdとarchive/WORKFLOW_DESIGN.mdで詳細設計済み：

- ✅ **B-1: ClusterIssues** - 関連Issue群の自動グルーピング
- ✅ **B-2: UpdateFlowRelations** - Flow間の関係性更新
- ✅ **B-3: UpdateFlowPriorities** - 優先度の動的調整
- ✅ **B-4: SalvageFromPond** - Pondからの価値ある情報の抽出
- ✅ **B-5: InferBehaviorPatterns** - 行動パターンの推論（archive/WORKFLOW_DESIGN.md）

#### C系ワークフロー（提案系ワークフロー）
Phase 3で詳細設計済み：

- ✅ **C-1: SuggestNextFlow** - 次に実行すべきFlowの提案
- ✅ **C-2: SuggestNextActionForIssue** - Issue解決のためのアクション提案

#### D系ワークフロー（自己調整ワークフロー）
COGNITIVE_DESIGN.mdで設計済み：

- ✅ **D-1: TuneSystemParameters** - システムパラメータの自律的調整
- ✅ **D-2: CollectSystemStats** - システム統計情報の収集

## 1. Phase 4で統合が必要な新概念

### 1.1 Flowの「観点」システム
Phase 3の設計にはなかった新しい概念：
- **観点による位置づけ**: FlowがIssueを「まとめる」のではなく「位置づける」
- **自然言語による関係性記述**: Issue間の関係を文章で定義
- **システム定義の観点**: 「今日のタスク」「今週の作業」「スタックしている作業」等
- **ユーザー定義の観点**: ユーザーがクエリや条件を定義

### 1.2 Inputの処理フロー
Phase 4で明確化された概念：
- **Input**: Reporter/ユーザーからの情報の最小単位
- **即座のIssue化**: DATA_ARRIVEDイベントで即座にIssue作成/更新を判定
- **Issueの分割・派生**: 既存Issueから新Issue作成可能

### 1.3 ユーザー問い合わせメカニズム
Phase 3で部分的に触れられているが詳細設計が必要：
- **矛盾検出時の処理**: CONTRADICTIONイベントとIssue作成
- **ユーザー応答の処理**: 応答待ちとタイムアウト処理
- **フォールバック処理**: 応答がない場合の自動処理

## 2. Phase 4で必要なイベント追加

Phase 3の設計に存在しない新規イベント：

### 2.1 Flow関連イベント（新規）
```typescript
// Flow管理イベント
- FLOW_CREATED           // Flow作成
- FLOW_UPDATED          // Flow更新
- FLOW_STATUS_CHANGED   // Flowステータス変更
- FLOW_PRIORITY_CHANGED // Flow優先度変更
- FLOW_COMPLETED        // Flow完了
- FLOW_ARCHIVED         // Flowアーカイブ

// Flow観点イベント（Phase 4の新概念）
- PERSPECTIVE_APPLIED   // 観点適用
- PERSPECTIVE_UPDATED   // 観点更新
- PERSPECTIVE_TRIGGERED // 観点の発動

// Flow関係性イベント
- FLOW_RELATIONS_CHANGED    // Flow間の関係変更
- ISSUE_ADDED_TO_FLOW      // IssueをFlowに追加
- ISSUE_REMOVED_FROM_FLOW  // IssueをFlowから削除
```

### 2.2 Issue分割・派生イベント（Phase 4で明確化）
```typescript
// Issue操作イベント
- ISSUE_SPLIT_REQUESTED  // Issue分割要求
- ISSUE_SPLIT_COMPLETED  // Issue分割完了
- ISSUE_MERGED          // Issue統合
```

### 2.3 ユーザー問い合わせイベント（Phase 3で部分設計済み、詳細化が必要）
```typescript
// ユーザーインタラクション
- USER_INQUIRY_REQUIRED     // ユーザー問い合わせ必要
- USER_RESPONSE_RECEIVED    // ユーザー応答受信
- CONTRADICTION_DETECTED    // 矛盾検出
- AMBIGUITY_DETECTED       // 曖昧性検出
```

### 2.4 Knowledge管理イベント（Phase 3で概念のみ、詳細化が必要）
```typescript
// Knowledge品質管理
- KNOWLEDGE_CORRUPTED      // Knowledge品質劣化
- KNOWLEDGE_UPDATED        // Knowledge更新
- KNOWLEDGE_ARCHIVED       // Knowledgeアーカイブ
```

## 3. Phase 4の実装戦略

### 3.1 既存設計の活用
Phase 3で既に詳細設計が完了しているものを最大限活用：

#### 活用できる設計資産
1. **B系・C系・D系ワークフローの詳細仕様**
   - トリガーイベント定義済み
   - 優先度設定済み（-100〜100）
   - 処理内容の概要設計済み

2. **ModulerPrompt統合パターン**
   - A_SERIES_WORKFLOW_IMPROVEMENT.mdの方針を継承
   - JSONSchemaによる構造化出力

3. **イベント駆動アーキテクチャ原則**
   - WORKFLOW_EVENT_DRIVEN_DESIGN.mdの設計思想

### 3.2 Phase 4で新規追加する要素

1. **Flowの観点システム実装**
   - システム定義の観点（日次タスク、週次作業等）
   - ユーザー定義の観点（クエリベース）
   - 自然言語による関係性記述

2. **Input処理フローの実装**
   - DATA_ARRIVEDイベントハンドリング
   - 即座のIssue作成/更新判定
   - Issue分割・派生メカニズム

3. **ユーザー問い合わせシステム**
   - 矛盾検出とIssue作成
   - 応答待機とタイムアウト処理

## 4. 実装優先順位（改訂版）

### Phase 4-1: 基盤整備（1週間）
1. **Flow関連イベントの定義追加**
2. **Flowの観点システム実装**
3. **Input処理フローの改善**

### Phase 4-2: B系ワークフロー実装（2週間）
1. **B-1: ClusterIssues** - Flow観点と統合
2. **B-2: UpdateFlowRelations** - 自然言語記述対応
3. **B-3: UpdateFlowPriorities** - 動的優先度調整

### Phase 4-3: C系・サルベージ実装（1週間）
1. **B-4: SalvageFromPond** - レシピ定義と実装
2. **C-1: SuggestNextFlow** - 観点ベースの提案
3. **C-2: SuggestNextActionForIssue** - アクション提案

### Phase 4-4: 自己調整機能（オプション）
1. **D-1: TuneSystemParameters**
2. **D-2: CollectSystemStats**

## 5. 次のアクション

1. **設計ドキュメントの統合**
   - Phase 3の設計をPhase 4仕様に統合
   - Flow観点システムの詳細設計書作成

2. **実装計画の具体化**
   - 各ワークフローのプロンプト設計
   - テストケース作成
   - 統合テストシナリオ

3. **プロトタイプ実装**
   - Flow観点システムの最小実装
   - B-1ワークフローから着手