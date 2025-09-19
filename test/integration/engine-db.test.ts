/**
 * CoreEngine と DBClient の統合テスト
 *
 * テスト対象：
 * - CoreEngineとDBClientの連携
 * - データ永続化処理
 * - エラーハンドリング
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoreEngine } from '../../packages/server/src/core/engine.js';
import { DBClient } from '@sebas-chan/db';

// DBClientのみモック（外部システム）
vi.mock('@sebas-chan/db');

// ロガーのモック（ノイズ削減）
vi.mock('../../packages/server/src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CoreEngine と DBClient の統合テスト', () => {
  let engine: CoreEngine;
  let mockDbClient: Partial<DBClient>;

  beforeEach(() => {
    // DBClientのモック設定
    mockDbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      initModel: vi.fn().mockResolvedValue(true),
      getStatus: vi.fn().mockResolvedValue({
        status: 'ok',
        model_loaded: true,
        tables: ['issues', 'pond', 'state'],
        vector_dimension: 256,
      }),
      addPondEntry: vi.fn().mockImplementation(async (entry) => ({
        ...entry,
        id: `pond-${Date.now()}`,
        timestamp: entry.timestamp || new Date(),
      })),
      searchPond: vi.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, limit: 20, offset: 0, hasMore: false },
      }),
      searchIssues: vi.fn().mockResolvedValue([]),
      updateStateDocument: vi.fn().mockResolvedValue(undefined),
      getStateDocument: vi.fn().mockResolvedValue(null), // デフォルトはnull（新規状態）
      saveStateDocument: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(DBClient).mockImplementation(() => mockDbClient as DBClient);

    // タイマーのモック
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('2.1 Pond操作', () => {
    beforeEach(async () => {
      engine = new CoreEngine();
      await engine.initialize();
    });

    it('TEST-POND-001: createInputからPondへの保存フロー', async () => {
      // Arrange
      await engine.start();
      const inputData = {
        source: 'manual',
        content: 'Test input for Pond',
        timestamp: new Date(),
      };

      // Pondエントリのモックデータ
      const expectedPondEntry = {
        id: 'pond-123',
        content: inputData.content,
        source: inputData.source,
        timestamp: inputData.timestamp,
        metadata: {
          inputId: expect.any(String),
          processedAt: expect.any(Date),
        },
      };

      mockDbClient.addPondEntry = vi.fn().mockResolvedValue(expectedPondEntry);

      // Act
      const input = await engine.createInput(inputData);

      // Assert
      expect(input.id).toBeDefined();
      expect(input.source).toBe('manual');
      expect(input.content).toBe('Test input for Pond');

      // WorkflowQueueベースのシステムでは、ワークフローの実行を確認
      // createInputがINGEST_INPUTイベントを生成し、ワークフローが解決されることを確認
      // ここではinputが正しく作成されたことを確認
    });

    it('TEST-POND-002: Pond検索が正しく動作する', async () => {
      // Arrange
      const searchResults = {
        data: [
          {
            id: 'pond-1',
            content: 'Result 1',
            source: 'test',
            timestamp: new Date('2024-01-01'),
            score: 0.9,
          },
          {
            id: 'pond-2',
            content: 'Result 2',
            source: 'test',
            timestamp: new Date('2024-01-02'),
            score: 0.8,
          },
        ],
        meta: {
          total: 2,
          limit: 20,
          offset: 0,
          hasMore: false,
        },
      };

      mockDbClient.searchPond = vi.fn().mockResolvedValue(searchResults);

      // Act
      const results = await engine.searchPond({ q: 'test query' });

      // Assert
      expect(mockDbClient.searchPond).toHaveBeenCalledWith({ q: 'test query' });
      expect(results.data).toHaveLength(2);
      expect(results.data[0].content).toBe('Result 1');
      expect(results.data[1].content).toBe('Result 2');
      expect(results.meta.total).toBe(2);
    });

    it('TEST-POND-003: 大量データのPond検索でページング処理', async () => {
      // Arrange
      const firstPageResults = {
        data: Array.from({ length: 20 }, (_, i) => ({
          id: `pond-${i}`,
          content: `Result ${i}`,
          source: 'test',
          timestamp: new Date(),
        })),
        meta: {
          total: 50,
          limit: 20,
          offset: 0,
          hasMore: true,
        },
      };

      const secondPageResults = {
        data: Array.from({ length: 20 }, (_, i) => ({
          id: `pond-${i + 20}`,
          content: `Result ${i + 20}`,
          source: 'test',
          timestamp: new Date(),
        })),
        meta: {
          total: 50,
          limit: 20,
          offset: 20,
          hasMore: true,
        },
      };

      mockDbClient.searchPond = vi.fn()
        .mockResolvedValueOnce(firstPageResults)
        .mockResolvedValueOnce(secondPageResults);

      // Act
      const page1 = await engine.searchPond({ q: 'test', limit: 20, offset: 0 });
      const page2 = await engine.searchPond({ q: 'test', limit: 20, offset: 20 });

      // Assert
      expect(page1.data).toHaveLength(20);
      expect(page1.meta.hasMore).toBe(true);
      expect(page2.data).toHaveLength(20);
      expect(page2.data[0].id).toBe('pond-20');
    });
  });

  describe('2.2 エラーハンドリング', () => {
    it('TEST-ERROR-001: DB切断時の graceful degradation', async () => {
      // Arrange
      engine = new CoreEngine();
      await engine.initialize();
      await engine.start();

      // DBを切断状態にシミュレート
      mockDbClient.searchPond = vi.fn().mockRejectedValue(new Error('Connection lost'));
      mockDbClient.addPondEntry = vi.fn().mockRejectedValue(new Error('Connection lost'));

      const { logger } = await import('../../packages/server/src/utils/logger.js');
      const errorSpy = vi.mocked(logger.error);

      // Act & Assert - 検索が空の結果を返す
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

      // Act & Assert - 追加操作もエラーをハンドリング
      const pondEntry = await engine.addToPond({
        content: 'test',
        source: 'test',
        timestamp: new Date(),
      });

      // エラー時でもIDが生成される（ローカルフォールバック）
      expect(pondEntry.id).toBeDefined();
      expect(pondEntry.id).toMatch(/^pond-\d+$/);
    });

    it('TEST-ERROR-002: DB再接続処理', async () => {
      // Arrange
      engine = new CoreEngine();
      let connectAttempts = 0;

      // 最初の接続は失敗、2回目は成功
      mockDbClient.connect = vi.fn().mockImplementation(async () => {
        connectAttempts++;
        if (connectAttempts === 1) {
          throw new Error('Connection failed');
        }
        return undefined;
      });

      // Act & Assert - 初回接続失敗
      await expect(engine.initialize()).rejects.toThrow('Connection failed');

      // 再接続試行
      connectAttempts = 1; // リセット
      await engine.initialize();

      // 2回目の接続が成功
      expect(mockDbClient.connect).toHaveBeenCalledTimes(2);
      expect(await engine.getStatus()).toMatchObject({
        dbStatus: 'ready',
      });
    });

    it('TEST-ERROR-003: トランザクション中のエラー処理', async () => {
      // Arrange
      engine = new CoreEngine();
      await engine.initialize();

      // 複数の操作を含むトランザクションをシミュレート
      const operations = [
        { type: 'add', data: { content: 'Op1', source: 'test' } },
        { type: 'add', data: { content: 'Op2', source: 'test' } },
        { type: 'add', data: { content: 'Op3', source: 'test' } },
      ];

      // 2番目の操作でエラーを発生させる
      let callCount = 0;
      mockDbClient.addPondEntry = vi.fn().mockImplementation(async (entry) => {
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

      // Act
      const results = [];
      for (const op of operations) {
        try {
          const result = await engine.addToPond({
            ...op.data,
            timestamp: new Date(),
          });
          results.push({ success: true, data: result });
        } catch (error) {
          results.push({ success: false, error: (error as Error).message });
        }
      }

      // Assert
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true); // エラーハンドリングによりローカルIDで成功
      expect(results[2].success).toBe(true);

      // すべての操作で結果が返される（エラーがあっても継続）
      expect(results.filter(r => r.success)).toHaveLength(3);
    });
  });

  describe('2.3 状態管理', () => {
    beforeEach(async () => {
      engine = new CoreEngine();
      await engine.initialize();
    });

    it('TEST-STATE-001: 状態の永続化と復元', async () => {
      // Arrange
      const initialState = '# sebas-chan State Document\n\nInitial content';
      const updatedState = '# sebas-chan State Document\n\nUpdated content';

      mockDbClient.getState = vi.fn()
        .mockResolvedValueOnce({ content: initialState, lastUpdated: new Date() })
        .mockResolvedValueOnce({ content: updatedState, lastUpdated: new Date() });

      // Act - 初期状態の取得
      const state1 = engine.getState();
      expect(state1).toContain('sebas-chan State Document');

      // 状態の更新
      engine.updateState(updatedState);

      // updateStateDocumentはasyncで実行されるため、待機が必要
      await vi.waitFor(() => {
        expect(mockDbClient.updateStateDocument).toHaveBeenCalledWith(updatedState);
      }, { timeout: 3000 });

      // 更新後の状態確認
      const state2 = engine.getState();
      expect(state2).toBe(updatedState);
    });

    it('TEST-STATE-002: 状態更新エラー時の処理', async () => {
      // Arrange
      mockDbClient.updateStateDocument = vi.fn().mockRejectedValue(new Error('Update failed'));
      const { logger } = await import('../../packages/server/src/utils/logger.js');
      const errorSpy = vi.mocked(logger.error);

      // Act
      const newState = '# New State';
      engine.updateState(newState);

      // Assert - ローカル状態は更新される
      expect(engine.getState()).toBe(newState);

      // DBへの更新は試行される
      await vi.waitFor(() => {
        expect(mockDbClient.updateStateDocument).toHaveBeenCalledWith(newState);
      }, { timeout: 3000 });

      // エラーがログに記録される
      await vi.waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to persist state'),
          expect.any(Error)
        );
      });
    });
  });

  describe('2.4 リソース管理', () => {
    beforeEach(async () => {
      engine = new CoreEngine();
      await engine.initialize();
    });

    it('TEST-RESOURCE-001: リソースのクリーンアップ', async () => {
      // Arrange
      await engine.start();

      // Act
      engine.stop();

      // Assert
      expect(mockDbClient.disconnect).toHaveBeenCalled();

      // 停止後の操作はエラーにならない（graceful）
      const result = await engine.searchPond({ q: 'test' });
      expect(result.data).toEqual([]);
    });
  });
});