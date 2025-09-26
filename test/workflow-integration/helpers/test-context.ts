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
  const aiService = new AIService();

  // 利用可能なドライバーをチェック
  const availableDrivers = await aiService.getAvailableDrivers();

  if (availableDrivers.length === 0) {
    console.warn('No AI drivers available for testing. Tests will be skipped.');
    return null;
  }

  // MLXドライバーが利用可能な場合は優先
  const mlxDriver = availableDrivers.find(d => d.name === 'mlx');
  if (mlxDriver) {
    // MLXドライバー用の設定
    await aiService.configure({
      defaultDriver: 'mlx',
      drivers: {
        mlx: {
          model: 'mlx-community/gemma-3-27b-it-qat-4bit'
        }
      }
    });
    console.info('Using MLX driver with gemma-3-27b-it-qat-4bit for testing');
  } else {
    // 他の利用可能なドライバーを使用
    const firstDriver = availableDrivers[0];
    await aiService.configure({
      defaultDriver: firstDriver.name
    });
    console.info(`Using ${firstDriver.name} driver for testing`);
  }

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
    createIssue: mockStorage?.createIssue || vi.fn().mockResolvedValue({
      id: 'test-issue-1',
      title: 'Test Issue',
      description: '',
      status: 'open',
      labels: [],
      updates: [],
      relations: [],
      sourceInputIds: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }),
    getIssue: mockStorage?.getIssue || vi.fn().mockResolvedValue(null),
    updateIssue: mockStorage?.updateIssue || vi.fn().mockResolvedValue(undefined),
    searchIssues: mockStorage?.searchIssues || vi.fn().mockResolvedValue([]),

    createKnowledge: mockStorage?.createKnowledge || vi.fn().mockResolvedValue({
      id: 'test-knowledge-1',
      content: '',
      category: 'reference',
      tags: [],
      sourceIds: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }),
    searchKnowledge: mockStorage?.searchKnowledge || vi.fn().mockResolvedValue([]),

    addPondEntry: mockStorage?.addPondEntry || vi.fn().mockResolvedValue({
      id: 'test-pond-1',
      content: '',
      source: 'test',
      metadata: {},
      timestamp: new Date()
    }),
    searchPond: mockStorage?.searchPond || vi.fn().mockResolvedValue([])
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
        nextRun: new Date()
      }),
      cancelByIssue: vi.fn().mockResolvedValue(undefined)
    }
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