/**
 * AnalyzeIssueImpactワークフロー用プロンプトモジュール定義
 */

import { type PromptModule, merge } from '@moduler-prompt/core';
import type { Issue } from '@sebas-chan/shared-types';
import { updateStatePromptModule } from '../shared/prompts/state.js';

/**
 * 分析用コンテキストの型定義
 */
export interface ImpactAnalysisContext {
  issue: Issue;
  otherRelatedIssues: Issue[];
  currentState: string; // statePromptModuleのContextインターフェースに合わせる
}

/**
 * 影響分析の出力スキーマ
 * 注: updatedStateはupdateStatePromptModuleから自動的に提供される
 */
const impactAnalysisOutputSchema = {
  type: 'object' as const,
  properties: {
    shouldClose: { type: 'boolean' as const },
    closeReason: { type: 'string' as const },
    suggestedPriority: { type: 'number' as const, minimum: 0, maximum: 100 },
    shouldMergeWith: {
      type: 'array' as const,
      items: { type: 'string' as const },
    },
    impactedComponents: {
      type: 'array' as const,
      items: { type: 'string' as const },
    },
    hasKnowledge: { type: 'boolean' as const },
    knowledgeSummary: { type: 'string' as const },
    impactScore: { type: 'number' as const, minimum: 0, maximum: 1 },
    // updatedStateはupdateStatePromptModuleのスキーマで定義済み
  },
  required: [
    'shouldClose',
    'suggestedPriority',
    'shouldMergeWith',
    'impactedComponents',
    'hasKnowledge',
    'impactScore',
    // 'updatedState'はupdateStatePromptModuleのrequiredに含まれる
  ],
} as const;

/**
 * 基本のAnalyzeImpactプロンプトモジュール
 */
const baseAnalyzeImpactModule: PromptModule<ImpactAnalysisContext> = {
  createContext: () => ({
    issue: {} as Issue,
    otherRelatedIssues: [],
    currentState: '',
  }),

  // objective: AIの目的と役割
  objective: ['Issueの現在の状態を分析し、必要なアクションを判定する'],

  // terms: 用語定義
  terms: [
    'Issue: 解決すべき問題やタスク',
    'close判定: Issueが解決済みかどうかの判定',
    '優先度: タスクの緊急度（0-100）',
    '影響範囲: 問題が影響するコンポーネントやシステム部分',
  ],

  // instructions: 具体的な処理指示
  instructions: [
    '以下の分析を実施してください：',
    '1. このIssueは解決可能な状態か（close判定）',
    '2. 優先度の見直しが必要か',
    '3. 他のIssueとの統合が必要か',
    '4. 影響範囲とコンポーネント',
    '5. 知識として抽出すべき内容があるか',
    '',
    'JSON形式で応答してください。',
  ],

  // inputs: コンテキストに基づく入力情報
  inputs: [
    (ctx: ImpactAnalysisContext) =>
      [
        `## 現在のIssue情報`,
        `- Issue ID: ${ctx.issue.id}`,
        `- タイトル: ${ctx.issue.title}`,
        `- 現在のステータス: ${ctx.issue.status}`,
        `- ラベル: ${ctx.issue.labels.join(', ') || 'なし'}`,
        `- 優先度: ${ctx.issue.priority || '未設定'}`,
        `- 更新回数: ${ctx.issue.updates.length}`,
        `- 説明: ${ctx.issue.description}`,
        ``,
        `## 最新の更新`,
        ...ctx.issue.updates.slice(-3).map((u) => `  - ${u.timestamp}: ${u.content}`),
      ].join('\n'),
  ],

  // materials: 関連Issueを参考資料として提供
  materials: [
    (ctx: ImpactAnalysisContext) =>
      ctx.otherRelatedIssues.map((issue) => ({
        type: 'material' as const,
        id: `issue-${issue.id}`,
        title: `関連Issue: ${issue.title}`,
        content: [
          `ID: ${issue.id}`,
          `ステータス: ${issue.status}`,
          `優先度: ${issue.priority || '未設定'}`,
          `ラベル: ${issue.labels.join(', ') || 'なし'}`,
          `説明: ${issue.description}`,
        ].join('\n'),
      })),
  ],

  // schema: 出力形式の定義（JSON形式）
  schema: [
    {
      type: 'json',
      content: impactAnalysisOutputSchema,
    },
  ],
};

/**
 * updateStatePromptModuleと統合したAnalyzeImpactプロンプトモジュール
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
export const analyzeImpactPromptModule = merge(updateStatePromptModule, baseAnalyzeImpactModule);
