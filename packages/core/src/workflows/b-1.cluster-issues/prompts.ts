/**
 * B-1: CLUSTER_ISSUES ワークフローのプロンプトモジュール
 */

import type { PromptModule } from '@moduler-prompt/core';
import type { Issue, Flow } from '@sebas-chan/shared-types';
import { merge } from '@moduler-prompt/core';
import { updateStatePromptModule, type StateContext } from '../shared/prompts/state.js';
import { issuesToMaterials, flowsToMaterials } from '../shared/material-utils.js';

/**
 * クラスタリング分析のコンテキスト
 */
interface ClusteringContext extends StateContext {
  issues: Issue[];
  existingFlows: Flow[];
  timestamp: Date;
}

/**
 * クラスタリング分析プロンプトモジュール
 */
export const clusteringPromptModule: PromptModule<ClusteringContext> = merge(
  updateStatePromptModule,
  {
    objective: ['関連するIssueをグループ化し、Flowの観点を発見する'],

    terms: [
      'Flow: Issueに「観点」を与えて位置づけるもの',
      'クラスタ: 関連性の高いIssue群',
      '観点: Issueをまとめる視点（プロジェクト、時間、テーマ、依存関係等）',
    ],

    instructions: [
      '以下の分析を実施してください：',
      '1. Issue間の関連性を判定',
      '2. グループ化の観点を発見',
      '3. 各グループ内の関係性を自然言語で記述',
      '4. Flow作成の必要性を判断',
      '',
      '観点の種類:',
      '- project: プロジェクトや目標ベース',
      '- temporal: 時間軸ベース（日次、週次、期限など）',
      '- thematic: テーマやトピックベース',
      '- dependency: 依存関係ベース',
    ],

    inputs: [
      (ctx: ClusteringContext) => `分析対象Issue数: ${ctx.issues.length}件`,
      (ctx: ClusteringContext) => `既存Flow数: ${ctx.existingFlows.length}件`,
      (ctx: ClusteringContext) => `分析日時: ${ctx.timestamp.toISOString()}`,
      '',
      '分析の目的:',
      '- 関連するIssueを発見してグルーピング',
      '- 各グループに対する「観点」の発見',
      '- Flow作成の必要性判断',
    ],

    materials: [
      // 分析対象のIssue詳細
      (ctx: ClusteringContext) => issuesToMaterials(ctx.issues),
      // 既存Flow情報
      (ctx: ClusteringContext) => flowsToMaterials(ctx.existingFlows),
    ],

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
                  id: {
                    type: 'string',
                    description: 'クラスタの一意識別子',
                  },
                  perspective: {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['project', 'temporal', 'thematic', 'dependency'],
                        description: '観点のタイプ',
                      },
                      title: {
                        type: 'string',
                        description: '観点のタイトル',
                      },
                      description: {
                        type: 'string',
                        description: '観点の詳細説明（自然言語）',
                      },
                      query: {
                        type: 'string',
                        description: 'この観点でIssueを検索するためのクエリ（オプション）',
                      },
                    },
                    required: ['type', 'title', 'description'],
                  },
                  issueIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'このクラスタに属するIssueのID群',
                  },
                  relationships: {
                    type: 'string',
                    description: 'Issue間の関係性の自然言語記述',
                  },
                  commonPatterns: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '共通パターンや特徴',
                  },
                  suggestedPriority: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                    description: '提案する優先度スコア',
                  },
                  completionCriteria: {
                    type: 'string',
                    description: 'このグループの完了条件（オプション）',
                  },
                },
                required: ['id', 'perspective', 'issueIds', 'relationships', 'commonPatterns', 'suggestedPriority'],
              },
            },
            insights: {
              type: 'array',
              items: { type: 'string' },
              description: '分析から得られた洞察',
            },
            unclustered: {
              type: 'array',
              items: { type: 'string' },
              description: 'どのクラスタにも属さないIssueのID',
            },
            // updatedStateはupdateStatePromptModuleから提供される
          },
          required: ['clusters', 'insights', 'unclustered'],
        },
      },
    ],
  }
);