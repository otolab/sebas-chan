/**
 * B-3: UPDATE_FLOW_PRIORITIES プロンプトモジュール
 *
 * AIによる優先度判定のためのプロンプト構築
 * 重要：判断の透明性と説明責任を重視
 *
 * 処理構造（3段階のAI処理）：
 * 1. analyzeIndividualFlow: 各Flowの個別分析（絶対評価）
 * 2. calculateFlowPriorities: 全体の比較と優先付け（相対評価）
 * 3. updateStateDocument: state文書の自然言語更新
 */

import type { AIDriver } from '@moduler-prompt/driver';
import type { PromptModule } from '@moduler-prompt/core';
import type { Flow, Issue } from '@sebas-chan/shared-types';
import { compile, merge } from '@moduler-prompt/core';
import type {
  FlowPriorityUpdate,
  PriorityCalculationResult,
  IndividualFlowAnalysis,
} from './types.js';
import { updateStatePromptModule, type StateContext } from '../shared/prompts/state.js';

/**
 * 優先度判定のコンテキスト
 */
export interface PriorityContext {
  flowAnalysis: Array<{
    flow: Flow;
    issues: Issue[];
    staleness: {
      daysSinceUpdate: number;
      status: string;
    };
    currentPriority: number;
  }>;
  stateDocument: string;
  currentDateTime: Date;
}

/**
 * 優先度判定の結果
 */
interface PriorityResult {
  updates: FlowPriorityUpdate[];
  confidence: number;
  contextQuality: 'good' | 'partial' | 'poor';
  suggestedStateUpdate?: string;
}

/**
 * Flow優先度計算のプロンプトモジュール
 *
 * なぜこの構造か：
 * - objective: システムの目的を明確にし、判断の軸を定める
 * - principles: 「信頼を得る」ための行動原則を明示
 * - instructions: 具体的な判断手順（ただし機械的にならないよう注意）
 * - materials: state文書をそのまま渡す（機械的分解はしない）
 */
export const flowPriorityPromptModule: PromptModule<PriorityContext> = {
  // 今回の作業の目的を明確にする
  // なぜ：AIが何のために判断するのかを理解させる
  objective: [
    '複数のFlowの優先度を評価し、相対的な優先順位を決定する',
    '各Flowの緊急性・重要性・停滞度を総合的に判断する',
    'ユーザーが「今、最も注力すべきFlow」を明確に認識できるようにする',
    // システムの理念（補足）: ユーザーが「安心して忘れる」ことを可能にする
  ],

  // 重要な用語の定義
  // なぜ：Flow、Issue、優先度などの概念を正しく理解させる
  terms: [
    'Flow: 複数のIssueをまとめた作業の流れ',
    'Issue: ユーザーが追跡すべき個別の事項',
    'priorityScore: 0.0〜1.0の値で、1.0が最高優先度',
    'state文書: ユーザーの現在の状況とコンテキスト（そのまま理解する）',
    '停滞: 更新がない状態（放置か熟成かはユーザーが判断）',
  ],

  // 判断の指示
  // 注意：機械的なルールではなく、考慮すべき観点として提示
  instructions: [
    {
      type: 'subsection' as const,
      title: '判断の原則',
      items: [
        'システムは「忘れない」 - 重要なことを確実に思い出させる',
        '勝手に完了しない - ユーザーの確認なしに判断を確定しない',
        '嘘をつかない - 都合の良い情報だけを提示しない',
        '判断の根拠を示す - なぜその優先度なのかを説明できる',
      ],
    },
    {
      type: 'subsection' as const,
      title: '評価の観点',
      items: [
        '以下の観点を総合的に考慮して優先度を判定してください：',
        '',
        '1. 緊急性（Urgency）',
        '   - 期限が迫っているか',
        '   - 他の作業をブロックしているか',
        '   - state文書に「急ぎ」「締切」などの言及があるか',
        '',
        '2. 重要性（Importance）',
        '   - 含まれるIssueの重要度',
        '   - state文書での言及頻度や表現',
        '   - ユーザーの関心の度合い',
        '',
        '3. 停滞度（Staleness）',
        '   - 最終更新からの経過時間',
        '   - ただし「寝かせている」可能性も考慮',
        '   - 確信が持てない場合はユーザーに確認を提案',
        '',
        '4. 現在のコンテキスト',
        '   - state文書の内容を重視',
        '   - ユーザーの状況（体調、気分、環境）を考慮',
        '   - 「自明な判断」を心がける（コンテキストから明らかなこと）',
        '',
        '各Flowについて：',
        '- 新しい優先度スコア（0.0〜1.0）を提案',
        '- 判断の主な理由を説明',
        '- 必要に応じてユーザーへの確認事項を提案',
      ],
    },
  ],

  // 入力情報の提示
  inputs: [
    (ctx) => `現在日時: ${ctx.currentDateTime.toISOString()}`,
    (ctx) => `分析対象Flow数: ${ctx.flowAnalysis.length}`,
    '',
    'Flow一覧:',
    (ctx) =>
      ctx.flowAnalysis
        .map((fa) => {
          // 各Flowの要約情報を提示
          // なぜ：全体像を把握してから詳細を見るため
          return `- ${fa.flow.title} (現在優先度: ${fa.flow.priorityScore}, ${fa.staleness.daysSinceUpdate}日前更新)`;
        })
        .join('\n'),
  ],

  // 詳細情報の提供
  materials: [
    // state文書をそのまま提供
    // なぜ：機械的分解せず、AIが文脈を理解する
    (ctx) => ({
      type: 'material' as const,
      id: 'state-document',
      title: '現在のコンテキスト（state文書）',
      content: ctx.stateDocument,
    }),

    // 各Flowの詳細情報
    // なぜ：優先度判定に必要な全情報を提供
    (ctx) =>
      ctx.flowAnalysis.map((fa) => ({
        type: 'material' as const,
        id: `flow-${fa.flow.id}`,
        title: `Flow: ${fa.flow.title}`,
        content: JSON.stringify(
          {
            id: fa.flow.id,
            description: fa.flow.description,
            status: fa.flow.status,
            currentPriority: fa.flow.priorityScore,
            staleness: fa.staleness,
            issueCount: fa.issues.length,
            issues: fa.issues.map((i) => ({
              title: i.title,
              status: i.status,
              priority: i.priority,
            })),
          },
          null,
          2
        ),
      })),
  ],

  // 出力スキーマ
  // なぜ：構造化された判定結果を得るため
  schema: [
    {
      type: 'json',
      content: {
        type: 'object',
        properties: {
          updates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                flowId: { type: 'string' },
                newPriority: { type: 'number', minimum: 0, maximum: 1 },
                mainFactor: { type: 'string' },
                reasoning: { type: 'string' },
                contextNotes: { type: 'string' },
                userQuery: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    message: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
              required: ['flowId', 'newPriority', 'mainFactor', 'reasoning'],
            },
          },
          overallAssessment: {
            type: 'object',
            properties: {
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              contextQuality: {
                type: 'string',
                enum: ['good', 'partial', 'poor'],
              },
              suggestedFocus: { type: 'string' },
              stateUpdate: { type: 'string' },
            },
            required: ['confidence', 'contextQuality'],
          },
        },
        required: ['updates', 'overallAssessment'],
      },
    },
  ],
};

/**
 * Flow優先度を計算する
 *
 * なぜ必要か：
 * - コンテキストを考慮した柔軟な判断
 * - 判断の透明性と説明責任
 * - ユーザーへの適切な確認事項の生成
 */
export async function calculateFlowPriorities(
  driver: AIDriver,
  flowAnalysis: PriorityContext['flowAnalysis'],
  stateDocument: string
): Promise<PriorityResult> {
  // コンテキストを構築
  // なぜ：AIに必要な全情報を提供
  const context: PriorityContext = {
    flowAnalysis,
    stateDocument,
    currentDateTime: new Date(),
  };

  // プロンプトをコンパイル
  // なぜ：ModulerPromptの構造化されたプロンプト生成
  const compiled = compile(flowPriorityPromptModule, context);

  // AIに判定を依頼
  // なぜ：人間的な判断が必要
  const result = await driver.query(compiled);

  // 結果を解析して返却
  // なぜ：型安全性と後続処理のため
  if (!result.structuredOutput) {
    throw new Error('AI応答から構造化出力を取得できませんでした');
  }
  const parsed = result.structuredOutput as PriorityCalculationResult;

  // FlowPriorityUpdate形式に変換
  const updates: FlowPriorityUpdate[] = parsed.updates.map((update) => {
    // 対応するFlowの現在の優先度を取得
    const currentFlow = flowAnalysis.find((fa) => fa.flow.id === update.flowId);

    return {
      flowId: update.flowId,
      oldPriority: currentFlow?.currentPriority || 0,
      newPriority: update.newPriority,
      explanation: {
        mainFactor: update.mainFactor,
        reasoning: update.reasoning,
        contextNotes: update.contextNotes,
      },
      userQuery: update.userQuery
        ? {
            type: update.userQuery.type as 'confirm_stale' | 'confirm_priority' | 'clarify_context',
            message: update.userQuery.message,
            options: update.userQuery.options,
          }
        : undefined,
    };
  });

  return {
    updates,
    confidence: parsed.overallAssessment.confidence,
    contextQuality: parsed.overallAssessment.contextQuality,
    suggestedStateUpdate: parsed.overallAssessment.stateUpdate,
  };
}

// ========================================
// 以下の関数は2段階AI処理対応で実装
// ========================================

/**
 * 個別Flow分析のコンテキスト
 */
interface IndividualFlowContext extends StateContext {
  flow: Flow;
  issues: Issue[];
  staleness: { daysSinceUpdate: number; status: string };
  currentPriority: number;
  currentDateTime: Date;
}

/**
 * 個別Flow分析のプロンプトモジュール
 */
const individualFlowPromptModule: PromptModule<IndividualFlowContext> = {
  objective: [
    'このFlowの絶対的な重要性と緊急性を評価する',
    '他のFlowとの比較は行わず、このFlow単体での判断を行う',
    'ユーザーが注意を向けるべきかどうかを判定する',
  ],

  instructions: [
    {
      type: 'subsection' as const,
      title: '評価の原則',
      items: [
        '締切や期限がある場合は最優先で考慮',
        '長期間停滞しているものは理由を推測',
        'Issueの内容から実際の影響度を判断',
        'state文書のコンテキストを重視',
      ],
    },
    {
      type: 'subsection' as const,
      title: '評価項目',
      items: [
        '以下の観点からFlowを評価してください：',
        '',
        '1. 絶対的な重要度（0.0-1.0）',
        '   - Issue内容の重要性',
        '   - ビジネスやシステムへの影響',
        '   - state文書での言及',
        '',
        '2. 緊急度レベル',
        '   - critical: 即座の対応が必要',
        '   - high: 数日以内の対応が望ましい',
        '   - medium: 通常の優先度',
        '   - low: 時間があるときに対応',
        '',
        '3. 停滞の影響',
        '   - なぜ停滞しているか',
        '   - 放置のリスク',
        '   - ユーザーの確認が必要か',
      ],
    },
  ],

  inputs: [
    (ctx) => `Flow: ${ctx.flow.title}`,
    (ctx) => `現在の優先度: ${ctx.currentPriority}`,
    (ctx) => `最終更新: ${ctx.staleness.daysSinceUpdate}日前`,
    (ctx) => `停滞状態: ${ctx.staleness.status}`,
    (ctx) => `含まれるIssue数: ${ctx.issues.length}`,
  ],

  materials: [
    (ctx) => ({
      type: 'material' as const,
      id: `flow-detail-${ctx.flow.id}`,
      title: 'Flow詳細',
      content: JSON.stringify(
        {
          id: ctx.flow.id,
          title: ctx.flow.title,
          description: ctx.flow.description,
          status: ctx.flow.status,
          priorityScore: ctx.flow.priorityScore,
        },
        null,
        2
      ),
    }),
    (ctx) => ({
      type: 'material' as const,
      id: `issues-${ctx.flow.id}`,
      title: 'Issues詳細',
      content: JSON.stringify(
        ctx.issues.map((i) => ({
          id: i.id,
          title: i.title,
          status: i.status,
          priority: i.priority,
          description: i.description,
        })),
        null,
        2
      ),
    }),
  ],

  schema: [
    {
      type: 'json',
      content: {
        type: 'object',
        properties: {
          absoluteImportance: { type: 'number', minimum: 0, maximum: 1 },
          urgencyLevel: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
          },
          stalenessImpact: { type: 'string' },
          keyFactors: {
            type: 'array',
            items: { type: 'string' },
          },
          needsUserAttention: { type: 'boolean' },
          analysisConfidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: [
          'absoluteImportance',
          'urgencyLevel',
          'stalenessImpact',
          'keyFactors',
          'needsUserAttention',
          'analysisConfidence',
        ],
      },
    },
  ],
};

/**
 * 第1段階：個別Flowの分析（絶対評価）
 *
 * 各Flowを独立して評価し、絶対的な重要性を判断
 */
export async function analyzeIndividualFlow(
  driver: AIDriver,
  flowAnalysis: {
    flow: Flow;
    issues: Issue[];
    staleness: { daysSinceUpdate: number; status: string };
    currentPriority: number;
  },
  stateDocument: string
): Promise<IndividualFlowAnalysis> {
  const context: IndividualFlowContext = {
    ...flowAnalysis,
    currentState: stateDocument,
    currentDateTime: new Date(),
  };

  // statePromptModuleとマージして、state文書のコンテキストを含める
  const mergedModule = merge(
    { state: updateStatePromptModule.state }, // state表示部分のみ使用
    individualFlowPromptModule
  );

  const compiled = compile(mergedModule, context);
  const result = await driver.query(compiled);

  if (!result.structuredOutput) {
    throw new Error('AI応答から構造化出力を取得できませんでした（個別Flow分析）');
  }

  // flowIdは元のコンテキストから取得して付加
  return {
    flowId: flowAnalysis.flow.id,
    ...(result.structuredOutput as Omit<IndividualFlowAnalysis, 'flowId'>),
  } as IndividualFlowAnalysis;
}

/**
 * state文書更新のコンテキスト
 */
interface StateUpdateContext {
  priorityUpdates: FlowPriorityUpdate[];
  userConfirmations: Array<{ flowId: string; message: string }>;
  flowAnalysis: Array<{
    flow: Flow;
    issues: Issue[];
    staleness: { daysSinceUpdate: number; status: string };
    currentPriority: number;
  }>;
  timestamp: Date;
}

/**
 * state文書更新用のプロンプトモジュール
 */
const stateUpdatePromptModule: PromptModule<StateUpdateContext & StateContext> = {
  objective: [
    '優先度判定の結果をstate文書に反映する',
    'ユーザーが理解しやすい形で状況をまとめる',
    '次のアクションを明確にする',
  ],

  instructions: [
    {
      type: 'subsection' as const,
      title: '更新内容',
      items: [
        '以下の情報をstate文書に統合してください：',
        '',
        '1. 優先度の変更内容',
        '   - 大きく変化したFlowとその理由',
        '   - 現在の最優先事項',
        '',
        '2. ユーザーへの確認事項',
        '   - 停滞しているFlowの扱い',
        '   - 判断に迷う点',
        '',
        '3. 状況サマリー',
        '   - 全体的な状況',
        '   - 注目すべき変化',
        '',
        '4. 推奨アクション',
        '   - 今すぐ取り組むべきこと',
        '   - 近日中に確認すべきこと',
      ],
    },
  ],

  inputs: [
    (ctx) => `更新日時: ${ctx.timestamp.toISOString()}`,
    (ctx) => `優先度変更: ${ctx.priorityUpdates.length}件`,
    (ctx) => `確認事項: ${ctx.userConfirmations.length}件`,
  ],

  materials: [
    (ctx) => ({
      type: 'material' as const,
      id: 'priority-updates',
      title: '優先度更新内容',
      content: JSON.stringify(
        ctx.priorityUpdates.map((u) => ({
          flowId: u.flowId,
          change: `${u.oldPriority.toFixed(2)} → ${u.newPriority.toFixed(2)}`,
          reason: u.explanation.mainFactor,
          details: u.explanation.reasoning,
        })),
        null,
        2
      ),
    }),
    (ctx) => ({
      type: 'material' as const,
      id: 'user-confirmations',
      title: 'ユーザー確認事項',
      content: JSON.stringify(ctx.userConfirmations, null, 2),
    }),
    (ctx) => ({
      type: 'material' as const,
      id: 'flow-overview',
      title: 'Flow概要',
      content: JSON.stringify(
        ctx.flowAnalysis.map((fa) => ({
          title: fa.flow.title,
          status: fa.flow.status,
          priority: fa.flow.priorityScore,
          staleness: `${fa.staleness.daysSinceUpdate}日前更新`,
        })),
        null,
        2
      ),
    }),
  ],
};

/**
 * 第3段階：state文書の自然言語更新
 *
 * 優先度判定結果を自然な文章でstate文書に統合
 */
export async function updateStateDocument(
  driver: AIDriver,
  currentState: string,
  updateContext: StateUpdateContext
): Promise<string> {
  const context = {
    ...updateContext,
    currentState,
  };

  // updateStatePromptModuleとマージして、state更新機能を活用
  const mergedModule = merge(updateStatePromptModule, stateUpdatePromptModule);

  const compiled = compile(mergedModule, context);
  const result = await driver.query(compiled);

  if (!result.structuredOutput) {
    throw new Error('AI応答から構造化出力を取得できませんでした（state文書更新）');
  }

  const parsed = result.structuredOutput as { updatedState: string };
  return parsed.updatedState;
}
