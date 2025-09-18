import type { FunctionalWorkflowRegistry, WorkflowDefinition } from './functional-types.js';

/**
 * 関数ベースのワークフローレジストリ実装
 */
export class WorkflowRegistry implements FunctionalWorkflowRegistry {
  private workflows: Map<string, WorkflowDefinition> = new Map();

  /**
   * ワークフローを登録
   * ワークフロー名をそのままイベントタイプとして使用
   */
  register(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.name, workflow);
    console.log(`Registered workflow: ${workflow.name}`);
  }

  /**
   * ワークフローを取得
   */
  get(eventType: string): WorkflowDefinition | undefined {
    return this.workflows.get(eventType);
  }

  /**
   * 全ワークフローを取得
   */
  getAll(): Map<string, WorkflowDefinition> {
    return new Map(this.workflows);
  }

  /**
   * レジストリをクリア
   */
  clear(): void {
    this.workflows.clear();
  }

  /**
   * 登録されているイベントタイプ一覧を取得
   */
  getEventTypes(): string[] {
    return Array.from(this.workflows.keys());
  }
}
