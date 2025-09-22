import { vi } from 'vitest';
import type { WorkflowRecorder } from './recorder.js';

/**
 * WorkflowRecorderのモック実装を作成
 */
export function createMockWorkflowRecorder(): WorkflowRecorder {
  const recorder = {
    executionId: 'test-execution-id',
    workflowName: 'TestWorkflow',

    // 基本記録メソッド
    record: vi.fn(),

    // バッファ管理
    clearBuffer: vi.fn().mockReturnValue([]),
    getBuffer: vi.fn().mockReturnValue([]),

    // クローズ
    close: vi.fn(),
  };

  return recorder as unknown as WorkflowRecorder;
}
