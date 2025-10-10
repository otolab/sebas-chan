/**
 * B-2: UPDATE_FLOW_RELATIONS ワークフローのプロンプトモジュール
 */

import type { PromptModule } from '@moduler-prompt/core';
import type { FlowAnalysis } from './actions.js';
import { merge } from '@moduler-prompt/core';
import { updateStatePromptModule, type StateContext } from '../shared/prompts/state.js';
import { issuesToMaterials } from '../shared/material-utils.js';

/**
 * Flow関係性分析のコンテキスト
 */
interface FlowRelationContext extends StateContext {
  flowAnalysis: FlowAnalysis[];
  recentChanges: string[];
  knowledgeBase: any[];
}

/**
 * Flow分析データをMaterialElementに変換
 */
function flowAnalysisToMaterial(analysis: FlowAnalysis) {
  return {
    type: 'material' as const,
    id: `flow-analysis-${analysis.flow.id}`,
    title: `Flow分析: ${analysis.flow.title}`,
    content: [
      `ID: ${analysis.flow.id}`,
      `タイトル: ${analysis.flow.title}`,
      `説明: ${analysis.flow.description}`,
      `健全性: ${(analysis.flow as any).health || 'unknown'}`,
      `優先度スコア: ${analysis.flow.priorityScore}`,
      `Issue数: ${analysis.issues.length}`,
      `完了率: ${analysis.completionRate}%`,
      `停滞期間: ${analysis.staleness}日`,
      `最終更新: ${analysis.flow.updatedAt}`,
    ].join('\n'),
  };
}

/**
 * Flow関係性分析プロンプトモジュール
 */
export const flowRelationPromptModule: PromptModule<FlowRelationContext> = merge(
  updateStatePromptModule,
  {
    objective: ['Flow間の関係性を分析し、更新の必要性を判定する'],

    terms: [
      'Flow: Issueに「観点」を与えて位置づけるもの',
      '健全性(health): Flowの現在の状態評価',
      '観点(perspective): Flowがどのような視点でIssueをまとめているか',
      '関係性(relationships): Issue間やFlow間の相互関係',
    ],

    instructions: [
      '以下を評価してください：',
      '1. 各Flowの健全性（health）',
      '  - healthy: 正常に機能している',
      '  - needs_attention: 注意が必要',
      '  - stale: 停滞している',
      '  - obsolete: 役割を終えた',
      '2. 観点（perspective）の妥当性',
      '  - 現在も有効か',
      '  - 更新が必要か',
      '3. Issue間の関係性',
      '  - 依存関係',
      '  - 順序関係',
      '  - グループ化の妥当性',
      '4. 必要な変更の提案',
      '  - Issue追加/削除',
      '  - Flow分割/統合',
      '  - アーカイブ',
    ],

    inputs: [
      (ctx: FlowRelationContext) => `分析対象Flow数: ${ctx.flowAnalysis.length}`,
      '',
      'Flows:',
      (ctx: FlowRelationContext) =>
        ctx.flowAnalysis
          .map(
            (f: FlowAnalysis) =>
              `- ${f.flow.id}: ${f.flow.title} (完了率: ${f.completionRate}%, 停滞: ${f.staleness}日)`
          )
          .join('\n'),
      '',
      (ctx: FlowRelationContext) =>
        ctx.recentChanges.length > 0
          ? `最近の変更Issue: ${ctx.recentChanges.join(', ')}`
          : '最近の変更なし',
    ],

    materials: [
      // Flow分析情報
      (ctx: FlowRelationContext) => ctx.flowAnalysis.map(flowAnalysisToMaterial),

      // 各Flowに関連するIssueの詳細
      (ctx: FlowRelationContext) =>
        ctx.flowAnalysis.flatMap((analysis: FlowAnalysis) =>
          issuesToMaterials(analysis.issues).map((material) => ({
            ...material,
            title: `${material.title} (Flow: ${analysis.flow.id})`,
          }))
        ),
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
                  flowId: {
                    type: 'string',
                    description: 'FlowのID',
                  },
                  health: {
                    type: 'string',
                    enum: ['healthy', 'needs_attention', 'stale', 'obsolete'],
                    description: 'Flowの健全性評価',
                  },
                  perspectiveValidity: {
                    type: 'object',
                    properties: {
                      stillValid: {
                        type: 'boolean',
                        description: '観点がまだ有効か',
                      },
                      reason: {
                        type: 'string',
                        description: '判定理由',
                      },
                      suggestedUpdate: {
                        type: 'string',
                        description: '提案する観点の更新内容（オプション）',
                      },
                    },
                    required: ['stillValid', 'reason'],
                  },
                  relationships: {
                    type: 'string',
                    description: 'Issue間の関係性の自然言語記述',
                  },
                  suggestedChanges: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        action: {
                          type: 'string',
                          enum: [
                            'remove_issue',
                            'add_issue',
                            'split_flow',
                            'merge_flow',
                            'archive_flow',
                          ],
                          description: '提案するアクション',
                        },
                        target: {
                          type: 'string',
                          description: '対象のID（IssueIDまたはFlowID）',
                        },
                        rationale: {
                          type: 'string',
                          description: '提案の理由',
                        },
                      },
                      required: ['action', 'target', 'rationale'],
                    },
                  },
                },
                required: [
                  'flowId',
                  'health',
                  'perspectiveValidity',
                  'relationships',
                  'suggestedChanges',
                ],
              },
            },
            // updatedStateはupdateStatePromptModuleから提供される
          },
          required: ['flowUpdates'],
        },
      },
    ],
  }
);
