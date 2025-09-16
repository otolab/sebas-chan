import type { AgentEvent } from './index.js';

export interface EventQueue {
  enqueue(event: AgentEvent): void;
  dequeue(): AgentEvent | null;
  peek(): AgentEvent | null;
  size(): number;
  clear(): void;
}

export class EventQueueImpl implements EventQueue {
  private queue: AgentEvent[] = [];

  enqueue(event: AgentEvent): void {
    this.queue.push(event);
    this.sortQueue();
  }

  dequeue(): AgentEvent | null {
    return this.queue.shift() || null;
  }

  peek(): AgentEvent | null {
    return this.queue[0] || null;
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return a.timestamp.getTime() - b.timestamp.getTime();
    });
  }
}