import { describe, it, expect, beforeAll } from 'vitest';
import { setupAIServiceForTest } from './test-ai-helper.js';
import type { AIService } from '@moduler-prompt/driver';
import { compile, type PromptModule } from '@moduler-prompt/core';

describe('AI Service Validation', () => {
  let aiService: AIService | null = null;

  beforeAll(async () => {
    console.log('Setting up AI Service for testing...');
    console.log('SKIP_AI_TESTS env:', process.env.SKIP_AI_TESTS);
    console.log('Current working directory:', process.cwd());

    aiService = await setupAIServiceForTest();

    if (aiService) {
      console.log('AI Service initialized successfully');
      // 利用可能なモデルを確認
      try {
        const models = aiService.selectModels([]);
        console.log(
          'Available models:',
          models.map((m) => ({
            model: m.model,
            provider: m.provider,
          }))
        );
      } catch (err) {
        console.error('Failed to get models:', err);
      }
    } else {
      console.log('AI Service not available (config not found or SKIP_AI_TESTS=true)');
    }
  });

  it.skipIf(() => !aiService)('should create driver and execute simple query', async () => {
    console.log('Testing AI driver with simple query...');

    // 構造化出力対応のドライバーを作成
    const driver = await aiService!.createDriverFromCapabilities(['structured'], { lenient: true });

    expect(driver).toBeTruthy();
    console.log('Driver created successfully');

    // シンプルなPromptModuleを定義
    const simpleModule: PromptModule<Record<string, never>> = {
      createContext: () => ({}),
      instructions: ['What is 2 + 2?', 'Reply with just the number.'],
    };

    // コンパイルしてプロンプトを作成
    const compiled = compile(simpleModule, {});

    // クエリを実行
    const result = await driver!.query(compiled);

    console.log('Query result:', result.content);
    expect(result.content).toBeTruthy();
    expect(result.content).toContain('4');
  });

  it.skipIf(() => !aiService)('should handle structured output', async () => {
    console.log('Testing structured output capability...');

    const driver = await aiService!.createDriverFromCapabilities(['structured'], { lenient: true });

    expect(driver).toBeTruthy();

    // 構造化出力を要求するPromptModule
    interface AnalysisContext {
      sentence: string;
    }

    const analysisModule: PromptModule<AnalysisContext> = {
      createContext: () => ({ sentence: '' }),

      objective: ['Analyze the provided sentence and extract structured information'],

      instructions: [
        'Analyze the sentence for the following properties:',
        '- Count the total number of words',
        '- Check if it contains all letters of the alphabet (pangram)',
        '- Determine the overall sentiment',
      ],

      inputs: [(ctx) => `Sentence to analyze: "${ctx.sentence}"`],

      schema: [
        {
          type: 'json',
          content: {
            type: 'object',
            properties: {
              wordCount: { type: 'number' },
              hasAllLetters: { type: 'boolean' },
              sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
            },
            required: ['wordCount', 'hasAllLetters', 'sentiment'],
          },
        },
      ],
    };

    // コンテキストを作成してコンパイル
    const context: AnalysisContext = {
      sentence: 'The quick brown fox jumps over the lazy dog',
    };

    const compiled = compile(analysisModule, context);
    const result = await driver!.query(compiled);

    console.log('Structured output result:', result);

    // 構造化出力の検証（ドライバーが構造化出力をサポートしているはず）
    expect(result.structuredOutput).toBeTruthy();
    const parsed = result.structuredOutput as {
      wordCount: number;
      hasAllLetters: boolean;
      sentiment: string;
    };
    expect(parsed).toHaveProperty('wordCount');
    expect(parsed).toHaveProperty('hasAllLetters');
    expect(parsed).toHaveProperty('sentiment');
    expect(parsed.wordCount).toBe(9);
    expect(parsed.hasAllLetters).toBe(true);
  });

  it.skipIf(() => !aiService)('should select appropriate model based on capabilities', async () => {
    console.log('Testing model selection...');

    // ローカル実行可能なモデルを優先して選択
    const models = aiService!.selectModels(['local'], { preferLocal: true });

    console.log(
      'Selected models:',
      models.map((m) => ({
        model: m.model,
        provider: m.provider,
        priority: m.priority,
        capabilities: m.capabilities,
      }))
    );

    // モデルが選択されることを確認
    expect(models.length).toBeGreaterThan(0);

    // ローカル能力を要求したので、最初のモデルはlocalを持つはず
    expect(models[0].capabilities).toContain('local');
  });
});
