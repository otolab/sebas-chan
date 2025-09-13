import type { BaseWorkflow, WorkflowRegistry as IWorkflowRegistry } from './types.js';

export class WorkflowRegistry implements IWorkflowRegistry {
  private workflows: Map<string, BaseWorkflow> = new Map();

  /**
   * ワークフローを登録
   */
  register(eventType: string, workflow: BaseWorkflow): void {
    if (this.workflows.has(eventType)) {
      console.warn(`Workflow for event type '${eventType}' is being overwritten`);
    }

    this.workflows.set(eventType, workflow);
    console.log(`Workflow registered for event type: ${eventType}`);
  }

  /**
   * イベントタイプに対応するワークフローを取得
   */
  get(eventType: string): BaseWorkflow | undefined {
    return this.workflows.get(eventType);
  }

  /**
   * 全ワークフローを取得
   */
  getAll(): Map<string, BaseWorkflow> {
    return new Map(this.workflows);
  }

  /**
   * 登録されているイベントタイプ一覧を取得
   */
  getEventTypes(): string[] {
    return Array.from(this.workflows.keys());
  }

  /**
   * ワークフローが登録されているか確認
   */
  has(eventType: string): boolean {
    return this.workflows.has(eventType);
  }

  /**
   * ワークフローを削除
   */
  unregister(eventType: string): boolean {
    return this.workflows.delete(eventType);
  }

  /**
   * 全ワークフローをクリア
   */
  clear(): void {
    this.workflows.clear();
  }
}
