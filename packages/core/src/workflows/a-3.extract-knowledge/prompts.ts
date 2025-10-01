/**
 * ExtractKnowledgeワークフロー用プロンプトモジュール定義
 */

import { merge, type PromptModule } from '@moduler-prompt/core';
import type { Knowledge } from '@sebas-chan/shared-types';
import { updateStatePromptModule } from '../shared/prompts/state.js';

/**
 * 知識抽出用コンテキストの型定義
 */
export interface KnowledgeExtractionContext {
  sourceType: string;
  confidence: number;
  content: string;
  existingKnowledge: Knowledge[];
  currentState: string;  // statePromptModuleと統合
}

/**
 * 出力スキーマ定義
 */
const outputSchema = {
  type: 'object',
  properties: {
    extractedKnowledge: {
      type: 'string' as const,
      description: '抽出された知識の内容'
    },
    // updatedStateはupdateStatePromptModuleから自動的に提供される
  },
  required: ['extractedKnowledge']
} as const;

/**
 * ExtractKnowledgeワークフローのプロンプトモジュール
 */
const baseExtractKnowledgeModule: PromptModule<KnowledgeExtractionContext> = {
    createContext: () => ({
      sourceType: '',
      confidence: 0.5,
      content: '',
      existingKnowledge: [] as Knowledge[],
      currentState: ''
    }),

    // objective: instructions大セクションに分類
    objective: [
      '- 情報から再利用可能な知識を抽出し、構造化する'
    ],

    // terms: instructions大セクションに分類
    terms: [
      '- 知識: 再利用可能な情報やノウハウ',
      '- ベストプラクティス: 推奨される方法や手順',
      '- 解決方法: 問題に対する具体的な対処法'
    ],

    // instructions標準セクション: instructions大セクションに分類
    instructions: [
      '以下の形式で知識を抽出してください：',
      '1. 問題の概要',
      '2. 解決方法またはベストプラクティス',
      '3. 適用可能な状況',
      '4. 注意点',
      '',
      '簡潔にまとめてください。'
    ],

    // materials: data大セクションに分類（参考情報）
    materials: [
      (ctx: KnowledgeExtractionContext) =>
        ctx.existingKnowledge.map((knowledge) => ({
          type: 'material' as const,
          id: `knowledge-${knowledge.id}`,
          title: `既存の知識: ${knowledge.type}`,
          content: knowledge.content,
        })),
    ],

    // inputs: data大セクションに分類（動的データ）
    inputs: [
      (ctx: KnowledgeExtractionContext) => `ソースタイプ: ${ctx.sourceType}`,
      (ctx: KnowledgeExtractionContext) => `信頼度: ${ctx.confidence}`,
      '',
      '内容:',

      >>> 省略しない

      (ctx: KnowledgeExtractionContext) => {
        const lines = ctx.content.split('\n').slice(0, 20);
        return lines.length > 20 ? [...lines, '...'] : lines;
      }
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
 * updateStatePromptModuleと統合したExtractKnowledgeプロンプトモジュール
 *
 * 設計意図:
 * - merge関数を活用して機能を統合（重複を避ける）
 * - updateStatePromptModuleは以下を提供:
 *   - statePromptModuleの機能（現在の状態表示）
 *   - State更新のinstructions
 *   - updatedStateフィールドのschema定義
 * - これにより1回のAI呼び出しで知識抽出とState更新を同時に実行可能
 */
export const extractKnowledgePromptModule = merge(
  updateStatePromptModule, // TODO: これが必要かは要検討
  baseExtractKnowledgeModule
);