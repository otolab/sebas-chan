import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { WorkflowLogger } from './logger.js';

describe('WorkflowLogger', () => {
  let logger: WorkflowLogger;
  const testLogDir = path.join(process.cwd(), 'test-logs');

  beforeEach(async () => {
    // テスト用ディレクトリを作成
    await fs.mkdir(testLogDir, { recursive: true });
    
    logger = new WorkflowLogger({
      logDir: testLogDir,
      consoleOutput: false,
      jsonFormat: true,
    });
  });

  afterEach(async () => {
    // クリーンアップ
    await logger.cleanup();
    
    // テストログディレクトリを削除
    try {
      const files = await fs.readdir(testLogDir);
      for (const file of files) {
        await fs.unlink(path.join(testLogDir, file));
      }
      await fs.rmdir(testLogDir);
    } catch {
      // エラーは無視
    }
  });

  describe('Basic Logging', () => {
    it('should log workflow start', async () => {
      const workflowName = 'TestWorkflow';
      const input = { test: 'data' };
      
      const logId = await logger.logStart(workflowName, input);
      
      expect(logId).toBeTruthy();
      expect(logId).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it('should log complete workflow execution', async () => {
      const workflowName = 'TestWorkflow';
      const input = { test: 'input' };
      const output = { result: 'success' };
      
      const logId = await logger.logStart(workflowName, input);
      await logger.logInput(logId, workflowName, input);
      await logger.logPrompt(logId, workflowName, 'Test prompt');
      await logger.logOutput(logId, workflowName, output);
      await logger.logComplete(logId, workflowName, output);
      
      // フラッシュして確実にファイルに書き込む
      await logger.flush();
      
      // ログを検索
      const logs = await logger.searchLogs({ id: logId });
      
      expect(logs).toHaveLength(5);
      expect(logs[0].phase).toBe('start');
      expect(logs[1].phase).toBe('input');
      expect(logs[2].phase).toBe('prompt');
      expect(logs[3].phase).toBe('output');
      expect(logs[4].phase).toBe('complete');
    });

    it('should log errors', async () => {
      const workflowName = 'TestWorkflow';
      const error = new Error('Test error');
      
      const logId = await logger.logStart(workflowName, {});
      await logger.logError(logId, workflowName, error);
      
      await logger.flush();
      
      const logs = await logger.searchLogs({ id: logId, phase: 'error' });
      
      expect(logs).toHaveLength(1);
      expect(logs[0].data.error?.message).toBe('Test error');
    });

    it('should log custom messages', async () => {
      const workflowName = 'TestWorkflow';
      const customMessage = 'Custom log message';
      const customData = { key: 'value' };
      
      const logId = await logger.logStart(workflowName, {});
      await logger.logCustom(logId, workflowName, customMessage, customData);
      
      await logger.flush();
      
      const logs = await logger.searchLogs({ id: logId, phase: 'custom' });
      
      expect(logs).toHaveLength(1);
      expect(logs[0].data.message).toBe(customMessage);
      expect(logs[0].data.metadata).toEqual(customData);
    });
  });

  describe('Log Search', () => {
    it('should search logs by workflow name', async () => {
      const workflow1 = 'Workflow1';
      const workflow2 = 'Workflow2';
      
      await logger.logStart(workflow1, {});
      await logger.logStart(workflow2, {});
      await logger.logStart(workflow1, {});
      
      await logger.flush();
      
      const logs1 = await logger.searchLogs({ workflowName: workflow1 });
      const logs2 = await logger.searchLogs({ workflowName: workflow2 });
      
      expect(logs1).toHaveLength(2);
      expect(logs2).toHaveLength(1);
    });

    it('should search logs by date range', async () => {
      const workflowName = 'TestWorkflow';
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      await logger.logStart(workflowName, {});
      await logger.flush();
      
      const logsInRange = await logger.searchLogs({
        startDate: yesterday,
        endDate: tomorrow,
      });
      
      const logsOutOfRange = await logger.searchLogs({
        startDate: tomorrow,
      });
      
      expect(logsInRange.length).toBeGreaterThan(0);
      expect(logsOutOfRange).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    it('should calculate workflow statistics', async () => {
      const workflowName = 'TestWorkflow';
      
      // 成功したワークフロー
      const id1 = await logger.logStart(workflowName, {});
      await logger.logComplete(id1, workflowName);
      
      // エラーのあるワークフロー
      const id2 = await logger.logStart(workflowName, {});
      await logger.logError(id2, workflowName, new Error('Test'));
      
      // 別のワークフロー
      const id3 = await logger.logStart('OtherWorkflow', {});
      await logger.logComplete(id3, 'OtherWorkflow');
      
      await logger.flush();
      
      const stats = await logger.getStatistics();
      
      expect(stats.totalExecutions).toBe(3);
      expect(stats.successfulExecutions).toBe(2);
      expect(stats.failedExecutions).toBe(1);
      expect(stats.executionsByWorkflow[workflowName]).toBe(2);
      expect(stats.executionsByWorkflow['OtherWorkflow']).toBe(1);
    });

    it('should track workflow duration', async () => {
      const workflowName = 'TestWorkflow';
      
      const id = await logger.logStart(workflowName, {});
      
      // 少し待機
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await logger.logComplete(id, workflowName);
      await logger.flush();
      
      const stats = await logger.getStatistics(workflowName);
      
      expect(stats.averageDuration).toBeGreaterThan(90);
      expect(stats.averageDuration).toBeLessThan(200);
    });
  });

  describe('Prompt Logging', () => {
    it('should log prompt with metadata', async () => {
      const workflowName = 'TestWorkflow';
      const prompt = 'This is a test prompt with some content';
      const metadata = { model: 'gpt-4', temperature: 0.7 };
      
      const logId = await logger.logStart(workflowName, {});
      await logger.logPrompt(logId, workflowName, prompt, metadata);
      
      await logger.flush();
      
      const logs = await logger.searchLogs({ id: logId, phase: 'prompt' });
      
      expect(logs).toHaveLength(1);
      expect(logs[0].data.prompt).toBe(prompt);
      expect(logs[0].data.metadata?.model).toBe('gpt-4');
      expect(logs[0].data.metadata?.temperature).toBe(0.7);
      expect(logs[0].data.metadata?.promptLength).toBe(prompt.length);
      expect(logs[0].data.metadata?.estimatedTokens).toBeGreaterThan(0);
    });
  });

  describe('Parent-Child Relationships', () => {
    it('should track parent-child workflow relationships', async () => {
      const parentWorkflow = 'ParentWorkflow';
      const childWorkflow = 'ChildWorkflow';
      
      const parentId = await logger.logStart(parentWorkflow, {});
      const childId = await logger.logStart(childWorkflow, {}, parentId);
      
      await logger.flush();
      
      const childLogs = await logger.searchLogs({ id: childId });
      
      expect(childLogs).toHaveLength(1);
      expect(childLogs[0].parentId).toBe(parentId);
    });
  });
});