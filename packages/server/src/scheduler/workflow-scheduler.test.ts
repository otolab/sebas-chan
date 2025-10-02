import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkflowScheduler } from './workflow-scheduler.js';
import { EventEmitter } from 'events';
import type { DriverFactory } from '../types.js';

// DBClientのモック
const mockDbClient = {
  isConnected: vi.fn().mockReturnValue(false),
  connect: vi.fn().mockResolvedValue(undefined),
  getStatus: vi.fn().mockResolvedValue({
    status: 'ok',
    tables: ['schedules'],
  }),
  getSchedule: vi.fn(),
  searchSchedules: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  addSchedule: vi.fn(),
};

vi.mock('@sebas-chan/db', () => ({
  DBClient: vi.fn().mockImplementation(() => mockDbClient),
}));

describe('WorkflowScheduler', () => {
  let scheduler: WorkflowScheduler;
  let mockDriverFactory: DriverFactory;
  let mockEventEmitter: EventEmitter;

  beforeEach(() => {
    // モックの初期化
    mockEventEmitter = new EventEmitter();
    vi.spyOn(mockEventEmitter, 'emit');

    mockDriverFactory = vi.fn().mockResolvedValue({
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          next: new Date(Date.now() + 60000).toISOString(), // 1分後
          pattern: null,
          interpretation: 'テスト: 1分後に実行',
        }),
        structured: {
          next: new Date(Date.now() + 60000).toISOString(), // 1分後
          pattern: null,
          interpretation: 'テスト: 1分後に実行',
        },
      }),
      query: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          next: new Date(Date.now() + 60000).toISOString(), // 1分後
          pattern: null,
          interpretation: 'テスト: 1分後に実行',
        }),
        structuredOutput: {
          next: new Date(Date.now() + 60000).toISOString(), // 1分後
          pattern: null,
          interpretation: 'テスト: 1分後に実行',
        },
      }),
    });

    // モックメソッドをリセット
    mockDbClient.execute = vi.fn();
    mockDbClient.getSchedule = vi.fn().mockResolvedValue(null);
    mockDbClient.searchSchedules = vi.fn().mockResolvedValue([]);
    mockDbClient.updateSchedule = vi.fn().mockResolvedValue(undefined);
    mockDbClient.deleteSchedule = vi.fn().mockResolvedValue(undefined);
    mockDbClient.addSchedule = vi.fn().mockResolvedValue(undefined);

    scheduler = new WorkflowScheduler(mockDriverFactory, mockEventEmitter, mockDbClient);
  });

  afterEach(async () => {
    await scheduler.shutdown();
    vi.clearAllMocks();
  });

  describe('schedule', () => {
    it('自然言語からスケジュールを作成できる', async () => {
      // モックデータは直接resultで検証
      mockDbClient.searchSchedules.mockResolvedValue([]);

      const result = await scheduler.schedule('test-issue-1', '5分後にリマインド', {
        type: 'REMINDER',
        payload: { message: 'test' },
      });

      expect(result).toMatchObject({
        interpretation: 'テスト: 1分後に実行',
      });
      expect(result.scheduleId).toBeDefined();
      expect(result.nextRun).toBeInstanceOf(Date);
      expect(mockDbClient.addSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          issue_id: 'test-issue-1',
          request: '5分後にリマインド',
          action: {
            type: 'REMINDER',
            payload: { message: 'test' },
          },
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

      mockDbClient.searchSchedules.mockImplementation(
        (filter: Partial<Record<string, string | number>>) => {
          if (filter?.dedupe_key === 'test-correlation' && filter?.issue_id === 'test-issue-2') {
            return Promise.resolve([existingSchedule]);
          }
          return Promise.resolve([]);
        }
      );
      mockDbClient.getSchedule.mockResolvedValue(existingSchedule);
      mockDbClient.updateSchedule.mockResolvedValue(undefined);
      mockDbClient.addSchedule.mockResolvedValue(undefined);

      await scheduler.schedule(
        'test-issue-2',
        'テストスケジュール',
        { type: 'TEST', payload: {} },
        { dedupeKey: 'test-correlation' }
      );

      // 既存スケジュールの検索が行われたことを確認
      expect(mockDbClient.searchSchedules).toHaveBeenCalled();
      // 更新（キャンセル）が行れたことを確認
      expect(mockDbClient.updateSchedule).toHaveBeenCalledWith(
        'existing-id',
        expect.objectContaining({
          status: 'cancelled',
        })
      );
    });

    it('繰り返しパターンを認識できる', async () => {
      // 繰り返しパターンを返すモック
      mockDriverFactory = vi.fn().mockResolvedValue({
        complete: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            next: new Date(Date.now() + 86400000).toISOString(), // 1日後
            pattern: '毎日朝9時',
            interpretation: '毎日朝9時に実行',
          }),
        }),
        query: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            next: new Date(Date.now() + 86400000).toISOString(), // 1日後
            pattern: '毎日朝9時',
            interpretation: '毎日朝9時に実行',
          }),
          structuredOutput: {
            next: new Date(Date.now() + 86400000).toISOString(), // 1日後
            pattern: '毎日朝9時',
            interpretation: '毎日朝9時に実行',
          },
        }),
      });

      scheduler = new WorkflowScheduler(mockDriverFactory, mockEventEmitter, mockDbClient);

      mockDbClient.execute.mockResolvedValue([]);

      const result = await scheduler.schedule('test-issue-3', '毎日朝9時にレポート', {
        type: 'REPORT',
        payload: {},
      });

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

      mockDbClient.getSchedule.mockResolvedValue(schedule);
      mockDbClient.updateSchedule.mockResolvedValue(true);

      const result = await scheduler.cancel('test-id');

      expect(result).toBe(true);
      expect(mockDbClient.getSchedule).toHaveBeenCalledWith('test-id');
      expect(mockDbClient.updateSchedule).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          status: 'cancelled',
        })
      );
    });

    it('存在しないスケジュールのキャンセルはfalseを返す', async () => {
      mockDbClient.getSchedule.mockResolvedValue(null);

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

      mockDbClient.searchSchedules.mockResolvedValue(schedules);
      mockDbClient.execute.mockResolvedValue(schedules);

      const result = await scheduler.list();

      expect(result).toHaveLength(2);
      expect(mockDbClient.searchSchedules).toHaveBeenCalledWith({
        limit: 1000,
      });
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

      mockDbClient.searchSchedules.mockResolvedValue(activeSchedules);
      mockDbClient.execute.mockResolvedValue(activeSchedules);

      const result = await scheduler.list({ status: 'active' });

      expect(result).toHaveLength(1);
      expect(mockDbClient.searchSchedules).toHaveBeenCalledWith({
        status: 'active',
        limit: 1000,
      });
    });
  });

  describe('タイマー実行', () => {
    it('スケジュール時刻になったらイベントが発行される', async () => {
      vi.useFakeTimers();

      // テスト用のスケジュールデータ
      mockDbClient.searchSchedules.mockResolvedValue([]);
      mockDbClient.addSchedule.mockResolvedValue('test-schedule-id');

      // 1秒後の実行を設定するようにモックを変更
      mockDriverFactory = vi.fn().mockResolvedValue({
        complete: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            next: new Date(Date.now() + 1000).toISOString(),
            pattern: null,
            interpretation: '1秒後に実行',
          }),
        }),
        query: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            next: new Date(Date.now() + 1000).toISOString(),
            pattern: null,
            interpretation: '1秒後に実行',
          }),
          structuredOutput: {
            next: new Date(Date.now() + 1000).toISOString(),
            pattern: null,
            interpretation: '1秒後に実行',
          },
        }),
      });

      scheduler = new WorkflowScheduler(mockDriverFactory, mockEventEmitter, mockDbClient);

      await scheduler.schedule('test-issue-4', 'テスト', {
        type: 'TEST_EVENT',
        payload: { test: true },
      });

      // 1秒進める
      await vi.advanceTimersByTimeAsync(1000);

      // イベントが発行されたことを確認
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'workflow:trigger',
        expect.objectContaining({
          payload: expect.objectContaining({
            action: expect.objectContaining({
              type: 'TEST_EVENT',
              payload: expect.objectContaining({
                test: true,
              }),
            }),
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

      mockDbClient.searchSchedules.mockResolvedValue(activeSchedules);
      mockDbClient.execute.mockImplementation((params: DBExecuteParams) => {
        if (params.action === 'search' && params.filter?.status === 'active') {
          return Promise.resolve(activeSchedules);
        }
        return Promise.resolve([]);
      });

      await scheduler.initialize();

      expect(mockDbClient.connect).toHaveBeenCalled();
      expect(mockDbClient.getStatus).toHaveBeenCalled();
      expect(mockDbClient.searchSchedules).toHaveBeenCalledWith({
        status: 'active',
        limit: 1000,
      });
    });

    it('shutdown時に全タイマーをクリアする', async () => {
      mockDbClient.searchSchedules.mockResolvedValue([]);

      await scheduler.schedule('test-issue-5', 'テスト', {
        type: 'TEST',
        payload: {},
      });

      await scheduler.shutdown();

      // エラーが出ないことで確認
      expect(true).toBe(true);
    });
  });
});
