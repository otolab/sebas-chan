import { CoreAgent } from '@sebas-chan/core';

/**
 * 追加のワークフローをCoreAgentに登録
 * 注：標準ワークフローはgenerateWorkflowRegistry()で登録済み
 * ここではserver固有の追加ワークフローのみを登録
 */
export function registerAdditionalWorkflows(_agent: CoreAgent): void {
  // 現時点ではserver固有のワークフローは存在しない
  // 将来的に追加される場合はここに登録

  console.log('Additional workflows registered: none');
}
