/**
 * ワークフローキュー
 * 実行待ちのワークフローを管理
 */

import type { WorkflowQueueItem, WorkflowQueueInterface } from '@sebas-chan/core';

export class WorkflowQueue implements WorkflowQueueInterface {
  private queue: WorkflowQueueItem[] = [];
  private running: Map<string, WorkflowQueueItem> = new Map();
  private idCounter = 0;

  /**
   * ユニークIDを生成
   */
  private generateId(): string {
    return `wf-${Date.now()}-${++this.idCounter}`;
  }

  /**
   * アイテムをキューに追加
   */
  enqueue(item: Omit<WorkflowQueueItem, 'id' | 'status'>): void {
    const fullItem: WorkflowQueueItem = {
      ...item,
      id: this.generateId(),
      status: 'pending',
      retryCount: 0,
    };

    // 優先度順に挿入（高い優先度が先）
    const insertIndex = this.queue.findIndex((existing) => existing.priority < fullItem.priority);

    if (insertIndex === -1) {
      this.queue.push(fullItem);
    } else {
      this.queue.splice(insertIndex, 0, fullItem);
    }

    console.log(
      `Enqueued workflow: ${fullItem.workflow.name} (priority: ${fullItem.priority}, queue size: ${this.queue.length})`
    );
  }

  /**
   * 次のアイテムを取得して実行中に移動
   */
  dequeue(): WorkflowQueueItem | undefined {
    const item = this.queue.shift();
    if (!item) {
      return undefined;
    }

    item.status = 'running';
    this.running.set(item.id, item);

    console.log(`Dequeued workflow: ${item.workflow.name} (remaining: ${this.queue.length})`);

    return item;
  }

  /**
   * ワークフローの完了を記録
   */
  markCompleted(id: string, success: boolean): void {
    const item = this.running.get(id);
    if (!item) {
      console.warn(`Workflow ${id} not found in running queue`);
      return;
    }

    item.status = success ? 'completed' : 'failed';
    this.running.delete(id);

    console.log(`Workflow ${item.workflow.name} ${item.status} (running: ${this.running.size})`);
  }

  /**
   * 失敗したワークフローをリトライキューに追加
   */
  retry(id: string): boolean {
    const item = this.running.get(id);
    if (!item) {
      return false;
    }

    const maxRetries = 3;
    if ((item.retryCount ?? 0) >= maxRetries) {
      console.error(`Workflow ${item.workflow.name} exceeded max retries (${maxRetries})`);
      this.markCompleted(id, false);
      return false;
    }

    item.retryCount = (item.retryCount ?? 0) + 1;
    item.status = 'pending';
    this.running.delete(id);

    // リトライは優先度を下げて再キュー
    item.priority = Math.max(0, item.priority - 1);
    this.queue.push(item);

    console.log(`Retrying workflow ${item.workflow.name} (attempt ${item.retryCount})`);
    return true;
  }

  /**
   * キューのサイズ
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * 実行中のワークフロー数
   */
  runningSize(): number {
    return this.running.size;
  }

  /**
   * キューをクリア
   */
  clear(): void {
    this.queue = [];
    this.running.clear();
    console.log('Cleared workflow queue');
  }

  /**
   * 実行中のワークフローを取得
   */
  getRunning(): WorkflowQueueItem[] {
    return Array.from(this.running.values());
  }

  /**
   * 保留中のワークフローを取得
   */
  getPending(): WorkflowQueueItem[] {
    return [...this.queue];
  }

  /**
   * キューの統計情報を取得
   */
  getStats(): {
    pending: number;
    running: number;
    avgPriority: number;
    workflowCounts: Record<string, number>;
  } {
    const allItems = [...this.queue, ...Array.from(this.running.values())];
    const workflowCounts: Record<string, number> = {};

    let totalPriority = 0;
    for (const item of allItems) {
      totalPriority += item.priority;
      workflowCounts[item.workflow.name] = (workflowCounts[item.workflow.name] ?? 0) + 1;
    }

    return {
      pending: this.queue.length,
      running: this.running.size,
      avgPriority: allItems.length > 0 ? totalPriority / allItems.length : 0,
      workflowCounts,
    };
  }
}
