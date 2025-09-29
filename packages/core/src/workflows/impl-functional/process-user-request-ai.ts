/**
 * ProcessUserRequestワークフローのAI処理関連
 */

import { compile } from '@moduler-prompt/core';
import type { PromptModule } from '@moduler-prompt/core';
import type { AIDriver } from '@moduler-prompt/driver';
import type { AnalysisResult, RelatedData } from './process-user-request-helpers.js';
import { AI_CONFIG, REQUEST_TYPE, ACTION_TYPE } from './constants.js';
import { classifyRequest } from './process-user-request-helpers.js';

/**
 * 分析用コンテキストの型定義
 */
interface AnalysisContext {
  content: string | undefined;
  relatedData: RelatedData;
}

/**
 * ProcessUserRequestワークフローのプロンプトモジュール
 */
export const analysisPromptModule: PromptModule<AnalysisContext> = {
  createContext: () => ({
    content: undefined,
    relatedData: {
      issues: [],
      knowledge: [],
      pondEntries: []
    }
  }),

  // objective: instructions大セクションに分類
  objective: [
    'ユーザーリクエストを分析し、適切なアクションとイベントを決定する'
  ],

  // terms: instructions大セクションに分類
  terms: [
    'Issue: 解決すべき問題やタスク',
    'Pond: 一時的なデータ保管場所',
    'Knowledge: 抽出された知識・ノウハウ'
  ],

  // instructions標準セクション: instructions大セクションに分類
  instructions: [
    '以下の項目を判定してください：',
    '1. 何が起きたか/何をすべきかを解釈',
    '2. 発行すべきイベントを選択（複数可）',
    '3. 実行すべきアクションを決定',
    '',
    'JSON形式で応答してください。'
  ],

  // inputs: data大セクションに分類（ユーザーデータ）
  inputs: [
    (ctx: AnalysisContext) => `ユーザーリクエスト: ${ctx.content || '（内容なし）'}`,
    '',
    '既存データ:',
    (ctx: AnalysisContext) => `関連Issue: ${ctx.relatedData.issues.length}件`,
    (ctx: AnalysisContext) => ctx.relatedData.issues
      .slice(0, AI_CONFIG.MAX_RELATED_ISSUES)
      .map(i => `  [${i.id}] ${i.title} (${i.status})`),
    (ctx: AnalysisContext) => `関連Knowledge: ${ctx.relatedData.knowledge.length}件`,
    (ctx: AnalysisContext) => ctx.relatedData.knowledge
      .slice(0, AI_CONFIG.MAX_RELATED_KNOWLEDGE)
      .map(k => `  ${k.content.substring(0, 50)}...`),
    (ctx: AnalysisContext) => `関連Pondエントリ: ${ctx.relatedData.pondEntries.length}件`
  ],

  // materials: data大セクションに分類（参考情報）
  materials: [
    '利用可能なイベントタイプ:',
    '- DATA_ARRIVED: 外部データ到着（Pond自動保存）',
    '- ISSUE_CREATED: 新Issue作成',
    '- ISSUE_UPDATED: Issue更新',
    '- ISSUE_STATUS_CHANGED: Issueステータス変更',
    '- ERROR_DETECTED: エラー検出',
    '- PATTERN_FOUND: パターン発見',
    '- KNOWLEDGE_EXTRACTABLE: 知識抽出可能',
    '- HIGH_PRIORITY_DETECTED: 高優先度検出',
    '- SCHEDULED_TIME_REACHED: スケジュール時刻到達',
    '',
    'アクションタイプ:',
    '- create: 新規作成',
    '- update: 更新',
    '- search: 検索'
  ],

  // schema: output大セクションに分類
  schema: [
    JSON.stringify({
      type: 'object',
      properties: {
      interpretation: {
        type: 'string',
        description: 'リクエストの解釈'
      },
      requestType: {
        type: 'string',
        enum: Object.values(REQUEST_TYPE),
        description: 'リクエストの分類'
      },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            reason: { type: 'string' },
            payload: { type: 'object' }
          },
          required: ['type', 'reason']
        }
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: Object.values(ACTION_TYPE)
            },
            target: {
              type: 'string',
              enum: ['issue', 'knowledge', 'pond']  // ターゲットはDBのエンティティ名
            },
            details: { type: 'string' }
          },
          required: ['type', 'target', 'details']
        }
      },
      response: {
        type: 'string',
        description: 'ユーザーへの応答メッセージ'
      }
      },
      required: ['interpretation', 'requestType', 'response']
    })
  ]
};


/**
 * AIドライバーを使用してリクエストを分析する
 * @param driver AIドライバー
 * @param content リクエスト内容
 * @param relatedData 関連データ
 * @returns 分析結果
 */
export async function analyzeRequest(
  driver: AIDriver,
  content: string | undefined,
  relatedData: RelatedData
): Promise<AnalysisResult> {
  // コンテキストを作成
  const context: AnalysisContext = {
    content,
    relatedData
  };

  // コンパイル
  const compiledPrompt = compile(analysisPromptModule, context);

  try {
    const result = await driver.query(compiledPrompt, {
      temperature: AI_CONFIG.DEFAULT_TEMPERATURE
    });

    // 構造化出力が利用可能な場合
    if (result.structuredOutput) {
      return result.structuredOutput as AnalysisResult;
    }

    // JSON形式でパース
    if (result.content) {
      try {
        return JSON.parse(result.content) as AnalysisResult;
      } catch {
        // JSONパースに失敗した場合のフォールバック
        return createFallbackAnalysis(content, result.content);
      }
    }

    // 完全なフォールバック
    return createFallbackAnalysis(content, '分析に失敗しました');

  } catch (error) {
    // エラー時のフォールバック
    console.error('AI analysis failed:', error);
    return createFallbackAnalysis(content, 'AI分析でエラーが発生しました');
  }
}

/**
 * フォールバック用の分析結果を生成する
 * @param content リクエスト内容
 * @param response AIからの生のレスポンス
 * @returns フォールバック分析結果
 */
function createFallbackAnalysis(
  content: string | undefined,
  response: string
): AnalysisResult {
  return {
    interpretation: response,
    requestType: classifyRequest(content),
    events: [],
    actions: [],
    response: response,
  };
}