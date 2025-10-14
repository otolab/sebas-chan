/**
 * B-3: UPDATE_FLOW_PRIORITIES プロンプトテスト
 *
 * Flow優先度動的調整プロンプトの品質を検証
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { compile } from '@moduler-prompt/core';
import { z } from 'zod';
import { flowPriorityPromptModule, type PriorityContext } from './prompts.js';
import { setupAIServiceForTest, shouldSkipAITests } from '../test-ai-helper.js';
import { createMockFlow, createMockIssue } from '../test-utils.js';
import type { MaterialElement } from '../shared/material-utils.js';
import type { AIService } from '@moduler-prompt/driver';

/**
 * 出力スキーマのZodバリデータ
 */
const outputSchemaValidator = z.object({
  updates: z.array(
    z.object({
      flowId: z.string(),
      newPriority: z.number(),
      mainFactor: z.string(),
      reasoning: z.string(),
      contextNotes: z.string().optional(),
      userQuery: z
        .object({
          type: z.string(),
          message: z.string(),
          options: z.array(z.string()).optional(),
        })
        .optional(),
    })
  ),
  overallAssessment: z.object({
    confidence: z.number(),
    contextQuality: z.enum(['good', 'partial', 'poor']),
    suggestedFocus: z.string().optional(),
    stateUpdate: z.string().optional(),
  }),
});

describe('UpdateFlowPriorities Prompts', () => {
  describe('ユニットテスト（コンテキスト反映）', () => {
    it('Flow情報がプロンプトに正しく反映される', () => {
      const flow1 = createMockFlow({
        id: 'flow-001',
        title: '緊急バグ修正',
        description: 'システムクリティカルなバグ',
        priorityScore: 0.5,
        updatedAt: new Date(),
      });

      const flow2 = createMockFlow({
        id: 'flow-002',
        title: '機能改善',
        description: 'UX改善タスク',
        priorityScore: 0.3,
        updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10日前
      });

      const issues1 = [
        createMockIssue({
          id: 'issue-001',
          title: 'ログイン不可',
          priority: 90,
          status: 'open',
        }),
      ];

      const issues2 = [
        createMockIssue({
          id: 'issue-002',
          title: 'ボタンの配置改善',
          priority: 30,
          status: 'open',
        }),
      ];

      const context: PriorityContext = {
        flowAnalysis: [
          {
            flow: flow1,
            issues: issues1,
            staleness: {
              daysSinceUpdate: 0,
              status: 'active',
            },
            currentPriority: flow1.priorityScore,
          },
          {
            flow: flow2,
            issues: issues2,
            staleness: {
              daysSinceUpdate: 10,
              status: 'stale',
            },
            currentPriority: flow2.priorityScore,
          },
        ],
        stateDocument: '# 現在の状況\n\n今週はバグ修正を優先する',
        currentDateTime: new Date(),
      };

      const compiled = compile(flowPriorityPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // Flow情報が含まれていることを確認
      expect(compiledString).toContain('flow-001');
      expect(compiledString).toContain('緊急バグ修正');
      expect(compiledString).toContain('flow-002');
      expect(compiledString).toContain('機能改善');

      // Issue優先度が含まれていることを確認
      expect(compiledString).toContain('90');
      expect(compiledString).toContain('30');
    });

    it('state文書が正しく反映される', () => {
      const flow = createMockFlow({
        id: 'flow-001',
        title: 'テストFlow',
        priorityScore: 0.5,
      });

      const stateDocument = `# 今週の重点事項
- セキュリティ対策を最優先
- パフォーマンス改善は来週以降
- ユーザーフィードバックを重視`;

      const context: PriorityContext = {
        flowAnalysis: [
          {
            flow,
            issues: [],
            staleness: {
              daysSinceUpdate: 0,
              status: 'active',
            },
            currentPriority: flow.priorityScore,
          },
        ],
        stateDocument,
        currentDateTime: new Date(),
      };

      const compiled = compile(flowPriorityPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      expect(compiledString).toContain('セキュリティ対策を最優先');
      expect(compiledString).toContain('パフォーマンス改善は来週以降');
      expect(compiledString).toContain('ユーザーフィードバックを重視');
    });

    it('停滞期間の計算が正しく反映される', () => {
      const now = new Date();
      const flow1 = createMockFlow({
        id: 'flow-001',
        title: '新しいFlow',
        updatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1日前
      });

      const flow2 = createMockFlow({
        id: 'flow-002',
        title: '停滞しているFlow',
        updatedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), // 14日前
      });

      const context: PriorityContext = {
        flowAnalysis: [
          {
            flow: flow1,
            issues: [],
            staleness: {
              daysSinceUpdate: 1,
              status: 'active',
            },
            currentPriority: flow1.priorityScore,
          },
          {
            flow: flow2,
            issues: [],
            staleness: {
              daysSinceUpdate: 14,
              status: 'abandoned',
            },
            currentPriority: flow2.priorityScore,
          },
        ],
        stateDocument: '',
        currentDateTime: new Date(),
      };

      const compiled = compile(flowPriorityPromptModule, context);
      const materials = compiled.data.filter(
        (item) => item.type === 'material'
      ) as MaterialElement[];

      // 停滞期間がマテリアルに含まれることを確認
      const flow2Material = materials.find((m) => m.id === 'flow-flow-002');
      expect(flow2Material).toBeDefined();
      expect(flow2Material?.content).toContain('"daysSinceUpdate": 14');
    });

    it('判断の原則が含まれる', () => {
      const context: PriorityContext = {
        flowAnalysis: [],
        stateDocument: '',
        currentDateTime: new Date(),
      };

      const compiled = compile(flowPriorityPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // 判断の原則が含まれることを確認
      expect(compiledString).toContain('忘れない');
      expect(compiledString).toContain('勝手に完了しない');
      expect(compiledString).toContain('嘘をつかない');
      expect(compiledString).toContain('判断の根拠を示す');
    });

    it('優先度判定要因の指示が含まれる', () => {
      const context: PriorityContext = {
        flowAnalysis: [],
        stateDocument: '',
        currentDateTime: new Date(),
      };

      const compiled = compile(flowPriorityPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // 判定要因が含まれることを確認
      expect(compiledString).toContain('緊急性');
      expect(compiledString).toContain('重要性');
      expect(compiledString).toContain('停滞度');
      expect(compiledString).toContain('現在のコンテキスト');
    });

    it('空のコンテキストが適切に処理される', () => {
      const context: PriorityContext = {
        flowAnalysis: [],
        stateDocument: '',
        currentDateTime: new Date(),
      };

      const compiled = compile(flowPriorityPromptModule, context);

      expect(compiled).toBeDefined();
      expect(compiled.data).toBeDefined();
      expect(() => JSON.stringify(compiled)).not.toThrow();
    });
  });

  describe.skipIf(shouldSkipAITests)('AI実行テスト', () => {
    let aiService: AIService | null;

    beforeAll(async () => {
      aiService = await setupAIServiceForTest();
      if (!aiService) {
        throw new Error('AI Service is required for these tests');
      }
    });

    it('重要なFlowを高優先度に設定する', async () => {
      if (!aiService) {
        throw new Error('AI Service is required for this test');
      }

      const urgentFlow = createMockFlow({
        id: 'flow-001',
        title: 'システム障害対応',
        description: 'ユーザーがログインできない重大な問題',
        priorityScore: 0.5,
        updatedAt: new Date(),
      });

      const normalFlow = createMockFlow({
        id: 'flow-002',
        title: 'UIの微調整',
        description: 'ボタンの色を変更',
        priorityScore: 0.5,
        updatedAt: new Date(),
      });

      const urgentIssues = [
        createMockIssue({
          id: 'issue-001',
          title: 'ログイン機能が完全に停止',
          priority: 100,
          status: 'open',
        }),
      ];

      const normalIssues = [
        createMockIssue({
          id: 'issue-002',
          title: 'ボタンの色が見にくい',
          priority: 20,
          status: 'open',
        }),
      ];

      const context: PriorityContext = {
        flowAnalysis: [
          {
            flow: urgentFlow,
            issues: urgentIssues,
            staleness: {
              daysSinceUpdate: 0,
              status: 'active',
            },
            currentPriority: urgentFlow.priorityScore,
          },
          {
            flow: normalFlow,
            issues: normalIssues,
            staleness: {
              daysSinceUpdate: 0,
              status: 'active',
            },
            currentPriority: normalFlow.priorityScore,
          },
        ],
        stateDocument: '# 現在の状況\n\nシステムの安定性を最優先に対応する',
        currentDateTime: new Date(),
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });

      const compiled = compile(flowPriorityPromptModule, context);
      const result = await driver!.query(compiled);

      // スキーマバリデーション
      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 緊急Flowが高優先度になることを確認
      const urgentUpdate = output.updates.find((u) => u.flowId === 'flow-001');
      const normalUpdate = output.updates.find((u) => u.flowId === 'flow-002');

      expect(urgentUpdate).toBeDefined();
      expect(normalUpdate).toBeDefined();
      expect(urgentUpdate!.newPriority).toBeGreaterThan(normalUpdate!.newPriority);
      expect(urgentUpdate!.mainFactor).toMatch(/緊急|システム|障害|重大/);
    });

    it('停滞しているFlowを検出してユーザー確認を提案する', async () => {
      if (!aiService) {
        throw new Error('AI Service is required for this test');
      }

      const staleFlow = createMockFlow({
        id: 'flow-001',
        title: '長期放置タスク',
        description: '進展がないタスク',
        priorityScore: 0.5,
        updatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15日前
      });

      const issues = [
        createMockIssue({
          id: 'issue-001',
          title: '優先度不明のタスク',
          priority: 50,
          status: 'open',
        }),
      ];

      const context: PriorityContext = {
        flowAnalysis: [
          {
            flow: staleFlow,
            issues,
            staleness: {
              daysSinceUpdate: 15,
              status: 'abandoned',
            },
            currentPriority: staleFlow.priorityScore,
          },
        ],
        stateDocument: '',
        currentDateTime: new Date(),
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });

      const compiled = compile(flowPriorityPromptModule, context);
      const result = await driver!.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      const staleUpdate = output.updates.find((u) => u.flowId === 'flow-001');
      expect(staleUpdate).toBeDefined();

      // 停滞に関する言及があることを確認
      expect(staleUpdate!.reasoning).toMatch(/停滞|放置|更新されていない|長期/);

      // ユーザー確認の提案があることを確認（オプショナル）
      if (staleUpdate!.userQuery) {
        expect(staleUpdate!.userQuery.type).toMatch(/confirm_stale|confirm_priority/);
        expect(staleUpdate!.userQuery.message).toBeTruthy();
      }
    });

    it('コンテキスト（state文書）を考慮した優先度調整', async () => {
      if (!aiService) {
        throw new Error('AI Service is required for this test');
      }

      const securityFlow = createMockFlow({
        id: 'flow-001',
        title: 'セキュリティ対策',
        description: 'セキュリティホールの修正',
        priorityScore: 0.4,
      });

      const featureFlow = createMockFlow({
        id: 'flow-002',
        title: '新機能開発',
        description: '新しい機能の実装',
        priorityScore: 0.6,
      });

      const context: PriorityContext = {
        flowAnalysis: [
          {
            flow: securityFlow,
            issues: [],
            staleness: {
              daysSinceUpdate: 0,
              status: 'active',
            },
            currentPriority: securityFlow.priorityScore,
          },
          {
            flow: featureFlow,
            issues: [],
            staleness: {
              daysSinceUpdate: 0,
              status: 'active',
            },
            currentPriority: featureFlow.priorityScore,
          },
        ],
        stateDocument: `# 今月の方針
セキュリティ監査が来月に予定されているため、
セキュリティ関連の対応を最優先で行う。
新機能開発は一時的に優先度を下げる。`,
        currentDateTime: new Date(),
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });

      const compiled = compile(flowPriorityPromptModule, context);
      const result = await driver!.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      const securityUpdate = output.updates.find((u) => u.flowId === 'flow-001');
      const featureUpdate = output.updates.find((u) => u.flowId === 'flow-002');

      // state文書の内容を反映して優先度が調整されることを確認
      expect(securityUpdate!.newPriority).toBeGreaterThan(featureUpdate!.newPriority);
      expect(securityUpdate!.contextNotes).toMatch(/セキュリティ|監査/);

      // state文書が更新されることを確認
      expect(output.overallAssessment.stateUpdate).toBeTruthy();
      expect(output.overallAssessment.stateUpdate).toContain('セキュリティ');
    });
  });
});
