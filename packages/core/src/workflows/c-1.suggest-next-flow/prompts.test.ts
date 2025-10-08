/**
 * C-1: SUGGEST_NEXT_FLOW プロンプトテスト
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { compile } from '@moduler-prompt/core';
import { z } from 'zod';
import { nextFlowPromptModule } from './prompts.js';
import type { Flow } from '@sebas-chan/shared-types';
import type { ExtendedFlow } from '../extended-types.js';
import type { AIService } from '@moduler-prompt/driver';
import { setupAIServiceForTest } from '../test-ai-helper.js';

// 出力スキーマのZodバリデータ
const outputSchemaValidator = z.object({
  suggestions: z.array(
    z.object({
      flowId: z.string(),
      score: z.number().min(0).max(1),
      reason: z.string(),
      matchFactors: z.array(
        z.object({
          factor: z.enum([
            'priority',
            'deadline',
            'energy_match',
            'time_fit',
            'context_continuity',
            'user_preference',
            'dependency',
          ]),
          score: z.number().min(0).max(1),
          description: z.string(),
        })
      ),
      estimatedDuration: z.number(),
      energyRequired: z.enum(['high', 'medium', 'low']),
      bestTimeSlot: z
        .object({
          start: z.string(),
          end: z.string(),
        })
        .optional(),
      alternativeIf: z
        .object({
          condition: z.string(),
          alternativeFlowId: z.string(),
          reason: z.string(),
        })
        .optional(),
      preparationSteps: z.array(z.string()).optional(),
    })
  ),
  contextInsights: z.object({
    currentFocus: z.string(),
    productivityAdvice: z.string(),
    bottleneck: z.string().optional(),
  }),
  fallbackSuggestion: z
    .object({
      action: z.enum(['take_break', 'review_progress', 'organize_thoughts']),
      reason: z.string(),
      duration: z.number(),
    })
    .nullable()
    .optional(),
  updatedState: z.string(),
});

describe('C-1: SuggestNextFlow Prompts', () => {
  describe('ユニットテスト（コンテキスト反映）', () => {
    it('コンテキスト情報がプロンプトに正しく反映される', () => {
      const activeFlows: Flow[] = [
        {
          id: 'flow-1',
          title: 'Daily Review',
          description: '日次レビュー',
          status: 'active',
          issueIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'flow-2',
          title: 'Bug Fix',
          description: 'バグ修正',
          status: 'active',
          issueIds: ['issue-1', 'issue-2'],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const upcomingDeadlines: ExtendedFlow[] = [
        {
          id: 'flow-3',
          title: 'Project Deadline',
          description: 'プロジェクト締切',
          status: 'active',
          issueIds: [],
          deadline: new Date('2024-12-31').toISOString(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const context = {
        contextAnalysis: {
          timeContext: {
            currentTime: new Date('2024-01-01T10:00:00Z'),
            timezone: 'Asia/Tokyo',
            isWorkingHours: true,
          },
          userContext: {
            recentFlows: [],
            currentEnergy: 'high' as const,
            availableTime: 120,
          },
          flowContext: {
            activeFlows,
            upcomingDeadlines,
          },
          completedFlowAnalysis: {
            id: 'flow-0',
            title: 'Morning Routine',
            description: '朝のルーチン',
            status: 'completed' as const,
            issueIds: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        knowledgeBase: [
          {
            id: 'kb-1',
            type: 'user_pattern',
            content: 'ユーザーは朝に集中力が高い',
            confidence: 0.9,
          },
        ],
        constraints: {
          maxSuggestions: 5,
          priorityThreshold: 0.5,
        },
        state: 'Current state',
      };

      const compiled = compile(nextFlowPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // コンテキストが反映されていることを確認
      expect(compiledString).toContain('2024-01-01T10:00:00');
      expect(compiledString).toContain('Asia/Tokyo');
      expect(compiledString).toContain('勤務時間内: はい');
      expect(compiledString).toContain('high');
      expect(compiledString).toContain('120分');
      expect(compiledString).toContain('Morning Routine');

      // Material要素の確認
      const materials = compiled.data.filter((item: any) => item.type === 'material');
      const materialIds = materials.map((m: any) => m.id);

      // アクティブなFlowが含まれている
      expect(materialIds).toContain('flow-flow-1');
      expect(materialIds).toContain('flow-flow-2');

      // 締切が近いFlowが含まれている
      const deadlineMaterial = materials.find((m: any) => m.id === 'flow-flow-3');
      expect(deadlineMaterial).toBeDefined();
      expect(deadlineMaterial?.title).toContain('[締切間近]');

      // ユーザーパターンが含まれている
      expect(materialIds).toContain('knowledge-kb-1');
    });

    it('完了したFlowがない場合も正しく処理される', () => {
      const context = {
        contextAnalysis: {
          timeContext: {
            currentTime: new Date(),
            timezone: 'UTC',
            isWorkingHours: false,
          },
          userContext: {
            recentFlows: [],
            currentEnergy: 'low' as const,
            availableTime: 30,
          },
          flowContext: {
            activeFlows: [],
            upcomingDeadlines: [],
          },
          completedFlowAnalysis: null,
        },
        knowledgeBase: [],
        constraints: {
          maxSuggestions: 3,
          priorityThreshold: 0.7,
        },
        state: 'Initial state',
      };

      const compiled = compile(nextFlowPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // 勤務時間外と低エネルギーが反映されている
      expect(compiledString).toContain('勤務時間内: いいえ');
      expect(compiledString).toContain('low');
      expect(compiledString).toContain('30分');

      // 完了したFlowの情報が含まれていない
      expect(compiledString).not.toContain('直前に完了したFlow');
    });

    it('最近のFlowがリストに含まれる', () => {
      const recentFlows: Flow[] = [
        {
          id: 'recent-1',
          title: 'Yesterday Task',
          description: '昨日のタスク',
          status: 'completed',
          issueIds: [],
          createdAt: new Date(),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      const context = {
        contextAnalysis: {
          timeContext: {
            currentTime: new Date(),
            timezone: 'Asia/Tokyo',
            isWorkingHours: true,
          },
          userContext: {
            recentFlows,
            currentEnergy: 'medium' as const,
            availableTime: 60,
          },
          flowContext: {
            activeFlows: [],
            upcomingDeadlines: [],
          },
          completedFlowAnalysis: null,
        },
        knowledgeBase: [],
        constraints: {
          maxSuggestions: 5,
          priorityThreshold: 0.5,
        },
        state: 'Current state',
      };

      const compiled = compile(nextFlowPromptModule, context);
      const materials = compiled.data.filter((item: any) => item.type === 'material');

      const recentMaterial = materials.find((m: any) => m.id === 'recent-recent-1');
      expect(recentMaterial).toBeDefined();
      expect(recentMaterial?.title).toContain('最近完了: Yesterday Task');
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

    it('朝の作業開始時に適切な提案を生成する', async () => {
      const context = {
        contextAnalysis: {
          timeContext: {
            currentTime: new Date('2024-01-01T09:00:00Z'),
            timezone: 'Asia/Tokyo',
            isWorkingHours: true,
          },
          userContext: {
            recentFlows: [],
            currentEnergy: 'high' as const,
            availableTime: 240, // 4時間
          },
          flowContext: {
            activeFlows: [
              {
                id: 'morning-review',
                title: 'Morning Review',
                description: '朝のレビューとタスク整理',
                status: 'active' as const,
                issueIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: 'deep-work',
                title: 'Deep Work Session',
                description: '集中作業セッション',
                status: 'active' as const,
                issueIds: ['issue-1'],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: 'email-check',
                title: 'Email Processing',
                description: 'メール処理',
                status: 'active' as const,
                issueIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            upcomingDeadlines: [],
          },
          completedFlowAnalysis: null,
        },
        knowledgeBase: [
          {
            id: 'pattern-1',
            type: 'user_pattern',
            content: 'ユーザーは朝に集中力が高く、深い思考作業を好む',
            confidence: 0.95,
          },
        ],
        constraints: {
          maxSuggestions: 3,
          priorityThreshold: 0.5,
        },
        state: 'Morning work session started',
      };

      const driver = await aiService!.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(nextFlowPromptModule, context);
      const result = await driver.query(compiled);

      // スキーマバリデーション
      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 朝の高エネルギー時に適切な提案がされている
      expect(output.suggestions.length).toBeGreaterThan(0);
      expect(output.suggestions.length).toBeLessThanOrEqual(3);

      // 最初の提案の検証
      const primarySuggestion = output.suggestions[0];
      expect(primarySuggestion.flowId).toBeDefined();
      expect(primarySuggestion.score).toBeGreaterThan(0.5);
      expect(primarySuggestion.energyRequired).toMatch(/high|medium/);

      // マッチファクターの検証
      expect(primarySuggestion.matchFactors.length).toBeGreaterThan(0);
      const energyMatch = primarySuggestion.matchFactors.find((f) => f.factor === 'energy_match');
      expect(energyMatch).toBeDefined();
      if (energyMatch) {
        expect(energyMatch.score).toBeGreaterThan(0.6);
      }

      // コンテキストインサイトの検証
      expect(output.contextInsights.currentFocus).toBeDefined();
      expect(output.contextInsights.productivityAdvice).toBeDefined();

      // 状態更新の確認
      expect(output.updatedState).toBeDefined();
      expect(output.updatedState).not.toBe('Morning work session started');
    });

    it('締切が近いFlowを優先的に提案する', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const context = {
        contextAnalysis: {
          timeContext: {
            currentTime: new Date(),
            timezone: 'Asia/Tokyo',
            isWorkingHours: true,
          },
          userContext: {
            recentFlows: [],
            currentEnergy: 'medium' as const,
            availableTime: 60,
          },
          flowContext: {
            activeFlows: [
              {
                id: 'regular-task',
                title: 'Regular Task',
                description: '通常タスク',
                status: 'active' as const,
                issueIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            upcomingDeadlines: [
              {
                id: 'urgent-deadline',
                title: 'Urgent Deadline',
                description: '緊急締切タスク',
                status: 'active' as const,
                issueIds: [],
                deadline: tomorrow.toISOString(),
                createdAt: new Date(),
                updatedAt: new Date(),
              } as ExtendedFlow,
            ],
          },
          completedFlowAnalysis: null,
        },
        knowledgeBase: [],
        constraints: {
          maxSuggestions: 2,
          priorityThreshold: 0.3,
        },
        state: 'Checking for urgent tasks',
      };

      const driver = await aiService!.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(nextFlowPromptModule, context);
      const result = await driver.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 締切が近いタスクが提案されている
      const urgentSuggestion = output.suggestions.find((s) => s.flowId === 'urgent-deadline');
      expect(urgentSuggestion).toBeDefined();

      if (urgentSuggestion) {
        // 締切ファクターのスコアが高い
        const deadlineFactor = urgentSuggestion.matchFactors.find((f) => f.factor === 'deadline');
        expect(deadlineFactor).toBeDefined();
        if (deadlineFactor) {
          expect(deadlineFactor.score).toBeGreaterThan(0.7);
        }
      }
    });

    it('低エネルギー時には軽いタスクを提案する', async () => {
      const context = {
        contextAnalysis: {
          timeContext: {
            currentTime: new Date('2024-01-01T17:00:00Z'),
            timezone: 'Asia/Tokyo',
            isWorkingHours: true,
          },
          userContext: {
            recentFlows: [],
            currentEnergy: 'low' as const,
            availableTime: 30,
          },
          flowContext: {
            activeFlows: [
              {
                id: 'heavy-task',
                title: 'Complex Analysis',
                description: '複雑な分析作業',
                status: 'active' as const,
                issueIds: ['issue-1', 'issue-2', 'issue-3'],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: 'light-task',
                title: 'Simple Review',
                description: '簡単なレビュー',
                status: 'active' as const,
                issueIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            upcomingDeadlines: [],
          },
          completedFlowAnalysis: null,
        },
        knowledgeBase: [],
        constraints: {
          maxSuggestions: 2,
          priorityThreshold: 0.5,
        },
        state: 'Low energy state',
      };

      const driver = await aiService!.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(nextFlowPromptModule, context);
      const result = await driver.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 提案の検証
      expect(output.suggestions.length).toBeGreaterThan(0);

      // 低エネルギーに適したタスクが提案されている
      const suggestions = output.suggestions;
      const hasLowEnergyTask = suggestions.some((s) => s.energyRequired === 'low' || s.energyRequired === 'medium');
      expect(hasLowEnergyTask).toBe(true);

      // フォールバック提案の確認（休憩など）
      if (output.fallbackSuggestion) {
        expect(['take_break', 'review_progress', 'organize_thoughts']).toContain(
          output.fallbackSuggestion.action
        );
      }
    });
  });
});