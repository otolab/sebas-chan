import { describe, it, expect, beforeAll } from 'vitest';
import { compile } from '@moduler-prompt/core';
import type { JSONSchema } from '@moduler-prompt/core';

/**
 * 自然言語スケジュール解釈のインテグレーションテスト
 * 実際のAIモデルを使用する場合はANTHROPIC_API_KEYが必要
 */
const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!hasApiKey)('Natural Language Schedule Interpretation (Integration)', () => {
  let driver: any;

  beforeAll(async () => {
    if (!hasApiKey) return;

    // 動的インポート
    const { createAnthropicDriver } = await import('@moduler-prompt/driver');

    // 実際のAIドライバーを初期化
    driver = createAnthropicDriver({
      model: 'claude-3-haiku-20240307',
      temperature: 0,
    });
  });

  describe('構造化出力の動作確認', () => {
    it('should interpret relative time expressions', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          next: {
            type: 'string',
            description: '次回実行時刻（ISO8601形式）',
          },
          pattern: {
            type: ['string', 'null'],
            description: '繰り返しパターン（ある場合）',
          },
          interpretation: {
            type: 'string',
            description: '解釈結果の日本語説明',
          },
        },
        required: ['next', 'interpretation'],
      };

      const now = new Date();
      const timezone = 'Asia/Tokyo';

      const prompt = compile`
現在時刻: ${now.toISOString()}
タイムゾーン: ${timezone}

以下のスケジュール要求を解釈してください:
「3日後の朝9時」

次回実行時刻をISO8601形式で返してください。
繰り返しパターンがある場合は pattern フィールドに記載してください。
interpretation フィールドには日本語で解釈結果を説明してください。
`;

      const result = await driver.complete(prompt, { schema });
      const parsed = JSON.parse(result.content);

      expect(parsed).toHaveProperty('next');
      expect(parsed).toHaveProperty('interpretation');
      expect(parsed.next).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(parsed.interpretation).toContain('3日後');
      expect(parsed.interpretation).toContain('9時');
    });

    it('should interpret recurring patterns', async () => {
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
            description: '解釈結果の日本語説明',
          },
        },
        required: ['next', 'interpretation'],
      };

      const now = new Date();
      const timezone = 'Asia/Tokyo';

      const prompt = compile`
現在時刻: ${now.toISOString()}
タイムゾーン: ${timezone}

以下のスケジュール要求を解釈してください:
「毎日午後3時」

次回実行時刻をISO8601形式で返してください。
繰り返しパターンがある場合は pattern フィールドに記載してください。
interpretation フィールドには日本語で解釈結果を説明してください。
`;

      const result = await driver.complete(prompt, { schema });
      const parsed = JSON.parse(result.content);

      expect(parsed).toHaveProperty('next');
      expect(parsed).toHaveProperty('pattern');
      expect(parsed).toHaveProperty('interpretation');
      expect(parsed.pattern).toBeTruthy();
      expect(parsed.pattern).toContain('毎日');
      expect(parsed.interpretation).toContain('毎日');
      expect(parsed.interpretation).toContain('15時');
    });

    it('should handle immediate execution requests', async () => {
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
            description: '解釈結果の日本語説明',
          },
        },
        required: ['next', 'interpretation'],
      };

      const now = new Date();
      const timezone = 'Asia/Tokyo';

      const prompt = compile`
現在時刻: ${now.toISOString()}
タイムゾーン: ${timezone}

以下のスケジュール要求を解釈してください:
「今すぐ」

次回実行時刻をISO8601形式で返してください。
繰り返しパターンがある場合は pattern フィールドに記載してください。
interpretation フィールドには日本語で解釈結果を説明してください。
`;

      const result = await driver.complete(prompt, { schema });
      const parsed = JSON.parse(result.content);

      expect(parsed).toHaveProperty('next');
      expect(parsed).toHaveProperty('interpretation');

      const nextTime = new Date(parsed.next);
      const diff = nextTime.getTime() - now.getTime();

      // 「今すぐ」は現在時刻から数秒以内であるべき
      expect(diff).toBeGreaterThanOrEqual(0);
      expect(diff).toBeLessThan(60000); // 1分以内
      expect(parsed.interpretation).toMatch(/今すぐ|即座|すぐに/);
    });

    it('should handle complex schedule expressions', async () => {
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
            description: '解釈結果の日本語説明',
          },
        },
        required: ['next', 'interpretation'],
      };

      const testCases = [
        '来週の月曜日の朝10時',
        '明日の夕方5時半',
        '3時間後',
        '毎週金曜日の午後2時',
      ];

      for (const testCase of testCases) {
        const now = new Date();
        const timezone = 'Asia/Tokyo';

        const prompt = compile`
現在時刻: ${now.toISOString()}
タイムゾーン: ${timezone}

以下のスケジュール要求を解釈してください:
「${testCase}」

次回実行時刻をISO8601形式で返してください。
繰り返しパターンがある場合は pattern フィールドに記載してください。
interpretation フィールドには日本語で解釈結果を説明してください。
`;

        const result = await driver.complete(prompt, { schema });
        const parsed = JSON.parse(result.content);

        expect(parsed).toHaveProperty('next');
        expect(parsed).toHaveProperty('interpretation');
        expect(parsed.next).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(parsed.interpretation).toBeTruthy();

        console.log(`Test case: ${testCase}`);
        console.log(`Result: ${JSON.stringify(parsed, null, 2)}`);
      }
    });
  });

  describe('エラーハンドリング', () => {
    it('should handle ambiguous requests gracefully', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          next: {
            type: ['string', 'null'],
            description: '次回実行時刻（解釈可能な場合）',
          },
          pattern: {
            type: ['string', 'null'],
            description: '繰り返しパターン',
          },
          interpretation: {
            type: 'string',
            description: '解釈結果または解釈できない理由',
          },
          error: {
            type: ['string', 'null'],
            description: 'エラーメッセージ（解釈できない場合）',
          },
        },
        required: ['interpretation'],
      };

      const now = new Date();
      const timezone = 'Asia/Tokyo';

      const prompt = compile`
現在時刻: ${now.toISOString()}
タイムゾーン: ${timezone}

以下のスケジュール要求を解釈してください:
「いつか」

次回実行時刻をISO8601形式で返してください（解釈可能な場合）。
解釈できない場合は、error フィールドにその理由を記載してください。
interpretation フィールドには解釈結果または問題の説明を記載してください。
`;

      const result = await driver.complete(prompt, { schema });
      const parsed = JSON.parse(result.content);

      expect(parsed).toHaveProperty('interpretation');
      // 「いつか」は曖昧なので、エラーまたは適切な解釈が必要
      expect(parsed.interpretation).toBeTruthy();
    });
  });
});
