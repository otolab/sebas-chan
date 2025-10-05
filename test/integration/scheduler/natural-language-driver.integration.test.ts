import { describe, it, expect, beforeAll } from 'vitest';
import { compile } from '@moduler-prompt/core';
import type { JSONSchema, PromptModule } from '@moduler-prompt/core';
import type { AIService, AIDriver } from '@moduler-prompt/driver';
import { setupAIService } from '../setup-ai.js';
import os from 'os';

/**
 * 自然言語スケジュール解釈のインテグレーションテスト
 * プラットフォームに応じた適切なドライバー（macOSではMLX）を使用
 */

// スケジュール解析用のコンテキスト型
interface ScheduleContext {
  currentTime: Date;
  timezone: string;
  request: string;
}

// スケジュール解析用のPromptModule（静的定義）
const scheduleParserModule: PromptModule<ScheduleContext> = {
  createContext: () => ({
    currentTime: new Date(),
    timezone: 'Asia/Tokyo',
    request: ''
  }),

  instructions: [
    'You are a schedule parser.',
    (ctx) => {
      const jstTime = new Date(ctx.currentTime.getTime() + 9 * 60 * 60 * 1000);
      return `Current time (JST): ${jstTime.toISOString().replace('Z', '+09:00').substring(0, 19)}`;
    },
    'Timezone: Japan Standard Time (JST, UTC+9)',
    'Parse the schedule request and return structured JSON.',
    'Return the next execution time in JST ISO8601 format (e.g., 2025-10-05T15:00:00).',
    'Do not perform timezone conversion, return JST time directly.'
  ],

  inputs: [
    (ctx) => `Parse this schedule request: "${ctx.request}"`
  ],

  schema: [{
    type: 'json',
    content: {
      type: 'object',
      properties: {
        next: {
          type: 'string',
          description: 'Next execution time in ISO8601 format'
        },
        pattern: {
          type: ['string', 'null'],
          description: 'Recurrence pattern if any'
        },
        interpretation: {
          type: 'string',
          description: 'Human-readable interpretation'
        }
      },
      required: ['next', 'interpretation']
    }
  }]
};

// 日本語入力用のPromptModule
const japaneseScheduleParserModule: PromptModule<ScheduleContext> = {
  createContext: () => ({
    currentTime: new Date(),
    timezone: 'Asia/Tokyo',
    request: ''
  }),

  instructions: [
    'あなたはスケジュール解析器です。',
    (ctx) => {
      const jstTime = new Date(ctx.currentTime.getTime() + 9 * 60 * 60 * 1000);
      return `現在時刻（日本時間）: ${jstTime.toISOString().replace('Z', '+09:00').substring(0, 19)}`;
    },
    'タイムゾーン: 日本時間（JST, UTC+9）',
    '日本語の時間表現（「明日」「午後」など）は日本時間として解釈してください。',
    'スケジュール要求を解析して構造化JSONを返してください。',
    '次回実行時刻を日本時間のISO8601形式（例: 2025-10-05T15:00:00）で返してください。',
    'タイムゾーン変換は行わず、日本時間のまま返してください。'
  ],

  inputs: [
    (ctx) => `スケジュール要求: "${ctx.request}"`
  ],

  schema: [{
    type: 'json',
    content: {
      type: 'object',
      properties: {
        next: {
          type: 'string',
          description: '次回実行時刻（ISO8601形式）'
        },
        pattern: {
          type: ['string', 'null'],
          description: '繰り返しパターン'
        },
        interpretation: {
          type: 'string',
          description: '解釈結果'
        }
      },
      required: ['next', 'interpretation']
    }
  }]
};

// macOSでのみ実行（MLXドライバーが利用可能）
const isMacOS = os.platform() === 'darwin';
describe.skipIf(!isMacOS)('Natural Language Schedule Interpretation (Integration)', () => {
  let aiService: AIService;

  beforeAll(async () => {
    console.log('🔍 Setting up AI Service for integration tests...');
    const service = await setupAIService();
    if (!service) {
      throw new Error('Failed to setup AI service');
    }
    aiService = service;
    console.log('✅ AI Service ready for tests');
  });

  describe('構造化出力の動作確認', () => {
    it('should interpret relative time expressions', async () => {
      console.log('Creating driver from capabilities...');
      const driver = await aiService.createDriverFromCapabilities(
        ['structured'],
        { preferLocal: true, lenient: true }
      );
      console.log('Driver created:', driver);

      const now = new Date();
      const context: ScheduleContext = {
        currentTime: now,
        timezone: 'Asia/Tokyo',
        request: '3 days later at 9am'
      };

      const compiledPrompt = compile(scheduleParserModule, context);
      console.log('Compiled prompt:', JSON.stringify(compiledPrompt, null, 2));
      console.log('Calling driver.query...');

      const result = await driver.query(compiledPrompt);
      const parsed = result.structuredOutput || JSON.parse(result.content);

      expect(parsed).toHaveProperty('next');
      expect(parsed).toHaveProperty('interpretation');
      expect(parsed.next).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      console.log('MLX interpretation result:', parsed);

      // JST形式で返ってきた時刻を検証
      const nextTimeJST = new Date(parsed.next + '+09:00');
      const threeDaysLater = new Date(now);
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      threeDaysLater.setHours(9, 0, 0, 0);

      const diff = Math.abs(nextTimeJST.getTime() - threeDaysLater.getTime());
      expect(diff).toBeLessThan(3600000); // 1時間以内
    }, 30000); // 30秒のタイムアウト

    it('should handle Japanese input with MLX', async () => {
      const driver = await aiService.createDriverFromCapabilities(
        ['structured'],
        { preferLocal: true, lenient: true }
      );

      const now = new Date();
      const context: ScheduleContext = {
        currentTime: now,
        timezone: 'Asia/Tokyo',
        request: '明日の午後3時'
      };

      const compiledPrompt = compile(japaneseScheduleParserModule, context);
      const result = await driver.query(compiledPrompt);
      const parsed = result.structuredOutput || JSON.parse(result.content);

      expect(parsed).toHaveProperty('next');
      expect(parsed).toHaveProperty('interpretation');

      console.log('Japanese input result:', parsed);
      console.log('Current time (JST):', now.toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'}));
      console.log('AI returned time (JST format):', parsed.next);

      // 明日の午後3時になっているか確認
      // AIの返答はJST形式（タイムゾーン情報なし）なので、JSTとして扱う
      const nextTimeJST = new Date(parsed.next + '+09:00');

      // 期待値：明日の15時（JST）
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(15, 0, 0, 0);

      console.log('Expected time (JST):', tomorrow.toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'}));
      console.log('Parsed time (JST):', nextTimeJST.toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'}));

      // 時間の差が1時間以内であることを確認
      const diff = Math.abs(nextTimeJST.getTime() - tomorrow.getTime());
      console.log('Time difference (ms):', diff);
      console.log('Time difference (hours):', diff / 3600000);

      expect(diff).toBeLessThan(3600000); // 1時間以内
    }, 30000);

    it('should handle immediate execution with MLX', async () => {
      const driver = await aiService.createDriverFromCapabilities(
        ['structured'],
        { preferLocal: true, lenient: true }
      );

      const now = new Date();
      const context: ScheduleContext = {
        currentTime: now,
        timezone: 'Asia/Tokyo',
        request: 'now'
      };

      const compiledPrompt = compile(scheduleParserModule, context);
      const result = await driver.query(compiledPrompt);
      const parsed = result.structuredOutput || JSON.parse(result.content);

      expect(parsed).toHaveProperty('next');

      // JST形式で返ってきた時刻を検証
      const nextTimeJST = new Date(parsed.next + '+09:00');
      const diff = nextTimeJST.getTime() - now.getTime();

      // "now"は現在時刻から1分以内
      expect(diff).toBeGreaterThanOrEqual(-1000); // 1秒前まで許容
      expect(diff).toBeLessThan(60000); // 1分以内

      console.log('Immediate execution result:', parsed);
    }, 30000);
  });

  describe('パフォーマンステスト', () => {
    it('should complete within reasonable time with MLX', async () => {
      const driver = await aiService.createDriverFromCapabilities(
        ['structured'],
        { preferLocal: true, lenient: true }
      );

      const startTime = Date.now();

      const context: ScheduleContext = {
        currentTime: new Date(),
        timezone: 'Asia/Tokyo',
        request: 'tomorrow at 10am'
      };

      const compiledPrompt = compile(scheduleParserModule, context);
      const result = await driver.query(compiledPrompt);

      // 結果が正しい形式であることを確認
      const parsed = result.structuredOutput || JSON.parse(result.content);
      expect(parsed).toHaveProperty('next');

      const duration = Date.now() - startTime;

      // MLXローカル実行は20秒以内に完了すべき（初回ロード含む）
      expect(duration).toBeLessThan(20000);

      console.log(`MLX processing time: ${duration}ms`);
    }, 30000);
  });
});