/**
 * 拡張ワークフローシステムのデモ
 * 1イベント対nワークフローの動作確認
 */

import type { WorkflowDefinition } from './workflow-types.js';
import type { AgentEvent } from '../index.js';
import { WorkflowRegistry } from './workflow-registry.js';
import { WorkflowResolver } from './workflow-resolver.js';

// デモ用のワークフロー定義
const logWorkflow: WorkflowDefinition = {
  name: 'LogInput',
  description: '入力をログに記録',
  triggers: {
    eventTypes: ['INGEST_INPUT'],
  },
  executor: async (event, context) => {
    console.log(`[LogInput] Processing event: ${event.type}`);
    console.log(`[LogInput] Input content:`, event.payload);
    return {
      success: true,
      context,
      output: { logged: true },
    };
  },
};

const validateWorkflow: WorkflowDefinition = {
  name: 'ValidateInput',
  description: '入力を検証',
  triggers: {
    eventTypes: ['INGEST_INPUT'],
    condition: (event) => {
      const input = (event.payload as { input?: { content?: string } })?.input;
      return (input?.content?.length ?? 0) > 0;
    },
  },
  executor: async (event, context) => {
    const input = (event.payload as { input?: { content?: string } })?.input;
    console.log(`[ValidateInput] Validating input: ${input?.content}`);

    const isValid = Boolean(input?.content && input.content.length > 0);
    return {
      success: isValid,
      context,
      output: { valid: isValid },
    };
  },
};

const analyzeErrorWorkflow: WorkflowDefinition = {
  name: 'AnalyzeError',
  description: 'エラーを分析',
  triggers: {
    eventTypes: ['INGEST_INPUT'],
    condition: (event) => {
      const input = (event.payload as { input?: { content?: string } })?.input;
      const content = input?.content?.toLowerCase() || '';
      return content.includes('error') || content.includes('エラー');
    },
  },
  executor: async (event, context, emitter) => {
    const input = (event.payload as { input?: { content?: string } })?.input;
    console.log(`[AnalyzeError] Error detected in: ${input?.content}`);

    // 後続イベントを発行
    await emitter.emit({
      type: 'ANALYZE_ISSUE_IMPACT',
      payload: {
        originalInput: input,
        errorDetected: true,
      },
    });

    return {
      success: true,
      context,
      output: { errorAnalyzed: true },
    };
  },
};

const issueAnalysisWorkflow: WorkflowDefinition = {
  name: 'IssueAnalysis',
  description: 'Issue影響分析',
  triggers: {
    eventTypes: ['ANALYZE_ISSUE_IMPACT'],
  },
  executor: async (event, context) => {
    console.log(`[IssueAnalysis] Analyzing issue impact`);
    console.log(`[IssueAnalysis] Payload:`, event.payload);

    return {
      success: true,
      context,
      output: { issueAnalyzed: true },
    };
  },
};

/**
 * デモ実行
 */
export async function runWorkflowDemo(): Promise<void> {
  console.log('=== 拡張ワークフローシステムデモ ===\n');

  // レジストリとリゾルバーを作成
  const registry = new WorkflowRegistry();
  const resolver = new WorkflowResolver(registry);

  // ワークフローを登録
  registry.register(logWorkflow);
  registry.register(validateWorkflow);
  registry.register(analyzeErrorWorkflow);
  registry.register(issueAnalysisWorkflow);

  console.log('登録されたワークフロー:');
  const debugInfo = registry.getDebugInfo();
  console.log(debugInfo);
  console.log();

  // テストケース1: 通常の入力
  console.log('--- テストケース1: 通常の入力 ---');
  const normalEvent: AgentEvent = {
    type: 'INGEST_INPUT',
    payload: {
      input: {
        id: 'input-1',
        content: '通常のテキスト入力です',
        source: 'test',
      },
    },
    timestamp: new Date(),
  };

  let resolution = await resolver.resolve(normalEvent);
  console.log(`解決されたワークフロー数: ${resolution.workflows.length}`);
  console.log(
    `ワークフロー名:`,
    resolution.workflows.map((w) => w.name)
  );
  console.log(`解決時間: ${resolution.resolutionTime}ms`);
  console.log();

  // テストケース2: エラーを含む入力
  console.log('--- テストケース2: エラーを含む入力 ---');
  const errorEvent: AgentEvent = {
    type: 'INGEST_INPUT',
    payload: {
      input: {
        id: 'input-2',
        content: 'エラーが発生しました',
        source: 'test',
      },
    },
    timestamp: new Date(),
  };

  resolution = await resolver.resolve(errorEvent);
  console.log(`解決されたワークフロー数: ${resolution.workflows.length}`);
  console.log(
    `ワークフロー名:`,
    resolution.workflows.map((w) => w.name)
  );
  console.log(
    `実行優先度:`,
    resolution.workflows.map((w) => w.triggers.priority)
  );
  console.log();

  // テストケース3: 空の入力
  console.log('--- テストケース3: 空の入力 ---');
  const emptyEvent: AgentEvent = {
    type: 'INGEST_INPUT',
    payload: {
      input: {
        id: 'input-3',
        content: '',
        source: 'test',
      },
    },
    timestamp: new Date(),
  };

  resolution = await resolver.resolve(emptyEvent);
  console.log(`解決されたワークフロー数: ${resolution.workflows.length}`);
  console.log(
    `ワークフロー名:`,
    resolution.workflows.map((w) => w.name)
  );
  console.log(`デバッグ情報:`, resolution.debug);
  console.log();

  // テストケース4: 別のイベントタイプ
  console.log('--- テストケース4: ANALYZE_ISSUE_IMPACTイベント ---');
  const analyzeEvent: AgentEvent = {
    type: 'ANALYZE_ISSUE_IMPACT',
    payload: {
      originalInput: { content: 'test' },
      errorDetected: true,
    },
    timestamp: new Date(),
  };

  resolution = await resolver.resolve(analyzeEvent);
  console.log(`解決されたワークフロー数: ${resolution.workflows.length}`);
  console.log(
    `ワークフロー名:`,
    resolution.workflows.map((w) => w.name)
  );
  console.log();

  // 検証
  console.log('--- レジストリ検証 ---');
  const isValid = resolver.validate();
  console.log(`検証結果: ${isValid ? '✓ 正常' : '✗ エラー'}`);
}

// 直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  runWorkflowDemo().catch(console.error);
}
