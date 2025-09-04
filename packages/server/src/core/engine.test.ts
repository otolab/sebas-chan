import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreEngine } from './engine';
import { Event } from '@sebas-chan/shared-types';

describe('CoreEngine', () => {
  let engine: CoreEngine;
  
  beforeEach(async () => {
    engine = new CoreEngine();
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
  });
  
  describe('initialize', () => {
    it('should initialize and start the engine', async () => {
      await engine.initialize();
      
      const state = engine.getState();
      expect(state).toContain('sebas-chan State Document');
    });
  });
  
  describe('event processing', () => {
    it('should process events from queue', async () => {
      await engine.initialize();
      
      const listener = vi.fn();
      engine.on('event:processing', listener);
      
      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { test: true }
      });
      
      // processInterval は 1000ms ごとに実行
      vi.advanceTimersByTime(1000);
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PROCESS_USER_REQUEST',
          priority: 'high',
          payload: { test: true }
        })
      );
    });
    
    it('should emit event:processed after processing', async () => {
      await engine.initialize();
      
      const processingListener = vi.fn();
      const processedListener = vi.fn();
      
      engine.on('event:processing', processingListener);
      engine.on('event:processed', processedListener);
      
      engine.enqueueEvent({
        type: 'INGEST_INPUT',
        priority: 'normal',
        payload: { inputId: 'test-input' }
      });
      
      vi.advanceTimersByTime(1000);
      
      expect(processingListener).toHaveBeenCalled();
      expect(processedListener).toHaveBeenCalled();
      
      const processedEvent = processedListener.mock.calls[0][0];
      expect(processedEvent.type).toBe('INGEST_INPUT');
    });
    
    it('should retry failed events with retry configuration', async () => {
      await engine.initialize();
      
      // handleEventをモックして常にエラーを投げる
      const originalHandleEvent = engine['handleEvent'];
      let callCount = 0;
      engine['handleEvent'] = vi.fn().mockImplementation(async () => {
        callCount++;
        throw new Error('Test error');
      });
      
      const event: Omit<Event, 'id' | 'timestamp'> = {
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: {},
        retryCount: 0,
        maxRetries: 2
      };
      
      engine.enqueueEvent(event);
      
      // 初回処理
      await vi.advanceTimersByTimeAsync(1000);
      expect(callCount).toBe(1);
      
      // リトライ1回目
      await vi.advanceTimersByTimeAsync(1000);
      expect(callCount).toBe(2);
      
      // リトライ2回目
      await vi.advanceTimersByTimeAsync(1000);
      expect(callCount).toBe(3);
      
      // 最大リトライ回数に達したので、これ以上処理されない
      await vi.advanceTimersByTimeAsync(1000);
      expect(callCount).toBe(3);
      
      engine['handleEvent'] = originalHandleEvent;
    });
  });
  
  describe('Issue operations', () => {
    it('should create issue with generated id', async () => {
      const issue = await engine.createIssue({
        title: 'Test Issue',
        description: 'Test description',
        status: 'open',
        labels: ['bug'],
        updates: [],
        relations: [],
        sourceInputIds: []
      });
      
      expect(issue.id).toMatch(/^issue-\d+$/);
      expect(issue.title).toBe('Test Issue');
      expect(issue.status).toBe('open');
      expect(issue.labels).toEqual(['bug']);
    });
    
    it('should search issues', async () => {
      const results = await engine.searchIssues('test query');
      expect(results).toEqual([]);
    });
    
    it('should throw error for unimplemented methods', async () => {
      await expect(engine.getIssue('test-id')).rejects.toThrow('Not implemented');
      await expect(engine.updateIssue('test-id', {})).rejects.toThrow('Not implemented');
    });
  });
  
  describe('Flow operations', () => {
    it('should create flow with generated id', async () => {
      const flow = await engine.createFlow({
        title: 'Test Flow',
        description: 'Test description',
        status: 'backlog',
        priorityScore: 0.7,
        issueIds: ['issue-1', 'issue-2']
      });
      
      expect(flow.id).toMatch(/^flow-\d+$/);
      expect(flow.title).toBe('Test Flow');
      expect(flow.status).toBe('backlog');
      expect(flow.priorityScore).toBe(0.7);
      expect(flow.issueIds).toEqual(['issue-1', 'issue-2']);
    });
    
    it('should search flows', async () => {
      const results = await engine.searchFlows('test query');
      expect(results).toEqual([]);
    });
  });
  
  describe('Knowledge operations', () => {
    it('should create knowledge with generated id', async () => {
      const knowledge = await engine.createKnowledge({
        type: 'factoid',
        content: 'Test knowledge',
        reputation: { upvotes: 0, downvotes: 0 },
        sources: []
      });
      
      expect(knowledge.id).toMatch(/^knowledge-\d+$/);
      expect(knowledge.type).toBe('factoid');
      expect(knowledge.content).toBe('Test knowledge');
      expect(knowledge.reputation).toEqual({ upvotes: 0, downvotes: 0 });
    });
  });
  
  describe('Input operations', () => {
    it('should create input and enqueue INGEST_INPUT event', async () => {
      await engine.initialize();
      
      const input = await engine.createInput({
        source: 'test',
        content: 'Test input',
        timestamp: new Date()
      });
      
      expect(input.id).toMatch(/^input-\d+$/);
      expect(input.source).toBe('test');
      expect(input.content).toBe('Test input');
      
      // イベントがキューに追加されたか確認
      const event = engine.dequeueEvent();
      expect(event).not.toBeNull();
      expect(event?.type).toBe('INGEST_INPUT');
      expect(event?.payload.inputId).toBe(input.id);
    });
    
    it('should list pending inputs', async () => {
      const inputs = await engine.listPendingInputs();
      expect(inputs).toEqual([]);
    });
  });
  
  describe('Pond operations', () => {
    it('should add entry to pond', async () => {
      const entry = await engine.addToPond({
        content: 'Test content',
        timestamp: new Date(),
        source: 'test'
      });
      
      expect(entry.id).toMatch(/^pond-\d+$/);
      expect(entry.content).toBe('Test content');
      expect(entry.source).toBe('test');
    });
    
    it('should search pond', async () => {
      const results = await engine.searchPond('test query');
      expect(results).toEqual([]);
    });
  });
  
  describe('State management', () => {
    it('should get and update state', async () => {
      await engine.initialize();
      
      const initialState = engine.getState();
      expect(initialState).toContain('sebas-chan State Document');
      
      const newState = '# Updated State\nNew content';
      engine.updateState(newState);
      
      expect(engine.getState()).toBe(newState);
    });
  });
  
  describe('Event queue management', () => {
    it('should enqueue and dequeue events', () => {
      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { test: true }
      });
      
      const event = engine.dequeueEvent();
      expect(event).not.toBeNull();
      expect(event?.type).toBe('PROCESS_USER_REQUEST');
      expect(event?.priority).toBe('high');
      expect(event?.payload).toEqual({ test: true });
      
      expect(engine.dequeueEvent()).toBeNull();
    });
  });
  
  describe('start/stop', () => {
    it('should not start if already running', async () => {
      await engine.initialize();
      const startSpy = vi.spyOn(engine as any, 'start');
      
      await engine.initialize();
      
      expect(startSpy).toHaveBeenCalledTimes(1);
    });
    
    it('should stop processing when stopped', async () => {
      await engine.initialize();
      
      engine.stop();
      
      const listener = vi.fn();
      engine.on('event:processing', listener);
      
      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: {}
      });
      
      vi.advanceTimersByTime(2000);
      
      expect(listener).not.toHaveBeenCalled();
    });
  });
  
  describe('event priority handling', () => {
    it('should process high priority events first', async () => {
      await engine.initialize();
      
      const processedPayloads: any[] = [];
      engine.on('event:processing', (event) => {
        processedPayloads.push(event.payload);
      });
      
      // 異なる優先度のイベントを追加
      engine.enqueueEvent({
        type: 'SALVAGE_FROM_POND',
        priority: 'low',
        payload: { id: 'low1' }
      });
      
      engine.enqueueEvent({
        type: 'INGEST_INPUT',
        priority: 'normal',
        payload: { id: 'normal1' }
      });
      
      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { id: 'high1' }
      });
      
      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { id: 'high2' }
      });
      
      // 4回処理を実行
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(1000);
      }
      
      expect(processedPayloads.length).toBe(4);
      
      // high優先度が最初の2つに含まれる
      const firstTwoIds = processedPayloads.slice(0, 2).map(p => p.id);
      expect(firstTwoIds).toContain('high1');
      expect(firstTwoIds).toContain('high2');
      
      // low優先度が最後
      expect(processedPayloads[3].id).toBe('low1');
    });
    
    it('should handle mixed priority events with timestamps', async () => {
      await engine.initialize();
      
      const processedTypes: string[] = [];
      engine.on('event:processing', (event) => {
        processedTypes.push(event.type);
      });
      
      // 異なる優先度と異なるタイプのイベント
      const events = [
        { type: 'COLLECT_SYSTEM_STATS' as const, priority: 'low' as const },
        { type: 'UPDATE_FLOW_PRIORITIES' as const, priority: 'normal' as const },
        { type: 'ANALYZE_ISSUE_IMPACT' as const, priority: 'high' as const },
        { type: 'EXTRACT_KNOWLEDGE' as const, priority: 'normal' as const },
        { type: 'PROCESS_USER_REQUEST' as const, priority: 'high' as const },
      ];
      
      events.forEach(e => {
        engine.enqueueEvent({
          type: e.type,
          priority: e.priority,
          payload: {}
        });
      });
      
      // すべてのイベントを処理
      for (let i = 0; i < events.length; i++) {
        vi.advanceTimersByTime(1000);
      }
      
      // high優先度のイベントが最初に処理される
      expect(processedTypes.slice(0, 2)).toContain('ANALYZE_ISSUE_IMPACT');
      expect(processedTypes.slice(0, 2)).toContain('PROCESS_USER_REQUEST');
      
      // low優先度のイベントが最後に処理される
      expect(processedTypes[processedTypes.length - 1]).toBe('COLLECT_SYSTEM_STATS');
    });
  });
  
  describe('error handling and recovery', () => {
    it('should continue processing after event handler error', async () => {
      await engine.initialize();
      
      let errorCount = 0;
      const processedEvents: string[] = [];
      
      // エラーを発生させるイベントハンドラーを設定
      const originalHandleEvent = engine['handleEvent'];
      engine['handleEvent'] = vi.fn().mockImplementation(async (event) => {
        processedEvents.push(event.id);
        if (event.payload?.shouldFail) {
          errorCount++;
          throw new Error('Intentional failure');
        }
        return originalHandleEvent.call(engine, event);
      });
      
      // 失敗するイベントと成功するイベントを混在
      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { shouldFail: true }
      });
      
      engine.enqueueEvent({
        type: 'INGEST_INPUT',
        priority: 'high',
        payload: { shouldFail: false }
      });
      
      engine.enqueueEvent({
        type: 'EXTRACT_KNOWLEDGE',
        priority: 'normal',
        payload: { shouldFail: true }
      });
      
      engine.enqueueEvent({
        type: 'UPDATE_FLOW_RELATIONS',
        priority: 'normal',
        payload: { shouldFail: false }
      });
      
      // 4回処理を実行
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(1000);
      }
      
      // エラーが発生してもすべてのイベントが処理される
      expect(processedEvents.length).toBe(4);
      expect(errorCount).toBe(2);
      
      engine['handleEvent'] = originalHandleEvent;
    });
    
    it('should respect retry limits', async () => {
      await engine.initialize();
      
      let attemptCount = 0;
      
      // 常にエラーを投げるハンドラー
      const originalHandleEvent = engine['handleEvent'];
      engine['handleEvent'] = vi.fn().mockImplementation(async (event) => {
        attemptCount++;
        throw new Error('Always fails');
      });
      
      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { id: 'test-retry' },
        retryCount: 0,
        maxRetries: 2
      });
      
      // 初回試行 + 2回のリトライ = 合計3回
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }
      
      // 正確に3回試行される（初回 + 2リトライ）
      expect(attemptCount).toBe(3);
      
      engine['handleEvent'] = originalHandleEvent;
    });
  });
  
  describe('complex workflow scenarios', () => {
    it('should handle cascade of events', async () => {
      await engine.initialize();
      
      const eventChain: string[] = [];
      
      // イベントチェーンを記録するハンドラー
      const originalHandleEvent = engine['handleEvent'];
      engine['handleEvent'] = vi.fn().mockImplementation(async (event) => {
        eventChain.push(event.type);
        
        // INGEST_INPUTの後にANALYZE_ISSUE_IMPACTを生成
        if (event.type === 'INGEST_INPUT') {
          engine.enqueueEvent({
            type: 'ANALYZE_ISSUE_IMPACT',
            priority: 'normal',
            payload: { triggeredBy: event.id }
          });
        }
        
        // ANALYZE_ISSUE_IMPACTの後にEXTRACT_KNOWLEDGEを生成
        if (event.type === 'ANALYZE_ISSUE_IMPACT') {
          engine.enqueueEvent({
            type: 'EXTRACT_KNOWLEDGE',
            priority: 'low',
            payload: { triggeredBy: event.id }
          });
        }
        
        return originalHandleEvent.call(engine, event);
      });
      
      // 最初のイベントを投入
      await engine.createInput({
        source: 'test',
        content: 'Test cascade',
        timestamp: new Date()
      });
      
      // カスケードが完了するまで処理
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(1000);
      }
      
      // 期待されるイベントチェーン
      expect(eventChain).toContain('INGEST_INPUT');
      expect(eventChain).toContain('ANALYZE_ISSUE_IMPACT');
      expect(eventChain).toContain('EXTRACT_KNOWLEDGE');
      
      // 順序を確認
      const ingestIndex = eventChain.indexOf('INGEST_INPUT');
      const analyzeIndex = eventChain.indexOf('ANALYZE_ISSUE_IMPACT');
      const extractIndex = eventChain.indexOf('EXTRACT_KNOWLEDGE');
      
      expect(ingestIndex).toBeLessThan(analyzeIndex);
      expect(analyzeIndex).toBeLessThan(extractIndex);
      
      engine['handleEvent'] = originalHandleEvent;
    });
    
    it('should handle concurrent event processing correctly', async () => {
      await engine.initialize();
      
      const processedEvents: string[] = [];
      
      // 処理を記録するハンドラー
      const originalHandleEvent = engine['handleEvent'];
      engine['handleEvent'] = vi.fn().mockImplementation(async (event) => {
        processedEvents.push(event.id);
        await originalHandleEvent.call(engine, event);
      });
      
      // 複数のイベントを一度に追加
      for (let i = 0; i < 10; i++) {
        engine.enqueueEvent({
          type: i % 2 === 0 ? 'PROCESS_USER_REQUEST' : 'INGEST_INPUT',
          priority: i < 3 ? 'high' : i < 7 ? 'normal' : 'low',
          payload: { index: i }
        });
      }
      
      // すべて処理
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(1000);
      }
      
      // 10個すべて処理される
      expect(processedEvents.length).toBe(10);
      
      // 重複がないことを確認
      const uniqueEvents = new Set(processedEvents);
      expect(uniqueEvents.size).toBe(10);
      
      engine['handleEvent'] = originalHandleEvent;
    });
  });
  
  describe('state synchronization', () => {
    it('should maintain state consistency during event processing', async () => {
      await engine.initialize();
      
      let stateUpdated = false;
      const originalState = engine.getState();
      
      // State更新を監視
      const originalHandleEvent = engine['handleEvent'];
      engine['handleEvent'] = vi.fn().mockImplementation(async (event) => {
        if (event.type === 'REFLECT_AND_ORGANIZE_STATE') {
          engine.updateState(`# Updated at ${new Date().toISOString()}\n${event.payload?.content || ''}`);
          stateUpdated = true;
        }
        
        await originalHandleEvent.call(engine, event);
      });
      
      // State更新イベントを投入
      engine.enqueueEvent({
        type: 'REFLECT_AND_ORGANIZE_STATE',
        priority: 'low',
        payload: { content: 'State update 1' }
      });
      
      // 処理実行
      vi.advanceTimersByTime(1000);
      
      // State更新が実行される
      expect(stateUpdated).toBe(true);
      const newState = engine.getState();
      expect(newState).not.toBe(originalState);
      expect(newState).toContain('State update 1');
      
      engine['handleEvent'] = originalHandleEvent;
    });
  });
  
  describe('performance and limits', () => {
    it('should handle queue overflow gracefully', async () => {
      await engine.initialize();
      
      // 大量のイベントを追加
      const eventCount = 10000;
      for (let i = 0; i < eventCount; i++) {
        engine.enqueueEvent({
          type: 'COLLECT_SYSTEM_STATS',
          priority: 'low',
          payload: { index: i }
        });
      }
      
      // キューサイズを確認
      let remainingEvents = eventCount;
      
      // 一部を処理
      for (let i = 0; i < 100; i++) {
        vi.advanceTimersByTime(1000);
        remainingEvents--;
      }
      
      // まだイベントが残っている
      const nextEvent = engine.dequeueEvent();
      expect(nextEvent).not.toBeNull();
      
      // キューに戻す
      if (nextEvent) {
        engine.enqueueEvent(nextEvent);
      }
    });
    
    it('should process events in reasonable time', async () => {
      await engine.initialize();
      
      const startTime = Date.now();
      let processedCount = 0;
      
      engine.on('event:processed', () => {
        processedCount++;
      });
      
      // 100個のイベントを追加
      for (let i = 0; i < 100; i++) {
        engine.enqueueEvent({
          type: 'PROCESS_USER_REQUEST',
          priority: 'normal',
          payload: { index: i }
        });
      }
      
      // 100秒で100個処理（1秒に1個）
      for (let i = 0; i < 100; i++) {
        vi.advanceTimersByTime(1000);
      }
      
      expect(processedCount).toBe(100);
    });
  });
});