/**
 * C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE ワークフローのプロンプトモジュール
 */

import type { PromptModule } from '@moduler-prompt/core';
import type { IssueAnalysis, SimilarResolvedIssue, UserContext } from './actions.js';
import type { Knowledge, Flow } from '@sebas-chan/shared-types';
import { merge } from '@moduler-prompt/core';
import { updateStatePromptModule, type StateContext } from '../shared/prompts/state.js';
import { knowledgesToMaterials } from '../shared/material-utils.js';

/**
 * Issueアクション提案のコンテキスト
 */
interface IssueActionContext extends StateContext {
  issueAnalysis: IssueAnalysis;
  relevantKnowledge: Knowledge[];
  similarResolvedIssues: SimilarResolvedIssue[];
  flowPerspective: Flow | null;
  userContext: UserContext;
  constraints: Record<string, unknown>;
  detailLevel: 'summary' | 'standard' | 'detailed';
}

/**
 * Issueアクション提案プロンプトモジュール
 */
export const issueActionPromptModule: PromptModule<IssueActionContext> = merge(
  updateStatePromptModule,
  {
    // >>> createContextなしだとちょっと分かりづらいかな？初期値は不要ですか？

    objective: ['Issueに対する具体的で実行可能なアクションを提案する'],

    terms: [
      'Issue: 解決すべき課題や作業項目',
      'アクション: 実行可能な具体的ステップ',
      'ブロッカー: 進行を妨げる要因',
      '根本原因: 問題の根源的な理由',
    ],

    // >>> どうも複雑な出力を求めすぎているように思えます
    // >>> 複数回への分割をしたほうが良いと思います。

    instructions: [
      '以下の観点からアクションを提案してください：',
      '1. 根本原因の特定と解決',
      '2. 実行可能性（時間、リソース、スキル）',
      '3. リスクレベルと成功可能性',
      '4. 類似ケースからの学習',
      '',
      'アクションタイプ:',
      '- immediate: 即座に実行可能',
      '- planned: 計画的実行が必要',
      '- investigative: 調査が必要',
      '- delegatable: 委譲可能',
      '',
      '優先度:',
      '- must_do: 必須',
      '- should_do: 推奨',
      '- nice_to_have: あると良い',
    ],

    inputs: [
      (ctx: IssueActionContext) => `Issue ID: ${ctx.issueAnalysis.issue.id}`,
      (ctx: IssueActionContext) => `タイトル: ${ctx.issueAnalysis.issue.title}`,
      (ctx: IssueActionContext) => `停滞期間: ${ctx.issueAnalysis.stalledDuration}日`,
      (ctx: IssueActionContext) => `複雑度: ${ctx.issueAnalysis.complexity}`,
      (ctx: IssueActionContext) => `詳細レベル: ${ctx.detailLevel}`,
      '',
      (ctx: IssueActionContext) =>
        ctx.userContext?.recentActivity && ctx.userContext.recentActivity.length > 0
          ? `過去の試行: ${ctx.userContext.recentActivity.join(', ')}`
          : '',
      (ctx: IssueActionContext) =>
        ctx.userContext?.preferences?.blockers &&
        Array.isArray(ctx.userContext.preferences.blockers)
          ? `ブロッカー: ${(ctx.userContext.preferences.blockers as string[]).join(', ')}`
          : '',
      (ctx: IssueActionContext) =>
        ctx.constraints?.timeLimit ? `時間制約: ${ctx.constraints.timeLimit}分` : '',
    ].filter(Boolean),

    materials: [
      // Issue詳細
      (ctx: IssueActionContext) =>
        ctx.issueAnalysis.issue
          ? [
              {
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
                    : '',
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
            ]
          : [],

      // 関連Knowledge
      (ctx: IssueActionContext) => knowledgesToMaterials(ctx.relevantKnowledge),

      // 類似の解決済みIssue
      (ctx: IssueActionContext) =>
        ctx.similarResolvedIssues.map((issue) => ({
          type: 'material' as const,
          id: `similar-${issue.id}`,
          title: `類似Issue: ${issue.title}`,
          content: [
            `類似度: ${issue.similarity}`,
            `解決方法: ${issue.resolution || '情報なし'}`,
            issue.description ? `説明: ${issue.description}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        })),

      // Flow観点情報
      (ctx: IssueActionContext) =>
        ctx.flowPerspective
          ? [
              {
                type: 'material' as const,
                id: 'flow-perspective',
                title: 'Flow観点情報',
                content: [
                  `Flow: ${ctx.flowPerspective.title}`,
                  `説明: ${ctx.flowPerspective.description}`,
                  `優先度: ${ctx.flowPerspective.priorityScore}`,
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
            ]
          : [],
    ],

    schema: [
      {
        type: 'json',

        // >>> schemaは別途const schema =として定義。
        // >>> 大きすぎて、この規模の出力をまとめで処理できるかちょっとわからないですね。

        content: {
          type: 'object',
          properties: {
            actions: {
              type: 'array',
              maxItems: 3,
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['immediate', 'planned', 'investigative', 'delegatable'],
                  },
                  priority: {
                    type: 'string',
                    enum: ['must_do', 'should_do', 'nice_to_have'],
                  },
                  title: {
                    type: 'string',
                  },
                  description: {
                    type: 'string',
                  },
                  steps: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        order: { type: 'number' },
                        action: { type: 'string' },
                        detail: { type: 'string' },
                        estimatedTime: { type: 'number' },
                        tools: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                        checkpoints: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                      },
                      required: [
                        'order',
                        'action',
                        'detail',
                        'estimatedTime',
                        'tools',
                        'checkpoints',
                      ],
                    },
                  },
                  prerequisites: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  estimatedTotalTime: {
                    type: 'number',
                    description: '総所要時間（分）',
                  },
                  confidence: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                  },
                  riskLevel: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                  },
                  successCriteria: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  potentialBlockers: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        blocker: { type: 'string' },
                        mitigation: { type: 'string' },
                      },
                      required: ['blocker', 'mitigation'],
                    },
                  },
                },
                required: [
                  'type',
                  'priority',
                  'title',
                  'description',
                  'steps',
                  'prerequisites',
                  'estimatedTotalTime',
                  'confidence',
                  'riskLevel',
                  'successCriteria',
                  'potentialBlockers',
                ],
              },
            },
            rootCauseAnalysis: {
              type: 'object',
              properties: {
                identified: { type: 'boolean' },
                description: { type: 'string' },
                evidence: {
                  type: 'array',
                  items: { type: 'string' },
                },
                addressedByActions: { type: 'boolean' },
              },
            },
            alternativeApproaches: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  approach: { type: 'string' },
                  whenToConsider: { type: 'string' },
                  prosAndCons: {
                    type: 'object',
                    properties: {
                      pros: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      cons: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                    required: ['pros', 'cons'],
                  },
                },
                required: ['approach', 'whenToConsider', 'prosAndCons'],
              },
            },
            splitSuggestion: {
              type: 'object',
              properties: {
                shouldSplit: { type: 'boolean' },
                reason: { type: 'string' },
                suggestedSubIssues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                      dependency: {
                        type: 'string',
                        enum: ['independent', 'sequential', 'parallel'],
                      },
                    },
                    required: ['title', 'description', 'dependency'],
                  },
                },
              },
            },
            escalationSuggestion: {
              type: 'object',
              properties: {
                shouldEscalate: { type: 'boolean' },
                reason: { type: 'string' },
                escalateTo: { type: 'string' },
                preparedInformation: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            // updatedStateはupdateStatePromptModuleから提供される
          },
          required: ['actions'],
        },
      },
    ],
  }
);
