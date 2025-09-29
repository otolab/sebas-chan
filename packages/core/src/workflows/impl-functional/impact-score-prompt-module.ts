import { type PromptModule } from '@moduler-prompt/core';

/**
 * 影響度スコア計算用のPromptModule
 */
export const impactScorePromptModule: PromptModule = {
  instructions: [
    'Issueの影響度スコアを0.0～1.0で評価してください。',
    '',
    '## 評価基準',
    '- **緊急性**: critical, urgent, 緊急, 重大, crash, downなどのキーワード（+0.3）',
    '- **エラー関連**: error, fail, エラー, 失敗, bug, バグなどのキーワード（+0.2）',
    '- **影響範囲**: 関連するIssueの数（多いほど高スコア、最大+0.3）',
    '- **ユーザー影響**: ユーザーに直接影響があるか',
    '- **ビジネス影響**: ビジネスクリティカルな機能への影響'
  ],
  inputs: [
    '## Issue内容',
    (ctx: any) => ctx.issueContent || '（内容なし）',
    '',
    '## 関連Issue数',
    (ctx: any) => `${ctx.relatedIssuesCount || 0}件`
  ],
  schema: [
    JSON.stringify({
      type: 'object',
      properties: {
        impactScore: {
          type: 'number',
          description: '影響度スコア（0.0～1.0）',
          minimum: 0,
          maximum: 1
        },
        reasoning: {
          type: 'string',
          description: 'スコアの理由'
        }
      },
      required: ['impactScore', 'reasoning']
    })
  ]
};