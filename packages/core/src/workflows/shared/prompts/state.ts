import { merge, type PromptModule } from '@moduler-prompt/core';

/**
 * State管理用のコンテキスト型
 */
export interface StateContext {
  currentState: string;
}

/**
 * context.stateを組み込むための共通PromptModule
 */
export const statePromptModule: PromptModule<StateContext> = {
  createContext: () => ({ currentState: '(initial)' }),
  terms: ['- State: アシスタントが利用するメモです。システム全体で共有されています。'],
  state: [
    {
      type: 'subsection',
      title: '現在の状態(State)',
      items: [(ctx: StateContext) => ctx.currentState || '（状態なし）'],
    },
  ],
};

/**
 * State更新用の出力スキーマ
 */
const updateStateOutputSchema = {
  type: 'object' as const,
  properties: {
    updatedState: {
      type: 'string' as const,
      description: '更新されたシステム状態',
    },
  },
  required: ['updatedState'],
} as const;

/**
 * State更新用のPromptModule
 */
export const updateStatePromptModule: PromptModule<StateContext> = merge(statePromptModule, {
  instructions: [
    {
      type: 'subsection',
      title: 'コンテキストの状態の利用と更新',
      items: [
        '- あなたは補助的な作業として、現在のシステム状態を更新する必要があります。',
        '- 『現在の状態(State)』に加筆・修正・整理を行い、stateとして出力してください。',
        '- 簡潔で有用な状態記述に更新してください。古い情報で重要でないものは削除し、新しい情報を適切に統合します。',
      ],
    },
  ],
  schema: [
    {
      type: 'json',
      content: updateStateOutputSchema,
    },
  ],
});
