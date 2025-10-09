import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { compile, merge } from '@moduler-prompt/core';
import { analyzeImpactPromptModule, baseAnalyzeImpactModule } from './prompts.js';
import { analyzeIssueImpact } from './actions.js';
import { setupAIServiceForTest } from '../test-ai-helper.js';
import type { Issue } from '@sebas-chan/db';
import type { ImpactAnalysisContext } from './prompts.js';
import { z } from 'zod';

describe('analyzeIssueImpact prompts', () => {
  describe('プロンプトモジュールの構造', () => {
    it('baseAnalyzeImpactModuleが正しい構造を持っている', () => {
      const compiled = compile(baseAnalyzeImpactModule);

      // 基本的な構造の確認
      expect(compiled).toBeDefined();
      expect(compiled.data).toBeDefined();

      // 必要な情報が含まれていることを確認
      const promptText = JSON.stringify(compiled);
      expect(promptText).toContain('Issue');
      expect(promptText).toContain('影響');
    });

    it('analyzeImpactPromptModuleが正しくマージされている', () => {
      const compiled = compile(analyzeImpactPromptModule);

      expect(compiled).toBeDefined();
      expect(compiled.data).toBeDefined();

      // updateStatePromptModuleとbaseAnalyzeImpactModuleの両方の要素が含まれる
      const promptText = JSON.stringify(compiled);
      expect(promptText).toContain('状態');
      expect(promptText).toContain('Issue');
    });
  });

  describe('コンテキストデータの反映', () => {
    it('Issue情報がプロンプトに含まれる', () => {
      const context: ImpactAnalysisContext = {
        currentState: {
          summary: 'システムの現在の状態',
          projects: [],
          issues: [],
          materials: [],
        },
        issue: {
          id: 'test-issue-1',
          title: 'テストIssue',
          description: '優先度の高い重要なバグ',
          status: 'open',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        updates: {
          previous: { priority: 'low' },
          current: { priority: 'high' },
          changedFields: ['priority'],
        },
      };

      const moduleWithContext = merge(analyzeImpactPromptModule, {
        data: context,
      });

      const compiled = compile(moduleWithContext);
      const promptText = JSON.stringify(compiled);

      expect(promptText).toContain('test-issue-1');
      expect(promptText).toContain('テストIssue');
      expect(promptText).toContain('優先度の高い重要なバグ');
      expect(promptText).toContain('high');
    });

    it('更新情報がプロンプトに反映される', () => {
      const context: ImpactAnalysisContext = {
        currentState: {
          summary: '現在の状態',
          projects: [],
          issues: [],
          materials: [],
        },
        issue: {
          id: 'issue-2',
          title: 'ステータス変更Issue',
          description: '修正完了',
          status: 'closed',
          priority: 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        updates: {
          previous: { status: 'open' },
          current: { status: 'closed' },
          changedFields: ['status'],
        },
      };

      const moduleWithContext = merge(analyzeImpactPromptModule, {
        data: context,
      });

      const compiled = compile(moduleWithContext);
      const promptText = JSON.stringify(compiled);

      expect(promptText).toContain('closed');
      expect(promptText).toContain('status');
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
      const context: ImpactAnalysisContext = {
        currentState: {
          summary: 'プロジェクトで複数のIssueが進行中',
          projects: [{
            id: 'proj-1',
            name: 'メインプロジェクト',
            description: 'システム開発',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
          }],
          issues: [],
          materials: [],
        },
        issue: {
          id: 'critical-bug',
          title: '本番環境でのデータ損失バグ',
          description: 'ユーザーデータが失われる重大なバグが発見されました',
          status: 'open',
          priority: 'critical',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        updates: {
          previous: { priority: 'low' },
          current: { priority: 'critical' },
          changedFields: ['priority'],
        },
      };

      const result = await analyzeIssueImpact(context, { aiDriver: aiService });

      expect(result).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.needsPriorityAdjustment).toBe(true);
      expect(result.suggestedPriority).toBe('critical');
      expect(result.analysis).toContain('重大');
    });

    it('Issue完了時の知識抽出可否を判定できる', async () => {
      const context: ImpactAnalysisContext = {
        currentState: {
          summary: 'プロジェクト進行中',
          projects: [],
          issues: [],
          materials: [],
        },
        issue: {
          id: 'completed-feature',
          title: 'ユーザー認証機能の実装',
          description: 'OAuth2.0による認証機能を実装し、セキュリティを強化しました',
          status: 'closed',
          priority: 'high',
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
        updates: {
          previous: { status: 'open' },
          current: { status: 'closed' },
          changedFields: ['status'],
        },
      };

      const result = await analyzeIssueImpact(context, { aiDriver: aiService });

      expect(result).toBeDefined();
      expect(result.shouldClose).toBe(true);
      expect(result.canExtractKnowledge).toBe(true);
      expect(result.analysis).toContain('完了');
    });

    it('関連Issueへの影響を検出できる', async () => {
      const context: ImpactAnalysisContext = {
        currentState: {
          summary: 'システム全体の改修プロジェクト',
          projects: [],
          issues: [
            {
              id: 'related-1',
              title: 'APIエンドポイントの追加',
              description: '認証が必要なAPI',
              status: 'open',
              priority: 'medium',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: 'related-2',
              title: 'フロントエンド対応',
              description: 'API連携部分',
              status: 'open',
              priority: 'medium',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          materials: [],
        },
        issue: {
          id: 'auth-blocked',
          title: '認証システムのブロッキング問題',
          description: '認証APIが動作しないため、関連機能の開発がブロックされています',
          status: 'open',
          priority: 'critical',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        updates: {
          previous: { priority: 'high' },
          current: { priority: 'critical' },
          changedFields: ['priority'],
        },
      };

      const result = await analyzeIssueImpact(context, { aiDriver: aiService });

      expect(result).toBeDefined();
      expect(result.affectedIssues).toBeDefined();
      expect(result.affectedIssues.length).toBeGreaterThan(0);
      expect(result.analysis).toContain('ブロック');
    });
  });
});