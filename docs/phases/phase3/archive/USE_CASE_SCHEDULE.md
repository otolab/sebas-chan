# スケジュール管理ユースケース

## 概要

このドキュメントでは、sebas-chanのワークフローがスケジュール管理タスクをどのように処理するかを具体的に検証します。これにより、設計したワークフローが実用的な要件を満たすことを確認します。

## ユースケースシナリオ

### シナリオ1: 会議の予定追加と準備

#### 状況

ユーザー: 「明日の14時から山田さんとプロジェクトレビューの会議があります。資料の準備が必要です。」

#### ワークフローの動作

##### 1. A-0: PROCESS_USER_REQUEST（初期処理）

```typescript
// Input
{
  request: "明日の14時から山田さんとプロジェクトレビューの会議があります。資料の準備が必要です。",
  context: { recentIssues: [...] }
}

// Moduler Prompt分析結果
{
  intent: 'create_task',
  entities: {
    date: '明日',
    time: '14:00',
    person: '山田さん',
    task: 'プロジェクトレビュー会議'
  },
  urgency: 'high',  // 明日なので高優先度
  needsFollowUp: true  // 資料準備が必要
}

// 作成されるIssue
{
  id: 'issue-001',
  title: 'プロジェクトレビュー会議（山田さん）',
  description: '日時: 明日14:00\n参加者: 山田さん\n準備: 資料作成が必要',
  status: 'open',
  priority: 'high',
  tags: ['meeting', 'preparation_required']
}
```

##### 2. A-2: ANALYZE_ISSUE_IMPACT（影響分析）

```typescript
// 関連Issue検索結果
- 過去の山田さんとの会議記録
- プロジェクト関連のIssue
- 資料作成タスクのテンプレート

// 分析結果
{
  impactLevel: 'high',
  affectedAreas: ['schedule', 'project_management'],
  relatedIssues: [
    {
      issueId: 'issue-prev-001',
      relation: 'relates_to',
      confidence: 0.8
    }
  ],
  suggestedFlow: {
    title: '会議準備フロー',
    priority: 75
  }
}

// 作成されるFlow
{
  id: 'flow-001',
  title: '会議準備フロー',
  issues: ['issue-001', 'issue-002-prep'],
  priority: 75,
  status: 'active'
}
```

##### 3. C-2: SUGGEST_NEXT_ACTION（アクション提案）

```typescript
// 提案されるアクション
{
  actions: [
    {
      type: 'immediate',
      description: 'カレンダーに予定を登録',
      steps: ['カレンダーアプリを開く', '14:00-15:00でブロック'],
      estimatedEffort: 2,
      tools: ['calendar'],
    },
    {
      type: 'planned',
      description: '資料作成',
      steps: ['前回の会議資料を確認', '進捗データを更新', 'スライド作成'],
      estimatedEffort: 60,
      prerequisites: ['前回の議事録'],
      relatedKnowledge: ['project-review-template'],
    },
  ];
}
```

### シナリオ2: 定期的な予定の処理

#### 状況

毎週火曜日の定例会議があり、複数の関連タスクが発生

#### ワークフローの連携

##### B-1: CLUSTER_ISSUES（Issue群のクラスタリング）

```typescript
// 定期実行により関連Issueを発見
{
  clusters: [
    {
      id: 'cluster-weekly',
      theme: '火曜定例会議関連',
      issueIds: ['issue-101', 'issue-102', 'issue-103'],
      commonPatterns: ['毎週火曜', '定例', '報告'],
      suggestedAction: 'テンプレート化して自動化',
      mergePotential: true
    }
  ],
  insights: ['毎週同じ準備作業が発生している']
}
```

##### A-3: EXTRACT_KNOWLEDGE（Knowledge抽出）

```typescript
// 定例会議パターンから知識を抽出
{
  knowledgeItems: [
    {
      type: 'procedure',
      content: '火曜定例会議の標準準備手順',
      confidence: 0.9,
      tags: ['meeting', 'recurring', 'tuesday'],
      applicableContexts: ['weekly_meeting_prep'],
    },
    {
      type: 'insight',
      content: '月曜日の夕方に準備リマインダーが有効',
      confidence: 0.85,
      tags: ['timing', 'reminder'],
    },
  ];
}
```

### シナリオ3: 競合する予定の調整

#### 状況

複数の予定が重なり、優先順位付けが必要

#### ワークフローの動作

##### B-3: UPDATE_FLOW_PRIORITIES（優先度更新）

```typescript
// 競合検出
{
  priorityUpdates: [
    {
      flowId: 'flow-201',
      currentPriority: 50,
      suggestedPriority: 80,
      factors: [
        { factor: '締切が本日', impact: +20 },
        { factor: '他の予定と競合', impact: +10 },
      ],
    },
    {
      flowId: 'flow-202',
      currentPriority: 60,
      suggestedPriority: 30,
      factors: [{ factor: '延期可能', impact: -30 }],
    },
  ];
}
```

##### C-1: SUGGEST_NEXT_FLOW（次のFlow提案）

```typescript
// 時間帯と優先度を考慮した提案
{
  suggestions: [
    {
      flowId: 'flow-201',
      reason: '締切が迫っており、他より優先度が高い',
      estimatedDuration: 30,
      confidence: 0.9,
      alternativeIf: {
        condition: '会議が延長した場合',
        alternativeFlowId: 'flow-203',
      },
    },
  ];
}
```

### シナリオ4: 過去の予定からの学習

#### 状況

完了した予定から、将来の改善点を抽出

#### ワークフローの動作

##### B-4: SALVAGE_FROM_POND（Pondからのサルベージ）

```typescript
// 過去の会議メモから価値ある情報を発見
{
  evaluations: [
    {
      pondEntryId: 'pond-301',
      currentValue: 'high',
      reason: '次回の会議で参照が必要な決定事項を含む',
      suggestedAction: 'create_issue',
      relatedToRecent: ['issue-current-001']
    }
  ]
}

// 生成されるIssue
{
  title: '前回の決定事項の確認',
  description: '3週間前の会議で決定した予算配分について再確認が必要'
}
```

## ワークフロー連携の検証

### 正常系フロー

1. **Input取り込み** → **Issue作成** → **Flow編成** → **実行提案**
   - A-1 → A-0 → A-2 → C-1/C-2
   - すべて期待通りに連携

2. **定期的な最適化**
   - B-1（クラスタリング） → A-3（知識抽出）
   - B-3（優先度更新） → C-1（Flow提案）
   - バックグラウンドで継続的に改善

3. **緊急対応**
   - A-0（高優先度判定） → A-2（即座の影響分析）
   - 優先度システムにより適切に処理

### エッジケース

#### ケース1: 曖昧な入力

```
入力: 「来週どこかで山田さんと話す」
```

**対応:**

- A-0が`needsFollowUp: true`を設定
- C-2が「詳細確認が必要」とアクション提案
- ユーザーに確認を促す

#### ケース2: 大量の予定

```
状況: 1日に10件以上の予定
```

**対応:**

- B-1がクラスタリングで整理
- B-3が動的に優先度調整
- C-1が実行可能な順序を提案

#### ケース3: 予定の変更

```
状況: 会議が急遽キャンセル
```

**対応:**

- Issue更新イベント → A-2が影響分析
- B-2が関連Flowを更新
- C-1が代替タスクを提案

## システム要件の確認

### 必須要件 ✅

1. **情報の取り込みと永続化**
   - A-1がすべてのInputをPondに保存
   - 後から検索・参照可能

2. **優先度管理**
   - -100〜100の優先度システム
   - B-3による動的調整

3. **知識の蓄積と活用**
   - A-3による知識抽出
   - B-4による価値の再発見

4. **ユーザー支援**
   - C-1/C-2による具体的な提案
   - 実行可能なアクションへの変換

### 追加で必要な要件

1. **時間認識の強化**
   - 自然言語の日時表現の解釈（「明日」「来週」等）
   - タイムゾーン対応

2. **外部連携**
   - カレンダーシステムとの同期
   - リマインダー機能

3. **競合検出**
   - 時間的な重複の検出
   - リソース（人、場所）の競合チェック

## 結論

設計したワークフローは、スケジュール管理の基本的な要求を満たしています：

✅ **強み**

- 自然言語からの予定抽出
- 優先度の動的管理
- 過去の経験からの学習
- 具体的なアクション提案

⚠️ **改善の余地**

- 時間表現の解釈精度
- 外部カレンダーとの連携
- リアルタイムな変更通知

全体として、ワークフローの設計は妥当であり、実装フェーズに進む準備ができています。
