import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowQueue } from './workflow-queue.js';
import type { WorkflowDefinition } from '@sebas-chan/core';

describe('WorkflowQueue', () => {
  let queue: WorkflowQueue;

  const createMockWorkflow = (name: string): WorkflowDefinition => ({
    name,
    description: `Test workflow ${name}`,
    triggers: {
      eventTypes: ['TEST_EVENT'],
      priority: 50,
    },
    executor: vi.fn(),
  });

  const createMockEvent = (type: string = 'TEST_EVENT') => ({
    type,
    priority: 'normal' as const,
    payload: {},
    timestamp: new Date(),
  });

  beforeEach(() => {
    queue = new WorkflowQueue();
  });

  describe('enqueue', () => {
    it('should add items to the queue', () => {
      const workflow = createMockWorkflow('test1');
      const event = createMockEvent();

      queue.enqueue({
        workflow,
        event,
        priority: 50,
        timestamp: new Date(),
      });

      expect(queue.size()).toBe(1);
    });

    it('should maintain priority order (higher priority first)', () => {
      // 優先度の異なる複数のアイテムを追加
      queue.enqueue({
        workflow: createMockWorkflow('low'),
        event: createMockEvent(),
        priority: 10, // low
        timestamp: new Date(),
      });

      queue.enqueue({
        workflow: createMockWorkflow('high'),
        event: createMockEvent(),
        priority: 100, // high
        timestamp: new Date(),
      });

      queue.enqueue({
        workflow: createMockWorkflow('normal'),
        event: createMockEvent(),
        priority: 50, // normal
        timestamp: new Date(),
      });

      // デキューして優先度順になっているか確認
      const first = queue.dequeue();
      expect(first?.workflow.name).toBe('high');

      const second = queue.dequeue();
      expect(second?.workflow.name).toBe('normal');

      const third = queue.dequeue();
      expect(third?.workflow.name).toBe('low');
    });

    it('should handle items with the same priority (FIFO)', () => {
      queue.enqueue({
        workflow: createMockWorkflow('first'),
        event: createMockEvent(),
        priority: 50,
        timestamp: new Date(),
      });

      queue.enqueue({
        workflow: createMockWorkflow('second'),
        event: createMockEvent(),
        priority: 50,
        timestamp: new Date(),
      });

      queue.enqueue({
        workflow: createMockWorkflow('third'),
        event: createMockEvent(),
        priority: 50,
        timestamp: new Date(),
      });

      // 同じ優先度の場合は先入先出
      expect(queue.dequeue()?.workflow.name).toBe('first');
      expect(queue.dequeue()?.workflow.name).toBe('second');
      expect(queue.dequeue()?.workflow.name).toBe('third');
    });
  });

  describe('dequeue', () => {
    it('should return undefined when queue is empty', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    it('should move item to running state', () => {
      queue.enqueue({
        workflow: createMockWorkflow('test'),
        event: createMockEvent(),
        priority: 50,
        timestamp: new Date(),
      });

      expect(queue.size()).toBe(1);
      expect(queue.runningSize()).toBe(0);

      const item = queue.dequeue();
      expect(item).toBeDefined();
      expect(item?.status).toBe('running');

      expect(queue.size()).toBe(0);
      expect(queue.runningSize()).toBe(1);
    });
  });

  describe('markCompleted', () => {
    it('should mark running item as completed', () => {
      queue.enqueue({
        workflow: createMockWorkflow('test'),
        event: createMockEvent(),
        priority: 50,
        timestamp: new Date(),
      });

      const item = queue.dequeue();
      expect(item).toBeDefined();

      queue.markCompleted(item!.id, true);
      expect(queue.runningSize()).toBe(0);
    });

    it('should mark running item as failed', () => {
      queue.enqueue({
        workflow: createMockWorkflow('test'),
        event: createMockEvent(),
        priority: 50,
        timestamp: new Date(),
      });

      const item = queue.dequeue();
      expect(item).toBeDefined();

      queue.markCompleted(item!.id, false);
      expect(queue.runningSize()).toBe(0);
    });

    it('should warn when marking non-existent item', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      queue.markCompleted('non-existent-id', true);
      expect(warnSpy).toHaveBeenCalledWith('Workflow non-existent-id not found in running queue');

      warnSpy.mockRestore();
    });
  });

  describe('retry', () => {
    it('should re-enqueue failed item with lower priority', () => {
      queue.enqueue({
        workflow: createMockWorkflow('test'),
        event: createMockEvent(),
        priority: 50,
        timestamp: new Date(),
      });

      const item = queue.dequeue();
      expect(item).toBeDefined();

      const retried = queue.retry(item!.id);
      expect(retried).toBe(true);
      expect(queue.size()).toBe(1);
      expect(queue.runningSize()).toBe(0);

      const retriedItem = queue.dequeue();
      expect(retriedItem?.priority).toBe(49); // priority decreased by 1
      expect(retriedItem?.retryCount).toBe(1);
    });

    it('should fail after max retries', () => {
      queue.enqueue({
        workflow: createMockWorkflow('test'),
        event: createMockEvent(),
        priority: 50,
        timestamp: new Date(),
      });

      let item = queue.dequeue();

      // Retry 3 times (max)
      for (let i = 0; i < 3; i++) {
        expect(queue.retry(item!.id)).toBe(true);
        item = queue.dequeue();
        expect(item?.retryCount).toBe(i + 1);
      }

      // 4th retry should fail
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(queue.retry(item!.id)).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('exceeded max retries'));
      errorSpy.mockRestore();
    });

    it('should return false for non-existent item', () => {
      expect(queue.retry('non-existent-id')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all queued and running items', () => {
      queue.enqueue({
        workflow: createMockWorkflow('test1'),
        event: createMockEvent(),
        priority: 50,
        timestamp: new Date(),
      });

      queue.enqueue({
        workflow: createMockWorkflow('test2'),
        event: createMockEvent(),
        priority: 50,
        timestamp: new Date(),
      });

      queue.dequeue(); // Move one to running

      expect(queue.size()).toBe(1);
      expect(queue.runningSize()).toBe(1);

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.runningSize()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', () => {
      queue.enqueue({
        workflow: createMockWorkflow('workflow1'),
        event: createMockEvent(),
        priority: 100,
        timestamp: new Date(),
      });

      queue.enqueue({
        workflow: createMockWorkflow('workflow1'),
        event: createMockEvent(),
        priority: 50,
        timestamp: new Date(),
      });

      queue.enqueue({
        workflow: createMockWorkflow('workflow2'),
        event: createMockEvent(),
        priority: 10,
        timestamp: new Date(),
      });

      queue.dequeue(); // Move one to running

      const stats = queue.getStats();

      expect(stats.pending).toBe(2);
      expect(stats.running).toBe(1);
      expect(stats.avgPriority).toBe((100 + 50 + 10) / 3);
      expect(stats.workflowCounts).toEqual({
        workflow1: 2,
        workflow2: 1,
      });
    });

    it('should handle empty queue', () => {
      const stats = queue.getStats();

      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.avgPriority).toBe(0);
      expect(stats.workflowCounts).toEqual({});
    });
  });

  describe('priority order edge cases', () => {
    it('should handle priority 0 correctly', () => {
      queue.enqueue({
        workflow: createMockWorkflow('zero'),
        event: createMockEvent(),
        priority: 0,
        timestamp: new Date(),
      });

      queue.enqueue({
        workflow: createMockWorkflow('one'),
        event: createMockEvent(),
        priority: 1,
        timestamp: new Date(),
      });

      expect(queue.dequeue()?.workflow.name).toBe('one');
      expect(queue.dequeue()?.workflow.name).toBe('zero');
    });

    it('should handle negative priorities correctly', () => {
      queue.enqueue({
        workflow: createMockWorkflow('negative'),
        event: createMockEvent(),
        priority: -10,
        timestamp: new Date(),
      });

      queue.enqueue({
        workflow: createMockWorkflow('positive'),
        event: createMockEvent(),
        priority: 10,
        timestamp: new Date(),
      });

      queue.enqueue({
        workflow: createMockWorkflow('zero'),
        event: createMockEvent(),
        priority: 0,
        timestamp: new Date(),
      });

      expect(queue.dequeue()?.workflow.name).toBe('positive');
      expect(queue.dequeue()?.workflow.name).toBe('zero');
      expect(queue.dequeue()?.workflow.name).toBe('negative');
    });
  });
});
