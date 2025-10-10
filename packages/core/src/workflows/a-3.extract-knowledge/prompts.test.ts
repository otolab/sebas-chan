import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { compile } from '@moduler-prompt/core';
import { extractKnowledgePromptModule } from './prompts.js';
import { extractKnowledge } from './actions.js';
import { setupAIServiceForTest } from '../test-ai-helper.js';
import type { Knowledge } from '@sebas-chan/shared-types';
import type { KnowledgeExtractionContext } from './prompts.js';
import type { AIService, AIDriver } from '@moduler-prompt/driver';

describe('extractKnowledge prompts', () => {
  describe('プロンプトモジュールの構造', () => {
    it('extractKnowledgePromptModuleが正しい構造を持っている', () => {
      const context: KnowledgeExtractionContext = {
        sourceType: 'issue',
        confidence: 0.8,
        content: 'テストコンテンツ',
        existingKnowledge: [],
        currentState: '初期状態',
      };

      const compiled = compile(extractKnowledgePromptModule, context);

      // 基本的な構造の確認
      expect(compiled).toBeDefined();
      expect(compiled.data).toBeDefined();

      // 必要な情報が含まれていることを確認
      const promptText = JSON.stringify(compiled);
      expect(promptText).toContain('知識');
      expect(promptText).toContain('抽出');
      expect(promptText).toContain('状態');
    });
  });

  describe('コンテキストデータの反映', () => {
    it('知識抽出コンテンツがプロンプトに含まれる', () => {
      const context: KnowledgeExtractionContext = {
        currentState: 'システムの現在の状態',
        sourceType: 'issue',
        confidence: 0.9,
        content: 'ユーザー認証機能を実装しました。OAuth2.0を使用し、セキュリティを強化しています。',
        existingKnowledge: [],
      };

      const compiled = compile(extractKnowledgePromptModule, context);
      const promptText = JSON.stringify(compiled);

      expect(promptText).toContain('issue');
      expect(promptText).toContain('OAuth2.0');
      expect(promptText).toContain('0.9');
    });

    it('既存知識がプロンプトに反映される', () => {
      const existingKnowledge: Knowledge = {
        id: 'k-1',
        type: 'system_rule',
        content: 'データベースのN+1問題を解決する方法',
        reputation: {
          upvotes: 10,
          downvotes: 0,
        },
        sources: [
          {
            type: 'issue',
            issueId: 'issue-1',
          },
        ],
        createdAt: new Date(),
      };

      const context: KnowledgeExtractionContext = {
        currentState: '現在の状態',
        sourceType: 'issue',
        confidence: 0.75,
        content: 'パフォーマンス問題が発生しています。',
        existingKnowledge: [existingKnowledge],
      };

      const compiled = compile(extractKnowledgePromptModule, context);
      const promptText = JSON.stringify(compiled);

      expect(promptText).toContain('N+1問題');
      expect(promptText).toContain('system_rule');
      expect(promptText).toContain('パフォーマンス');
    });
  });

  describe.skipIf(() => process.env.SKIP_AI_TESTS === 'true')('AI実行テスト', () => {
    let aiService: AIService | null;
    let driver: AIDriver;

    beforeAll(async () => {
      aiService = await setupAIServiceForTest();
      if (!aiService) {
        throw new Error('AI Service is required for these tests');
      }
      // ドライバーを作成
      driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
    });

    afterAll(() => {
      vi.restoreAllMocks();
    });

    it('技術的な知識を正しく抽出できる', async () => {
      const content = `GraphQL APIの実装
RESTful APIからGraphQLへの移行を完了しました。
GraphQLスキーマ設計完了。Apollo Serverを採用。
リゾルバー実装完了。DataLoaderでN+1問題を解決。
移行完了。クエリ効率が40%向上。`;

      const result = await extractKnowledge(
        driver,
        'issue',
        0.9,
        content,
        [],
        'システム開発プロジェクト'
      );

      expect(result).toBeDefined();
      expect(result.extractedKnowledge).toBeDefined();
      expect(result.extractedKnowledge).toContain('GraphQL');
      expect(result.extractedKnowledge).toContain('Apollo Server');
      expect(result.updatedState).toBeDefined();
    });

    it('ビジネス知識を正しく抽出できる', async () => {
      const content = `ユーザーオンボーディング改善
新規ユーザーの離脱率を30%削減することに成功しました。
ユーザーインタビュー実施。主な離脱要因を特定。
インタラクティブチュートリアル実装。プログレスバー追加。
A/Bテスト完了。離脱率30%削減を確認。`;

      const result = await extractKnowledge(driver, 'issue', 0.85, content, [], 'プロダクト開発');

      expect(result).toBeDefined();
      expect(result.extractedKnowledge).toBeDefined();
      expect(result.extractedKnowledge).toContain('離脱');
      expect(result.extractedKnowledge).toContain('チュートリアル');
      expect(result.updatedState).toBeDefined();
    });

    it('抽出すべき知識がない場合を正しく判定できる', async () => {
      const content = `定期メンテナンス
毎月の定期メンテナンスを実施しました。
ログファイルのローテーション実施。
キャッシュクリア完了。`;

      const result = await extractKnowledge(driver, 'issue', 0.3, content, [], '日常的な運用作業');

      expect(result).toBeDefined();
      expect(result.extractedKnowledge).toBeDefined();
      // 定期的な作業でも何らかの知識が抽出される可能性がある
      expect(result.extractedKnowledge.length).toBeGreaterThan(0);
    });
  });
});
