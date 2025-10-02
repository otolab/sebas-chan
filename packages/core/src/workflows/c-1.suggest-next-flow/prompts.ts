/**
 * C-1: SUGGEST_NEXT_FLOW ワークフローのプロンプトモジュール
 */

import type { PromptModule } from '@moduler-prompt/core';
import type { ContextAnalysis } from './actions.js';
import { merge } from '@moduler-prompt/core';
import { updateStatePromptModule, type StateContext } from '../shared/prompts/state.js';
import { flowsToMaterials } from '../shared/material-utils.js';

/**
 * 次のFlow提案のコンテキスト
 */
interface NextFlowContext extends StateContext {
  contextAnalysis: ContextAnalysis;
  knowledgeBase: Array<{
    id: string;
    type: string;
    content: string;
    confidence: number;
  }>;
  constraints: {
    maxSuggestions: number;
    priorityThreshold: number;
  };
}

/**
 * 次のFlow提案プロンプトモジュール
 */
export const nextFlowPromptModule: PromptModule<NextFlowContext> = merge(
  updateStatePromptModule,
  {
    objective: ['次に実行すべきFlowを提案する'],

    terms: [
      'Flow: Issueに観点を与えて位置づけるもの',
      '優先度スコア: 0-1の範囲で緊急度と重要度を示す',
      'エネルギーレベル: high/medium/lowでユーザーの状態を示す',
      'コンテキストスイッチ: 作業内容の切り替えによる認知的負荷',
    ],

    instructions: [
      '以下の観点から最適なFlowを提案してください：',
      '1. 現在の時間帯とユーザーのエネルギーレベル',
      '2. Flowの優先度と締切',
      '3. 作業の継続性（コンテキストスイッチの最小化）',
      '4. 依存関係の考慮',
      '',
      'マッチング要因の評価:',
      '- priority: 優先度の高さ',
      '- deadline: 締切の近さ',
      '- energy_match: エネルギーレベルとの適合',
      '- time_fit: 利用可能時間との適合',
      '- context_continuity: 前の作業との関連性',
      '- user_preference: ユーザーの好み',
      '- dependency: 他のFlowとの依存関係',
    ],

    inputs: [
      (ctx: NextFlowContext) => `現在時刻: ${ctx.contextAnalysis.timeContext.currentTime.toISOString()}`,
      (ctx: NextFlowContext) => `タイムゾーン: ${ctx.contextAnalysis.timeContext.timezone}`,
      (ctx: NextFlowContext) => `勤務時間内: ${ctx.contextAnalysis.timeContext.isWorkingHours ? 'はい' : 'いいえ'}`,
      (ctx: NextFlowContext) => `ユーザーエネルギー: ${ctx.contextAnalysis.userContext.currentEnergy}`,
      (ctx: NextFlowContext) => `利用可能時間: ${ctx.contextAnalysis.userContext.availableTime}分`,
      '',
      (ctx: NextFlowContext) => `アクティブFlow数: ${ctx.contextAnalysis.flowContext.activeFlows.length}`,
      (ctx: NextFlowContext) => `締切が近いFlow数: ${ctx.contextAnalysis.flowContext.upcomingDeadlines.length}`,
      (ctx: NextFlowContext) =>
        ctx.contextAnalysis.completedFlowAnalysis
          ? `直前に完了したFlow: ${ctx.contextAnalysis.completedFlowAnalysis.title}`
          : '',
    ].filter(Boolean),

    materials: [
      // アクティブなFlow詳細
      (ctx: NextFlowContext) => flowsToMaterials(ctx.contextAnalysis.flowContext.activeFlows),

      // 締切が近いFlow
      (ctx: NextFlowContext) =>
        ctx.contextAnalysis.flowContext.upcomingDeadlines.length > 0
          ? flowsToMaterials(ctx.contextAnalysis.flowContext.upcomingDeadlines).map((m) => ({
              ...m,
              title: `[締切間近] ${m.title}`,
            }))
          : [],

      // 最近完了したFlow（学習用）
      (ctx: NextFlowContext) =>
        ctx.contextAnalysis.userContext.recentFlows.map((flow) => ({
          type: 'material' as const,
          id: `recent-${flow.id}`,
          title: `最近完了: ${flow.title}`,
          content: `完了日時: ${flow.updatedAt}`,
        })),

      // ユーザーパターン（Knowledge）
      (ctx: NextFlowContext) =>
        ctx.knowledgeBase
          .filter((k) => k.type === 'user_pattern')
          .map((knowledge) => ({
            type: 'material' as const,
            id: `knowledge-${knowledge.id}`,
            title: 'ユーザーパターン',
            content: knowledge.content,
          })),
    ],

    schema: [
      {
        type: 'json',
        content: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              maxItems: 5,
              items: {
                type: 'object',
                properties: {
                  flowId: {
                    type: 'string',
                    description: 'FlowのID',
                  },
                  score: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                    description: '推奨度スコア',
                  },
                  reason: {
                    type: 'string',
                    description: '推奨理由',
                  },
                  matchFactors: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        factor: {
                          type: 'string',
                          enum: ['priority', 'deadline', 'energy_match', 'time_fit', 'context_continuity', 'user_preference', 'dependency'],
                        },
                        score: {
                          type: 'number',
                          minimum: 0,
                          maximum: 1,
                        },
                        description: {
                          type: 'string',
                        },
                      },
                      required: ['factor', 'score', 'description'],
                    },
                  },
                  estimatedDuration: {
                    type: 'number',
                    description: '推定所要時間（分）',
                  },
                  energyRequired: {
                    type: 'string',
                    enum: ['high', 'medium', 'low'],
                  },
                  bestTimeSlot: {
                    type: 'object',
                    properties: {
                      start: { type: 'string' },
                      end: { type: 'string' },
                    },
                  },
                  alternativeIf: {
                    type: 'object',
                    properties: {
                      condition: { type: 'string' },
                      alternativeFlowId: { type: 'string' },
                      reason: { type: 'string' },
                    },
                  },
                  preparationSteps: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
                required: ['flowId', 'score', 'reason', 'matchFactors', 'estimatedDuration', 'energyRequired'],
              },
            },
            contextInsights: {
              type: 'object',
              properties: {
                currentFocus: {
                  type: 'string',
                  description: '現在のフォーカスエリア',
                },
                productivityAdvice: {
                  type: 'string',
                  description: '生産性向上のアドバイス',
                },
                bottleneck: {
                  type: 'string',
                  description: 'ボトルネック（オプション）',
                },
              },
              required: ['currentFocus', 'productivityAdvice'],
            },
            fallbackSuggestion: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: ['take_break', 'review_progress', 'organize_thoughts'],
                },
                reason: {
                  type: 'string',
                },
                duration: {
                  type: 'number',
                  description: '推奨時間（分）',
                },
              },
            },
            // updatedStateはupdateStatePromptModuleから提供される
          },
          required: ['suggestions', 'contextInsights'],
        },
      },
    ],
  }
);