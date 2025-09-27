/**
 * AnalyzeIssueImpactワークフロー用プロンプトモジュール定義
 */

import type { PromptModule } from '@moduler-prompt/core';
import type { Issue } from '@sebas-chan/shared-types';

/**
 * 分析用コンテキストの型定義
 */
export interface ImpactAnalysisContext {
  issue: Issue;
  otherRelatedIssues: Issue[];
}

/**
 * AnalyzeIssueImpactワークフローのプロンプトモジュール
 */
export const analyzeImpactPromptModule: PromptModule<ImpactAnalysisContext> = {
  createContext: () => ({
    issue: {} as Issue,
    otherRelatedIssues: []
  }),

  // objective: instructions大セクションに分類
  objective: [
    'Issueの現在の状態を分析し、必要なアクションを判定する'
  ],

  // terms: instructions大セクションに分類
  terms: [
    'Issue: 解決すべき問題やタスク',
    'close判定: Issueが解決済みかどうかの判定',
    '優先度: タスクの緊急度（0-100）',
    '影響範囲: 問題が影響するコンポーネントやシステム部分'
  ],

  // instructions標準セクション: instructions大セクションに分類
  instructions: [
    '以下の分析を実施してください：',
    '1. このIssueは解決可能な状態か（close判定）',
    '2. 優先度の見直しが必要か',
    '3. 他のIssueとの統合が必要か',
    '4. 影響範囲とコンポーネント',
    '5. 知識として抽出すべき内容があるか',
    '',
    'JSON形式で応答してください。'
  ],

  // inputs: data大セクションに分類（動的データ）
  inputs: [
    (ctx: ImpactAnalysisContext) => `Issue ID: ${ctx.issue.id}`,
    (ctx: ImpactAnalysisContext) => `タイトル: ${ctx.issue.title}`,
    (ctx: ImpactAnalysisContext) => `説明: ${ctx.issue.description}`,
    (ctx: ImpactAnalysisContext) => `現在のステータス: ${ctx.issue.status}`,
    (ctx: ImpactAnalysisContext) => `ラベル: ${ctx.issue.labels.join(', ') || 'なし'}`,
    (ctx: ImpactAnalysisContext) => `優先度: ${ctx.issue.priority || '未設定'}`,
    (ctx: ImpactAnalysisContext) => `更新回数: ${ctx.issue.updates.length}`,
    '',
    (ctx: ImpactAnalysisContext) => `関連Issue数: ${ctx.otherRelatedIssues.length}`,
    (ctx: ImpactAnalysisContext) => ctx.otherRelatedIssues.slice(0, 5).map(i =>
      `  - [${i.id}] ${i.title} (status: ${i.status})`
    ),
    '',
    '最新の更新:',
    (ctx: ImpactAnalysisContext) => ctx.issue.updates.slice(-3).map(u =>
      `  - ${u.timestamp}: ${u.content.substring(0, 100)}...`
    )
  ],

  // output: output大セクションに分類
  output: {
    schema: {
    type: 'object',
    properties: {
      shouldClose: { type: 'boolean' },
      closeReason: { type: 'string' },
      suggestedPriority: { type: 'number', minimum: 0, maximum: 100 },
      shouldMergeWith: {
        type: 'array',
        items: { type: 'string' }
      },
      impactedComponents: {
        type: 'array',
        items: { type: 'string' }
      },
      hasKnowledge: { type: 'boolean' },
      knowledgeSummary: { type: 'string' },
      impactScore: { type: 'number', minimum: 0, maximum: 1 }
    },
    required: ['shouldClose', 'suggestedPriority', 'shouldMergeWith', 'impactedComponents', 'hasKnowledge', 'impactScore']
    }
  }
};