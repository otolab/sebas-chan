import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { compile, merge } from '@moduler-prompt/core';
import { extractKnowledgePromptModule, baseExtractKnowledgeModule } from './prompts.js';
import { extractKnowledge } from './actions.js';
import { setupAIServiceForTest } from '../test-ai-helper.js';
import type { Issue } from '@sebas-chan/db';
import type { KnowledgeExtractionContext } from './prompts.js';

describe('extractKnowledge prompts', () => {
  describe('プロンプトモジュールの構造', () => {
    it('baseExtractKnowledgeModuleが正しい構造を持っている', () => {
      const compiled = compile(baseExtractKnowledgeModule);

      // 基本的な構造の確認
      expect(compiled).toBeDefined();
      expect(compiled.data).toBeDefined();

      // 必要な情報が含まれていることを確認
      const promptText = JSON.stringify(compiled);
      expect(promptText).toContain('知識');
      expect(promptText).toContain('抽出');
    });

    it('extractKnowledgePromptModuleが正しくマージされている', () => {
      const compiled = compile(extractKnowledgePromptModule);

      expect(compiled).toBeDefined();
      expect(compiled.data).toBeDefined();

      // updateStatePromptModuleとbaseExtractKnowledgeModuleの両方の要素が含まれる
      const promptText = JSON.stringify(compiled);
      expect(promptText).toContain('状態');
      expect(promptText).toContain('知識');
    });
  });

  describe('コンテキストデータの反映', () => {
    it('Issue情報がプロンプトに含まれる', () => {
      const context: KnowledgeExtractionContext = {
        currentState: {
          summary: 'システムの現在の状態',
          projects: [],
          issues: [],
          materials: [],
        },
        issue: {
          id: 'completed-issue',
          title: '重要な機能実装の完了',
          description: 'ユーザー認証機能を実装しました。OAuth2.0を使用し、セキュリティを強化しています。',
          status: 'closed',
          priority: 'high',
          createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
        issueHistory: [
          {
            timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            content: '実装開始。基本設計を完了。',
          },
          {
            timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
            content: 'OAuth2.0の統合完了。テスト開始。',
          },
          {
            timestamp: new Date(),
            content: '全テスト合格。本番環境へデプロイ完了。',
          },
        ],
      };

      const moduleWithContext = merge(extractKnowledgePromptModule, {
        data: context,
      });

      const compiled = compile(moduleWithContext);
      const promptText = JSON.stringify(compiled);

      expect(promptText).toContain('completed-issue');
      expect(promptText).toContain('重要な機能実装の完了');
      expect(promptText).toContain('OAuth2.0');
      expect(promptText).toContain('closed');
    });

    it('Issue履歴がプロンプトに反映される', () => {
      const context: KnowledgeExtractionContext = {
        currentState: {
          summary: '現在の状態',
          projects: [],
          issues: [],
          materials: [],
        },
        issue: {
          id: 'bug-fix',
          title: 'パフォーマンス問題の解決',
          description: 'データベースクエリの最適化により、レスポンス時間を50%短縮しました。',
          status: 'closed',
          priority: 'high',
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
        issueHistory: [
          {
            timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            content: '問題の原因を特定：N+1クエリ問題',
          },
          {
            timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            content: 'クエリ最適化を実装：Eager Loading導入',
          },
          {
            timestamp: new Date(),
            content: 'パフォーマンステスト完了：50%の改善を確認',
          },
        ],
      };

      const moduleWithContext = merge(extractKnowledgePromptModule, {
        data: context,
      });

      const compiled = compile(moduleWithContext);
      const promptText = JSON.stringify(compiled);

      expect(promptText).toContain('N+1クエリ問題');
      expect(promptText).toContain('Eager Loading');
      expect(promptText).toContain('50%');
    });
  });

  describe.skipIf(() => process.env.SKIP_AI_TESTS === 'true')('AI実行テスト', () => {
    let aiService: any;

    beforeAll(async () => {
      aiService = await setupAIServiceForTest();
      if (!aiService) {
        throw new Error('AI Service is required for these tests');
      }
    });

    afterAll(() => {
      vi.restoreAllMocks();
    });

    it('技術的な知識を正しく抽出できる', async () => {
      const context: KnowledgeExtractionContext = {
        currentState: {
          summary: 'システム開発プロジェクト',
          projects: [],
          issues: [],
          materials: [],
        },
        issue: {
          id: 'tech-knowledge',
          title: 'GraphQL APIの実装',
          description: 'RESTful APIからGraphQLへの移行を完了しました。',
          status: 'closed',
          priority: 'high',
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
        issueHistory: [
          {
            timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
            content: 'GraphQLスキーマ設計完了。Apollo Serverを採用。',
          },
          {
            timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
            content: 'リゾルバー実装完了。DataLoaderでN+1問題を解決。',
          },
          {
            timestamp: new Date(),
            content: '移行完了。クエリ効率が40%向上。',
          },
        ],
      };

      const result = await extractKnowledge(context, { aiDriver: aiService });

      expect(result).toBeDefined();
      expect(result.knowledge).toBeDefined();
      expect(result.knowledge.title).toContain('GraphQL');
      expect(result.knowledge.content).toContain('Apollo Server');
      expect(result.knowledge.tags).toContain('api');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('ビジネス知識を正しく抽出できる', async () => {
      const context: KnowledgeExtractionContext = {
        currentState: {
          summary: 'プロダクト開発',
          projects: [],
          issues: [],
          materials: [],
        },
        issue: {
          id: 'business-knowledge',
          title: 'ユーザーオンボーディング改善',
          description: '新規ユーザーの離脱率を30%削減することに成功しました。',
          status: 'closed',
          priority: 'high',
          createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
        issueHistory: [
          {
            timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            content: 'ユーザーインタビュー実施。主な離脱要因を特定。',
          },
          {
            timestamp: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
            content: 'インタラクティブチュートリアル実装。プログレスバー追加。',
          },
          {
            timestamp: new Date(),
            content: 'A/Bテスト完了。離脱率30%削減を確認。',
          },
        ],
      };

      const result = await extractKnowledge(context, { aiDriver: aiService });

      expect(result).toBeDefined();
      expect(result.knowledge).toBeDefined();
      expect(result.knowledge.category).toBe('business');
      expect(result.knowledge.content).toContain('離脱');
      expect(result.knowledge.tags).toContain('ux');
      expect(result.learnings).toContain('チュートリアル');
    });

    it('抽出すべき知識がない場合を正しく判定できる', async () => {
      const context: KnowledgeExtractionContext = {
        currentState: {
          summary: '日常的な運用作業',
          projects: [],
          issues: [],
          materials: [],
        },
        issue: {
          id: 'routine-task',
          title: '定期メンテナンス',
          description: '毎月の定期メンテナンスを実施しました。',
          status: 'closed',
          priority: 'low',
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
        issueHistory: [
          {
            timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
            content: 'ログファイルのローテーション実施。',
          },
          {
            timestamp: new Date(),
            content: 'キャッシュクリア完了。',
          },
        ],
      };

      const result = await extractKnowledge(context, { aiDriver: aiService });

      expect(result).toBeDefined();
      expect(result.shouldExtract).toBe(false);
      expect(result.reason).toContain('定期');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });
});