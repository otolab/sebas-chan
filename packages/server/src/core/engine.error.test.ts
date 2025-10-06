/**
 * CoreEngine エラーハンドリングのユニットテスト
 *
 * 統合テストから分離したエラーケースのテスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreEngine } from './engine.js';
import { CoreAgent } from '@sebas-chan/core';

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@sebas-chan/core', async () => {
  const actual = await vi.importActual<typeof import('@sebas-chan/core')>('@sebas-chan/core');
  return {
    CoreAgent: vi.fn(),
    WorkflowRecorder: vi.fn().mockImplementation(() => ({
      record: vi.fn(),
      getBuffer: vi.fn().mockReturnValue([]),
    })),
    RecordType: actual.RecordType,
    WorkflowRegistry: vi.fn().mockImplementation(() => ({
      register: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      getByEventType: vi.fn().mockReturnValue([]),
    })),
    WorkflowResolver: vi.fn().mockImplementation(() => ({
      resolve: vi.fn().mockReturnValue({
        workflows: [],
        resolutionTime: 1,
      }),
    })),
    registerDefaultWorkflows: vi.fn(),
  };
});

vi.mock('@sebas-chan/db');

describe('CoreEngine Error Handling', () => {
  let engine: CoreEngine;
  let mockDbClient: any;
  let mockCoreAgent: any;

  beforeEach(async () => {
    // DBClientモックの設定
    mockDbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      initModel: vi.fn().mockResolvedValue(true),
      addPondEntry: vi.fn().mockResolvedValue({
        id: 'pond-123',
        content: 'test',
        source: 'test',
        timestamp: new Date(),
      }),
      searchPond: vi.fn().mockResolvedValue({
        data: [],
        meta: {
          total: 0,
          limit: 20,
          offset: 0,
          hasMore: false,
        },
      }),
      searchIssues: vi.fn().mockResolvedValue([]),
      updateStateDocument: vi.fn().mockResolvedValue(undefined),
      getStateDocument: vi.fn().mockResolvedValue(null),
      getStatus: vi.fn().mockResolvedValue({ status: 'error', model_loaded: false }), // 未接続状態
    };

    // CoreAgentモックの設定
    mockCoreAgent = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      queueEvent: vi.fn(),
      setContext: vi.fn(),
      getWorkflowRegistry: vi.fn().mockReturnValue({
        get: vi.fn(),
        register: vi.fn(),
        list: vi.fn().mockReturnValue([]),
      }),
      executeWorkflow: vi.fn().mockResolvedValue({
        success: true,
        context: {},
      }),
    };

    vi.mocked(CoreAgent).mockImplementation(() => mockCoreAgent);

    engine = new CoreEngine(mockCoreAgent as any, mockDbClient as any);
    vi.useFakeTimers();
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('DB Connection Errors', () => {
    it('should handle DB connection failure during initialization', async () => {
      mockDbClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(engine.initialize()).rejects.toThrow('Connection failed');
    });

    it.skip('should handle DB model initialization failure - CoreEngineはもうinitModelを呼ばない', async () => {
      // CoreEngine.initialize()はもうinitModelを呼ばないため、このテストは不要
      mockDbClient.initModel.mockRejectedValue(new Error('Model init failed'));

      await expect(engine.initialize()).rejects.toThrow('Model init failed');
    });

    it.skip('should allow retry after DB connection failure - モックの分離が必要', async () => {
      // 最初の接続は失敗
      mockDbClient.connect.mockRejectedValueOnce(new Error('Connection failed'));
      await expect(engine.initialize()).rejects.toThrow('Connection failed');

      // モックをリセットして、2回目の接続は成功するように設定
      mockDbClient.connect.mockResolvedValueOnce(undefined);

      // 新しいengineインスタンスで再接続試行
      const newEngine = new CoreEngine(mockCoreAgent as any, mockDbClient as any);
      await newEngine.initialize();

      // 2回目の接続が成功
      const status = await newEngine.getStatus();
      expect(status.dbStatus).toBe('ready');

      newEngine.stop();
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle DB disconnection gracefully', async () => {
      await engine.initialize();
      await engine.start();

      // DBを切断状態にシミュレート
      mockDbClient.searchPond.mockRejectedValue(new Error('Connection lost'));
      mockDbClient.addPondEntry.mockRejectedValue(new Error('Connection lost'));

      const { logger } = await import('../utils/logger.js');
      const errorSpy = vi.mocked(logger.error);

      // 検索が空の結果を返す
      const searchResults = await engine.searchPond({ q: 'test' });
      expect(searchResults).toEqual({
        data: [],
        meta: {
          total: 0,
          limit: 20,
          offset: 0,
          hasMore: false,
        },
      });

      // エラーがログに記録される
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to search pond with filters',
        expect.objectContaining({
          error: expect.any(Error),
        })
      );

      // 追加操作もエラーをハンドリング
      const pondEntry = await engine.addToPond({
        content: 'test',
        source: 'test',
        timestamp: new Date(),
      });

      // エラー時でもIDが生成される（ローカルフォールバック）
      expect(pondEntry.id).toBeDefined();
      expect(pondEntry.id).toMatch(/^pond-\d+$/);
    });
  });

  describe('Transaction Error Handling', () => {
    it('should handle errors during transaction', async () => {
      await engine.initialize();

      // 複数の操作を含むトランザクションをシミュレート
      const operations = [
        { type: 'add', data: { content: 'Op1', source: 'test' } },
        { type: 'add', data: { content: 'Op2', source: 'test' } },
        { type: 'add', data: { content: 'Op3', source: 'test' } },
      ];

      // 2番目の操作でエラーを発生させる
      let callCount = 0;
      mockDbClient.addPondEntry.mockImplementation(async (entry) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Transaction error');
        }
        return {
          ...entry,
          id: `pond-${callCount}`,
          timestamp: new Date(),
        };
      });

      // 各操作を実行
      const results = [];
      for (const op of operations) {
        const result = await engine.addToPond({
          ...op.data,
          timestamp: new Date(),
        });
        results.push({ success: true, data: result });
      }

      // すべての操作で結果が返される（エラーがあっても継続）
      expect(results.filter((r) => r.success)).toHaveLength(3);

      // 2番目の操作はローカルIDで成功
      expect(results[1].data.id).toMatch(/^pond-\d+$/);
    });
  });

  describe('State Management Errors', () => {
    it('should handle state update errors', async () => {
      await engine.initialize();

      mockDbClient.updateStateDocument.mockRejectedValue(new Error('Update failed'));
      const { logger } = await import('../utils/logger.js');
      const errorSpy = vi.mocked(logger.error);

      // 新しい状態を設定
      const newState = '# New State';
      engine.updateState(newState);

      // ローカル状態は更新される
      expect(engine.getState()).toBe(newState);

      // DBへの更新は試行される
      await vi.waitFor(
        () => {
          expect(mockDbClient.updateStateDocument).toHaveBeenCalledWith(newState);
        },
        { timeout: 3000 }
      );

      // エラーがログに記録される
      await vi.waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to persist state'),
          expect.any(Error)
        );
      });
    });

    it('should handle state retrieval errors', async () => {
      mockDbClient.getStateDocument.mockRejectedValue(new Error('Read failed'));

      // 初期化時にエラーが発生してもデフォルト状態を使用
      await engine.initialize();

      const state = engine.getState();
      expect(state).toContain('sebas-chan State Document');
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources properly', async () => {
      await engine.initialize();
      await engine.start();

      engine.stop();

      expect(mockDbClient.disconnect).toHaveBeenCalled();

      // 停止後の操作はエラーにならない（graceful）
      const result = await engine.searchPond({ q: 'test' });
      expect(result.data).toEqual([]);
    });

    it('should handle disconnect errors gracefully', async () => {
      await engine.initialize();
      await engine.start();

      mockDbClient.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      // エラーが発生してもstopは完了する
      expect(() => engine.stop()).not.toThrow();
    });
  });
});
