import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DBClient } from './index';

describe('DBClient - Schedule Methods', () => {
  let client: DBClient;

  beforeEach(() => {
    client = new DBClient();
    // sendRequestをモック化
    client.sendRequest = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addSchedule', () => {
    it('スケジュールを追加できる', async () => {
      const schedule = {
        id: 'test-schedule-1',
        issue_id: 'issue-1',
        request: '毎日朝9時にレポート',
        action: {
          type: 'REPORT',
          payload: { format: 'pdf' }
        },
        next_run: new Date().toISOString(),
        pattern: '毎日朝9時',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      client.sendRequest = vi.fn().mockResolvedValue({ success: true });

      await client.addSchedule(schedule);

      expect(client.sendRequest).toHaveBeenCalledWith('addSchedule', schedule);
    });
  });

  describe('getSchedule', () => {
    it('IDでスケジュールを取得できる', async () => {
      const scheduleId = 'test-schedule-1';
      const expectedSchedule = {
        id: scheduleId,
        issue_id: 'issue-1',
        request: 'テストスケジュール',
        status: 'active'
      };

      client.sendRequest = vi.fn().mockResolvedValue(expectedSchedule);

      const result = await client.getSchedule(scheduleId);

      expect(client.sendRequest).toHaveBeenCalledWith('getSchedule', { id: scheduleId });
      expect(result).toEqual(expectedSchedule);
    });

    it('存在しないIDの場合nullを返す', async () => {
      client.sendRequest = vi.fn().mockResolvedValue(null);

      const result = await client.getSchedule('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('searchSchedules', () => {
    it('フィルタなしで全スケジュールを検索できる', async () => {
      const schedules = [
        { id: '1', status: 'active' },
        { id: '2', status: 'completed' }
      ];

      client.sendRequest = vi.fn().mockResolvedValue(schedules);

      const result = await client.searchSchedules({ limit: 100 });

      expect(client.sendRequest).toHaveBeenCalledWith('searchSchedules', { limit: 100 });
      expect(result).toEqual(schedules);
    });

    it('ステータスでフィルタリングできる', async () => {
      const activeSchedules = [
        { id: '1', status: 'active' }
      ];

      client.sendRequest = vi.fn().mockResolvedValue(activeSchedules);

      const result = await client.searchSchedules({
        status: 'active',
        limit: 100
      });

      expect(client.sendRequest).toHaveBeenCalledWith('searchSchedules', { status: 'active', limit: 100 });
      expect(result).toEqual(activeSchedules);
    });

    it('issue_idでフィルタリングできる', async () => {
      const issueSchedules = [
        { id: '1', issue_id: 'issue-1', status: 'active' }
      ];

      client.sendRequest = vi.fn().mockResolvedValue(issueSchedules);

      const result = await client.searchSchedules({
        issue_id: 'issue-1',
        limit: 50
      });

      expect(client.sendRequest).toHaveBeenCalledWith('searchSchedules', { issue_id: 'issue-1', limit: 50 });
      expect(result).toEqual(issueSchedules);
    });

    it('dedupe_keyでフィルタリングできる', async () => {
      const dedupeSchedules = [
        { id: '1', dedupe_key: 'daily-report', status: 'active' }
      ];

      client.sendRequest = vi.fn().mockResolvedValue(dedupeSchedules);

      const result = await client.searchSchedules({
        dedupe_key: 'daily-report',
        issue_id: 'issue-1',
        limit: 10
      });

      expect(client.sendRequest).toHaveBeenCalledWith('searchSchedules', {
        dedupe_key: 'daily-report',
        issue_id: 'issue-1',
        limit: 10
      });
      expect(result).toEqual(dedupeSchedules);
    });
  });

  describe('updateSchedule', () => {
    it('スケジュールを更新できる', async () => {
      const scheduleId = 'test-schedule-1';
      const updates = {
        status: 'cancelled',
        updated_at: new Date().toISOString()
      };

      client.sendRequest = vi.fn().mockResolvedValue({ success: true });

      await client.updateSchedule(scheduleId, updates);

      expect(client.sendRequest).toHaveBeenCalledWith('updateSchedule', {
        id: scheduleId,
        updates
      });
    });

    it('next_runを更新できる', async () => {
      const scheduleId = 'test-schedule-1';
      const nextRun = new Date(Date.now() + 86400000).toISOString();
      const updates = {
        next_run: nextRun,
        occurrences: 1,
        last_run: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      client.sendRequest = vi.fn().mockResolvedValue({ success: true });

      await client.updateSchedule(scheduleId, updates);

      expect(client.sendRequest).toHaveBeenCalledWith('updateSchedule', {
        id: scheduleId,
        updates
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('addScheduleでエラーが発生した場合、エラーを投げる', async () => {
      client.sendRequest = vi.fn().mockRejectedValue(new Error('DB Error'));

      await expect(client.addSchedule({ id: 'test' } as any))
        .rejects.toThrow('DB Error');
    });

    it('getScheduleでエラーが発生した場合、エラーを投げる', async () => {
      client.sendRequest = vi.fn().mockRejectedValue(new Error('Connection failed'));

      await expect(client.getSchedule('test-id'))
        .rejects.toThrow('Connection failed');
    });

    it('searchSchedulesでエラーが発生した場合、エラーを投げる', async () => {
      client.sendRequest = vi.fn().mockRejectedValue(new Error('Query failed'));

      await expect(client.searchSchedules({}))
        .rejects.toThrow('Query failed');
    });

    it('updateScheduleでエラーが発生した場合、エラーを投げる', async () => {
      client.sendRequest = vi.fn().mockRejectedValue(new Error('Update failed'));

      await expect(client.updateSchedule('id', {}))
        .rejects.toThrow('Update failed');
    });
  });
});