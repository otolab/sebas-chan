/**
 * B-2: UPDATE_FLOW_RELATIONS プロンプトテスト
 *
 * Flow間の関係性分析プロンプトの品質を検証
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { compile } from '@moduler-prompt/core';
import { z } from 'zod';
import type { Flow, Issue } from '@sebas-chan/shared-types';
import type { FlowAnalysis } from './actions.js';
import { flowRelationPromptModule } from './prompts.js';
import { setupAIServiceForTest } from '../test-ai-helper.js';
import { createMockFlow, createMockIssue } from '../test-utils.js';
import type { MaterialElement } from '../shared/material-utils.js';
import type { AIService } from '@moduler-prompt/driver';

/**
 * 出力スキーマのZodバリデータ
 */
const outputSchemaValidator = z.object({
  flowUpdates: z.array(
    z.object({
      flowId: z.string(),
      health: z.enum(['healthy', 'needs_attention', 'stale', 'obsolete']),
      perspectiveValidity: z.object({
        stillValid: z.boolean(),
        reason: z.string(),
        suggestedUpdate: z.string().optional(),
      }),
      relationships: z.string(),
      suggestedChanges: z.array(
        z.object({
          action: z.enum(['remove_issue', 'add_issue', 'split_flow', 'merge_flow', 'archive_flow']),
          target: z.string(),
          rationale: z.string(),
        })
      ),
    })
  ),
  updatedState: z.record(z.any()).optional(),
});

/**
 * テスト用のFlowAnalysis作成ヘルパー
 */
function createFlowAnalysis(
  flow: Flow,
  issues: Issue[],
  completionRate: number = 0,
  staleness: number = 0
): FlowAnalysis {
  return {
    flow,
    issues,
    completionRate,
    staleness,
  };
}

describe('UpdateFlowRelations Prompts', () => {
  describe('ユニットテスト（コンテキスト反映）', () => {
    it('Flow分析データがプロンプトに正しく反映される', () => {
      const flow1 = createMockFlow({
        id: 'flow-001',
        title: 'ユーザー認証機能',
        description: 'ユーザー認証に関する観点',
        issueIds: ['issue-001', 'issue-002'],
        updatedAt: new Date(),
      });

      const flow2 = createMockFlow({
        id: 'flow-002',
        title: 'データ同期処理',
        description: 'データ同期に関する観点',
        issueIds: ['issue-003'],
        updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30日前
      });

      const issues1 = [
        createMockIssue({
          id: 'issue-001',
          title: 'ログイン機能実装',
          status: 'open',
        }),
        createMockIssue({
          id: 'issue-002',
          title: 'パスワードリセット',
          status: 'open',
        }),
      ];

      const issues2 = [
        createMockIssue({
          id: 'issue-003',
          title: '同期エラーの調査',
          status: 'closed',
        }),
      ];

      const context = {
        flowAnalysis: [
          createFlowAnalysis(flow1, issues1, 50, 5),
          createFlowAnalysis(flow2, issues2, 100, 30),
        ],
        recentChanges: ['issue-001'],
        knowledgeBase: [],
        currentState: '初期状態',
      };

      const compiled = compile(flowRelationPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // Flowの情報が含まれていることを確認
      expect(compiledString).toContain('flow-001');
      expect(compiledString).toContain('ユーザー認証機能');
      expect(compiledString).toContain('flow-002');
      expect(compiledString).toContain('データ同期処理');

      // 完了率と停滞期間が含まれることを確認
      expect(compiledString).toContain('50');
      expect(compiledString).toContain('100');
      expect(compiledString).toContain('30');
    });

    it('Flow分析がmaterialsセクションに展開される', () => {
      const flow = createMockFlow({
        id: 'flow-001',
        title: 'テストFlow',
        description: 'テストFlowの観点',
        issueIds: ['issue-001'],
      });

      const issue = createMockIssue({
        id: 'issue-001',
        title: 'テストIssue',
        description: 'テストIssueの詳細',
      });

      const context = {
        flowAnalysis: [createFlowAnalysis(flow, [issue], 75, 10)],
        recentChanges: [],
        knowledgeBase: [],
        currentState: '初期状態',
      };

      const compiled = compile(flowRelationPromptModule, context);
      const materials = compiled.data.filter(
        (item) => item.type === 'material'
      ) as MaterialElement[];

      // Flow分析のマテリアルが存在することを確認
      const flowMaterial = materials.find((m) => m.id === 'flow-analysis-flow-001');
      expect(flowMaterial).toBeDefined();
      expect(flowMaterial?.title).toContain('Flow分析: テストFlow');
      expect(flowMaterial?.content).toContain('完了率: 75%');
      expect(flowMaterial?.content).toContain('停滞期間: 10日');

      // Issueのマテリアルも存在することを確認
      const issueMaterial = materials.find((m) => m.id === 'issue-issue-001');
      expect(issueMaterial).toBeDefined();
      expect(issueMaterial?.title).toContain('テストIssue');
      expect(issueMaterial?.title).toContain('(Flow: flow-001)');
    });

    it('最近の変更情報が正しく反映される', () => {
      const flow = createMockFlow({
        id: 'flow-001',
        title: 'テストFlow',
        issueIds: ['issue-001', 'issue-002'],
      });

      const issues = [
        createMockIssue({ id: 'issue-001', title: 'Issue 1' }),
        createMockIssue({ id: 'issue-002', title: 'Issue 2' }),
      ];

      const context = {
        flowAnalysis: [createFlowAnalysis(flow, issues, 50, 0)],
        recentChanges: ['issue-001', 'issue-002'],
        knowledgeBase: [],
        currentState: '初期状態',
      };

      const compiled = compile(flowRelationPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      expect(compiledString).toContain('最近の変更Issue: issue-001, issue-002');
    });

    it('空のflowAnalysisが適切に処理される', () => {
      const context = {
        flowAnalysis: [],
        recentChanges: [],
        knowledgeBase: [],
        currentState: '初期状態',
      };

      const compiled = compile(flowRelationPromptModule, context);

      expect(compiled).toBeDefined();
      expect(JSON.stringify(compiled)).toContain('分析対象Flow数: 0');
      expect(JSON.stringify(compiled)).toContain('最近の変更なし');
    });

    it('健全性評価の指示が含まれる', () => {
      const context = {
        flowAnalysis: [],
        recentChanges: [],
        knowledgeBase: [],
        currentState: '初期状態',
      };

      const compiled = compile(flowRelationPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // instructions内容が含まれていることを確認
      expect(compiledString).toContain('healthy');
      expect(compiledString).toContain('needs_attention');
      expect(compiledString).toContain('stale');
      expect(compiledString).toContain('obsolete');
    });

    it('観点の妥当性評価の指示が含まれる', () => {
      const context = {
        flowAnalysis: [],
        recentChanges: [],
        knowledgeBase: [],
        currentState: '初期状態',
      };

      const compiled = compile(flowRelationPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      expect(compiledString).toContain('観点（perspective）の妥当性');
      expect(compiledString).toContain('現在も有効か');
      expect(compiledString).toContain('更新が必要か');
    });
  });

  describe.skipIf(() => process.env.SKIP_AI_TESTS === 'true')('AI実行テスト', () => {
    let aiService: AIService | null;

    beforeAll(async () => {
      aiService = await setupAIServiceForTest();
      if (!aiService) {
        throw new Error('AI Service is required for these tests');
      }
    });

    it('健全なFlowを正しく評価する', async () => {
      if (!aiService) {
        throw new Error('AI Service is required for this test');
      }

      const flow = createMockFlow({
        id: 'flow-001',
        title: 'アクティブな開発タスク',
        description: '現在進行中の開発タスクをまとめる観点',
        issueIds: ['issue-001', 'issue-002'],
        updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1日前
      });

      const issues = [
        createMockIssue({
          id: 'issue-001',
          title: '新機能の実装',
          status: 'open',
        }),
        createMockIssue({
          id: 'issue-002',
          title: 'UIの改善',
          status: 'open',
        }),
      ];

      const context = {
        flowAnalysis: [
          createFlowAnalysis(flow, issues, 30, 1), // 完了率30%、1日前に更新
        ],
        recentChanges: ['issue-001'],
        knowledgeBase: [],
        currentState: '初期状態',
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(flowRelationPromptModule, context);
      const result = await driver!.query(compiled);

      // スキーマバリデーション
      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 健全なFlowとして評価されることを確認
      const flowUpdate = output.flowUpdates.find((u) => u.flowId === 'flow-001');
      expect(flowUpdate).toBeDefined();
      expect(flowUpdate?.health).toBe('healthy');
      expect(flowUpdate?.perspectiveValidity.stillValid).toBe(true);
    });

    it('停滞しているFlowを検出する', async () => {
      if (!aiService) {
        throw new Error('AI Service is required for this test');
      }

      const flow = createMockFlow({
        id: 'flow-001',
        title: '放置されたタスク',
        description: '長期間更新されていないタスクの観点',
        issueIds: ['issue-001', 'issue-002'],
        updatedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60日前
      });

      const issues = [
        createMockIssue({
          id: 'issue-001',
          title: '古いバグ',
          status: 'open',
        }),
        createMockIssue({
          id: 'issue-002',
          title: '優先度の低い改善',
          status: 'open',
        }),
      ];

      const context = {
        flowAnalysis: [
          createFlowAnalysis(flow, issues, 0, 60), // 完了率0%、60日間停滞
        ],
        recentChanges: [],
        knowledgeBase: [],
        currentState: '初期状態',
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(flowRelationPromptModule, context);
      const result = await driver!.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 停滞として評価されることを確認
      const flowUpdate = output.flowUpdates.find((u) => u.flowId === 'flow-001');
      expect(flowUpdate?.health).toMatch(/stale|needs_attention/);

      // アーカイブや見直しの提案があることを確認
      expect(flowUpdate?.suggestedChanges.length).toBeGreaterThan(0);
    });

    it('完了したFlowを適切に識別する', async () => {
      if (!aiService) {
        throw new Error('AI Service is required for this test');
      }

      const flow = createMockFlow({
        id: 'flow-001',
        title: '完了したプロジェクト',
        description: '完了済みプロジェクトの観点',
        issueIds: ['issue-001', 'issue-002'],
      });

      const issues = [
        createMockIssue({
          id: 'issue-001',
          title: 'タスク1',
          status: 'closed',
        }),
        createMockIssue({
          id: 'issue-002',
          title: 'タスク2',
          status: 'closed',
        }),
      ];

      const context = {
        flowAnalysis: [
          createFlowAnalysis(flow, issues, 100, 5), // 完了率100%
        ],
        recentChanges: [],
        knowledgeBase: [],
        currentState: '初期状態',
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(flowRelationPromptModule, context);
      const result = await driver!.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      const flowUpdate = output.flowUpdates.find((u) => u.flowId === 'flow-001');

      // 完了またはアーカイブの提案があることを確認
      const archiveSuggestion = flowUpdate?.suggestedChanges.find(
        (c) => c.action === 'archive_flow'
      );
      expect(archiveSuggestion || flowUpdate?.health === 'obsolete').toBeTruthy();
    });

    it('複数Flowの関係性を分析する', async () => {
      if (!aiService) {
        throw new Error('AI Service is required for this test');
      }

      const flow1 = createMockFlow({
        id: 'flow-001',
        title: 'フロントエンド開発',
        description: 'フロントエンド開発の観点',
        issueIds: ['issue-001', 'issue-002'],
      });

      const flow2 = createMockFlow({
        id: 'flow-002',
        title: 'バックエンド開発',
        description: 'バックエンド開発の観点',
        issueIds: ['issue-003', 'issue-004'],
      });

      const issues1 = [
        createMockIssue({ id: 'issue-001', title: 'React実装' }),
        createMockIssue({ id: 'issue-002', title: 'APIクライアント実装' }),
      ];

      const issues2 = [
        createMockIssue({ id: 'issue-003', title: 'API設計' }),
        createMockIssue({ id: 'issue-004', title: 'データベース設計' }),
      ];

      const context = {
        flowAnalysis: [
          createFlowAnalysis(flow1, issues1, 40, 2),
          createFlowAnalysis(flow2, issues2, 60, 1),
        ],
        recentChanges: ['issue-002'], // APIクライアントが変更された
        knowledgeBase: [],
        currentState: '初期状態',
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(flowRelationPromptModule, context);
      const result = await driver!.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 両方のFlowが分析されることを確認
      expect(output.flowUpdates).toHaveLength(2);

      // 関係性の記述があることを確認
      output.flowUpdates.forEach((update) => {
        expect(update.relationships).toBeTruthy();
        expect(update.relationships.length).toBeGreaterThan(10); // 意味のある記述
      });
    });
  });
});
