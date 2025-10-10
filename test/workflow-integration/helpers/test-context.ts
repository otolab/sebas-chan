import { AIService } from '@moduler-prompt/driver';
import type { Driver, DriverCapabilities } from '@moduler-prompt/driver';
import type { WorkflowContextInterface } from '@sebas-chan/core';
import { WorkflowRecorder } from '@sebas-chan/core';
import type { Storage } from '@sebas-chan/shared-types';

/**
 * テスト用のAIServiceセットアップ
 * 利用可能なドライバーを環境から自動選択
 */
export async function createTestAIService(): Promise<AIService | null> {
  // テスト用のデフォルト設定
  // 環境に応じて、実際の設定ファイルを読み込むか、このデフォルトを使用
  const config = {
    models: [
      {
        model: 'test-model',
        provider: 'test' as const,
        capabilities: ['fast', 'structured'] as any,
        priority: 10,
        enabled: true,
      },
      {
        model: 'mlx-community/gemma-3-27b-it-qat-4bit',
        provider: 'mlx' as const,
        capabilities: ['local', 'fast', 'structured'] as any,
        priority: 30,
        enabled: true,
      },
    ],
    drivers: {
      test: {},
      mlx: {},
    },
  };

  const aiService = new AIService(config);

  // 利用可能なモデルをチェック
  const models = aiService.selectModels([]);

  if (models.length === 0) {
    console.warn('No AI models available for testing. Tests will be skipped.');
    return null;
  }

  // 利用可能なモデルの情報を出力
  console.info(`Available models: ${models.map((m) => `${m.provider}:${m.model}`).join(', ')}`);

  return aiService;
}

/**
 * テスト用のWorkflowContext作成
 */
export async function createTestContext(
  workflowName: string,
  mockStorage?: Partial<Storage>
): Promise<WorkflowContextInterface | null> {
  const aiService = await createTestAIService();

  if (!aiService) {
    return null;
  }

  const recorder = new WorkflowRecorder(workflowName);

  // Mock Storage with minimal implementation
  const storage: Storage = {
    createIssue:
      mockStorage?.createIssue ||
      vi.fn().mockResolvedValue({
        id: 'test-issue-1',
        title: 'Test Issue',
        description: '',
        status: 'open',
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    getIssue: mockStorage?.getIssue || vi.fn().mockResolvedValue(null),
    updateIssue: mockStorage?.updateIssue || vi.fn().mockResolvedValue(undefined),
    searchIssues: mockStorage?.searchIssues || vi.fn().mockResolvedValue([]),

    createKnowledge:
      mockStorage?.createKnowledge ||
      vi.fn().mockResolvedValue({
        id: 'test-knowledge-1',
        content: '',
        category: 'reference',
        tags: [],
        sourceIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    searchKnowledge: mockStorage?.searchKnowledge || vi.fn().mockResolvedValue([]),

    addPondEntry:
      mockStorage?.addPondEntry ||
      vi.fn().mockResolvedValue({
        id: 'test-pond-1',
        content: '',
        source: 'test',
        metadata: {},
        timestamp: new Date(),
      }),
    searchPond: mockStorage?.searchPond || vi.fn().mockResolvedValue([]),
  };

  // DriverFactoryをAIServiceを使って作成
  const createDriver = async (capabilities: DriverCapabilities): Promise<Driver> => {
    return aiService.createDriver(capabilities);
  };

  const context: WorkflowContextInterface = {
    state: '',
    storage,
    recorder,
    createDriver,
    metadata: {},
    scheduler: {
      schedule: vi.fn().mockResolvedValue({
        scheduleId: 'test-schedule-1',
        nextRun: new Date(),
      }),
      cancelByIssue: vi.fn().mockResolvedValue(undefined),
    },
  };

  return context;
}

/**
 * テストスキップ条件の判定
 */
export async function shouldSkipAITests(): Promise<boolean> {
  const aiService = await createTestAIService();
  return aiService === null;
}
