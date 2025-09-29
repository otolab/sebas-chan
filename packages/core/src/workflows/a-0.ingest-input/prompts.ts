/**
 * IngestInputワークフロー用プロンプトモジュール定義
 */

import { merge, type PromptModule } from '@moduler-prompt/core';
import type { Issue } from '@sebas-chan/shared-types';
import { updateStatePromptModule } from '../shared/prompts/state.js';

/**
 * 入力分析用コンテキストの型定義
 */
export interface InputAnalysisContext {
  source: string;
  format: string | undefined;
  content: string;
  relatedIssues: Issue[];
  currentState: string;  // statePromptModuleと統合
}

/**
 * 出力スキーマ定義
 */
const outputSchema = {
  type: 'object',
  properties: {
    relatedIssueIds: {
      type: 'array' as const,
      items: { type: 'string' as const }
    },
    needsNewIssue: { type: 'boolean' as const },
    newIssueTitle: { type: 'string' as const },
    severity: {
      type: 'string' as const,
      enum: ['critical', 'high', 'medium', 'low']
    },
    updateContent: { type: 'string' as const },
    labels: {
      type: 'array' as const,
      items: { type: 'string' as const }
    },
    // updatedStateはupdateStatePromptModuleから自動的に提供される
  },
  required: ['relatedIssueIds', 'needsNewIssue', 'severity', 'labels']
} as const;

/**
 * IngestInputワークフローのプロンプトモジュール
 */
const baseIngestInputModule: PromptModule<InputAnalysisContext> = {
    createContext: () => ({
      source: '',
      format: undefined as string | undefined,
      content: '',
      relatedIssues: [] as Issue[],
      currentState: ''
    }),

  // objective: instructions大セクションに分類
  objective: [
    'データを分析し、既存Issueとの関連性と処理方法を判定する'
  ],

  // terms: instructions大セクションに分類
  terms: [
    'Issue: 解決すべき問題やタスク',
    '深刻度: critical（致命的）、high（高）、medium（中）、low（低）',
    'ラベル: Issueを分類するためのタグ'
  ],

  // instructions標準セクション: instructions大セクションに分類
  instructions: [
    '以下を判定してください：',
    '1. 既存Issueとの関連性（どのIssueに情報を追加すべきか）',
    '2. 新規Issueの必要性（既存で対応できない場合）',
    '3. 問題の深刻度・優先度',
    '4. 適用すべきラベル',
    '',
    'JSON形式で応答してください。'
  ],

  // materials: data大セクションに分類（参考情報）
  materials: [
    (ctx: InputAnalysisContext) =>
      ctx.relatedIssues.map((issue) => ({
        type: 'material' as const,
        id: `issue-${issue.id}`,
        title: `既存Issue: ${issue.title}`,
        content: [
          `ID: ${issue.id}`,
          `ステータス: ${issue.status}`,
          `優先度: ${issue.priority || '未設定'}`,
          `ラベル: ${issue.labels.join(', ') || 'なし'}`,
          `説明: ${issue.description}`,
        ].join('\n'),
      })),
  ],

  // inputs: data大セクションに分類（動的データ）
  inputs: [
    (ctx: InputAnalysisContext) => `データソース: ${ctx.source}`,
    (ctx: InputAnalysisContext) => `データ形式: ${ctx.format || '不明'}`,
    '',
    '内容:',
    (ctx: InputAnalysisContext) => ctx.content.split('\n').map(line => `  ${line}`)
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
 * updateStatePromptModuleと統合したIngestInputプロンプトモジュール
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
export const ingestInputPromptModule = merge(
  updateStatePromptModule,
  baseIngestInputModule
);