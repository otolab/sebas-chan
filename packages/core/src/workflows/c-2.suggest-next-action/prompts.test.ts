/**
 * C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE プロンプトテスト
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { compile } from '@moduler-prompt/core';
import { z } from 'zod';
import { issueActionPromptModule } from './prompts.js';
import { createMockIssue, createMockKnowledge, createMockFlow } from '../test-utils.js';
import type { AIService } from '@moduler-prompt/driver';
import { setupAIServiceForTest } from '../test-ai-helper.js';

// 出力スキーマのZodバリデータ（簡略化版）
const outputSchemaValidator = z.object({
  actions: z.array(
    z.object({
      type: z.enum(['immediate', 'planned', 'investigative', 'delegatable']),
      priority: z.enum(['must_do', 'should_do', 'nice_to_have']),
      title: z.string(),
      description: z.string(),
      steps: z.array(
        z.object({
          order: z.number(),
          action: z.string(),
          detail: z.string(),
          estimatedTime: z.number(),
          tools: z.array(z.string()),
          checkpoints: z.array(z.string()),
        })
      ),
      prerequisites: z.array(z.string()),
      estimatedTotalTime: z.number(),
      confidence: z.number().min(0).max(1),
      riskLevel: z.enum(['low', 'medium', 'high']),
      successCriteria: z.array(z.string()),
      potentialBlockers: z.array(
        z.object({
          blocker: z.string(),
          mitigation: z.string(),
        })
      ),
    })
  ),
  rootCauseAnalysis: z
    .object({
      identified: z.boolean(),
      description: z.string(),
      evidence: z.array(z.string()),
      addressedByActions: z.boolean(),
    })
    .optional(),
  alternativeApproaches: z
    .array(
      z.object({
        approach: z.string(),
        whenToConsider: z.string(),
        prosAndCons: z.object({
          pros: z.array(z.string()),
          cons: z.array(z.string()),
        }),
      })
    )
    .optional(),
  splitSuggestion: z
    .object({
      shouldSplit: z.boolean(),
      reason: z.string(),
      suggestedSubIssues: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
          dependency: z.enum(['independent', 'sequential', 'parallel']),
        })
      ),
    })
    .optional(),
  escalationSuggestion: z
    .object({
      shouldEscalate: z.boolean(),
      reason: z.string(),
      escalateTo: z.string(),
      preparedInformation: z.array(z.string()),
    })
    .optional(),
  updatedState: z.string(),
});

describe('C-2: SuggestNextActionForIssue Prompts', () => {
  describe('ユニットテスト（コンテキスト反映）', () => {
    it('Issue情報がプロンプトに正しく反映される', () => {
      const issue = createMockIssue({
        id: 'issue-1',
        title: 'Performance degradation',
        description: 'Application response time increased',
        priority: 85,
        status: 'open',
        labels: ['bug', 'performance'],
      });

      const knowledge = [
        createMockKnowledge({
          id: 'knowledge-1',
          type: 'solution',
          content: 'Database query optimization techniques',
        }),
      ];

      const context = {
        issueAnalysis: {
          issue,
          stalledDuration: 5,
          complexity: 'high' as const,
        },
        relevantKnowledge: knowledge,
        similarResolvedIssues: [
          {
            id: 'resolved-1',
            title: 'Similar performance issue',
            similarity: 0.85,
            resolution: 'Optimized database indexes',
            keyLearning: 'Always check query execution plans',
          },
        ],
        flowPerspective: createMockFlow({
          id: 'flow-1',
          title: 'Performance Optimization',
          description: 'Improve system performance',
          priorityScore: 0.9,
        }),
        userContext: {
          previousAttempts: ['Cache optimization', 'Code profiling'],
          blockers: ['Cannot reproduce in dev environment'],
        },
        constraints: {
          timeLimit: 120,
        },
        detailLevel: 'detailed' as const,
        state: 'Initial analysis',
      };

      const compiled = compile(issueActionPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // 基本情報の反映確認
      expect(compiledString).toContain('issue-1');
      expect(compiledString).toContain('Performance degradation');
      expect(compiledString).toContain('5日');
      expect(compiledString).toContain('high');
      expect(compiledString).toContain('detailed');

      // ユーザーコンテキストの反映
      expect(compiledString).toContain('Cache optimization');
      expect(compiledString).toContain('Cannot reproduce in dev environment');
      expect(compiledString).toContain('120分');

      // Material要素の確認
      const materials = compiled.data.filter((item: any) => item.type === 'material');
      const materialIds = materials.map((m: any) => m.id);

      // Issue詳細
      expect(materialIds).toContain('issue-issue-1');
      const issueMaterial = materials.find((m: any) => m.id === 'issue-issue-1');
      expect(issueMaterial?.content).toContain('bug, performance');

      // 関連Knowledge
      expect(materialIds).toContain('knowledge-knowledge-1');

      // 類似Issue
      expect(materialIds).toContain('similar-resolved-1');
      const similarMaterial = materials.find((m: any) => m.id === 'similar-resolved-1');
      expect(similarMaterial?.content).toContain('0.85');

      // Flow観点
      expect(materialIds).toContain('flow-perspective');
    });

    it('ユーザーコンテキストがない場合も正しく処理される', () => {
      const issue = createMockIssue({
        id: 'issue-2',
        title: 'Simple bug',
      });

      const context = {
        issueAnalysis: {
          issue,
          stalledDuration: 0,
          complexity: 'low' as const,
        },
        relevantKnowledge: [],
        similarResolvedIssues: [],
        flowPerspective: null,
        userContext: {},
        constraints: {},
        detailLevel: 'quick' as const,
        state: 'Quick fix needed',
      };

      const compiled = compile(issueActionPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // 基本情報のみが含まれる
      expect(compiledString).toContain('issue-2');
      expect(compiledString).toContain('Simple bug');
      expect(compiledString).toContain('quick');

      // オプション情報が含まれない（ただし「ブロッカー」は用語説明にあるため除外）
      expect(compiledString).not.toContain('過去の試行');
      expect(compiledString).not.toContain('時間制約');

      // Flow観点がない
      const materials = compiled.data.filter((item: any) => item.type === 'material');
      const flowMaterial = materials.find((m: any) => m.id === 'flow-perspective');
      expect(flowMaterial).toBeUndefined();
    });

    it('複数の類似Issueが正しく展開される', () => {
      const issue = createMockIssue({
        id: 'current-issue',
        title: 'Database timeout',
      });

      const similarIssues = [
        {
          id: 'similar-1',
          title: 'Connection pool exhaustion',
          similarity: 0.9,
          resolution: 'Increased pool size',
        },
        {
          id: 'similar-2',
          title: 'Query timeout',
          similarity: 0.75,
          resolution: 'Added index',
          keyLearning: 'Monitor slow queries',
        },
      ];

      const context = {
        issueAnalysis: {
          issue,
          stalledDuration: 3,
          complexity: 'medium' as const,
        },
        relevantKnowledge: [],
        similarResolvedIssues: similarIssues,
        flowPerspective: null,
        userContext: {},
        constraints: {},
        detailLevel: 'detailed' as const,
        state: 'Analyzing similar issues',
      };

      const compiled = compile(issueActionPromptModule, context);
      const materials = compiled.data.filter((item: any) => item.type === 'material');

      // 両方の類似Issueが含まれる
      const similar1 = materials.find((m: any) => m.id === 'similar-similar-1');
      const similar2 = materials.find((m: any) => m.id === 'similar-similar-2');

      expect(similar1).toBeDefined();
      expect(similar1?.content).toContain('0.9');
      expect(similar1?.content).toContain('Increased pool size');

      expect(similar2).toBeDefined();
      expect(similar2?.content).toContain('0.75');
      expect(similar2?.content).toContain('Monitor slow queries');
    });
  });

  describe.skipIf(() => process.env.SKIP_AI_TESTS === 'true')('AI実行テスト', () => {
    let aiService: AIService | null = null;

    beforeAll(async () => {
      aiService = await setupAIServiceForTest();
      if (!aiService) {
        throw new Error('AI Service is required for these tests');
      }
    });

    it('高優先度Issueに対して適切なアクションを提案する', async () => {
      const issue = createMockIssue({
        id: 'critical-issue',
        title: 'Production server down',
        description: 'Main application server is not responding',
        priority: 95,
        status: 'open',
        labels: ['critical', 'production'],
      });

      const context = {
        issueAnalysis: {
          issue,
          stalledDuration: 0,
          complexity: 'high' as const,
        },
        relevantKnowledge: [
          createMockKnowledge({
            content: 'Server restart procedures and health check scripts',
          }),
        ],
        similarResolvedIssues: [],
        flowPerspective: null,
        userContext: {},
        constraints: {
          timeLimit: 30,
        },
        detailLevel: 'quick' as const,
        state: 'Emergency response needed',
      };

      const driver = await aiService!.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(issueActionPromptModule, context);
      const result = await driver.query(compiled);

      // スキーマバリデーション
      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 高優先度の即座のアクションが提案される
      expect(output.actions.length).toBeGreaterThan(0);
      expect(output.actions.length).toBeLessThanOrEqual(3);

      const primaryAction = output.actions[0];
      expect(primaryAction.type).toMatch(/immediate|investigative/);
      expect(primaryAction.priority).toBe('must_do');
      expect(primaryAction.estimatedTotalTime).toBeLessThanOrEqual(30);

      // ステップが具体的
      expect(primaryAction.steps.length).toBeGreaterThan(0);
      expect(primaryAction.steps[0].action).toBeDefined();
      expect(primaryAction.steps[0].checkpoints.length).toBeGreaterThan(0);

      // リスクと成功基準が定義されている
      expect(primaryAction.riskLevel).toBeDefined();
      expect(primaryAction.successCriteria.length).toBeGreaterThan(0);

      // 状態更新
      expect(output.updatedState).toBeDefined();
      expect(output.updatedState).not.toBe('Emergency response needed');
    });

    it('停滞しているIssueに対して分割提案を行う', async () => {
      const issue = createMockIssue({
        id: 'stalled-issue',
        title: 'Complete system refactoring',
        description: 'Refactor entire legacy codebase to modern architecture',
        priority: 60,
        status: 'open',
      });

      const context = {
        issueAnalysis: {
          issue,
          stalledDuration: 14,
          complexity: 'high' as const,
        },
        relevantKnowledge: [],
        similarResolvedIssues: [],
        flowPerspective: null,
        userContext: {
          previousAttempts: ['Started but overwhelmed by scope'],
          blockers: ['Too large to tackle at once'],
        },
        constraints: {},
        detailLevel: 'comprehensive' as const,
        state: 'Analyzing stalled issue',
      };

      const driver = await aiService!.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(issueActionPromptModule, context);
      const result = await driver.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 分割提案の検証
      if (output.splitSuggestion) {
        expect(output.splitSuggestion.shouldSplit).toBe(true);
        expect(output.splitSuggestion.reason).toBeDefined();

        if (output.splitSuggestion.suggestedSubIssues) {
          expect(output.splitSuggestion.suggestedSubIssues.length).toBeGreaterThan(1);
          const firstSubIssue = output.splitSuggestion.suggestedSubIssues[0];
          expect(firstSubIssue.title).toBeDefined();
          expect(firstSubIssue.description).toBeDefined();
          expect(['independent', 'sequential', 'parallel']).toContain(firstSubIssue.dependency);
        }
      }

      // 根本原因分析
      if (output.rootCauseAnalysis) {
        expect(output.rootCauseAnalysis.description).toBeDefined();
        if (output.rootCauseAnalysis.identified) {
          expect(output.rootCauseAnalysis.evidence.length).toBeGreaterThan(0);
        }
      }
    });

    it('類似の解決済みIssueから学習した提案を行う', async () => {
      const issue = createMockIssue({
        id: 'new-issue',
        title: 'Memory leak in application',
        description: 'Application memory usage keeps increasing',
        priority: 75,
      });

      const context = {
        issueAnalysis: {
          issue,
          stalledDuration: 2,
          complexity: 'medium' as const,
        },
        relevantKnowledge: [],
        similarResolvedIssues: [
          {
            id: 'resolved-1',
            title: 'Memory leak in worker process',
            similarity: 0.92,
            resolution: 'Fixed circular references and added proper cleanup',
            keyLearning: 'Always use weak references for event listeners',
          },
          {
            id: 'resolved-2',
            title: 'Memory usage spike',
            similarity: 0.78,
            resolution: 'Implemented object pooling',
            keyLearning: 'Monitor heap snapshots regularly',
          },
        ],
        flowPerspective: null,
        userContext: {},
        constraints: {},
        detailLevel: 'detailed' as const,
        state: 'Learning from similar issues',
      };

      const driver = await aiService!.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(issueActionPromptModule, context);
      const result = await driver.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 学習が反映されたアクションの検証
      expect(output.actions.length).toBeGreaterThan(0);

      const actions = output.actions;
      const hasInvestigativeAction = actions.some((a) => a.type === 'investigative');
      expect(hasInvestigativeAction).toBe(true);

      // 高い確信度（類似事例があるため）
      const highConfidenceAction = actions.find((a) => a.confidence > 0.7);
      expect(highConfidenceAction).toBeDefined();

      // 代替アプローチの提案
      if (output.alternativeApproaches && output.alternativeApproaches.length > 0) {
        const alternative = output.alternativeApproaches[0];
        expect(alternative.approach).toBeDefined();
        expect(alternative.prosAndCons.pros.length).toBeGreaterThan(0);
        expect(alternative.prosAndCons.cons.length).toBeGreaterThan(0);
      }
    });
  });
});