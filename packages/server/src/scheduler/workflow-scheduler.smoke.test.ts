import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { WorkflowScheduler } from './workflow-scheduler.js';
import type { DriverFactory } from '@sebas-chan/core';
import type { DBClient } from '@sebas-chan/db';

/**
 * WorkflowSchedulerのスモークテスト
 * 基本的な動作を確認
 */
describe('WorkflowScheduler (Smoke Test)', () => {
  it('should instantiate without errors', () => {
    const mockDriverFactory = vi.fn() as DriverFactory;

    const mockEventEmitter = new EventEmitter();

    const mockDbClient = {
      isConnected: vi.fn().mockReturnValue(false),
      connect: vi.fn(),
      execute: vi.fn(),
      getStatus: vi.fn(),
    } as unknown as DBClient;

    const scheduler = new WorkflowScheduler(mockDriverFactory, mockEventEmitter, mockDbClient);

    expect(scheduler).toBeDefined();
    expect(scheduler).toBeInstanceOf(WorkflowScheduler);
  });

  it('should have required methods', () => {
    const mockDriverFactory = {} as DriverFactory;
    const mockEventEmitter = new EventEmitter();
    const mockDbClient = {} as unknown as DBClient;

    const scheduler = new WorkflowScheduler(mockDriverFactory, mockEventEmitter, mockDbClient);

    // 新しいAPIメソッドの存在確認
    expect(scheduler.schedule).toBeDefined();
    expect(scheduler.cancel).toBeDefined();
    expect(scheduler.listByIssue).toBeDefined();
    expect(scheduler.cancelByIssue).toBeDefined();
    expect(scheduler.initialize).toBeDefined();
    expect(scheduler.shutdown).toBeDefined();
  });

  it('should call driver for natural language interpretation', async () => {
    const mockDriver = {
      query: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          next: '2025-01-26T09:00:00+09:00',
          pattern: null,
          interpretation: 'テスト実行',
        }),
        structuredOutput: {
          next: '2025-01-26T09:00:00+09:00',
          pattern: null,
          interpretation: 'テスト実行',
        },
      }),
    };

    const mockDriverFactory = vi.fn().mockResolvedValue(mockDriver) as DriverFactory;

    const mockEventEmitter = new EventEmitter();

    const mockDbClient = {
      isConnected: vi.fn().mockReturnValue(false),
      connect: vi.fn(),
      execute: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn(),
      addSchedule: vi.fn().mockResolvedValue(undefined),
      searchSchedules: vi.fn().mockResolvedValue([]),
    } as unknown as DBClient;

    const scheduler = new WorkflowScheduler(mockDriverFactory, mockEventEmitter, mockDbClient);

    const result = await scheduler.schedule('issue-123', '3日後の朝9時', {
      type: 'reminder',
      payload: {},
    });

    expect(result).toBeDefined();
    expect(result.scheduleId).toBeDefined();
    expect(result.interpretation).toBe('テスト実行');
    expect(mockDriverFactory).toHaveBeenCalled();
    expect(mockDriver.query).toHaveBeenCalled();
  });

  it('should emit SCHEDULE_TRIGGERED event format', async () => {
    vi.useFakeTimers();

    const mockDriver = {
      query: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          next: new Date(Date.now() + 100).toISOString(), // 100ms後
          pattern: null,
          interpretation: '即座に実行',
        }),
        structuredOutput: {
          next: new Date(Date.now() + 100).toISOString(), // 100ms後
          pattern: null,
          interpretation: '即座に実行',
        },
      }),
    };

    const mockDriverFactory = vi.fn().mockResolvedValue(mockDriver) as DriverFactory;

    const mockEventEmitter = new EventEmitter();
    const emitSpy = vi.spyOn(mockEventEmitter, 'emit');

    const mockDbClient = {
      isConnected: vi.fn().mockReturnValue(false),
      connect: vi.fn(),
      execute: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn(),
      addSchedule: vi.fn().mockResolvedValue(undefined),
      searchSchedules: vi.fn().mockResolvedValue([]),
    } as unknown as DBClient;

    const scheduler = new WorkflowScheduler(mockDriverFactory, mockEventEmitter, mockDbClient);

    await scheduler.schedule('issue-123', '今すぐ', {
      type: 'reminder',
      payload: {},
    });

    // タイマーを進める
    await vi.advanceTimersByTimeAsync(150);

    // SCHEDULE_TRIGGEREDイベントの形式を確認
    expect(emitSpy).toHaveBeenCalledWith(
      'workflow:trigger',
      expect.objectContaining({
        type: 'SCHEDULE_TRIGGERED',
        payload: expect.objectContaining({
          issueId: 'issue-123',
          scheduleId: expect.any(String),
          action: expect.objectContaining({
            type: 'reminder',
            payload: {},
          }),
          originalRequest: '今すぐ',
        }),
      })
    );

    vi.useRealTimers();
  });
});
