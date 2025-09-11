import { describe, it, expect, beforeEach } from 'vitest';
import { EventQueue } from './event-queue';
import { Event, WorkflowType } from '@sebas-chan/shared-types';

describe('EventQueue', () => {
  let queue: EventQueue;

  const createEvent = (
    id: string,
    priority: 'high' | 'normal' | 'low',
    timestamp: Date,
    type: WorkflowType = 'PROCESS_USER_REQUEST'
  ): Event => ({
    id,
    type,
    priority,
    payload: { testId: id },
    timestamp,
  });

  beforeEach(() => {
    queue = new EventQueue();
  });

  describe('enqueue/dequeue', () => {
    it('should enqueue and dequeue events in FIFO order for same priority', () => {
      const event1: Event = {
        id: 'event1',
        type: 'PROCESS_USER_REQUEST',
        priority: 'normal',
        payload: { test: 1 },
        timestamp: new Date('2024-01-01T00:00:00Z'),
      };

      const event2: Event = {
        id: 'event2',
        type: 'INGEST_INPUT',
        priority: 'normal',
        payload: { test: 2 },
        timestamp: new Date('2024-01-01T00:00:01Z'),
      };

      queue.enqueue(event1);
      queue.enqueue(event2);

      expect(queue.dequeue()).toEqual(event1);
      expect(queue.dequeue()).toEqual(event2);
      expect(queue.dequeue()).toBeNull();
    });

    it('should prioritize high priority events', () => {
      const highPriorityEvent: Event = {
        id: 'high',
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: {},
        timestamp: new Date('2024-01-01T00:00:02Z'),
      };

      const normalPriorityEvent: Event = {
        id: 'normal',
        type: 'INGEST_INPUT',
        priority: 'normal',
        payload: {},
        timestamp: new Date('2024-01-01T00:00:01Z'),
      };

      const lowPriorityEvent: Event = {
        id: 'low',
        type: 'SALVAGE_FROM_POND',
        priority: 'low',
        payload: {},
        timestamp: new Date('2024-01-01T00:00:00Z'),
      };

      queue.enqueue(lowPriorityEvent);
      queue.enqueue(normalPriorityEvent);
      queue.enqueue(highPriorityEvent);

      expect(queue.dequeue()?.id).toBe('high');
      expect(queue.dequeue()?.id).toBe('normal');
      expect(queue.dequeue()?.id).toBe('low');
    });

    it('should maintain timestamp order within same priority', () => {
      const event1: Event = {
        id: 'event1',
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: {},
        timestamp: new Date('2024-01-01T00:00:02Z'),
      };

      const event2: Event = {
        id: 'event2',
        type: 'INGEST_INPUT',
        priority: 'high',
        payload: {},
        timestamp: new Date('2024-01-01T00:00:01Z'),
      };

      queue.enqueue(event1);
      queue.enqueue(event2);

      expect(queue.dequeue()?.id).toBe('event2');
      expect(queue.dequeue()?.id).toBe('event1');
    });
  });

  describe('peek', () => {
    it('should return next event without removing it', () => {
      const event: Event = {
        id: 'event1',
        type: 'PROCESS_USER_REQUEST',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      };

      queue.enqueue(event);

      expect(queue.peek()).toEqual(event);
      expect(queue.size()).toBe(1);
      expect(queue.peek()).toEqual(event);
    });

    it('should return null for empty queue', () => {
      expect(queue.peek()).toBeNull();
    });
  });

  describe('size', () => {
    it('should return the number of events in queue', () => {
      expect(queue.size()).toBe(0);

      queue.enqueue({
        id: 'event1',
        type: 'PROCESS_USER_REQUEST',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      expect(queue.size()).toBe(1);

      queue.enqueue({
        id: 'event2',
        type: 'INGEST_INPUT',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      expect(queue.size()).toBe(2);

      queue.dequeue();
      expect(queue.size()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all events from queue', () => {
      queue.enqueue({
        id: 'event1',
        type: 'PROCESS_USER_REQUEST',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      queue.enqueue({
        id: 'event2',
        type: 'INGEST_INPUT',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      expect(queue.size()).toBe(2);

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.dequeue()).toBeNull();
    });
  });

  describe('priority ordering edge cases', () => {
    it('should handle mixed priority events correctly', () => {
      const base = new Date('2024-01-01T00:00:00Z');

      // 異なる優先度と時刻のイベントを複雑な順序で追加
      const events = [
        createEvent('normal1', 'normal', new Date(base.getTime() + 1000)),
        createEvent('low1', 'low', new Date(base.getTime())),
        createEvent('high1', 'high', new Date(base.getTime() + 3000)),
        createEvent('high2', 'high', new Date(base.getTime() + 1000)),
        createEvent('normal2', 'normal', new Date(base.getTime())),
        createEvent('low2', 'low', new Date(base.getTime() + 2000)),
        createEvent('high3', 'high', new Date(base.getTime() + 2000)),
      ];

      events.forEach((e) => queue.enqueue(e));

      // 期待される順序: high(時刻順) -> normal(時刻順) -> low(時刻順)
      const expectedOrder = [
        'high2', // high, time: 1000
        'high3', // high, time: 2000
        'high1', // high, time: 3000
        'normal2', // normal, time: 0
        'normal1', // normal, time: 1000
        'low1', // low, time: 0
        'low2', // low, time: 2000
      ];

      expectedOrder.forEach((expectedId) => {
        const event = queue.dequeue();
        expect(event?.id).toBe(expectedId);
      });

      expect(queue.dequeue()).toBeNull();
    });

    it('should handle events with same priority and timestamp', () => {
      const timestamp = new Date('2024-01-01T00:00:00Z');

      // 同じ優先度と時刻のイベント
      const event1 = createEvent('event1', 'normal', timestamp);
      const event2 = createEvent('event2', 'normal', timestamp);
      const event3 = createEvent('event3', 'normal', timestamp);

      queue.enqueue(event1);
      queue.enqueue(event2);
      queue.enqueue(event3);

      // 同じ優先度と時刻の場合、追加順序が保たれるべき
      expect(queue.dequeue()?.id).toBe('event1');
      expect(queue.dequeue()?.id).toBe('event2');
      expect(queue.dequeue()?.id).toBe('event3');
    });

    it('should handle large number of events', () => {
      const base = new Date('2024-01-01T00:00:00Z');
      const eventCount = 1000;
      const priorities: Array<'high' | 'normal' | 'low'> = ['high', 'normal', 'low'];

      // 大量のイベントを追加
      for (let i = 0; i < eventCount; i++) {
        const priority = priorities[i % 3];
        const timestamp = new Date(base.getTime() + i);
        queue.enqueue(createEvent(`event${i}`, priority, timestamp));
      }

      expect(queue.size()).toBe(eventCount);

      // 優先度順に取り出されることを確認
      let lastPriority: 'high' | 'normal' | 'low' | null = null;
      let lastTimestamp: Date | null = null;
      let highCount = 0,
        normalCount = 0,
        lowCount = 0;

      while (queue.size() > 0) {
        const event = queue.dequeue();
        if (!event) break;

        // 優先度カウント
        if (event.priority === 'high') highCount++;
        else if (event.priority === 'normal') normalCount++;
        else if (event.priority === 'low') lowCount++;

        // 優先度が変わる時のチェック
        if (lastPriority && lastPriority !== event.priority) {
          const priorityOrder = { high: 0, normal: 1, low: 2 };
          expect(priorityOrder[event.priority]).toBeGreaterThan(priorityOrder[lastPriority]);
          lastTimestamp = null; // 優先度が変わったらタイムスタンプをリセット
        }

        // 同じ優先度内では時刻順
        if (lastPriority === event.priority && lastTimestamp) {
          expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(lastTimestamp.getTime());
        }

        lastPriority = event.priority;
        lastTimestamp = event.timestamp;
      }

      // 各優先度のイベント数を確認
      expect(highCount).toBe(Math.floor(eventCount / 3) + (eventCount % 3 > 0 ? 1 : 0));
      expect(normalCount).toBe(Math.floor(eventCount / 3) + (eventCount % 3 > 1 ? 1 : 0));
      expect(lowCount).toBe(Math.floor(eventCount / 3));
    });

    it('should maintain order after multiple enqueue/dequeue operations', () => {
      const base = new Date('2024-01-01T00:00:00Z');

      // 初期イベントを追加
      queue.enqueue(createEvent('high1', 'high', new Date(base.getTime() + 2000)));
      queue.enqueue(createEvent('normal1', 'normal', base));
      queue.enqueue(createEvent('low1', 'low', base));

      // 一部を取り出し
      expect(queue.dequeue()?.id).toBe('high1');

      // 新しいイベントを追加
      queue.enqueue(createEvent('high2', 'high', base));
      queue.enqueue(createEvent('high3', 'high', new Date(base.getTime() + 1000)));

      // 順序を確認
      expect(queue.dequeue()?.id).toBe('high2'); // high, time: 0
      expect(queue.dequeue()?.id).toBe('high3'); // high, time: 1000
      expect(queue.dequeue()?.id).toBe('normal1'); // normal, time: 0
      expect(queue.dequeue()?.id).toBe('low1'); // low, time: 0
      expect(queue.dequeue()).toBeNull();
    });

    it('should handle events with retry counts', () => {
      const base = new Date('2024-01-01T00:00:00Z');

      const eventWithRetry: Event = {
        id: 'retry-event',
        type: 'PROCESS_USER_REQUEST',
        priority: 'normal',
        payload: {},
        timestamp: base,
        retryCount: 1,
        maxRetries: 3,
      };

      const normalEvent = createEvent('normal', 'normal', new Date(base.getTime() + 1000));

      queue.enqueue(eventWithRetry);
      queue.enqueue(normalEvent);

      // リトライ情報を持つイベントも正しく処理される
      const first = queue.dequeue();
      expect(first?.id).toBe('retry-event');
      expect(first?.retryCount).toBe(1);
      expect(first?.maxRetries).toBe(3);

      expect(queue.dequeue()?.id).toBe('normal');
    });

    it('should handle empty payload events', () => {
      const event: Event = {
        id: 'empty-payload',
        type: 'COLLECT_SYSTEM_STATS',
        priority: 'low',
        payload: {},
        timestamp: new Date(),
      };

      queue.enqueue(event);
      const dequeued = queue.dequeue();

      expect(dequeued).toEqual(event);
      expect(dequeued?.payload).toEqual({});
    });

    it('should not mutate original events', () => {
      const originalEvent: Event = {
        id: 'original',
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { data: 'test' },
        timestamp: new Date('2024-01-01'),
      };

      const eventCopy = { ...originalEvent };

      queue.enqueue(originalEvent);

      // キューから取り出した後も元のイベントは変更されない
      const dequeued = queue.dequeue();

      expect(originalEvent).toEqual(eventCopy);
      expect(dequeued).toEqual(originalEvent);
    });
  });

  describe('concurrent operations', () => {
    it('should handle rapid enqueue/dequeue operations', () => {
      const results: string[] = [];
      const base = new Date();

      // 高速でenqueue/dequeueを繰り返す
      for (let i = 0; i < 100; i++) {
        if (i % 3 === 0 && queue.size() > 0) {
          const event = queue.dequeue();
          if (event) results.push(event.id);
        } else {
          const priority = i % 2 === 0 ? 'high' : 'normal';
          queue.enqueue(
            createEvent(`event${i}`, priority as Event['priority'], new Date(base.getTime() + i))
          );
        }
      }

      // 残りをすべて取り出す
      while (queue.size() > 0) {
        const event = queue.dequeue();
        if (event) results.push(event.id);
      }

      // 取り出されたイベントが存在し、重複がないことを確認
      expect(results.length).toBeGreaterThan(0);
      expect(new Set(results).size).toBe(results.length);
    });
  });
});
