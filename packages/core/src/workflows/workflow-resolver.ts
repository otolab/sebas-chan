/**
 * ワークフロー解決器
 * イベントから実行すべきワークフローを解決する
 */

import type { AgentEvent } from '../index.js';
import type { WorkflowDefinition, WorkflowResolution } from './workflow-types.js';
import type { WorkflowRegistry } from './workflow-registry.js';

export class WorkflowResolver {
  constructor(private registry: WorkflowRegistry) {}

  /**
   * イベントにマッチするワークフローを解決
   */
  resolve(event: AgentEvent): WorkflowResolution {
    const startTime = Date.now();
    const allWorkflows = this.registry.getAll();
    const debug = {
      totalWorkflows: allWorkflows.length,
      matchedCount: 0,
      filteredByType: 0,
      filteredByCondition: 0,
    };

    // イベントタイプでフィルタ
    const typeMatched = allWorkflows.filter((workflow) => {
      const matches = workflow.triggers.eventTypes.includes(event.type);
      if (matches) {
        debug.filteredByType++;
      }
      return matches;
    });

    // 条件でフィルタ
    const conditionMatched = typeMatched.filter((workflow) => {
      // 条件がない場合は通過
      if (!workflow.triggers.condition) {
        return true;
      }

      try {
        const matches = workflow.triggers.condition(event);
        if (!matches) {
          debug.filteredByCondition++;
        }
        return matches;
      } catch (error) {
        console.error(`Error evaluating condition for workflow ${workflow.name}:`, error);
        debug.filteredByCondition++;
        return false;
      }
    });

    // 優先度でソート（高い順）
    const sorted = conditionMatched.sort((a, b) => {
      const priorityA = a.triggers.priority ?? 0;
      const priorityB = b.triggers.priority ?? 0;
      return priorityB - priorityA;
    });

    debug.matchedCount = sorted.length;

    return {
      workflows: sorted,
      resolutionTime: Date.now() - startTime,
      debug,
    };
  }

  /**
   * 解決ルールの検証
   * 循環依存や競合するルールがないかチェック
   */
  validate(): boolean {
    const allWorkflows = this.registry.getAll();

    // 同じ名前のワークフローがないかチェック
    const names = new Set<string>();
    for (const workflow of allWorkflows) {
      if (names.has(workflow.name)) {
        console.error(`Duplicate workflow name: ${workflow.name}`);
        return false;
      }
      names.add(workflow.name);
    }

    // イベントタイプが空でないかチェック
    for (const workflow of allWorkflows) {
      if (!workflow.triggers.eventTypes || workflow.triggers.eventTypes.length === 0) {
        console.error(`Workflow ${workflow.name} has no event types`);
        return false;
      }
    }

    return true;
  }

  /**
   * デバッグ用：特定のイベントタイプにマッチするワークフローを取得
   */
  findWorkflowsForEventType(eventType: string): WorkflowDefinition[] {
    return this.registry.findByEventType(eventType);
  }

  /**
   * デバッグ用：解決のシミュレーション
   */
  simulate(event: AgentEvent): string[] {
    const resolution = this.resolve(event);
    return resolution.workflows.map((w) => w.name);
  }
}
