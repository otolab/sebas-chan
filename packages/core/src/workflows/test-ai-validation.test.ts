import { describe, it, expect, beforeAll } from 'vitest';
import { setupAIServiceForTest } from './test-ai-helper.js';
import type { AIService } from '@moduler-prompt/driver';
import { CompiledPrompt } from '@moduler-prompt/core';

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
        console.log('Available models:', models.map(m => ({
          model: m.model,
          provider: m.provider
        })));
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
    const driver = await aiService!.createDriverFromCapabilities(
      ['structured'],
      { lenient: true }
    );

    expect(driver).toBeTruthy();
    console.log('Driver created successfully');

    // シンプルなプロンプトを作成
    const prompt = new CompiledPrompt({
      messages: [
        {
          role: 'user',
          content: 'What is 2 + 2? Reply with just the number.'
        }
      ]
    });

    // クエリを実行
    const result = await driver!.query(prompt);

    console.log('Query result:', result.content);
    expect(result.content).toBeTruthy();
    expect(result.content).toContain('4');
  });

  it.skipIf(() => !aiService)('should handle structured output', async () => {
    console.log('Testing structured output capability...');

    const driver = await aiService!.createDriverFromCapabilities(
      ['structured'],
      { lenient: true }
    );

    expect(driver).toBeTruthy();

    // 構造化出力を要求するプロンプト
    const prompt = new CompiledPrompt({
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that provides structured responses.'
        },
        {
          role: 'user',
          content: 'Analyze this sentence: "The quick brown fox jumps over the lazy dog"'
        }
      ],
      structuredOutput: {
        schema: {
          type: 'object',
          properties: {
            wordCount: { type: 'number' },
            hasAllLetters: { type: 'boolean' },
            sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] }
          },
          required: ['wordCount', 'hasAllLetters', 'sentiment']
        }
      }
    });

    const result = await driver!.query(prompt);

    console.log('Structured output result:', result.content);

    // 構造化出力の検証
    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveProperty('wordCount');
    expect(parsed).toHaveProperty('hasAllLetters');
    expect(parsed).toHaveProperty('sentiment');
    expect(parsed.wordCount).toBe(9);
    expect(parsed.hasAllLetters).toBe(true);
  });

  it.skipIf(() => !aiService)('should select appropriate model based on capabilities', async () => {
    console.log('Testing model selection...');

    // ローカル実行可能なモデルを優先して選択
    const models = aiService!.selectModels(
      ['local'],
      { preferLocal: true }
    );

    console.log('Selected models:', models.map(m => ({
      model: m.model,
      provider: m.provider,
      priority: m.priority
    })));

    if (models.length > 0) {
      expect(models[0].capabilities).toContain('local');

      // MLX設定の場合、MLXが選択されることを確認
      const mlxModel = models.find(m => m.provider === 'mlx');
      if (mlxModel) {
        console.log('MLX model found:', mlxModel.model);
        expect(mlxModel.model).toBe('mlx-community/gemma-3-27b-it-qat-4bit');
      }
    }
  });
});