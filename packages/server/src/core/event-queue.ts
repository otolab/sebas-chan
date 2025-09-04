import { Event, EventQueue as IEventQueue } from '@sebas-chan/shared-types';

export class EventQueue implements IEventQueue {
  private queue: Event[] = [];

  enqueue(event: Event): void {
    this.queue.push(event);
    this.sortQueue();
  }

  dequeue(): Event | null {
    return this.queue.shift() || null;
  }

  peek(): Event | null {
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
