import type { AgentEvent } from '../../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from '../context.js';
import { BaseWorkflow, WorkflowResult } from '../types.js';

/**
 * A-1: INGEST_INPUT ワークフロー
 * InputデータをPondに取り込み、必要に応じて後続の処理を起動
 */
export class IngestInputWorkflow extends BaseWorkflow {
  constructor() {
    super('IngestInput');
  }

  protected async process(
    event: AgentEvent,
    context: WorkflowContext,
    emitter: WorkflowEventEmitter
  ): Promise<WorkflowResult> {
    const { logger, storage } = context;
    const { input } = event.payload as { input: any };

    try {
      // 1. InputをPondに保存
      await logger.log('info', 'Ingesting input to pond', { inputId: input.id });

      const pondEntry = await storage.addPondEntry({
        content: input.content,
        source: input.source,
      });

      await logger.logDbQuery('addPondEntry', { input }, [pondEntry.id]);

      // 2. 内容を簡単に分析して次のアクションを決定
      const shouldAnalyze = this.shouldTriggerAnalysis(input.content);

      if (shouldAnalyze) {
        // 3. 必要に応じて後続のイベントを発行
        await logger.log('info', 'Triggering issue impact analysis');

        emitter.emit({
          type: 'ANALYZE_ISSUE_IMPACT',
          priority: 'normal',
          payload: {
            pondEntryId: pondEntry.id,
            originalInput: input,
          },
        });
      }

      // 4. State更新（最新の処理内容を反映）
      const updatedState = this.updateState(context.state, input, pondEntry.id);

      return {
        success: true,
        context: {
          ...context,
          state: updatedState,
        },
        output: {
          pondEntryId: pondEntry.id,
          analyzed: shouldAnalyze,
        },
      };
    } catch (error) {
      await logger.logError(error as Error, { input });
      throw error;
    }
  }

  /**
   * 入力内容から影響分析が必要かを判定
   */
  private shouldTriggerAnalysis(content: string): boolean {
    // キーワードベースの簡易判定
    const keywords = ['エラー', 'error', '失敗', 'failed', '問題', 'issue', 'バグ', 'bug'];
    const lowerContent = content.toLowerCase();
    return keywords.some((keyword) => lowerContent.includes(keyword.toLowerCase()));
  }

  /**
   * Stateを更新
   */
  private updateState(currentState: string, input: any, pondEntryId: string): string {
    const timestamp = new Date().toISOString();
    const addition = `
## 最新の入力処理 (${timestamp})
- Input ID: ${input.id}
- Source: ${input.source}
- Pond Entry ID: ${pondEntryId}
- Content preview: ${input.content.substring(0, 100)}...
`;
    return currentState + addition;
  }
}