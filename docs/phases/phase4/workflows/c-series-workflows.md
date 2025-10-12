# C系ワークフロー詳細仕様（Phase 4版）

## 概要

C系ワークフローは「提案系ワークフロー」として、ユーザーの次のアクションを支援する役割を持ちます。Flow の「観点」システムを活用し、コンテキストに応じた最適な提案を生成します。

### C-1 → C-2 連携フロー
C系ワークフローは以下の流れで連携して動作します：
1. **C-1 (SUGGEST_NEXT_FLOW)**: ユーザーの状況に応じて最適なFlowを選定
2. **C-2 (SUGGEST_NEXT_ACTION_FOR_ISSUE)**: 選定されたFlow内の最優先Issueを特定し、具体的な解決方法を提案

この連携により、ユーザーへの包括的な行動指針を提供します。

## C-1: SUGGEST_NEXT_FLOW（次のFlow提案）

### 目的
ユーザーの現在の状況、完了したFlow、時間帯、作業パターンから、次に取り組むべき最適なFlowを提案する。

### トリガー
```typescript
triggers: {
  events: [
    'FLOW_COMPLETED',           // Flow完了時
    'USER_REQUEST_RECEIVED',    // ユーザーからの提案要求
    'MORNING_ROUTINE',          // 朝の定期実行
    'CONTEXT_SWITCHED'          // コンテキスト切り替え時
  ],
  priority: 25,
  condition: (context) => {
    // 提案の頻度制限（30分に1回まで）
    const lastSuggestionTime = context.getLastSuggestionTime('C-1');
    return (Date.now() - lastSuggestionTime) > 30 * 60 * 1000;
  }
}
```

### ペイロード型定義
```typescript
interface SuggestNextFlowPayload {
  trigger: 'flow_completed' | 'user_request' | 'morning' | 'context_switch';
  context: {
    completedFlowId?: string;      // 完了したFlowのID
    currentTime: Date;
    timezone: string;
    userState?: {
      energy: 'high' | 'medium' | 'low';
      availableTime: number;      // 利用可能時間（分）
      location?: string;           // 作業場所
      preferredType?: string;      // 希望する作業タイプ
    };
    constraints?: {
      excludeFlowIds?: string[];   // 除外するFlow
      includeOnlyTypes?: string[]; // 特定タイプのみ
    };
  };
}
```

### 処理ステップ

#### 1. コンテキスト分析
```typescript
// 現在のコンテキストを総合的に分析
const contextAnalysis = {
  // 時間的コンテキスト
  timeContext: analyzeTimeContext({
    currentTime: input.context.currentTime,
    timezone: input.context.timezone,
    workingHours: await context.getUserWorkingHours()
  }),

  // ユーザーの状態と履歴
  userContext: {
    recentFlows: await context.getRecentCompletedFlows(7), // 7日間
    productivityPattern: await context.getUserProductivityPattern(),
    currentEnergy: input.context.userState?.energy || 'medium',
    availableTime: input.context.userState?.availableTime || 60
  },

  // Flow の現状
  flowContext: {
    activeFlows: await context.getActiveFlows(),
    flowsByPriority: await context.getFlowsSortedByPriority(),
    stalledFlows: await context.getStalledFlows(),
    upcomingDeadlines: await context.getUpcomingDeadlines(7)
  },

  // 完了したFlowの分析（該当する場合）
  completedFlowAnalysis: input.context.completedFlowId
    ? await analyzeCompletedFlow(input.context.completedFlowId)
    : null
};
```

#### 2. 提案生成（ModulerPrompt）
```typescript
// PromptModuleを静的に定義
const nextFlowPromptModule: PromptModule<NextFlowContext> = {
  createContext: () => ({
    contextAnalysis: {},
    knowledgeBase: [],
    constraints: {}
  }),

  objective: ['次に実行すべきFlowを提案する'],

  terms: [
    'Flow: Issueに観点を与えて位置づけるもの',
    '優先度スコア: 0-1の範囲で緊急度と重要度を示す',
    'エネルギーレベル: high/medium/lowでユーザーの状態を示す'
  ],

  instructions: [
    '以下の観点から最適なFlowを提案してください：',
    '1. 現在の時間帯とユーザーのエネルギーレベル',
    '2. Flowの優先度と締切',
    '3. 作業の継続性（コンテキストスイッチの最小化）',
    '4. 依存関係の考慮'
  ],

  inputs: [
    ctx => `現在時刻: ${ctx.contextAnalysis.timeContext?.currentTime}`,
    ctx => `タイムゾーン: ${ctx.contextAnalysis.timeContext?.timezone}`,
    ctx => `ユーザーエネルギー: ${ctx.contextAnalysis.userContext?.currentEnergy}`,
    ctx => `利用可能時間: ${ctx.contextAnalysis.userContext?.availableTime}分`,
    '',
    ctx => `アクティブFlow数: ${ctx.contextAnalysis.flowContext?.activeFlows?.length || 0}`,
    ctx => ctx.contextAnalysis.completedFlowAnalysis
      ? `直前に完了したFlow: ${ctx.contextAnalysis.completedFlowAnalysis.flowId}`
      : ''
  ].filter(Boolean),

  materials: [
    // アクティブなFlow詳細
    ctx => ctx.contextAnalysis.flowContext?.flowsByPriority?.map(flow => ({
      type: 'material' as const,
      id: `flow-${flow.id}`,
      title: `Flow: ${flow.title}`,
      content: [
        `ID: ${flow.id}`,
        `優先度スコア: ${flow.priorityScore}`,
        `観点タイプ: ${flow.perspective.type}`,
        `観点説明: ${flow.perspective.description}`,
        flow.perspective.query ? `クエリ: ${flow.perspective.query}` : '',
        `関係性: ${flow.relationships || '未定義'}`,
        `Issue数: ${flow.issueIds.length}`,
        flow.deadline ? `締切: ${flow.deadline}` : '',
        `健全性: ${flow.health || 'healthy'}`,
        flow.recommendedTimeSlot ? `推奨時間帯: ${flow.recommendedTimeSlot}` : ''
      ].filter(Boolean).join('\n')
    })) || [],

    // 停滞しているFlow
    ctx => ctx.contextAnalysis.flowContext?.stalledFlows?.map(flow => ({
      type: 'material' as const,
      id: `stalled-flow-${flow.id}`,
      title: `停滞Flow: ${flow.title}`,
      content: [
        `停滞期間: ${flow.stalledDuration}日`,
        `最終更新: ${flow.lastUpdated}`,
        `ブロッカー: ${flow.blockers?.join(', ') || '不明'}`
      ].join('\n')
    })) || [],

    // ユーザーパターン（Knowledge）
    ctx => ctx.knowledgeBase.filter(k => k.type === 'user_pattern').map(knowledge => ({
      type: 'material' as const,
      id: `knowledge-${knowledge.id}`,
      title: 'ユーザーパターン',
      content: knowledge.content
    })),

    // 最近完了したFlow
    ctx => ctx.contextAnalysis.userContext?.recentFlows?.map(flow => ({
      type: 'material' as const,
      id: `recent-${flow.id}`,
      title: `最近完了: ${flow.title}`,
      content: [
        `完了日時: ${flow.completedAt}`,
        `所要時間: ${flow.actualDuration}分`
      ].join('\n')
    })) || []
  ],

  schema: {
    suggestions: z.array(z.object({
      flowId: z.string(),
      score: z.number().min(0).max(1), // 推奨度スコア
      reason: z.string(),
      matchFactors: z.array(z.object({
        factor: z.enum([
          'priority',
          'deadline',
          'energy_match',
          'time_fit',
          'context_continuity',
          'user_preference',
          'dependency'
        ]),
        score: z.number().min(0).max(1),
        description: z.string()
      })),
      estimatedDuration: z.number(), // 推定所要時間（分）
      energyRequired: z.enum(['high', 'medium', 'low']),
      bestTimeSlot: z.object({
        start: z.string(),
        end: z.string()
      }).optional(),
      alternativeIf: z.object({
        condition: z.string(),
        alternativeFlowId: z.string(),
        reason: z.string()
      }).optional(),
      preparationSteps: z.array(z.string()).optional() // 事前準備
    })).max(5), // 最大5つの提案

    contextInsights: z.object({
      currentFocus: z.string(),
      productivityAdvice: z.string(),
      bottleneck: z.string().optional()
    }),

    fallbackSuggestion: z.object({
      action: z.enum(['take_break', 'review_progress', 'organize_thoughts']),
      reason: z.string(),
      duration: z.number()
    }).optional()
  }
};

// コンテキスト作成とコンパイル
const nextFlowContext: NextFlowContext = {
  contextAnalysis,
  knowledgeBase: await context.queryKnowledge({
    types: ['user_pattern', 'best_practice', 'system_rule']
  }),
  constraints: input.context.constraints
};

const compiled = compile(nextFlowPromptModule, nextFlowContext);
const result = await context.createDriver().query(compiled);
```

#### 3. 提案の調整と記録
```typescript
// 提案をコンテキストに応じて調整
const adjustedSuggestions = await adjustSuggestions(result.suggestions, {
  userEnergy: contextAnalysis.userContext.currentEnergy,
  availableTime: contextAnalysis.userContext.availableTime,
  userPreferences: await context.getUserPreferences()
});

// 主要な提案を選定
const primarySuggestion = adjustedSuggestions[0];
const alternativeSuggestions = adjustedSuggestions.slice(1, 4);

// 提案の記録（学習用）
await context.recordSuggestion({
  timestamp: new Date(),
  trigger: input.trigger,
  suggestions: adjustedSuggestions,
  context: contextAnalysis,
  selected: null // ユーザーの選択は後で更新
});

// 必要に応じてFlowの観点を更新
if (primarySuggestion && primarySuggestion.score > 0.8) {
  const flow = await context.getFlow(primarySuggestion.flowId);
  if (!flow.perspective.lastApplied ||
      Date.now() - flow.perspective.lastApplied > 24 * 60 * 60 * 1000) {
    await context.emit('PERSPECTIVE_TRIGGERED', {
      flowId: flow.id,
      perspective: flow.perspective,
      trigger: 'suggestion'
    });
  }
}
```

### 結果の記録とイベント発行
```typescript
// 提案結果の記録（stateに要約を保存）
await context.updateState({
  lastFlowSuggestion: {
    timestamp: new Date(),
    flowId: primarySuggestion.flowId,
    reason: primarySuggestion.reason,
    alternatives: alternativeSuggestions.map(s => s.flowId)
  }
});

// C-2への連携イベント発行
if (primarySuggestion) {
  await context.emit('FLOW_SELECTED_FOR_ACTION', {
    flowId: primarySuggestion.flowId,
    trigger: 'c1_suggestion',
    priority: primarySuggestion.score,
    context: {
      reason: primarySuggestion.reason,
      estimatedDuration: primarySuggestion.estimatedDuration
    }
  });
}
```

### イベント発行
- `FLOW_SELECTED_FOR_ACTION`: 選定したFlowに対するC-2起動イベント
- `PERSPECTIVE_TRIGGERED`: Flow観点の適用時
- `USER_GUIDANCE_PROVIDED`: ユーザーガイダンス提供時

## C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE（Issue対応アクション提案）

### 目的
C-1で選定されたFlow内の最優先Issueを特定し、そのIssueに対する具体的で実行可能なアクションステップを提案する。これにより、ユーザーの「次に何をすべきか」を明確にする。

### トリガー
```typescript
triggers: {
  events: [
    'FLOW_SELECTED_FOR_ACTION',     // C-1からの連携イベント
    'HIGH_PRIORITY_ISSUE_DETECTED', // 高優先度Issue検出時
    'ISSUE_CREATED',                // 新規Issue作成時（高優先度のみ）
  ],
  priority: 25,
  condition: (context) => {
    // FLOW_SELECTED_FOR_ACTIONの場合は無条件で実行
    if (context.eventType === 'FLOW_SELECTED_FOR_ACTION') {
      return true;
    }
    // その他のイベントは高優先度の場合のみ
    const issue = context.getIssue(context.eventPayload.issueId);
    return issue && issue.priority > 70;
  }
}
```

注：ISSUE_STALLEDイベントは直接C-2をトリガーせず、Flowレビューのきっかけとして扱われます。

### ペイロード型定義
```typescript
interface SuggestNextActionPayload {
  flowId?: string;              // C-1から連携された場合のFlowID
  issueId?: string;             // 直接Issue指定の場合
  trigger: 'flow_selected' | 'high_priority' | 'new_issue';
  requestDetail: {
    level: 'quick' | 'detailed' | 'comprehensive';
    focusArea?: string;         // 特定の側面に焦点
    constraints?: {
      timeLimit?: number;        // 時間制約（分）
      resources?: string[];      // 利用可能なリソース
      skills?: string[];         // 利用可能なスキル
    };
  };
  userContext?: {
    previousAttempts?: string[]; // 過去の試行
    blockers?: string[];         // 障害事項
  };
}
```

### 処理ステップ

#### 1. Issue特定と分析
```typescript
// Flow内の最優先Issue特定（C-1から連携された場合）
let targetIssueId: string;
let parentFlow: Flow | null = null;

if (input.flowId) {
  // Flow内のIssueを優先度順で取得
  parentFlow = await context.getFlow(input.flowId);
  const flowIssues = await context.getIssuesByFlowId(input.flowId);

  // 優先度とステータスに基づいてソート
  const prioritizedIssues = flowIssues
    .filter(issue => issue.status !== 'closed')
    .sort((a, b) => {
      // 優先度が高いものを先に
      if (b.priority !== a.priority) return b.priority - a.priority;
      // 停滞期間が長いものを先に
      const stalledA = calculateStalledDuration(a.id);
      const stalledB = calculateStalledDuration(b.id);
      return stalledB - stalledA;
    });

  targetIssueId = prioritizedIssues[0]?.id;

  if (!targetIssueId) {
    // Flow内にIssueがない場合は新規Issue作成を提案
    await context.emit('EMPTY_FLOW_DETECTED', { flowId: input.flowId });
    return;
  }
} else if (input.issueId) {
  targetIssueId = input.issueId;
  parentFlow = await context.getFlowByIssueId(input.issueId);
} else {
  throw new Error('Either flowId or issueId must be provided');
}

// Issueの詳細分析
const issueAnalysis = {
  issue: await context.getIssue(targetIssueId),
  history: await context.getIssueHistory(targetIssueId),
  relations: await context.getIssueRelations(targetIssueId),
  stalledDuration: calculateStalledDuration(targetIssueId),
  complexity: await estimateIssueComplexity(targetIssueId)
};

// 関連するKnowledge検索
const relevantKnowledge = await context.queryKnowledge({
  vector: await context.vectorize(issueAnalysis.issue.description),
  types: ['procedure', 'best_practice', 'system_rule'],
  limit: 10
});

// Flow の観点を取得
const flowPerspective = parentFlow?.perspective;
```

#### 2. アクション提案生成（ModulerPrompt）
```typescript
// PromptModuleを静的に定義
const issueActionPromptModule: PromptModule<IssueActionContext> = {
  createContext: () => ({
    issueAnalysis: {},
    relevantKnowledge: [],
    flowPerspective: null,
    userContext: {},
    constraints: {},
    detailLevel: 'detailed'
  }),

  objective: ['Issueに対する具体的で実行可能なアクションを提案する'],

  terms: [
    'Issue: 解決すべき課題や作業項目',
    'アクション: 実行可能な具体的ステップ',
    'ブロッカー: 進行を妨げる要因'
  ],

  instructions: [
    '以下の観点からアクションを提案してください：',
    '1. 根本原因の特定と解決',
    '2. 実行可能性（時間、リソース、スキル）',
    '3. リスクレベルと成功可能性',
    '4. 類似ケースからの学習'
  ],

  inputs: [
    ctx => `Issue ID: ${ctx.issueAnalysis.issue?.id}`,
    ctx => `タイトル: ${ctx.issueAnalysis.issue?.title}`,
    ctx => `停滞期間: ${ctx.issueAnalysis.stalledDuration}日`,
    ctx => `複雑度: ${ctx.issueAnalysis.complexity}`,
    '',
    ctx => ctx.userContext?.previousAttempts?.length > 0
      ? `過去の試行: ${ctx.userContext.previousAttempts.join(', ')}`
      : '',
    ctx => ctx.userContext?.blockers?.length > 0
      ? `ブロッカー: ${ctx.userContext.blockers.join(', ')}`
      : '',
    ctx => ctx.constraints?.timeLimit
      ? `時間制約: ${ctx.constraints.timeLimit}分`
      : '',
    ctx => `詳細レベル: ${ctx.detailLevel}`
  ].filter(Boolean),

  materials: [
    // Issue詳細（存在する場合のみ単体の配列として返す）
    ctx => ctx.issueAnalysis.issue ? [{
      type: 'material' as const,
      id: `issue-${ctx.issueAnalysis.issue.id}`,
      title: `Issue詳細: ${ctx.issueAnalysis.issue.title}`,
      content: [
        `説明: ${ctx.issueAnalysis.issue.description}`,
        `優先度: ${ctx.issueAnalysis.issue.priority}`,
        `ステータス: ${ctx.issueAnalysis.issue.status}`,
        `作成日: ${ctx.issueAnalysis.issue.createdAt}`,
        ctx.issueAnalysis.issue.labels?.length > 0
          ? `ラベル: ${ctx.issueAnalysis.issue.labels.join(', ')}`
          : ''
      ].filter(Boolean).join('\n')
    }] : [],

    // Issue履歴
    ctx => ctx.issueAnalysis.history?.map(entry => ({
      type: 'material' as const,
      id: `history-${entry.id}`,
      title: `履歴: ${entry.timestamp}`,
      content: [
        `アクション: ${entry.action}`,
        `詳細: ${entry.details}`,
        entry.result ? `結果: ${entry.result}` : ''
      ].filter(Boolean).join('\n')
    })) || [],

    // 関連Knowledge
    ctx => ctx.relevantKnowledge.map(knowledge => ({
      type: 'material' as const,
      id: `knowledge-${knowledge.id}`,
      title: `関連Knowledge: ${knowledge.type}`,
      content: [
        `内容: ${knowledge.content}`,
        knowledge.confidence ? `信頼度: ${knowledge.confidence}` : '',
        knowledge.applicability ? `適用可能性: ${knowledge.applicability}` : ''
      ].filter(Boolean).join('\n')
    })),

    // Flow観点情報（存在する場合のみ単体の配列として返す）
    ctx => ctx.flowPerspective ? [{
      type: 'material' as const,
      id: 'flow-perspective',
      title: 'Flow観点情報',
      content: [
        `観点タイプ: ${ctx.flowPerspective.type}`,
        `説明: ${ctx.flowPerspective.description}`,
        ctx.flowPerspective.query ? `クエリ: ${ctx.flowPerspective.query}` : '',
        ctx.flowPerspective.completionCriteria
          ? `完了条件: ${ctx.flowPerspective.completionCriteria}`
          : ''
      ].filter(Boolean).join('\n')
    }] : []
  ],

  schema: {
    actions: z.array(z.object({
      type: z.enum(['immediate', 'planned', 'investigative', 'delegatable']),
      priority: z.enum(['must_do', 'should_do', 'nice_to_have']),
      title: z.string(),
      description: z.string(),
      steps: z.array(z.object({
        order: z.number(),
        action: z.string(),
        detail: z.string(),
        estimatedTime: z.number(), // 分
        tools: z.array(z.string()),
        checkpoints: z.array(z.string())
      })),
      prerequisites: z.array(z.string()),
      estimatedTotalTime: z.number(), // 分
      confidence: z.number().min(0).max(1),
      riskLevel: z.enum(['low', 'medium', 'high']),
      successCriteria: z.array(z.string()),
      potentialBlockers: z.array(z.object({
        blocker: z.string(),
        mitigation: z.string()
      })),
      relatedKnowledge: z.array(z.object({
        knowledgeId: z.string(),
        relevance: z.string(),
        keyInsight: z.string()
      })),
      similarCases: z.array(z.object({
        issueId: z.string(),
        similarity: z.number(),
        resolution: z.string(),
        keyLearning: z.string()
      }))
    })).max(3), // 最大3つのアクション案

    rootCauseAnalysis: z.object({
      identified: z.boolean(),
      description: z.string(),
      evidence: z.array(z.string()),
      addressedByActions: z.boolean()
    }).optional(),

    alternativeApproaches: z.array(z.object({
      approach: z.string(),
      whenToConsider: z.string(),
      prosAndCons: z.object({
        pros: z.array(z.string()),
        cons: z.array(z.string())
      })
    })).optional(),

    splitSuggestion: z.object({
      shouldSplit: z.boolean(),
      reason: z.string(),
      suggestedSubIssues: z.array(z.object({
        title: z.string(),
        description: z.string(),
        dependency: z.enum(['independent', 'sequential', 'parallel'])
      }))
    }).optional(),

    escalationSuggestion: z.object({
      shouldEscalate: z.boolean(),
      reason: z.string(),
      escalateTo: z.string(),
      preparedInformation: z.array(z.string())
    }).optional()
  }
};

// コンテキスト作成とコンパイル
const actionContext: IssueActionContext = {
  issueAnalysis,
  relevantKnowledge,
  flowPerspective,
  userContext: input.userContext,
  constraints: input.requestDetail.constraints,
  detailLevel: input.requestDetail.level
};

const compiled = compile(issueActionPromptModule, actionContext);
const result = await context.createDriver().query(compiled);
```

#### 3. アクションの優先順位付けと実行支援
```typescript
// アクションの優先順位付け
const prioritizedActions = result.actions.sort((a, b) => {
  const priorityWeight = { must_do: 3, should_do: 2, nice_to_have: 1 };
  const typeWeight = { immediate: 3, investigative: 2, planned: 1, delegatable: 0 };

  const scoreA = priorityWeight[a.priority] * 10 +
                  typeWeight[a.type] * 5 +
                  a.confidence * 3;
  const scoreB = priorityWeight[b.priority] * 10 +
                  typeWeight[b.type] * 5 +
                  b.confidence * 3;

  return scoreB - scoreA;
});

// 主要アクションの選定
const primaryAction = prioritizedActions[0];

// 実行支援情報の準備
const executionSupport = {
  checklist: primaryAction.steps.map(step => ({
    step: step.action,
    completed: false,
    checkpoint: step.checkpoints[0] || null
  })),
  resources: {
    knowledge: primaryAction.relatedKnowledge,
    similarCases: primaryAction.similarCases,
    tools: [...new Set(primaryAction.steps.flatMap(s => s.tools))]
  },
  timeline: calculateTimeline(primaryAction.steps),
  nextCheckIn: calculateNextCheckIn(primaryAction.estimatedTotalTime)
};

// Issue分割が推奨される場合
if (result.splitSuggestion?.shouldSplit) {
  await context.emit('ISSUE_SPLIT_SUGGESTED', {
    issueId: input.issueId,
    reason: result.splitSuggestion.reason,
    suggestedSubIssues: result.splitSuggestion.suggestedSubIssues
  });
}

// エスカレーションが必要な場合
if (result.escalationSuggestion?.shouldEscalate) {
  await context.emit('ESCALATION_REQUIRED', {
    issueId: input.issueId,
    reason: result.escalationSuggestion.reason,
    escalateTo: result.escalationSuggestion.escalateTo
  });
}

// アクション提案をIssue updatesに直接記録
const issue = await context.getIssue(targetIssueId);
await context.updateIssue(targetIssueId, {
  updates: [
    ...issue.updates,
    {
      type: 'ai_suggestion',
      timestamp: new Date(),
      content: {
        primaryAction: {
          title: primaryAction.title,
          type: primaryAction.type,
          steps: primaryAction.steps,
          estimatedTime: primaryAction.estimatedTotalTime,
          confidence: primaryAction.confidence
        },
        alternatives: prioritizedActions.slice(1, 3).map(a => ({
          title: a.title,
          type: a.type,
          reason: a.description
        })),
        executionSupport,
        rootCause: result.rootCauseAnalysis
      }
    }
  ]
});

// stateに要約を記録
await context.updateState({
  lastActionSuggestion: {
    timestamp: new Date(),
    issueId: targetIssueId,
    flowId: parentFlow?.id,
    actionTitle: primaryAction.title,
    confidence: primaryAction.confidence
  }
});
```

### 結果の記録
提案結果は以下の方法で記録されます：
- **Issue updates**: AIの提案内容を直接追記
- **state**: 最新の提案の要約を保存
- **イベント発行**: 必要に応じて後続処理をトリガー

### イベント発行
- `ACTION_SUGGESTION_READY`: アクション提案準備完了
- `ISSUE_SPLIT_SUGGESTED`: Issue分割提案時
- `ESCALATION_REQUIRED`: エスカレーション必要時
- `KNOWLEDGE_APPLIED`: Knowledge適用時

## 共通設計要素

### 提案の学習とフィードバック

```typescript
// ユーザーフィードバックの記録
interface SuggestionFeedback {
  suggestionId: string;
  selected: boolean;
  helpful: boolean;
  actualDuration?: number;
  completionSuccess?: boolean;
  userComment?: string;
}

// フィードバックに基づく学習
async function learnFromFeedback(feedback: SuggestionFeedback) {
  // フィードバックをKnowledge化
  if (feedback.helpful) {
    await context.createKnowledge({
      type: 'user_preference',
      content: `Successful suggestion pattern: ${JSON.stringify(feedback)}`,
      confidence: 0.8
    });
  }

  // 提案アルゴリズムの調整
  await adjustSuggestionWeights(feedback);
}
```

### コンテキスト適応

```typescript
// 時間帯別の最適化
function optimizeForTimeOfDay(suggestions: any[], timeOfDay: string) {
  const timePreferences = {
    morning: { energyLevel: 'high', taskType: 'creative' },
    afternoon: { energyLevel: 'medium', taskType: 'routine' },
    evening: { energyLevel: 'low', taskType: 'review' }
  };

  // 時間帯に応じて提案を調整
  return suggestions.map(s => ({
    ...s,
    score: adjustScoreForTime(s, timePreferences[timeOfDay])
  }));
}
```

### 提案の説明可能性

```typescript
// 提案理由の生成
function generateExplanation(suggestion: any, factors: any[]) {
  const explanations = factors
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(f => `${f.description}（スコア: ${f.score.toFixed(2)}）`);

  return {
    summary: `この提案の主な理由: ${explanations[0]}`,
    details: explanations,
    confidence: factors.reduce((sum, f) => sum + f.score, 0) / factors.length
  };
}
```

### パフォーマンス考慮事項

1. **キャッシング**
   - 頻繁にアクセスされるユーザーパターンをキャッシュ
   - Flow内Issue優先度計算の一時保存

2. **バッチ処理**
   - 複数の提案要求をまとめて処理
   - ModulerPromptへの一括クエリ

3. **段階的詳細化**
   - 基本提案を即座に返し、詳細は非同期で生成
   - ユーザーの選択に応じて追加情報を提供

## テストシナリオ

### C-1: SUGGEST_NEXT_FLOW テストケース

1. **朝の提案**
   - 高エネルギータスクを優先
   - 1日の計画を考慮

2. **Flow完了後の提案**
   - 関連Flowを優先
   - コンテキスト継続性を重視

3. **時間制約下の提案**
   - 短時間で完了可能なFlowを選択
   - 部分的実行可能なFlowの提案

### C-2: SUGGEST_NEXT_ACTION テストケース

1. **停滞Issue対応**
   - ブロッカーの特定と解消策
   - 代替アプローチの提案

2. **複雑Issue対応**
   - Issue分割の提案
   - 段階的アプローチ

3. **緊急Issue対応**
   - 即座実行可能なアクション
   - エスカレーションパス

## 次のステップ

1. プロンプトテンプレートの詳細設計
2. フィードバックループの実装設計
3. A系・B系ワークフローとの統合設計
4. ユーザーインターフェース要件の定義