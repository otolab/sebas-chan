/**
 * 拡張されたワークフローレジストリ
 * 1イベント対nワークフローをサポート
 */

import type { WorkflowDefinition, IWorkflowRegistry } from './workflow-types.js';

export class WorkflowRegistry implements IWorkflowRegistry {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private eventTypeIndex: Map<string, Set<string>> = new Map();

  /**
   * ワークフローを登録
   */
  register(workflow: WorkflowDefinition): void {
    // 名前で登録
    this.workflows.set(workflow.name, workflow);

    // イベントタイプインデックスを更新
    for (const eventType of workflow.triggers.eventTypes) {
      if (!this.eventTypeIndex.has(eventType)) {
        this.eventTypeIndex.set(eventType, new Set());
      }
      this.eventTypeIndex.get(eventType)!.add(workflow.name);
    }

    console.log(
      `Registered workflow: ${workflow.name} for events: ${workflow.triggers.eventTypes.join(', ')}`
    );
  }

  /**
   * 全ワークフローを取得
   */
  getAll(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * 名前でワークフローを取得
   */
  getByName(name: string): WorkflowDefinition | undefined {
    return this.workflows.get(name);
  }

  /**
   * イベントタイプでワークフローを検索
   */
  findByEventType(eventType: string): WorkflowDefinition[] {
    const workflowNames = this.eventTypeIndex.get(eventType);
    if (!workflowNames) {
      return [];
    }

    const workflows: WorkflowDefinition[] = [];
    for (const name of workflowNames) {
      const workflow = this.workflows.get(name);
      if (workflow) {
        workflows.push(workflow);
      }
    }

    return workflows;
  }

  /**
   * ワークフローを削除
   */
  unregister(name: string): boolean {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      return false;
    }

    // インデックスから削除
    for (const eventType of workflow.triggers.eventTypes) {
      const names = this.eventTypeIndex.get(eventType);
      if (names) {
        names.delete(name);
        if (names.size === 0) {
          this.eventTypeIndex.delete(eventType);
        }
      }
    }

    // ワークフローを削除
    this.workflows.delete(name);
    console.log(`Unregistered workflow: ${name}`);
    return true;
  }

  /**
   * 全ワークフローをクリア
   */
  clear(): void {
    this.workflows.clear();
    this.eventTypeIndex.clear();
    console.log('Cleared all workflows');
  }

  /**
   * 登録されているワークフロー数を取得
   */
  size(): number {
    return this.workflows.size;
  }

  /**
   * デバッグ情報を取得
   */
  getDebugInfo(): {
    totalWorkflows: number;
    eventTypes: string[];
    eventTypeMapping: Record<string, string[]>;
  } {
    const eventTypeMapping: Record<string, string[]> = {};
    for (const [eventType, names] of this.eventTypeIndex.entries()) {
      eventTypeMapping[eventType] = Array.from(names);
    }

    return {
      totalWorkflows: this.workflows.size,
      eventTypes: Array.from(this.eventTypeIndex.keys()),
      eventTypeMapping,
    };
  }
}
