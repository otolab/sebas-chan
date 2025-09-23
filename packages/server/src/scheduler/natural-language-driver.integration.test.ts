import { describe, it, expect, beforeAll, skipIf } from 'vitest';
import { compile } from '@moduler-prompt/core';
import type { JSONSchema } from '@moduler-prompt/core';
import type { DriverFactory } from '../types.js';

/**
 * 自然言語スケジュール解釈のインテグレーションテスト
 * driverFactoryが適切なドライバー（MLX優先）を選択
 */
describe('Natural Language Schedule Interpretation (Integration)', () => {
  let driverFactory: DriverFactory;
  let hasValidDriver = false;

  beforeAll(async () => {
    try {
      // 実際のDriverFactoryをインポート
      const { createDriverFactory } = await import('../driver-factory.js');
      driverFactory = createDriverFactory();

      // テスト用のドライバーが取得できるか確認
      const testDriver = await driverFactory.getDriver({
        requiredCapabilities: ['structured_output']
      });

      if (testDriver) {
        hasValidDriver = true;
        console.log('Driver factory initialized successfully');
      }
    } catch (error) {
      console.log('No valid driver available for testing:', error);
    }
  });

  describe.skipIf(!hasValidDriver)('構造化出力の動作確認', () => {
    it('should interpret relative time expressions', async () => {
      const driver = await driverFactory.getDriver({
        requiredCapabilities: ['structured_output']
      });
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          next: {
            type: 'string',
            description: 'Next execution time in ISO8601 format',
          },
          pattern: {
            type: ['string', 'null'],
            description: 'Recurrence pattern if any',
          },
          interpretation: {
            type: 'string',
            description: 'Human-readable interpretation in Japanese',
          },
        },
        required: ['next', 'interpretation'],
      };

      const now = new Date();
      const timezone = 'Asia/Tokyo';

      const prompt = compile`
You are a schedule parser. Current time: ${now.toISOString()}
Timezone: ${timezone}

Parse this schedule request and return structured JSON:
"3 days later at 9am"

Return the next execution time in ISO8601 format.
`;

      const result = await driver.complete(prompt, { schema });
      const parsed = JSON.parse(result.content);

      expect(parsed).toHaveProperty('next');
      expect(parsed).toHaveProperty('interpretation');
      expect(parsed.next).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      console.log('MLX interpretation result:', parsed);
    });

    it('should handle Japanese input with MLX', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          next: {
            type: 'string',
            description: '次回実行時刻（ISO8601形式）',
          },
          pattern: {
            type: ['string', 'null'],
            description: '繰り返しパターン',
          },
          interpretation: {
            type: 'string',
            description: '解釈結果',
          },
        },
        required: ['next', 'interpretation'],
      };

      const now = new Date();
      const timezone = 'Asia/Tokyo';

      const prompt = compile`
現在時刻: ${now.toISOString()}
タイムゾーン: ${timezone}

スケジュール要求: "明日の午後3時"

次回実行時刻をISO8601形式で返してください。
`;

      const result = await driver.complete(prompt, { schema });
      const parsed = JSON.parse(result.content);

      expect(parsed).toHaveProperty('next');
      expect(parsed).toHaveProperty('interpretation');

      // 明日の15時になっているか確認
      const nextTime = new Date(parsed.next);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(15, 0, 0, 0);

      // 時間の差が1時間以内であることを確認（タイムゾーン考慮）
      const diff = Math.abs(nextTime.getTime() - tomorrow.getTime());
      expect(diff).toBeLessThan(3600000); // 1時間以内

      console.log('Japanese input result:', parsed);
    });

    it('should handle immediate execution with MLX', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          next: {
            type: 'string',
            description: 'Next execution time in ISO8601 format',
          },
          pattern: {
            type: ['string', 'null'],
            description: 'Recurrence pattern',
          },
          interpretation: {
            type: 'string',
            description: 'Interpretation',
          },
        },
        required: ['next', 'interpretation'],
      };

      const now = new Date();
      const timezone = 'Asia/Tokyo';

      const prompt = compile`
Current time: ${now.toISOString()}
Timezone: ${timezone}

Parse schedule: "now"

Return the next execution time as current time or within 1 minute.
`;

      const result = await driver.complete(prompt, { schema });
      const parsed = JSON.parse(result.content);

      expect(parsed).toHaveProperty('next');

      const nextTime = new Date(parsed.next);
      const diff = nextTime.getTime() - now.getTime();

      // "now"は現在時刻から1分以内
      expect(diff).toBeGreaterThanOrEqual(-1000); // 1秒前まで許容
      expect(diff).toBeLessThan(60000); // 1分以内

      console.log('Immediate execution result:', parsed);
    });
  });

  describe('パフォーマンステスト', () => {
    it('should complete within reasonable time with MLX', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          next: { type: 'string' },
          interpretation: { type: 'string' },
        },
        required: ['next', 'interpretation'],
      };

      const startTime = Date.now();

      const prompt = compile`
Parse schedule: "tomorrow at 10am"
Return ISO8601 time and interpretation.
`;

      await driver.complete(prompt, { schema });

      const duration = Date.now() - startTime;

      // MLXローカル実行は5秒以内に完了すべき
      expect(duration).toBeLessThan(5000);

      console.log(`MLX processing time: ${duration}ms`);
    });
  });
});