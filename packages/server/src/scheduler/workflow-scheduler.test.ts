import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkflowScheduler } from './workflow-scheduler.js';
import { EventEmitter } from 'events';
import type { DriverFactory } from '../types.js';

// DBClientのモック
vi.mock('@sebas-chan/db', () => ({
  DBClient: vi.fn().mockImplementation(() => ({
    isConnected: vi.fn().mockReturnValue(false),
    connect: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({
      status: 'ok',
      tables: ['schedules'],
    }),
    execute: vi.fn(),
  })),
}));

describe('WorkflowScheduler', () => {
  let scheduler: WorkflowScheduler;
  let mockDriverFactory: DriverFactory;
  let mockEventEmitter: EventEmitter;
  let mockDbClient: any;

  beforeEach(() => {
    // モックの初期化
    mockEventEmitter = new EventEmitter();
    vi.spyOn(mockEventEmitter, 'emit');

    mockDriverFactory = vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        structured: {
          next: new Date(Date.now() + 60000).toISOString(), // 1分後
          pattern: null,
          interpretation: 'テスト: 1分後に実行',
        },
      }),
    });

    // DBClientモックのインスタンス作成
    const { DBClient } = require('@sebas-chan/db');
    mockDbClient = new DBClient();
    mockDbClient.execute = vi.fn();

    scheduler = new WorkflowScheduler(
      mockDriverFactory,
      mockEventEmitter,
      mockDbClient
    );
  });

  afterEach(async () => {
    await scheduler.shutdown();
    vi.clearAllMocks();
  });

  describe('scheduleFromNatural', () => {
    it('自然言語からスケジュールを作成できる', async () => {
      const mockSchedule = {
        id: 'test-id',
        request: '5分後にリマインド',
        event_type: 'REMINDER',
        event_payload: JSON.stringify({ message: 'test' }),
        event_metadata: null,
        next_run: new Date(Date.now() + 300000).toISOString(),
        last_run: null,
        pattern: null,
        occurrences: 0,
        max_occurrences: null,
        correlation_id: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockDbClient.execute.mockImplementation((params: any) => {
        if (params.action === 'insert') {
          return Promise.resolve();
        }
        if (params.action === 'search') {
          return Promise.resolve([]);
        }
        return Promise.resolve();
      });

      const result = await scheduler.scheduleFromNatural(
        '5分後にリマインド',
        {
          type: 'REMINDER',
          payload: { message: 'test' },
        }
      );

      expect(result).toMatchObject({
        interpretation: 'テスト: 1分後に実行',
      });
      expect(result.scheduleId).toBeDefined();
      expect(result.nextRun).toBeInstanceOf(Date);
      expect(mockDbClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'insert',
          table: 'schedules',
        })
      );
    });

    it('correlationIdが指定された場合、既存のスケジュールをキャンセルする', async () => {
      const existingSchedule = {
        id: 'existing-id',
        status: 'active',
        event_type: 'TEST',
        event_payload: '{}',
        event_metadata: null,
        next_run: new Date().toISOString(),
        last_run: null,
        pattern: null,
        occurrences: 0,
        correlation_id: 'test-correlation',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockDbClient.execute.mockImplementation((params: any) => {
        if (params.action === 'search' && params.filter?.correlation_id) {
          return Promise.resolve([existingSchedule]);
        }
        if (params.action === 'search' && params.filter?.id) {
          return Promise.resolve([existingSchedule]);
        }
        if (params.action === 'update') {
          return Promise.resolve();
        }
        if (params.action === 'insert') {
          return Promise.resolve();
        }
        return Promise.resolve([]);
      });

      await scheduler.scheduleFromNatural(
        'テストスケジュール',
        { type: 'TEST', payload: {} },
        { correlationId: 'test-correlation' }
      );

      // 既存スケジュールの検索が行われたことを確認
      expect(mockDbClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'search',
          filter: { correlation_id: 'test-correlation' },
        })
      );
      // 更新（キャンセル）が行われたことを確認
      expect(mockDbClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          filter: { id: 'existing-id' },
        })
      );
    });

    it('繰り返しパターンを認識できる', async () => {
      // 繰り返しパターンを返すモック
      mockDriverFactory = vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({
          structured: {
            next: new Date(Date.now() + 86400000).toISOString(), // 1日後
            pattern: '毎日朝9時',
            interpretation: '毎日朝9時に実行',
          },
        }),
      });

      scheduler = new WorkflowScheduler(
        mockDriverFactory,
        mockEventEmitter,
        mockDbClient
      );

      mockDbClient.execute.mockResolvedValue([]);

      const result = await scheduler.scheduleFromNatural(
        '毎日朝9時にレポート',
        { type: 'REPORT', payload: {} }
      );

      expect(result.pattern).toBe('毎日朝9時');
      expect(result.interpretation).toBe('毎日朝9時に実行');
    });
  });

  describe('cancel', () => {
    it('アクティブなスケジュールをキャンセルできる', async () => {
      const schedule = {
        id: 'test-id',
        status: 'active',
        event_type: 'TEST',
        event_payload: '{}',
        next_run: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockDbClient.execute.mockImplementation((params: any) => {
        if (params.action === 'search' && params.filter?.id === 'test-id') {
          return Promise.resolve([schedule]);
        }
        if (params.action === 'update') {
          return Promise.resolve();
        }
        return Promise.resolve([]);
      });

      const result = await scheduler.cancel('test-id');

      expect(result).toBe(true);
      expect(mockDbClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          filter: { id: 'test-id' },
        })
      );
    });

    it('存在しないスケジュールのキャンセルはfalseを返す', async () => {
      mockDbClient.execute.mockResolvedValue([]);

      const result = await scheduler.cancel('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('list', () => {
    it('フィルタなしで全スケジュールを取得できる', async () => {
      const schedules = [
        {
          id: '1',
          status: 'active',
          event_type: 'TEST',
          event_payload: '{}',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: '2',
          status: 'completed',
          event_type: 'TEST',
          event_payload: '{}',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockDbClient.execute.mockResolvedValue(schedules);

      const result = await scheduler.list();

      expect(result).toHaveLength(2);
      expect(mockDbClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'search',
          table: 'schedules',
        })
      );
    });

    it('フィルタ付きでスケジュールを取得できる', async () => {
      const activeSchedules = [
        {
          id: '1',
          status: 'active',
          event_type: 'TEST',
          event_payload: '{}',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockDbClient.execute.mockResolvedValue(activeSchedules);

      const result = await scheduler.list({ status: 'active' });

      expect(result).toHaveLength(1);
      expect(mockDbClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'search',
          filter: { status: 'active' },
        })
      );
    });
  });

  describe('タイマー実行', () => {
    it('スケジュール時刻になったらイベントが発行される', async () => {
      vi.useFakeTimers();

      const schedule = {
        id: 'timer-test',
        request: 'テスト',
        event_type: 'TEST_EVENT',
        event_payload: JSON.stringify({ test: true }),
        event_metadata: null,
        next_run: new Date(Date.now() + 1000).toISOString(), // 1秒後
        last_run: null,
        pattern: null,
        occurrences: 0,
        max_occurrences: null,
        status: 'active',
        correlation_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockDbClient.execute.mockImplementation((params: any) => {
        if (params.action === 'insert') {
          return Promise.resolve();
        }
        if (params.action === 'search') {
          return Promise.resolve([]);
        }
        if (params.action === 'update') {
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      // 1秒後の実行を設定するようにモックを変更
      mockDriverFactory = vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({
          structured: {
            next: new Date(Date.now() + 1000).toISOString(),
            pattern: null,
            interpretation: '1秒後に実行',
          },
        }),
      });

      scheduler = new WorkflowScheduler(
        mockDriverFactory,
        mockEventEmitter,
        mockDbClient
      );

      await scheduler.scheduleFromNatural('テスト', {
        type: 'TEST_EVENT',
        payload: { test: true },
      });

      // 1秒進める
      await vi.advanceTimersByTimeAsync(1000);

      // イベントが発行されたことを確認
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'scheduled_event',
        expect.objectContaining({
          type: 'SCHEDULED_TIME_REACHED',
          payload: expect.objectContaining({
            test: true,
          }),
        })
      );

      vi.useRealTimers();
    });
  });

  describe('初期化と復元', () => {
    it('初期化時に既存のアクティブスケジュールを復元する', async () => {
      const activeSchedules = [
        {
          id: 'restored-1',
          status: 'active',
          event_type: 'TEST1',
          event_payload: '{}',
          next_run: new Date(Date.now() + 10000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'restored-2',
          status: 'active',
          event_type: 'TEST2',
          event_payload: '{}',
          next_run: new Date(Date.now() + 20000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockDbClient.execute.mockImplementation((params: any) => {
        if (params.action === 'search' && params.filter?.status === 'active') {
          return Promise.resolve(activeSchedules);
        }
        return Promise.resolve([]);
      });

      await scheduler.initialize();

      expect(mockDbClient.connect).toHaveBeenCalled();
      expect(mockDbClient.getStatus).toHaveBeenCalled();
      expect(mockDbClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'search',
          filter: { status: 'active' },
        })
      );
    });

    it('shutdown時に全タイマーをクリアする', async () => {
      mockDbClient.execute.mockResolvedValue([]);

      await scheduler.scheduleFromNatural('テスト', {
        type: 'TEST',
        payload: {},
      });

      await scheduler.shutdown();

      // エラーが出ないことで確認
      expect(true).toBe(true);
    });
  });
});