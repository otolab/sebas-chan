/**
 * A-0: INGEST_INPUT プロンプトテスト
 *
 * 入力取り込みプロンプトの品質を検証
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { compile } from '@moduler-prompt/core';
import { z } from 'zod';
import type { Issue } from '@sebas-chan/shared-types';
import { ingestInputPromptModule } from './prompts.js';
import { setupAIServiceForTest } from '../test-ai-helper.js';
import { createMockIssue } from '../test-utils.js';
import type { MaterialElement } from '../shared/material-utils.js';

/**
 * 出力スキーマのZodバリデータ
 */
const outputSchemaValidator = z.object({
  relatedIssueIds: z.array(z.string()),
  needsNewIssue: z.boolean(),
  newIssueTitle: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  updateContent: z.string().optional(),
  labels: z.array(z.string()),
  updatedState: z.string().optional()
});

describe('IngestInput Prompts', () => {
  describe('ユニットテスト（コンテキスト反映）', () => {
    it('入力コンテキストがプロンプトに正しく反映される', () => {
      const context = {
        source: 'manual-input',
        format: 'text/plain',
        content: 'システムでエラーが発生しています',
        relatedIssues: [],
        currentState: '初期状態'
      };

      const compiled = compile(ingestInputPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // コンテキストの値が含まれていることを確認
      expect(compiledString).toContain('manual-input');
      expect(compiledString).toContain('text/plain');
      expect(compiledString).toContain('システムでエラーが発生しています');
    });

    it('関連Issueがmaterialsセクションに展開される', () => {
      const issue = createMockIssue({
        id: 'issue-001',
        title: '既存のバグ',
        description: 'テストバグの詳細',
        status: 'open',
        priority: 80,
        labels: ['bug', 'critical']
      });

      const context = {
        source: 'api',
        format: 'json',
        content: '{"error": "timeout"}',
        relatedIssues: [issue],
        currentState: '処理中'
      };

      const compiled = compile(ingestInputPromptModule, context);
      const materials = compiled.data.filter((item) => item.type === 'material') as MaterialElement[];

      // Issue情報がマテリアルとして展開されることを確認
      const issueMaterial = materials.find((m) => m.id === 'issue-issue-001');
      expect(issueMaterial).toBeDefined();
      expect(issueMaterial?.title).toContain('既存のバグ');
      expect(issueMaterial?.content).toContain('ステータス: open');
      expect(issueMaterial?.content).toContain('優先度: high');
      expect(issueMaterial?.content).toContain('ラベル: bug, critical');
    });

    it('複数の関連Issueが正しく処理される', () => {
      const issues = [
        createMockIssue({
          id: 'issue-001',
          title: 'Issue 1',
          status: 'open'
        }),
        createMockIssue({
          id: 'issue-002',
          title: 'Issue 2',
          status: 'closed'
        })
      ];

      const context = {
        source: 'webhook',
        format: undefined,
        content: 'テスト内容',
        relatedIssues: issues,
        currentState: '初期状態'
      };

      const compiled = compile(ingestInputPromptModule, context);
      const materials = compiled.data.filter((item) => item.type === 'material') as MaterialElement[];

      // 両方のIssueがマテリアルに含まれることを確認
      expect(materials.some((m) => m.id === 'issue-issue-001')).toBe(true);
      expect(materials.some((m) => m.id === 'issue-issue-002')).toBe(true);
    });

    it('formatがundefinedの場合も適切に処理される', () => {
      const context = {
        source: 'unknown',
        format: undefined,
        content: '不明な形式のデータ',
        relatedIssues: [],
        currentState: '初期状態'
      };

      const compiled = compile(ingestInputPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // "不明"として処理されることを確認
      expect(compiledString).toContain('データ形式: 不明');
    });

    it('深刻度判定の指示が含まれる', () => {
      const context = {
        source: 'test',
        format: 'text',
        content: 'test',
        relatedIssues: [],
        currentState: '初期状態'
      };

      const compiled = compile(ingestInputPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // 深刻度の定義が含まれることを確認
      expect(compiledString).toContain('critical');
      expect(compiledString).toContain('high');
      expect(compiledString).toContain('medium');
      expect(compiledString).toContain('low');
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

    it('エラーメッセージから高優先度Issueを判定する', async () => {
      const context = {
        source: 'error-monitor',
        format: 'text/plain',
        content: 'CRITICAL: Database connection failed. All services are down.',
        relatedIssues: [],
        currentState: '正常稼働中'
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], { lenient: true });
      const compiled = compile(ingestInputPromptModule, context);
      const result = await driver.query(compiled);

      // スキーマバリデーション
      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 高優先度として判定されることを確認
      expect(output.severity).toMatch(/critical|high/);
      expect(output.needsNewIssue).toBe(true);
      expect(output.labels).toContain('error');
    });

    it('既存Issueとの関連性を正しく判定する', async () => {
      const existingIssue = createMockIssue({
        id: 'issue-001',
        title: 'データベース接続エラー',
        description: 'DBへの接続がタイムアウトする問題',
        status: 'open',
        labels: ['database', 'bug']
      });

      const context = {
        source: 'monitoring',
        format: 'json',
        content: '{"error": "Database timeout occurred", "service": "api"}',
        relatedIssues: [existingIssue],
        currentState: '監視中'
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], { lenient: true });
      const compiled = compile(ingestInputPromptModule, context);
      const result = await driver.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 既存Issueとの関連性を認識することを確認
      expect(output.relatedIssueIds).toContain('issue-001');
      expect(output.needsNewIssue).toBe(false);
    });

    it('通常のメッセージを低優先度として分類する', async () => {
      const context = {
        source: 'user-input',
        format: 'text',
        content: '明日の会議の準備をお願いします',
        relatedIssues: [],
        currentState: '待機中'
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], { lenient: true });
      const compiled = compile(ingestInputPromptModule, context);
      const result = await driver.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 低優先度として判定されることを確認
      expect(output.severity).toMatch(/medium|low/);
      expect(output.needsNewIssue).toBe(true);
    });

    it('複数の関連Issueから最も適切なものを選択する', async () => {
      const issues = [
        createMockIssue({
          id: 'issue-001',
          title: 'ログイン問題',
          description: 'ユーザーがログインできない',
          status: 'open'
        }),
        createMockIssue({
          id: 'issue-002',
          title: 'パフォーマンス改善',
          description: 'システムの応答速度が遅い',
          status: 'open'
        }),
        createMockIssue({
          id: 'issue-003',
          title: '認証エラー',
          description: '認証トークンの有効期限切れ',
          status: 'closed'
        })
      ];

      const context = {
        source: 'support',
        format: 'text',
        content: 'ユーザーから「ログインしようとすると認証エラーが出る」という報告',
        relatedIssues: issues,
        currentState: '対応中'
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], { lenient: true });
      const compiled = compile(ingestInputPromptModule, context);
      const result = await driver.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 関連するIssueを選択することを確認
      expect(output.relatedIssueIds.length).toBeGreaterThan(0);
      // ログインまたは認証関連のIssueが選ばれることを期待
      const selectedIssues = output.relatedIssueIds;
      const relevantIssues = ['issue-001', 'issue-003'];
      expect(selectedIssues.some(id => relevantIssues.includes(id))).toBe(true);
    });
  });
});