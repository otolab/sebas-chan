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
    log: vi.fn().mockResolvedValue(undefined),
    logInput: vi.fn().mockResolvedValue(undefined),
    logOutput: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn().mockResolvedValue(undefined),
    logDbQuery: vi.fn().mockResolvedValue(undefined),
    logAiCall: vi.fn().mockResolvedValue(undefined),

    // ヘルパーメソッド
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined),

    // サブワークフロー
    createChildLogger: vi.fn().mockReturnValue({
      executionId: 'child-execution-id',
      workflowName: 'ChildWorkflow',
      options: {},
      currentLogFile: 'child.log',
      log: vi.fn().mockResolvedValue(undefined),
      logInput: vi.fn().mockResolvedValue(undefined),
      logOutput: vi.fn().mockResolvedValue(undefined),
      logError: vi.fn().mockResolvedValue(undefined),
      logDbQuery: vi.fn().mockResolvedValue(undefined),
      logAiCall: vi.fn().mockResolvedValue(undefined),
      warn: vi.fn().mockResolvedValue(undefined),
      error: vi.fn().mockResolvedValue(undefined),
      debug: vi.fn().mockResolvedValue(undefined),
      createChildLogger: vi.fn(),
      getExecutionReport: vi.fn().mockResolvedValue({
        executionId: 'child-execution-id',
        workflowName: 'ChildWorkflow',
        startTime: new Date(),
        endTime: new Date(),
        duration: 100,
        status: 'success',
        logs: [],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),

    // レポート生成
    getExecutionReport: vi.fn().mockResolvedValue({
      executionId: 'test-execution-id',
      workflowName: 'TestWorkflow',
      startTime: new Date(),
      endTime: new Date(),
      duration: 100,
      status: 'success',
      logs: [],
    }),

    // クローズ
    close: vi.fn().mockResolvedValue(undefined),
  };

  return logger as unknown as WorkflowLogger;
}