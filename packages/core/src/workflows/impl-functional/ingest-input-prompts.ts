/**
 * IngestInputワークフロー用プロンプトモジュール定義
 */

import type { PromptModule } from '@moduler-prompt/core';
import type { Issue } from '@sebas-chan/shared-types';

/**
 * 入力分析用コンテキストの型定義
 */
export interface InputAnalysisContext {
  source: string;
  format: string | undefined;
  content: string;
  relatedIssues: Issue[];
}

/**
 * IngestInputワークフローのプロンプトモジュール
 */
export const ingestInputPromptModule: PromptModule<InputAnalysisContext> = {
  createContext: () => ({
    source: '',
    format: undefined,
    content: '',
    relatedIssues: []
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

  // inputs: data大セクションに分類（動的データ）
  inputs: [
    (ctx: InputAnalysisContext) => `データソース: ${ctx.source}`,
    (ctx: InputAnalysisContext) => `データ形式: ${ctx.format || '不明'}`,
    '',
    '内容:',
    (ctx: InputAnalysisContext) => {
      const lines = ctx.content.split('\n').slice(0, 10);
      return lines.map(line => `  ${line}`);
    },
    (ctx: InputAnalysisContext) => ctx.content.split('\n').length > 10 ? '  ...' : ''
  ],

  // materials: data大セクションに分類（参考情報）
  materials: [
    (ctx: InputAnalysisContext) => `既存のIssue (${ctx.relatedIssues.length}件):`,
    (ctx: InputAnalysisContext) => ctx.relatedIssues.slice(0, 10).map(issue =>
      `  - [${issue.id}] ${issue.title} (status: ${issue.status})`
    ),
    (ctx: InputAnalysisContext) => ctx.relatedIssues.length > 10 ? '  ...' : ''
  ],

  // output: output大セクションに分類
  output: {
    schema: {
      type: 'object',
      properties: {
        relatedIssueIds: {
          type: 'array',
          items: { type: 'string' }
        },
        needsNewIssue: { type: 'boolean' },
        newIssueTitle: { type: 'string' },
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low']
        },
        updateContent: { type: 'string' },
        labels: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['relatedIssueIds', 'needsNewIssue', 'severity', 'labels']
    }
  }
};