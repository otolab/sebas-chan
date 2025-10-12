/**
 * A-1: PROCESS_USER_REQUEST プロンプトテスト
 *
 * ユーザーリクエスト処理プロンプトの品質を検証
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { compile } from '@moduler-prompt/core';
import { z } from 'zod';
import { processUserRequestPromptModule } from './prompts.js';
import { setupAIServiceForTest } from '../test-ai-helper.js';
import { createMockIssue, createMockKnowledge, createMockPondEntry } from '../test-utils.js';
import { REQUEST_TYPE, ACTION_TYPE } from '../shared/constants.js';
import type { MaterialElement } from '../shared/material-utils.js';
import type { AIService } from '@moduler-prompt/driver';

/**
 * 出力スキーマのZodバリデータ
 */
const outputSchemaValidator = z.object({
  interpretation: z.string(),
  requestType: z.enum([
    REQUEST_TYPE.ISSUE,
    REQUEST_TYPE.QUESTION,
    REQUEST_TYPE.ACTION,
    REQUEST_TYPE.FEEDBACK,
    REQUEST_TYPE.SCHEDULE,
    REQUEST_TYPE.SEARCH,
    REQUEST_TYPE.OTHER,
  ]),
  events: z.array(
    z.object({
      type: z.string(),
      payload: z.object({}).passthrough(),
    })
  ),
  actions: z.array(
    z.object({
      type: z.enum([
        ACTION_TYPE.SEARCH,
        ACTION_TYPE.CREATE,
        ACTION_TYPE.UPDATE,
        ACTION_TYPE.ANALYZE,
      ]),
      target: z.string(),
      details: z.object({}).passthrough().optional(),
    })
  ),
  response: z.string(),
  reasoning: z.string(),
  updatedState: z.string().optional(),
});

describe('ProcessUserRequest Prompts', () => {
  describe('ユニットテスト（コンテキスト反映）', () => {
    it('ユーザーリクエストがプロンプトに正しく反映される', () => {
      const context = {
        content: 'データベースのバックアップを実行してください',
        relatedIssues: [],
        relatedKnowledge: [],
        relatedPondEntries: [],
        currentState: '待機中',
      };

      const compiled = compile(processUserRequestPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // リクエスト内容が含まれていることを確認
      expect(compiledString).toContain('データベースのバックアップを実行してください');
    });

    it('関連Issueがmaterialsセクションに展開される', () => {
      const issue = createMockIssue({
        id: 'issue-001',
        title: '既存タスク',
        status: 'open',
        priority: 80,
        labels: ['urgent'],
      });

      const context = {
        content: 'タスクの状況を教えて',
        relatedIssues: [issue],
        relatedKnowledge: [],
        relatedPondEntries: [],
        currentState: '処理中',
      };

      const compiled = compile(processUserRequestPromptModule, context);
      const materials = compiled.data.filter(
        (item) => item.type === 'material'
      ) as MaterialElement[];

      // Issue情報がマテリアルとして展開されることを確認
      const issueMaterial = materials.find((m) => m.id === 'issue-issue-001');
      expect(issueMaterial).toBeDefined();
      expect(issueMaterial?.title).toContain('既存タスク');
      expect(issueMaterial?.content).toContain('ステータス: open');
      expect(issueMaterial?.content).toContain('優先度: 80');
    });

    it('関連Knowledgeがmaterialsセクションに展開される', () => {
      const knowledge = createMockKnowledge({
        id: 'know-001',
        type: 'process_manual',
        content: 'バックアップ手順書',
      });

      const context = {
        content: 'バックアップの手順は？',
        relatedIssues: [],
        relatedKnowledge: [knowledge],
        relatedPondEntries: [],
        currentState: '初期状態',
      };

      const compiled = compile(processUserRequestPromptModule, context);
      const materials = compiled.data.filter(
        (item) => item.type === 'material'
      ) as MaterialElement[];

      // Knowledge情報がマテリアルとして展開されることを確認
      const knowledgeMaterial = materials.find((m) => m.id === 'knowledge-know-001');
      expect(knowledgeMaterial).toBeDefined();
      expect(knowledgeMaterial?.title).toContain('process_manual');
      expect(knowledgeMaterial?.content).toContain('バックアップ手順書');
    });

    it('関連PondEntryがmaterialsセクションに展開される', () => {
      const pondEntry = createMockPondEntry({
        id: 'pond-001',
        content: '前回の実行ログ',
        metadata: { source: 'system-log' },
      });

      const context = {
        content: '前回の結果を確認',
        relatedIssues: [],
        relatedKnowledge: [],
        relatedPondEntries: [pondEntry],
        currentState: '確認中',
      };

      const compiled = compile(processUserRequestPromptModule, context);
      const materials = compiled.data.filter(
        (item) => item.type === 'material'
      ) as MaterialElement[];

      // PondEntry情報がマテリアルとして展開されることを確認
      const pondMaterial = materials.find((m) => m.id === 'pond-pond-001');
      expect(pondMaterial).toBeDefined();
      expect(pondMaterial?.title).toContain('system-log');
      expect(pondMaterial?.content).toContain('前回の実行ログ');
    });

    it('イベントタイプとアクションタイプが固定マテリアルとして含まれる', () => {
      const context = {
        content: undefined,
        relatedIssues: [],
        relatedKnowledge: [],
        relatedPondEntries: [],
        currentState: '初期状態',
      };

      const compiled = compile(processUserRequestPromptModule, context);
      const materials = compiled.data.filter(
        (item) => item.type === 'material'
      ) as MaterialElement[];

      // 固定マテリアルが含まれることを確認
      const eventTypes = materials.find((m) => m.id === 'event-types');
      const actionTypes = materials.find((m) => m.id === 'action-types');

      expect(eventTypes).toBeDefined();
      expect(eventTypes?.content).toContain('DATA_ARRIVED');
      expect(eventTypes?.content).toContain('ISSUE_CREATED');

      expect(actionTypes).toBeDefined();
      expect(actionTypes?.content).toContain('create');
      expect(actionTypes?.content).toContain('update');
      expect(actionTypes?.content).toContain('search');
    });

    it('contentがundefinedの場合も適切に処理される', () => {
      const context = {
        content: undefined,
        relatedIssues: [],
        relatedKnowledge: [],
        relatedPondEntries: [],
        currentState: '待機中',
      };

      const compiled = compile(processUserRequestPromptModule, context);
      const compiledString = JSON.stringify(compiled);

      // "（内容なし）"として処理されることを確認
      expect(compiledString).toContain('（内容なし）');
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

    it('Issue作成リクエストを正しく分類する', async () => {
      if (!aiService) {
        throw new Error('AI Service is required for this test');
      }

      const context = {
        content: '新しいバグを見つけました。ログイン画面でエラーが発生します。',
        relatedIssues: [],
        relatedKnowledge: [],
        relatedPondEntries: [],
        currentState: '対応待機中',
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(processUserRequestPromptModule, context);
      const result = await driver!.query(compiled);

      // スキーマバリデーション
      const output = outputSchemaValidator.parse(result.structuredOutput);

      // Issueタイプとして分類されることを確認
      expect(output.requestType).toBe(REQUEST_TYPE.ISSUE);
      expect(output.events.some((e) => e.type === 'ISSUE_CREATED')).toBe(true);
      expect(output.actions.some((a) => a.type === ACTION_TYPE.CREATE)).toBe(true);
    });

    it('検索リクエストを正しく処理する', async () => {
      if (!aiService) {
        throw new Error('AI Service is required for this test');
      }

      const existingIssue = createMockIssue({
        id: 'issue-001',
        title: 'データベースパフォーマンス問題',
        description: 'クエリが遅い',
        status: 'open',
      });

      const context = {
        content: 'データベースに関する既存の問題を探してください',
        relatedIssues: [existingIssue],
        relatedKnowledge: [],
        relatedPondEntries: [],
        currentState: '検索中',
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(processUserRequestPromptModule, context);
      const result = await driver!.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 検索タイプとして分類されることを確認
      expect(output.requestType).toBe(REQUEST_TYPE.SEARCH);
      expect(output.actions.some((a) => a.type === ACTION_TYPE.SEARCH)).toBe(true);
      expect(output.response).toContain('データベース');
    });

    it('質問リクエストに適切に応答する', async () => {
      if (!aiService) {
        throw new Error('AI Service is required for this test');
      }

      const knowledge = createMockKnowledge({
        id: 'know-001',
        type: 'factoid',
        content: 'システムのメンテナンス時間は毎週日曜日の深夜2時から4時です',
      });

      const context = {
        content: 'システムのメンテナンス時間はいつですか？',
        relatedIssues: [],
        relatedKnowledge: [knowledge],
        relatedPondEntries: [],
        currentState: '質問対応中',
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(processUserRequestPromptModule, context);
      const result = await driver!.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // 質問タイプとして分類されることを確認
      expect(output.requestType).toBe(REQUEST_TYPE.QUESTION);
      expect(output.response).toContain('メンテナンス');
      expect(output.reasoning).toBeTruthy();
    });

    it('アクションリクエストで適切なイベントを発行する', async () => {
      if (!aiService) {
        throw new Error('AI Service is required for this test');
      }

      const context = {
        content: 'すべての高優先度タスクをレビューして、ステータスを更新してください',
        relatedIssues: [
          createMockIssue({
            id: 'issue-001',
            title: '緊急バグ修正',
            status: 'open',
            priority: 80,
          }),
          createMockIssue({
            id: 'issue-002',
            title: '重要な機能追加',
            status: 'open',
            priority: 80,
          }),
        ],
        relatedKnowledge: [],
        relatedPondEntries: [],
        currentState: 'レビュー中',
      };

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });
      const compiled = compile(processUserRequestPromptModule, context);
      const result = await driver!.query(compiled);

      const output = outputSchemaValidator.parse(result.structuredOutput);

      // アクションタイプとして分類されることを確認
      expect(output.requestType).toBe(REQUEST_TYPE.ACTION);
      // 更新アクションが含まれることを確認
      expect(output.actions.some((a) => a.type === ACTION_TYPE.UPDATE)).toBe(true);
      // 複数のイベントが発行される可能性を確認
      expect(output.events.length).toBeGreaterThan(0);
    });
  });
});
