# D系ワークフロー詳細仕様（Phase 4 簡略版）

## 概要

D系ワークフローは「監視ワークフロー」として、システム内のデータ状態を監視し、他のワークフローをトリガーするイベントを発行します。

## Phase 4 実装範囲

**D-2 (CollectSystemStats) のみ**を実装。パフォーマンスチューニング（D-1）は将来課題。

## D-2: COLLECT_SYSTEM_STATS（統計収集・監視）

### 目的

定期的にシステム内のデータを監視し、閾値超過時にイベントを発行する。

### トリガー

```typescript
triggers: {
  events: [
    'SYSTEM_MAINTENANCE_DUE',    // 定期実行（1時間ごと等）
    'IDLE_TIME_DETECTED'         // アイドル時
  ],
  priority: 5  // 最低優先度（バックグラウンド）
}
```

### 主要な監視項目と発行イベント

| 監視項目 | 閾値 | 発行イベント | トリガーされるワークフロー |
|---------|------|------------|------------------------|
| 未整理Issue数 | 20件 | UNCLUSTERED_ISSUES_EXCEEDED | B-1 (ClusterIssues) |
| Issue停滞期間 | 3日 | ISSUE_STALLED | C-2 (SuggestNextAction) |
| Pond使用率 | 80% | POND_CAPACITY_WARNING | B-4 (SalvageFromPond) |

### 実装（シンプル版）

```typescript
async function collectSystemStats(context: WorkflowContext): Promise<WorkflowResult> {
  // 1. Issue統計の収集
  const issues = await context.storage.searchIssues('status:open');

  // 未整理Issue（Flowに属さない）をカウント
  const unclusteredIssues = issues.filter(issue =>
    !issue.flowIds || issue.flowIds.length === 0
  );

  // 停滞Issue（3日以上更新なし）を検出
  const stalledIssues = issues.filter(issue => {
    const daysSinceUpdate = Math.floor(
      (Date.now() - issue.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceUpdate > 3;
  });

  // 2. Pond容量チェック（簡易版）
  const pondEntries = await context.storage.searchPond({});
  const pondUsageRatio = pondEntries.data.length / 10000; // 仮の上限

  // 3. イベント発行
  const eventsEmitted = [];

  // 未整理Issue数が閾値超過
  if (unclusteredIssues.length >= 20) {
    const event = {
      type: 'UNCLUSTERED_ISSUES_EXCEEDED',
      payload: {
        count: unclusteredIssues.length,
        threshold: 20,
        issueIds: unclusteredIssues.map(i => i.id)
      }
    };
    context.emitEvent(event);
    eventsEmitted.push(event);
  }

  // 停滞Issue検出
  for (const issue of stalledIssues) {
    const event = {
      type: 'ISSUE_STALLED',
      payload: {
        issueId: issue.id,
        stalledDays: Math.floor(
          (Date.now() - issue.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
        ),
        lastUpdate: issue.updatedAt
      }
    };
    context.emitEvent(event);
    eventsEmitted.push(event);
  }

  // Pond容量警告
  if (pondUsageRatio > 0.8) {
    const event = {
      type: 'POND_CAPACITY_WARNING',
      payload: {
        usage: pondEntries.data.length,
        ratio: pondUsageRatio
      }
    };
    context.emitEvent(event);
    eventsEmitted.push(event);
  }

  // 4. 統計をRecorderに記録
  context.recorder.record('SYSTEM_STATS_COLLECTED', {
    timestamp: new Date(),
    stats: {
      totalIssues: issues.length,
      unclusteredCount: unclusteredIssues.length,
      stalledCount: stalledIssues.length,
      pondUsage: pondUsageRatio
    },
    eventsEmitted: eventsEmitted.length
  });

  return {
    success: true,
    logs: [{
      level: 'info',
      message: `統計収集完了: ${eventsEmitted.length}個のイベント発行`,
      timestamp: new Date()
    }]
  };
}
```

### 閾値の管理

```typescript
// 閾値はKnowledgeまたは定数として管理
const THRESHOLDS = {
  UNCLUSTERED_ISSUES: 20,    // 未整理Issue数
  STALLED_DAYS: 3,           // 停滞日数
  POND_CAPACITY: 0.8         // Pond容量比率
};

// 将来的にはKnowledgeから動的に取得
async function getThresholds(context: WorkflowContext) {
  const knowledge = await context.storage.searchKnowledge('type:system_rule');
  const thresholdKnowledge = knowledge.find(k =>
    k.content.includes('threshold')
  );

  if (thresholdKnowledge) {
    return JSON.parse(thresholdKnowledge.content);
  }

  return THRESHOLDS; // デフォルト値
}
```

## 実装の簡潔さ

### やること
1. **Issue/Flow/Pondの数を数える**
2. **閾値と比較**
3. **超えていたらイベント発行**

### やらないこと
- 複雑なパフォーマンス分析
- システムパラメータの調整
- 機械学習や予測
- 詳細なレポート生成

## テストシナリオ

### 1. 未整理Issue検出テスト
```typescript
// 21個のFlowなしIssueを作成
for (let i = 0; i < 21; i++) {
  await createIssue({
    title: `Test Issue ${i}`,
    description: 'Test',
    flowIds: []  // Flowに属さない
  });
}

// D-2実行
await runWorkflow('D-2');

// UNCLUSTERED_ISSUES_EXCEEDED イベントが発行されることを確認
// B-1がトリガーされることを確認
```

### 2. Issue停滞検出テスト
```typescript
// 4日前の日付でIssueを作成
const stalledIssue = await createIssue({
  title: 'Stalled Issue',
  updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
});

// D-2実行
await runWorkflow('D-2');

// ISSUE_STALLED イベントが発行されることを確認
// C-2がトリガーされることを確認
```

## まとめ

D-2は**シンプルな監視役**：

1. **定期的に数を数える**
2. **閾値を超えたらイベント発行**
3. **他のワークフローに処理を任せる**

これにより、システム全体の自律的な動作を支援します。パフォーマンスチューニングなどの複雑な処理は、実際のインフラレベルで対処すべき課題として、ワークフローの範囲外とします。