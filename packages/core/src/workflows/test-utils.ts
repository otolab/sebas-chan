import { vi } from 'vitest';
import type { WorkflowLogger } from './logger.js';

/**
 * WorkflowLoggerのモック実装を作成
 */
export function createMockWorkflowLogger(): WorkflowLogger {
  const logger = {
    executionId: 'test-execution-id',
    workflowName: 'TestWorkflow',

    // 基本ログメソッド
    log: vi.fn(),

    // バッファ管理
    clearBuffer: vi.fn().mockReturnValue([]),
    getLogRecords: vi.fn().mockReturnValue([]),

    // クローズ
    close: vi.fn(),
  };

  return logger as unknown as WorkflowLogger;
}
