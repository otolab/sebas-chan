import type { AgentEvent } from '../../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from '../context.js';
import { BaseWorkflow, WorkflowResult } from '../types.js';

/**
 * A-0: PROCESS_USER_REQUEST ワークフロー
 * ユーザーリクエストを処理し、適切な後続ワークフローを起動
 */
export class ProcessUserRequestWorkflow extends BaseWorkflow {
  constructor() {
    super('ProcessUserRequest');
  }

  protected async process(
    event: AgentEvent,
    context: WorkflowContext,
    emitter: WorkflowEventEmitter
  ): Promise<WorkflowResult> {
    const { logger, storage, driver } = context;
    const { request } = event.payload as { request: any };

    try {
      await logger.log('info', 'Processing user request', { requestId: request.id });

      // 1. リクエストタイプを判定
      const requestType = await this.classifyRequest(request, context);
      await logger.log('info', `Request classified as: ${requestType}`);

      // 2. 関連するデータを検索
      const relevantData = await this.searchRelevantData(request, storage, logger);

      // 3. AIを使ってリクエストを処理（driverが利用可能な場合）
      let aiResponse = null;
      if (driver) {
        aiResponse = await this.processWithAI(request, relevantData, driver, logger);
      }

      // 4. 処理結果に基づいて後続イベントを発行
      const nextEvents = this.determineNextEvents(requestType, request, aiResponse);
      for (const nextEvent of nextEvents) {
        emitter.emit(nextEvent);
        await logger.log('info', `Emitted event: ${nextEvent.type}`);
      }

      // 5. State更新
      const updatedState = this.updateState(
        context.state,
        request,
        requestType,
        nextEvents.length
      );

      return {
        success: true,
        context: {
          ...context,
          state: updatedState,
        },
        output: {
          requestType,
          relevantDataCount: relevantData.issueCount + relevantData.knowledgeCount,
          nextEventsEmitted: nextEvents.length,
          aiProcessed: !!aiResponse,
        },
      };
    } catch (error) {
      await logger.logError(error as Error, { request });
      throw error;
    }
  }

  /**
   * リクエストタイプを分類
   */
  private async classifyRequest(
    request: any,
    context: WorkflowContext
  ): Promise<'issue' | 'question' | 'feedback' | 'unknown'> {
    const content = request.content?.toLowerCase() || '';

    if (content.includes('エラー') || content.includes('error') || content.includes('バグ')) {
      return 'issue';
    }
    if (content.includes('？') || content.includes('?') || content.includes('教えて')) {
      return 'question';
    }
    if (content.includes('改善') || content.includes('提案') || content.includes('フィードバック')) {
      return 'feedback';
    }

    return 'unknown';
  }

  /**
   * 関連データを検索
   */
  private async searchRelevantData(request: any, storage: any, logger: any) {
    const query = request.content || '';

    // Issues検索
    const issues = await storage.searchIssues(query);
    await logger.logDbQuery('searchIssues', { query }, issues.map((i: any) => i.id));

    // Knowledge検索
    const knowledge = await storage.searchKnowledge(query);
    await logger.logDbQuery('searchKnowledge', { query }, knowledge.map((k: any) => k.id));

    return {
      issues,
      knowledge,
      issueCount: issues.length,
      knowledgeCount: knowledge.length,
    };
  }

  /**
   * AIを使用してリクエストを処理
   */
  private async processWithAI(
    request: any,
    relevantData: any,
    driver: any,
    logger: any
  ): Promise<any> {
    try {
      // @moduler-prompt/driverを使用した処理
      // 実際の実装はdriver の型が確定してから
      const prompt = `
User request: ${request.content}
Related issues: ${relevantData.issues.length}
Related knowledge: ${relevantData.knowledge.length}

Please analyze this request and suggest appropriate actions.
`;

      // 仮の実装（driverの実際のAPIに合わせて調整が必要）
      if (driver && typeof driver.generate === 'function') {
        const response = await driver.generate(prompt);
        await logger.logAiCall('driver.generate', { prompt }, response);
        return response;
      }

      return null;
    } catch (error) {
      await logger.log('warn', 'AI processing failed, continuing without AI', { error });
      return null;
    }
  }

  /**
   * 次のイベントを決定
   */
  private determineNextEvents(
    requestType: string,
    request: any,
    aiResponse: any
  ): Array<{ type: string; priority?: 'high' | 'normal' | 'low'; payload: any }> {
    const events = [];

    // リクエストタイプに基づいてイベントを生成
    switch (requestType) {
      case 'issue':
        events.push({
          type: 'ANALYZE_ISSUE_IMPACT',
          priority: 'high' as const,
          payload: {
            requestId: request.id,
            content: request.content,
            aiAnalysis: aiResponse,
          },
        });
        break;

      case 'question':
        events.push({
          type: 'EXTRACT_KNOWLEDGE',
          priority: 'normal' as const,
          payload: {
            requestId: request.id,
            question: request.content,
            aiResponse,
          },
        });
        break;

      case 'feedback':
        // フィードバックは一旦Pondに保存
        events.push({
          type: 'INGEST_INPUT',
          priority: 'low' as const,
          payload: {
            input: {
              id: request.id,
              source: 'user-feedback',
              content: request.content,
              timestamp: new Date(),
            },
          },
        });
        break;

      default:
        // 不明なリクエストもPondに保存
        events.push({
          type: 'INGEST_INPUT',
          priority: 'low' as const,
          payload: {
            input: {
              id: request.id,
              source: 'user-request-unknown',
              content: request.content,
              timestamp: new Date(),
            },
          },
        });
    }

    return events;
  }

  /**
   * Stateを更新
   */
  private updateState(
    currentState: string,
    request: any,
    requestType: string,
    nextEventsCount: number
  ): string {
    const timestamp = new Date().toISOString();
    const addition = `
## ユーザーリクエスト処理 (${timestamp})
- Request ID: ${request.id}
- Type: ${requestType}
- Next events emitted: ${nextEventsCount}
- Content preview: ${request.content?.substring(0, 100)}...
`;
    return currentState + addition;
  }
}