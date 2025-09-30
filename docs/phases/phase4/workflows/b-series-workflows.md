# B系ワークフロー詳細仕様（Phase 4版）

## 概要

B系ワークフローは「横断的ワークフロー」として、複数のIssueやFlowを俯瞰的に分析・整理する役割を持ちます。Phase 4では、Flow の「観点」システムと統合し、自然言語による関係性記述を活用します。

## B-1: CLUSTER_ISSUES（Issue群のクラスタリング）

### 目的
関連するIssue群を自動的にグルーピングし、Flow生成の候補を発見する。「観点」を自動抽出し、Flowによる位置づけを提案する。

### トリガー
```typescript
triggers: {
  events: [
    'SCHEDULED_TIME_REACHED',     // 定期実行（日次/週次）
    'ISSUE_THRESHOLD_EXCEEDED',   // Issue数が閾値超過
    'USER_REQUEST_RECEIVED'        // ユーザーによる手動実行
  ],
  priority: 10,
  // conditionは同期的な処理のみ（DB/APIアクセスは避ける）
  condition: (payload) => {
    // イベントペイロードから判定
    if (payload.type === 'ISSUE_THRESHOLD_EXCEEDED') {
      return payload.issueCount >= 5;
    }
    return true; // その他のイベントは常に実行
  }
}
```

### ペイロード型定義
```typescript
interface ClusterIssuesPayload {
  trigger: 'scheduled' | 'threshold' | 'manual';
  scope: {
    status?: 'open' | 'all';
    age?: number;              // days
    excludeFlowIds?: string[]; // 既存Flow所属のIssueを除外
  };
  analysisDepth?: 'quick' | 'deep' | 'comprehensive';
}
```

### 処理ステップ

#### 1. Issue収集と処理可否判定
```typescript
// WorkflowContextを使用してIssue収集
const issues = await context.storage.searchIssues('status:open');

// Flowに属していないIssueのみ抽出
const unclusteredIssues = issues.filter(issue => !issue.flowIds || issue.flowIds.length === 0);

// 処理可否判定
if (unclusteredIssues.length < 3) {
  // 3件未満なら処理をスキップ
  return {
    skipped: true,
    reason: 'Not enough unclustered issues',
    issueCount: unclusteredIssues.length
  };
}

// ベクトル検索は既にDBレイヤーで実行済み（LanceDB + ruri-v3）
// 類似度計算のための追加情報取得
const issuesWithContext = await Promise.all(unclusteredIssues.map(async issue => {
  const relatedPond = await context.storage.searchPond(issue.description.slice(0, 100));
  return {
    ...issue,
    relatedContext: relatedPond.slice(0, 3) // 上位3件
  };
}));
```

#### 2. クラスタリング分析（ModulerPrompt）
```typescript
import { compile, createContext } from '@moduler-prompt/core';
import type { PromptModule } from '@moduler-prompt/core';
import { issuesToMaterials, flowsToMaterials } from '../shared/material-utils.js';

// PromptModuleを静的に定義（関数外）
const clusteringPromptModule: PromptModule<ClusteringContext> = {
  createContext: () => ({
    issues: [],
    existingFlows: [],
    timestamp: new Date()
  }),

  objective: ['関連するIssueをグループ化し、Flowの観点を発見する'],

  terms: [
    'Flow: Issueに「観点」を与えて位置づけるもの',
    'クラスタ: 関連性の高いIssue群',
    '観点: Issueをまとめる視点（プロジェクト、時間、テーマ等）'
  ],

  instructions: [
    '以下の分析を実施してください：',
    '1. Issue間の関連性を判定',
    '2. グループ化の観点を発見',
    '3. 各グループ内の関係性を自然言語で記述',
    '4. Flow作成の必要性を判断'
  ],

  inputs: [
    ctx => `分析対象Issue数: ${ctx.issues.length}件`,
    ctx => `既存Flow数: ${ctx.existingFlows.length}件`,
    '',
    '分析の目的:',
    '- 関連するIssueを発見してグルーピング',
    '- 各グループに対する「観点」の発見',
    '- Flow作成の必要性判断'
  ],

  materials: [
    // 分析対象のIssue詳細をMaterialElementとして提供
    ctx => issuesToMaterials(ctx.issues),

    // 既存Flowを MaterialElement として提供
    ctx => flowsToMaterials(ctx.existingFlows)
  ],
  // JSONスキーマ形式で定義（ModulerPrompt仕様に準拠）
  schema: [
    {
      type: 'json',
      content: {
        type: 'object',
        properties: {
          clusters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                perspective: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['project', 'temporal', 'thematic', 'dependency']
                    },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    query: { type: 'string' }
                  },
                  required: ['type', 'title', 'description']
                },
                issueIds: {
                  type: 'array',
                  items: { type: 'string' }
                },
                relationships: { type: 'string' },
                commonPatterns: {
                  type: 'array',
                  items: { type: 'string' }
                },
                suggestedPriority: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1
                },
                completionCriteria: { type: 'string' }
              },
              required: ['id', 'perspective', 'issueIds', 'relationships']
            }
          },
          insights: {
            type: 'array',
            items: { type: 'string' }
          },
          unclustered: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['clusters', 'insights', 'unclustered']
      }
    }
  ]
};

// コンテキスト作成とコンパイル
const clusteringContext: ClusteringContext = {
  issues: issuesWithContext,
  existingFlows: [], // 実際は context.storage から取得
  timestamp: new Date()
};

const compiled = compile(clusteringPromptModule, clusteringContext);
const result = await context.createDriver().query(compiled);

// 構造化出力の取得
const clusteringResult = result.structuredOutput || JSON.parse(result.content);
```

#### 3. Flow候補の生成
```typescript
// WorkflowRecorderで記録
context.recorder.record('AI_CALL', {
  model: context.createDriver().modelId || 'default',
  temperature: 0.3,
  purpose: 'cluster_issues'
});

for (const cluster of clusteringResult.clusters) {
  if (cluster.issueIds.length >= 3) {
    // WorkflowEventEmitterを使用してイベント発行
    const emitter = createWorkflowEventEmitter(engine);
    emitter.emit({
      type: 'FLOW_CREATION_SUGGESTED',
      payload: {
        perspective: cluster.perspective,
        issueIds: cluster.issueIds,
        relationships: cluster.relationships,
        priority: cluster.suggestedPriority,
        completionCriteria: cluster.completionCriteria,
        autoCreate: cluster.perspective.type === 'project' // プロジェクト型は自動作成
      }
    });
  }
}
```

### 出力
```typescript
interface ClusterIssuesOutput {
  clusters: Array<{
    id: string;
    perspective: FlowPerspective;
    issueIds: string[];
    relationships: string;
    createdFlow?: Flow; // 自動作成された場合
  }>;
  insights: string[];
  metrics: {
    totalIssuesAnalyzed: number;
    clustersFound: number;
    flowsCreated: number;
    executionTime: number;
  };
}
```

### イベント発行
- `ISSUES_CLUSTER_DETECTED`: クラスタ発見時
- `FLOW_CREATION_SUGGESTED`: Flow作成提案時
- `FLOW_CREATED`: Flow自動作成時（条件付き）

## B-2: UPDATE_FLOW_RELATIONS（Flow関係性更新）

### 目的
FlowとIssueの関係性、およびFlow間の関係性を最新状態に保ち、「観点」による位置づけを維持・更新する。

### トリガー
```typescript
triggers: {
  events: [
    'ISSUE_UPDATED',
    'ISSUE_STATUS_CHANGED',
    'FLOW_PERSPECTIVE_UPDATED',
    'SCHEDULED_TIME_REACHED'
  ],
  priority: 15,
  condition: (context) => {
    // Flowに影響する変更があった場合のみ実行
    return context.hasFlowRelatedChanges();
  }
}
```

### ペイロード型定義
```typescript
interface UpdateFlowRelationsPayload {
  flowId?: string;  // 特定Flow or 全Flow
  trigger: 'issue_changed' | 'perspective_changed' | 'scheduled';
  changedIssueIds?: string[];
}
```

### 処理ステップ

#### 1. 現状分析
```typescript
const flows = input.flowId
  ? [await context.getFlow(input.flowId)]
  : await context.getActiveFlows();

const flowAnalysis = await Promise.all(flows.map(async flow => ({
  flow,
  issues: await context.getIssuesByIds(flow.issueIds),
  completionRate: calculateCompletionRate(flow),
  staleness: calculateStaleness(flow),
  perspectiveRelevance: await evaluatePerspectiveRelevance(flow)
})));
```

#### 2. 関係性の再評価（ModulerPrompt）
```typescript
import { flowAnalysisToMaterial, knowledgesToMaterials } from '../shared/material-utils.js';

// PromptModuleを静的に定義
const flowRelationPromptModule: PromptModule<FlowRelationContext> = {
  createContext: () => ({
    flowAnalysis: [],
    recentChanges: [],
    knowledgeBase: []
  }),

  objective: ['Flow間の関係性を分析し、更新の必要性を判定する'],

  instructions: [
    '以下を評価してください：',
    '1. 各Flowの健全性（health）',
    '2. 観点（perspective）の妥当性',
    '3. Issue間の関係性',
    '4. 必要な変更の提案'
  ],

  inputs: [
    ctx => `分析対象Flow数: ${ctx.flowAnalysis.length}`,
    '',
    'Flows:',
    ctx => ctx.flowAnalysis.map(f =>
      `- ${f.flow.id}: ${f.flow.title} (完了率: ${f.completionRate}%)`
    ).join('\n'),
    '',
    ctx => ctx.recentChanges.length > 0
      ? `最近の変更Issue: ${ctx.recentChanges.join(', ')}`
      : '最近の変更なし'
  ],

  materials: [
    // Flow分析情報を MaterialElement として提供
    ctx => ctx.flowAnalysis.map(flowAnalysisToMaterial),

    // 各Issueの詳細情報を個別のMaterialElementとして提供
    // flatMapを使用して二重配列を平坦化
    ctx => ctx.flowAnalysis.flatMap(analysis =>
      issuesToMaterials(analysis.issues).map(material => ({
        ...material,
        title: `${material.title} (Flow: ${analysis.flow.id})`
      }))
    ),

    // Knowledge情報
    ctx => knowledgesToMaterials(ctx.knowledgeBase)
  ],

  schema: [
    {
      type: 'json',
      content: {
        type: 'object',
        properties: {
          flowUpdates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                flowId: { type: 'string' },
                health: {
                  type: 'string',
                  enum: ['healthy', 'needs_attention', 'stale', 'obsolete']
                },
                perspectiveValidity: {
                  type: 'object',
                  properties: {
                    stillValid: { type: 'boolean' },
                    reason: { type: 'string' },
                    suggestedUpdate: { type: 'string' }
                  },
                  required: ['stillValid', 'reason']
                },
                relationships: { type: 'string' },
                suggestedChanges: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      action: {
                        type: 'string',
                        enum: ['remove_issue', 'add_issue', 'split_flow', 'merge_flow', 'archive_flow']
                      },
                      target: { type: 'string' },
                      rationale: { type: 'string' }
                    },
                    required: ['action', 'target', 'rationale']
                  }
                }
              },
              required: ['flowId', 'health', 'perspectiveValidity', 'relationships']
            }
          }
        },
        required: ['flowUpdates']
      }
    }
  ]
};

// コンパイルと実行
const relationContext: FlowRelationContext = {
  flowAnalysis,
  recentChanges: payload.changedIssueIds || [],
  knowledgeBase: await context.storage.searchKnowledge('type:flow_pattern')
};

const compiled = compile(flowRelationPromptModule, relationContext);
const result = await context.createDriver().query(compiled);
const updateResult = result.structuredOutput || JSON.parse(result.content);
```

#### 3. 更新の適用
```typescript
for (const update of result.flowUpdates) {
  // Flowの健全性更新
  if (update.health === 'obsolete') {
    await context.emit('FLOW_ARCHIVE_SUGGESTED', { flowId: update.flowId });
  }

  // 観点の更新
  if (!update.perspectiveValidity.stillValid && update.perspectiveValidity.suggestedUpdate) {
    await context.emit('PERSPECTIVE_UPDATE_REQUIRED', {
      flowId: update.flowId,
      newPerspective: update.perspectiveValidity.suggestedUpdate
    });
  }

  // Issue関係の更新
  for (const change of update.suggestedChanges) {
    await applyFlowChange(update.flowId, change);
  }

  // 関係性記述の更新
  await context.updateFlow(update.flowId, {
    relationships: update.relationships,
    health: update.health,
    lastUpdated: new Date()
  });
}
```

### 出力
```typescript
interface UpdateFlowRelationsOutput {
  updatedFlows: Flow[];
  changes: Array<{
    flowId: string;
    changeType: string;
    description: string;
  }>;
  flowInterRelations: FlowRelation[];
  metrics: {
    flowsAnalyzed: number;
    changesApplied: number;
    executionTime: number;
  };
}
```

### イベント発行
- `FLOW_RELATIONS_CHANGED`: Flow関係性変更時
- `FLOW_HEALTH_CHANGED`: Flow健全性変更時
- `PERSPECTIVE_UPDATE_REQUIRED`: 観点更新が必要な時

## B-3: UPDATE_FLOW_PRIORITIES（Flow優先度更新）

### 目的
外部要因、進捗状況、時間的制約に基づいてFlowの優先度を動的に調整する。

### トリガー
```typescript
triggers: {
  events: [
    'SCHEDULED_TIME_REACHED',    // 日次実行
    'DEADLINE_APPROACHING',       // 期限接近
    'USER_FEEDBACK_RECEIVED',     // ユーザーフィードバック
    'FLOW_STATUS_CHANGED'        // Flow状態変化
  ],
  priority: 15
}
```

### ペイロード型定義
```typescript
interface UpdateFlowPrioritiesPayload {
  trigger: 'scheduled' | 'deadline' | 'feedback' | 'status_change';
  context: {
    upcomingDeadlines?: Array<{flowId: string; deadline: Date}>;
    userFeedback?: {flowId: string; feedback: string};
    timezone?: string; // ユーザーのタイムゾーン
  };
}
```

### 処理ステップ

#### 1. 優先度要因の収集
```typescript
const priorityFactors = await gatherPriorityFactors({
  deadlines: await context.getUpcomingDeadlines(),
  dependencies: await context.getFlowDependencies(),
  staleness: await context.getStalenessMetrics(),
  userActivity: await context.getUserActivityPattern(),
  timeOfDay: getCurrentTimeContext(input.context.timezone),
  systemRules: await context.queryKnowledge({ type: 'system_rule' })
});
```

#### 2. 優先度計算（ModulerPrompt）
```typescript
const priorityPrompt = createPromptModule({
  name: 'calculate-flow-priorities',
  context: {
    flows: await context.getActiveFlows(),
    factors: priorityFactors,
    userContext: {
      currentTime: new Date(),
      workingHours: await context.getUserWorkingHours(),
      recentFocus: await context.getRecentUserFocus()
    }
  },
  schema: {
    priorityUpdates: z.array(z.object({
      flowId: z.string(),
      currentPriority: z.number(),
      suggestedPriority: z.number().min(0).max(1),
      factors: z.array(z.object({
        factor: z.string(),
        impact: z.number().min(-0.3).max(0.3), // 優先度への影響
        reason: z.string()
      })),
      urgencyLevel: z.enum(['critical', 'high', 'normal', 'low']),
      recommendedTimeSlot: z.string().optional() // 推奨作業時間帯
    })),
    globalInsights: z.array(z.string()),
    suggestedFocus: z.object({
      primaryFlow: z.string(),
      reason: z.string(),
      alternativeFlows: z.array(z.string())
    }).optional()
  }
});

const result = await driver.query(priorityPrompt);
```

#### 3. 優先度の適用と通知
```typescript
for (const update of result.priorityUpdates) {
  const significantChange = Math.abs(update.suggestedPriority - update.currentPriority) > 0.2;

  await context.updateFlow(update.flowId, {
    priorityScore: update.suggestedPriority,
    urgencyLevel: update.urgencyLevel,
    priorityFactors: update.factors,
    recommendedTimeSlot: update.recommendedTimeSlot
  });

  if (significantChange) {
    await context.emit('FLOW_PRIORITY_CHANGED', {
      flowId: update.flowId,
      oldPriority: update.currentPriority,
      newPriority: update.suggestedPriority,
      reason: update.factors[0].reason // 最も影響の大きい要因
    });
  }

  // Critical な Flow は即座に通知
  if (update.urgencyLevel === 'critical') {
    await context.emit('HIGH_PRIORITY_FLOW_DETECTED', {
      flowId: update.flowId,
      reason: 'Critical urgency level detected'
    });
  }
}
```

### 出力
```typescript
interface UpdateFlowPrioritiesOutput {
  priorityChanges: Array<{
    flowId: string;
    oldPriority: number;
    newPriority: number;
    factors: PriorityFactor[];
  }>;
  suggestedFocus?: {
    primaryFlow: Flow;
    alternativeFlows: Flow[];
  };
  insights: string[];
}
```

## B-4: SALVAGE_FROM_POND（Pondからのサルベージ）

### 目的
Pondに蓄積された未整理情報から、時間経過により価値が顕在化した情報を発見し、Knowledge化またはIssue化する。

### トリガー
```typescript
triggers: {
  events: [
    'SCHEDULED_TIME_REACHED',  // 週次/月次実行
    'POND_SIZE_THRESHOLD',     // Pond容量閾値超過
    'USER_REQUEST_RECEIVED'     // 手動サルベージ要求
  ],
  priority: 5  // 最低優先度（バックグラウンド処理）
}
```

### ペイロード型定義
```typescript
interface SalvageFromPondPayload {
  trigger: 'scheduled' | 'threshold' | 'manual';
  recipe?: SalvageRecipe;  // サルベージレシピ（指定しない場合はデフォルト）
  config: {
    ageThreshold: number;   // 何日以上前のデータを対象とするか
    sampleSize: number;     // 一度に処理する最大件数
    focusAreas?: string[];  // 特定の領域に絞る場合
  };
}

interface SalvageRecipe {
  name: string;           // "月次イベント集約" など
  schedule: string;       // "monthly", "weekly" など
  query: {
    dateRange: string;    // "last_month" など
    source?: string[];    // ["slack", "email"] など
    pattern?: string;     // 検索パターン
  };
  output: {
    type: 'knowledge' | 'issue' | 'summary';
    format?: string;      // 出力形式
  };
}
```

### 処理ステップ

#### 1. 候補の選定
```typescript
// サルベージ対象の選定
const candidates = await context.queryPond({
  ageGreaterThan: input.config.ageThreshold * 24 * 60 * 60 * 1000,
  limit: input.config.sampleSize,
  excludeProcessed: true,
  ...(input.recipe?.query || {})
});

// ベクトル検索で関連性の高いものをグループ化
const clusters = await clusterPondEntries(candidates);
```

#### 2. 価値評価と知識抽出（ModulerPrompt）
```typescript
const salvagePrompt = createPromptModule({
  name: 'salvage-pond',
  context: {
    clusters,
    recentIssues: await context.getRecentIssues(30), // 30日以内のIssue
    existingKnowledge: await context.queryKnowledge(),
    currentDate: new Date(),
    recipe: input.recipe
  },
  schema: {
    evaluations: z.array(z.object({
      clusterId: z.string(),
      pondEntryIds: z.array(z.string()),
      currentValue: z.enum(['high', 'medium', 'low', 'none']),
      valueType: z.enum(['pattern', 'fact', 'insight', 'anomaly']),
      reason: z.string(),
      suggestedAction: z.enum(['create_knowledge', 'create_issue', 'aggregate', 'discard']),
      relatedTo: z.array(z.object({
        type: z.enum(['issue', 'flow', 'knowledge']),
        id: z.string(),
        relation: z.string()
      })),
      extractedContent: z.object({
        title: z.string(),
        summary: z.string(),
        details: z.string(),
        tags: z.array(z.string()),
        confidence: z.number()
      }).optional()
    })),
    patterns: z.array(z.object({
      type: z.enum(['recurring', 'trend', 'correlation']),
      description: z.string(),
      frequency: z.number(),
      examples: z.array(z.string())
    })),
    aggregatedSummary: z.string().optional() // レシピ指定時の集約結果
  }
});

const result = await driver.query(salvagePrompt);
```

#### 3. アクション実行
```typescript
const salvageResults = [];

for (const evaluation of result.evaluations) {
  if (evaluation.currentValue === 'high' || evaluation.currentValue === 'medium') {
    switch (evaluation.suggestedAction) {
      case 'create_knowledge':
        const knowledge = await context.createKnowledge({
          type: determineKnowledgeType(evaluation.valueType),
          content: evaluation.extractedContent.details,
          summary: evaluation.extractedContent.summary,
          sources: evaluation.pondEntryIds.map(id => ({ type: 'pond', pondEntryId: id })),
          tags: evaluation.extractedContent.tags,
          confidence: evaluation.extractedContent.confidence
        });

        await context.emit('KNOWLEDGE_CREATED', { knowledgeId: knowledge.id });
        salvageResults.push({ type: 'knowledge', id: knowledge.id });
        break;

      case 'create_issue':
        const issue = await context.createIssue({
          title: evaluation.extractedContent.title,
          description: evaluation.extractedContent.details,
          source: 'pond_salvage',
          priority: evaluation.currentValue === 'high' ? 50 : 30,
          labels: ['salvaged', ...evaluation.extractedContent.tags]
        });

        await context.emit('ISSUE_CREATED', { issueId: issue.id });
        salvageResults.push({ type: 'issue', id: issue.id });
        break;

      case 'aggregate':
        // レシピに基づいた集約処理
        if (input.recipe && result.aggregatedSummary) {
          const summary = await context.createKnowledge({
            type: 'curated_summary',
            content: result.aggregatedSummary,
            title: `${input.recipe.name} - ${new Date().toISOString().split('T')[0]}`,
            sources: evaluation.pondEntryIds.map(id => ({ type: 'pond', pondEntryId: id }))
          });
          salvageResults.push({ type: 'summary', id: summary.id });
        }
        break;
    }

    // 処理済みマーク
    await context.markPondEntriesAsProcessed(evaluation.pondEntryIds);
  }
}
```

### 出力
```typescript
interface SalvageFromPondOutput {
  salvagedItems: Array<{
    type: 'knowledge' | 'issue' | 'summary';
    id: string;
    sourcePondEntryIds: string[];
  }>;
  patterns: Pattern[];
  metrics: {
    entriesAnalyzed: number;
    itemsSalvaged: number;
    knowledgeCreated: number;
    issuesCreated: number;
    executionTime: number;
  };
}
```

### イベント発行
- `SALVAGE_COMPLETED`: サルベージ完了時
- `PATTERN_FOUND`: パターン発見時
- `KNOWLEDGE_CREATED`: Knowledge作成時
- `ISSUE_CREATED`: Issue作成時

## B-5: INFER_BEHAVIOR_PATTERNS（行動パターン推論）

### 目的
ユーザーの行動パターンを分析し、効率的な作業習慣やボトルネックを発見する。

### トリガー
```typescript
triggers: {
  events: [
    'SCHEDULED_TIME_REACHED',    // 週次実行
    'PATTERN_ANALYSIS_REQUESTED' // 手動分析要求
  ],
  priority: 10
}
```

### ペイロード型定義
```typescript
interface InferBehaviorPatternsPayload {
  timeRange: {
    start: Date;
    end: Date;
  };
  focusAreas?: string[]; // 特定の領域に絞る場合
}
```

### 処理ステップ

#### 1. 行動データ収集
```typescript
const behaviorData = {
  issuePatterns: await analyzeIssuePatterns(input.timeRange),
  flowPatterns: await analyzeFlowPatterns(input.timeRange),
  timePatterns: await analyzeTimePatterns(input.timeRange),
  interactionPatterns: await analyzeUserInteractions(input.timeRange)
};
```

#### 2. パターン分析（ModulerPrompt）
```typescript
const patternPrompt = createPromptModule({
  name: 'infer-behavior-patterns',
  context: behaviorData,
  schema: {
    patterns: z.array(z.object({
      type: z.enum(['productivity', 'bottleneck', 'preference', 'anomaly']),
      description: z.string(),
      frequency: z.string(),
      impact: z.enum(['positive', 'negative', 'neutral']),
      suggestions: z.array(z.string())
    })),
    insights: z.array(z.string()),
    recommendations: z.array(z.object({
      type: z.enum(['workflow', 'scheduling', 'prioritization']),
      description: z.string(),
      expectedBenefit: z.string()
    }))
  }
});

const result = await driver.query(patternPrompt);
```

#### 3. Knowledge化と提案
```typescript
// 発見されたパターンをKnowledge化
for (const pattern of result.patterns) {
  if (pattern.impact !== 'neutral') {
    await context.createKnowledge({
      type: 'user_pattern',
      content: pattern.description,
      tags: ['behavior_pattern', pattern.type],
      metadata: {
        frequency: pattern.frequency,
        impact: pattern.impact
      }
    });
  }
}

// 改善提案がある場合は Issue 化
if (result.recommendations.length > 0) {
  await context.createIssue({
    title: '作業パターン改善の提案',
    description: result.recommendations.map(r => r.description).join('\n'),
    labels: ['improvement', 'pattern_analysis']
  });
}
```

### 出力
```typescript
interface InferBehaviorPatternsOutput {
  patterns: BehaviorPattern[];
  insights: string[];
  recommendations: Recommendation[];
  createdKnowledge: Knowledge[];
}
```

## 共通設計要素

### エラーハンドリング
```typescript
// 各ワークフローで共通のエラーハンドリング
try {
  // 処理実行
} catch (error) {
  await context.logError({
    workflowId: 'B-X',
    error: error.message,
    input,
    timestamp: new Date()
  });

  // リトライ可能なエラーの場合
  if (isRetryableError(error)) {
    await context.emit('WORKFLOW_RETRY_REQUIRED', {
      workflowId: 'B-X',
      retryCount: context.getRetryCount(),
      maxRetries: 3
    });
  }

  throw error; // 上位層へ伝播
}
```

### パフォーマンス最適化
- ベクトル検索は並列実行
- ModulerPromptのバッチ処理対応
- 大量データ処理時のストリーミング対応
- キャッシュ活用（特に B-4 のサルベージ処理）

### 次のステップ
1. C系ワークフロー仕様の作成
2. テストシナリオの作成
3. 実装優先順位の決定