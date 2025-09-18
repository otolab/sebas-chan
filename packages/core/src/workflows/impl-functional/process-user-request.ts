import type { AgentEvent } from '../../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from '../context.js';
import type { WorkflowResult } from '../functional-types.js';
import type { ExtendedWorkflowDefinition } from '../workflow-types.js';
import { compile } from '@moduler-prompt/core';

// リクエストの型定義
interface UserRequest {
  id?: string;
  content?: string;
}

/**
 * 次のイベントを決定する
 */
function determineNextEvents(
  requestType: string,
  request: UserRequest,
  aiResponse: string
): Array<{ type: string; priority: 'high' | 'normal' | 'low'; payload: Record<string, unknown> }> {
  const events: Array<{
    type: string;
    priority: 'high' | 'normal' | 'low';
    payload: Record<string, unknown>;
  }> = [];

  switch (requestType) {
    case 'issue':
      events.push({
        type: 'ANALYZE_ISSUE_IMPACT',
        priority: 'high' as const,
        payload: {
          issue: request,
          aiResponse,
        },
      });
      break;

    case 'question':
      events.push({
        type: 'EXTRACT_KNOWLEDGE',
        priority: 'normal' as const,
        payload: {
          question: request.content,
          context: aiResponse,
        },
      });
      break;

    case 'feedback':
      // フィードバックの場合は知識として保存
      events.push({
        type: 'EXTRACT_KNOWLEDGE',
        priority: 'low' as const,
        payload: {
          feedback: request.content,
          source: 'user_feedback',
        },
      });
      break;
  }

  return events;
}

/**
 * リクエストタイプを分類
 */
function classifyRequest(content: string): string {
  const lowerContent = content.toLowerCase();

  if (
    lowerContent.includes('エラー') ||
    lowerContent.includes('error') ||
    lowerContent.includes('問題') ||
    lowerContent.includes('issue') ||
    lowerContent.includes('バグ') ||
    lowerContent.includes('bug')
  ) {
    return 'issue';
  }

  if (
    lowerContent.includes('どうやって') ||
    lowerContent.includes('how to') ||
    lowerContent.includes('？') ||
    lowerContent.includes('?')
  ) {
    return 'question';
  }

  return 'feedback';
}

/**
 * A-0: PROCESS_USER_REQUEST ワークフロー実行関数
 * ユーザーからのリクエストを処理し、適切な後続処理を起動
 */
async function executeProcessUserRequest(
  event: AgentEvent,
  context: WorkflowContext,
  emitter: WorkflowEventEmitter
): Promise<WorkflowResult> {
  const { storage, createDriver } = context;
  interface ProcessUserRequestPayload {
    request: UserRequest;
  }
  const { request } = event.payload as unknown as ProcessUserRequestPayload;

  try {
    // 1. AIを使ってリクエストを分類・理解
    const prompt = `
以下のユーザーリクエストを分析し、適切な対応を提案してください。
リクエスト: ${request.content}

タイプ（issue/question/feedback）と概要を日本語で返してください。
`;

    // ドライバーを作成してプロンプトを実行
    const driver = await createDriver({
      requiredCapabilities: ['fast'],
      preferredCapabilities: ['japanese'],
    });

    const promptModule = { instructions: [prompt] };
    const compiledPrompt = compile(promptModule);
    const result = await driver.query(compiledPrompt, { temperature: 0.3 });
    const aiResponse = result.content;

    // 2. リクエストタイプを判定（簡易版）
    const requestType = classifyRequest(String(request.content));

    // 3. 後続のイベントを生成
    const nextEvents = determineNextEvents(requestType, request, aiResponse);

    // 4. イベントを発行
    for (const nextEvent of nextEvents) {
      emitter.emit(nextEvent);
    }

    // 5. State更新
    const timestamp = new Date().toISOString();
    const updatedState =
      context.state +
      `
## ユーザーリクエスト処理 (${timestamp})
- Request ID: ${request.id}
- Type: ${requestType}
- AI Response: ${aiResponse.substring(0, 200)}...
- Next Actions: ${nextEvents.map((e) => e.type).join(', ')}
`;

    return {
      success: true,
      context: {
        ...context,
        state: updatedState,
      },
      output: {
        requestType,
        aiResponse,
        nextEvents: nextEvents.map((e) => e.type),
      },
    };
  } catch (error) {
    throw error;
  }
}

/**
 * PROCESS_USER_REQUEST ワークフロー定義
 */
export const processUserRequestWorkflow: ExtendedWorkflowDefinition = {
  name: 'ProcessUserRequest',
  description: 'ユーザーリクエストを分類し、適切な後続ワークフローへルーティングする',
  triggers: {
    eventTypes: ['PROCESS_USER_REQUEST'],
    priority: 20,
  },
  executor: executeProcessUserRequest,
};
