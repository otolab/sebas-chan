/**
 * ProcessUserRequestワークフロー用プロンプトモジュール定義
 */

import { merge, type PromptModule } from '@moduler-prompt/core';
import type { Issue, Knowledge, PondEntry } from '@sebas-chan/shared-types';
import { updateStatePromptModule } from '../shared/prompts/state.js';
import { REQUEST_TYPE, ACTION_TYPE } from '../shared/constants.js';

/**
 * リクエスト分析用コンテキストの型定義
 */
export interface RequestAnalysisContext {
  content: string | undefined;
  relatedIssues: Issue[];
  relatedKnowledge: Knowledge[];
  relatedPondEntries: PondEntry[];
  currentState: string;  // statePromptModuleと統合
}

/**
 * 出力スキーマ定義
 */
const outputSchema = {
  type: 'object',
  properties: {
    interpretation: {
      type: 'string' as const,
      description: 'リクエストの解釈'
    },
    requestType: {
      type: 'string' as const,
      enum: Object.values(REQUEST_TYPE),
      description: 'リクエストの分類'
    },
    events: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          type: { type: 'string' as const },
          payload: { type: 'object' as const }
        },
        required: ['type', 'payload']
      },
      description: '発行するイベント'
    },
    actions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          type: { type: 'string' as const, enum: Object.values(ACTION_TYPE) },
          target: { type: 'string' as const },
          details: { type: 'object' as const }
        },
        required: ['type', 'target']
      },
      description: '実行するアクション'
    },
    response: {
      type: 'string' as const,
      description: 'ユーザーへの応答'
    },
    reasoning: {
      type: 'string' as const,
      description: '判断理由'
    },
    // updatedStateはupdateStatePromptModuleから自動的に提供される
  },
  required: ['interpretation', 'requestType', 'events', 'actions', 'response', 'reasoning']
} as const;

/**
 * 利用可能なイベントタイプ定義
 */
const availableEventTypes = [
  '- DATA_ARRIVED: 外部データ到着（Pond自動保存）',
  '- ISSUE_CREATED: 新Issue作成',
  '- ISSUE_UPDATED: Issue更新',
  '- ISSUE_STATUS_CHANGED: Issueステータス変更',
  '- ERROR_DETECTED: エラー検出',
  '- PATTERN_FOUND: パターン発見',
  '- KNOWLEDGE_EXTRACTABLE: 知識抽出可能',
  '- HIGH_PRIORITY_DETECTED: 高優先度検出',
  '- SCHEDULE_TRIGGERED: スケジュール実行',
].join('\n');

/**
 * アクションタイプ定義
 */
const actionTypes = [
  '- create: 新規作成（issue/knowledge/pond）',
  '- update: 更新（issue/knowledge）',
  '- search: 検索（issue/knowledge/pond）'
].join('\n');

/**
 * ProcessUserRequestワークフローのプロンプトモジュール
 */
const baseProcessUserRequestModule: PromptModule<RequestAnalysisContext> = {
  createContext: () => ({
    content: undefined,
    relatedIssues: [] as Issue[],
    relatedKnowledge: [] as Knowledge[],
    relatedPondEntries: [] as PondEntry[],
    currentState: ''
  }),

  // objective: instructions大セクションに分類
  objective: [
    'ユーザーリクエストを分析し、適切なアクションとイベントを決定する'
  ],

  // terms: instructions大セクションに分類
  terms: [
    'Issue: ユーザーに代わってAIが追跡・管理すべき事項',
    'Pond: 一時的なデータ保管場所',
    'Knowledge: 抽出された知識・ノウハウ',
    'リクエストタイプ: issue（追跡事項）、schedule（スケジュール）、search（検索）、question（質問）、action（アクション）、feedback（フィードバック）、other（その他）'
  ],

  // instructions標準セクション: instructions大セクションに分類
  instructions: [
    '以下の項目を判定してください：',
    '1. リクエストの内容を解釈し、ユーザーの意図を明確化',
    '2. リクエストタイプを分類',
    '3. 発行すべきイベントを選択（複数可）',
    '4. 実行すべきアクションを決定',
    '5. ユーザーへの応答メッセージを生成',
    '',
    'JSON形式で応答してください。'
  ],

  // materials: data大セクションに分類（参考情報）
  materials: [
    // 既存Issues
    (ctx: RequestAnalysisContext) =>
      ctx.relatedIssues.map((issue) => ({
        type: 'material' as const,
        id: `issue-${issue.id}`,
        title: `既存Issue: ${issue.title}`,
        content: [
          `ID: ${issue.id}`,
          `ステータス: ${issue.status}`,
          `優先度: ${issue.priority || '未設定'}`,
          `ラベル: ${issue.labels.join(', ') || 'なし'}`,
        ].join('\n'),
      })),

    // 関連Knowledge
    (ctx: RequestAnalysisContext) =>
      ctx.relatedKnowledge.map((knowledge) => ({
        type: 'material' as const,
        id: `knowledge-${knowledge.id}`,
        title: `関連Knowledge: ${knowledge.type}`,
        content: knowledge.content,
      })),

    // 関連Pondエントリ
    (ctx: RequestAnalysisContext) =>
      ctx.relatedPondEntries.map((entry) => ({
        type: 'material' as const,
        id: `pond-${entry.id}`,
        title: `Pondエントリ: ${entry.metadata?.source || 'unknown'}`,
        content: entry.content,
      })),

    // イベントタイプとアクションタイプ
    {
      type: 'material' as const,
      id: 'event-types',
      title: '利用可能なイベントタイプ',
      content: availableEventTypes,
    },
    {
      type: 'material' as const,
      id: 'action-types',
      title: 'アクションタイプ',
      content: actionTypes,
    },
  ],

  // inputs: data大セクションに分類（動的データ）
  inputs: [
    (ctx: RequestAnalysisContext) => `ユーザーリクエスト: ${ctx.content || '（内容なし）'}`,
  ],

  // schemaセクション（output大セクションに分類）
  schema: [
    {
      type: 'json',
      content: outputSchema
    }
  ]
};

/**
 * updateStatePromptModuleと統合したProcessUserRequestプロンプトモジュール
 *
 * 設計意図:
 * - merge関数を活用して機能を統合（重複を避ける）
 * - updateStatePromptModuleは以下を提供:
 *   - statePromptModuleの機能（現在の状態表示）
 *   - State更新のinstructions
 *   - updatedStateフィールドのschema定義
 * - これにより1回のAI呼び出しで分析とState更新を同時に実行可能
 *
 * 重要: updateStatePromptModuleが既にstatePromptModuleを含んでいるため、
 *       statePromptModuleを別途マージする必要はない
 */
export const processUserRequestPromptModule = merge(
  updateStatePromptModule,
  baseProcessUserRequestModule
);