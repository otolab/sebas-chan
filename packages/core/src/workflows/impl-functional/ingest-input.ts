import type { AgentEvent } from '../../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from '../context.js';
import type { WorkflowDefinition, WorkflowResult } from '../functional-types.js';

/**
 * 入力内容から影響分析が必要かを判定
 */
function shouldTriggerAnalysis(content: string): boolean {
  // キーワードベースの簡易判定
  const keywords = ['エラー', 'error', '失敗', 'failed', '問題', 'issue', 'バグ', 'bug'];
  const lowerContent = content.toLowerCase();
  return keywords.some((keyword) => lowerContent.includes(keyword.toLowerCase()));
}

/**
 * Stateを更新
 */
function updateState(currentState: string, input: any, pondEntryId: string): string {
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

/**
 * A-1: INGEST_INPUT ワークフロー実行関数
 * InputデータをPondに取り込み、必要に応じて後続の処理を起動
 */
async function executeIngestInput(
  event: AgentEvent,
  context: WorkflowContext,
  emitter: WorkflowEventEmitter
): Promise<WorkflowResult> {
  const { storage } = context;
  const { input } = event.payload as { input: any };

  try {
    // 1. InputをPondに保存
    const pondEntry = await storage.addPondEntry({
      content: input.content,
      source: input.source,
    });

    // 2. 内容を簡単に分析して次のアクションを決定
    const shouldAnalyze = shouldTriggerAnalysis(input.content);

    if (shouldAnalyze) {
      // 3. 必要に応じて後続のイベントを発行
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
    const updatedState = updateState(context.state, input, pondEntry.id);

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
    throw error;
  }
}

/**
 * INGEST_INPUT ワークフロー定義
 */
export const ingestInputWorkflow: WorkflowDefinition = {
  name: 'IngestInput',
  description: '入力データをPondに取り込み、エラーキーワードを検出して必要に応じて分析を起動する',
  executor: executeIngestInput,
};