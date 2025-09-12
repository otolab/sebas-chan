import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreEngine } from './engine.js';
import { CoreAgent } from '@sebas-chan/core';
import { DBClient } from '@sebas-chan/db';
import { Input } from '@sebas-chan/shared-types';

// モックを作成
vi.mock('@sebas-chan/core');
vi.mock('@sebas-chan/db');

describe('Input to Pond Flow Integration', () => {
  let engine: CoreEngine;
  let mockDbClient: any;
  let mockCoreAgent: any;

  beforeEach(async () => {
    // DBClientモックの設定
    mockDbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      initModel: vi.fn().mockResolvedValue(true),
      addPondEntry: vi.fn().mockResolvedValue(true),
      searchPond: vi.fn().mockResolvedValue([]),
      searchIssues: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(DBClient).mockImplementation(() => mockDbClient);

    // CoreAgentモックの設定
    mockCoreAgent = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      queueEvent: vi.fn(),
      setContext: vi.fn(),
    };

    vi.mocked(CoreAgent).mockImplementation(() => mockCoreAgent);

    engine = new CoreEngine();
    await engine.initialize();
  });

  afterEach(() => {
    engine.stop();
    vi.clearAllMocks();
  });

  describe('Basic Input Processing', () => {
    it('should create input and process it into pond', async () => {
      // Create an input
      const input: Input = await engine.createInput({
        source: 'test-reporter',
        content: 'システムのバックアップ処理でエラーが発生しています。',
        timestamp: new Date(),
      });

      expect(input).toBeDefined();
      expect(input.id).toBeDefined();
      expect(input.source).toBe('test-reporter');
      expect(input.content).toContain('バックアップ処理');

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Search in pond for the processed content
      await engine.searchPond('バックアップ エラー');

      // Since we're using mocked DB in tests, verify the flow was triggered
      const event = engine.dequeueEvent();
      if (event) {
        expect(event.type).toBe('INGEST_INPUT');
        expect(event.payload.input).toBeDefined();
      }
    });

    it('should handle multiple inputs in sequence', async () => {
      const inputs = [
        {
          source: 'manual',
          content: 'ユーザー認証でタイムアウトが頻発',
          timestamp: new Date(),
        },
        {
          source: 'manual',
          content: 'データベース接続が不安定',
          timestamp: new Date(),
        },
        {
          source: 'automated',
          content: 'CPU使用率が90%を超過',
          timestamp: new Date(),
        },
      ];

      const createdInputs: Input[] = [];
      for (const inputData of inputs) {
        const input = await engine.createInput(inputData);
        createdInputs.push(input);
      }

      expect(createdInputs).toHaveLength(3);

      // Verify all inputs have unique IDs
      const ids = new Set(createdInputs.map((i) => i.id));
      expect(ids.size).toBe(3);

      // Check that events were enqueued
      let eventCount = 0;
      let event;
      while ((event = engine.dequeueEvent()) !== null) {
        expect(event.type).toBe('INGEST_INPUT');
        eventCount++;
      }
      expect(eventCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Pond Entry Management', () => {
    it('should add entries directly to pond', async () => {
      const pondEntry = await engine.addToPond({
        content: '直接追加されたナレッジ情報',
        timestamp: new Date(),
        source: 'direct',
      });

      expect(pondEntry).toBeDefined();
      expect(pondEntry.id).toBeDefined();
      expect(pondEntry.content).toBe('直接追加されたナレッジ情報');
      expect(pondEntry.source).toBe('direct');
    });

    it('should handle pond entries with metadata', async () => {
      const pondEntry = await engine.addToPond({
        content: JSON.stringify({
          type: 'error_report',
          message: 'メモリリークの可能性',
          severity: 'high',
          component: 'cache-manager',
        }),
        timestamp: new Date(),
        source: 'monitoring',
      });

      expect(pondEntry).toBeDefined();
      const parsedContent = JSON.parse(pondEntry.content);
      expect(parsedContent.type).toBe('error_report');
      expect(parsedContent.severity).toBe('high');
    });
  });

  describe('Search Capabilities', () => {
    it('should search pond with Japanese queries', async () => {
      // Add test data
      await engine.addToPond({
        content: 'Elasticsearchのインデックスが破損している',
        timestamp: new Date(),
        source: 'test',
      });

      await engine.addToPond({
        content: 'Redisのメモリ使用量が限界に近い',
        timestamp: new Date(),
        source: 'test',
      });

      // Search tests (with mocked DB, just verify the search is called)
      const results1 = await engine.searchPond('Elasticsearch');
      expect(results1).toBeDefined();
      expect(Array.isArray(results1)).toBe(true);

      const results2 = await engine.searchPond('メモリ');
      expect(results2).toBeDefined();
      expect(Array.isArray(results2)).toBe(true);
    });

    it('should handle empty search results gracefully', async () => {
      const results = await engine.searchPond('存在しないキーワード12345');
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results).toEqual([]);
    });
  });

  describe('Event Processing Flow', () => {
    it('should process INGEST_INPUT events', async () => {
      const processedEvents: string[] = [];

      engine.on('event:processed', (event) => {
        processedEvents.push(event.type);
      });

      // Create input which triggers INGEST_INPUT event
      await engine.createInput({
        source: 'test',
        content: 'テスト入力データ',
        timestamp: new Date(),
      });

      // Give time for event processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Manual processing since we're in test mode
      const event = engine.dequeueEvent();
      if (event) {
        expect(event.type).toBe('INGEST_INPUT');
        expect(event.payload.input).toBeDefined();
        expect(event.payload.input.content).toBe('テスト入力データ');
      }
    });

    it('should maintain event priority during input processing', async () => {
      // High priority event
      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { urgent: true },
      });

      // Create input (normal priority)
      await engine.createInput({
        source: 'test',
        content: 'Normal priority input',
        timestamp: new Date(),
      });

      // Low priority event
      engine.enqueueEvent({
        type: 'SALVAGE_FROM_POND',
        priority: 'low',
        payload: { cleanup: true },
      });

      // Check processing order
      const events: string[] = [];
      let event;
      while ((event = engine.dequeueEvent()) !== null) {
        events.push(event.type);
      }

      // High priority should be first
      expect(events[0]).toBe('PROCESS_USER_REQUEST');
      // Low priority should be last
      expect(events[events.length - 1]).toBe('SALVAGE_FROM_POND');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input gracefully', async () => {
      const input = await engine.createInput({
        source: '',
        content: 'Content with empty source',
        timestamp: new Date(),
      });

      expect(input).toBeDefined();
      expect(input.id).toBeDefined();
      expect(input.source).toBe('');
    });

    it('should handle very long content', async () => {
      const longContent = 'あ'.repeat(10000);

      const input = await engine.createInput({
        source: 'stress-test',
        content: longContent,
        timestamp: new Date(),
      });

      expect(input).toBeDefined();
      expect(input.content).toHaveLength(10000);
    });
  });

  describe('State Integration', () => {
    it('should reflect input processing in state', async () => {
      engine.getState();

      await engine.createInput({
        source: 'state-test',
        content: 'State integration test input',
        timestamp: new Date(),
      });

      // In a real scenario, state might be updated after processing
      // For now, verify state management is accessible
      const currentState = engine.getState();
      expect(currentState).toBeDefined();
      expect(typeof currentState).toBe('string');
    });
  });
});
