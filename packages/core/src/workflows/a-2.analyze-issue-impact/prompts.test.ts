import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { compile, merge } from '@moduler-prompt/core';
import { analyzeImpactPromptModule } from './prompts.js';
import { analyzeIssue } from './actions.js';
import { setupAIServiceForTest } from '../test-ai-helper.js';
import { createMockIssue } from '../test-utils.js';
import type { Issue } from '@sebas-chan/shared-types';
import type { ImpactAnalysisContext } from './prompts.js';
import { z } from 'zod';

describe('analyzeIssueImpact prompts', () => {
  describe('プロンプトモジュールの構造', () => {
    it('analyzeImpactPromptModuleが正しい構造を持っている', () => {
      const context: ImpactAnalysisContext = {
        issue: createMockIssue({
          id: 'test-issue',
          title: 'テストIssue',
          description: 'テスト用の説明',
          status: 'open',
          priority: 50,
        }),
        otherRelatedIssues: [],
        currentState: '初期状態',
      };

      const compiled = compile(analyzeImpactPromptModule, context);

      // 基本的な構造の確認
      expect(compiled).toBeDefined();
      expect(compiled.data).toBeDefined();

      // 必要な情報が含まれていることを確認
      const promptText = JSON.stringify(compiled);
      expect(promptText).toContain('Issue');
      expect(promptText).toContain('分析');
    });
  });

  describe('コンテキストデータの反映', () => {
    it('Issue情報がプロンプトに含まれる', () => {
      const context: ImpactAnalysisContext = {
        currentState: 'システムの現在の状態',
        issue: createMockIssue({
          id: 'test-issue-1',
          title: 'テストIssue',
          description: '優先度の高い重要なバグ',
          status: 'open',
          priority: 80,
          labels: ['bug', 'high-priority'],
        }),
        otherRelatedIssues: [],
      };

      const compiled = compile(analyzeImpactPromptModule, context);
      const promptText = JSON.stringify(compiled);

      expect(promptText).toContain('test-issue-1');
      expect(promptText).toContain('テストIssue');
      expect(promptText).toContain('優先度の高い重要なバグ');
      expect(promptText).toContain('80');
    });

    it('関連Issueがプロンプトに反映される', () => {
      const context: ImpactAnalysisContext = {
        currentState: '現在の状態',
        issue: createMockIssue({
          id: 'issue-2',
          title: 'ステータス変更Issue',
          description: '修正完了',
          status: 'closed',
          priority: 50,
          updates: [
            {
              timestamp: new Date(),
              content: 'バグを修正しました',
              author: 'system',
            },
          ],
        }),
        otherRelatedIssues: [
          createMockIssue({
            id: 'related-1',
            title: '関連Issue',
            description: '関連する問題',
            status: 'open',
            priority: 30,
            labels: ['related'],
          }),
        ],
      };

      const compiled = compile(analyzeImpactPromptModule, context);
      const promptText = JSON.stringify(compiled);

      expect(promptText).toContain('closed');
      expect(promptText).toContain('関連Issue');
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

    it('優先度変更の影響を正しく分析できる', async () => {
      const issue = createMockIssue({
        id: 'critical-bug',
        title: '本番環境でのデータ損失バグ',
        description: 'ユーザーデータが失われる重大なバグが発見されました',
        status: 'open',
        priority: 100,
        labels: ['bug', 'critical'],
        updates: [
          {
            timestamp: new Date(),
            content: '優先度をcriticalに変更しました',
            author: 'system',
          },
        ],
      });

      const result = await analyzeIssue(
        aiService,
        issue,
        [],
        'プロジェクトで複数のIssueが進行中'
      );

      expect(result).toBeDefined();
      expect(result.impactScore).toBeDefined();
      expect(result.suggestedPriority).toBeGreaterThan(80);
      expect(result.updatedState).toContain('重大');
    });

    it('Issue完了時の知識抽出可否を判定できる', async () => {
      const issue = createMockIssue({
        id: 'completed-feature',
        title: 'ユーザー認証機能の実装',
        description: 'OAuth2.0による認証機能を実装し、セキュリティを強化しました',
        status: 'closed',
        priority: 80,
        labels: ['feature', 'completed'],
        updates: [
          {
            timestamp: new Date(),
            content: '実装完了、テスト合格',
            author: 'developer',
          },
        ],
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      });

      const result = await analyzeIssue(
        aiService,
        issue,
        [],
        'プロジェクト進行中'
      );

      expect(result).toBeDefined();
      expect(result.shouldClose).toBe(true);
      expect(result.hasKnowledge).toBe(true);
      expect(result.knowledgeSummary).toContain('認証');
    });

    it('関連Issueへの影響を検出できる', async () => {
      const issue = createMockIssue({
        id: 'auth-blocked',
        title: '認証システムのブロッキング問題',
        description: '認証APIが動作しないため、関連機能の開発がブロックされています',
        status: 'open',
        priority: 100,
        labels: ['blocker', 'critical'],
        updates: [
          {
            timestamp: new Date(),
            content: '優先度をcriticalに変更',
            author: 'system',
          },
        ],
      });

      const relatedIssues = [
        createMockIssue({
          id: 'related-1',
          title: 'APIエンドポイントの追加',
          description: '認証が必要なAPI',
          status: 'open',
          priority: 50,
        }),
        createMockIssue({
          id: 'related-2',
          title: 'フロントエンド対応',
          description: 'API連携部分',
          status: 'open',
          priority: 50,
        }),
      ];

      const result = await analyzeIssue(
        aiService,
        issue,
        relatedIssues,
        'システム全体の改修プロジェクト'
      );

      expect(result).toBeDefined();
      expect(result.impactedComponents).toBeDefined();
      expect(result.impactedComponents.length).toBeGreaterThan(0);
      expect(result.updatedState).toContain('ブロック');
    });
  });
});