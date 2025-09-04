/**
 * E2E Test: 基本的なフローの検証
 * 
 * テスト目的: システム全体の経路が正常に動作することを確認
 * - Input → Issue → Flow → Knowledge の変換フロー
 * - API経由でのデータ投入と取得
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';

describe('E2E: Basic Flow', () => {
  let serverProcess: ChildProcess;
  const API_URL = 'http://localhost:3000';
  
  beforeAll(async () => {
    console.log('Starting server for E2E tests...');
    
    // サーバープロセスを起動
    serverProcess = spawn('npm', ['run', 'dev', '-w', '@sebas-chan/server'], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test', USE_TEST_WORKFLOW: 'true' }
    });
    
    // サーバーの起動を待つ
    await waitForServer(API_URL, 10000);
  }, 30000);
  
  afterAll(async () => {
    console.log('Stopping server...');
    if (serverProcess) {
      serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });
  
  it('should complete Input → Issue → Flow cycle', async () => {
    // Step 1: ヘルスチェック
    const healthResponse = await fetch(`${API_URL}/health`);
    expect(healthResponse.ok).toBe(true);
    const health = await healthResponse.json();
    expect(health.status).toBe('healthy');
    
    // Step 2: Inputを投入
    const inputData = {
      source: 'e2e-test',
      content: 'This is a bug report about urgent feature'
    };
    
    const inputResponse = await fetch(`${API_URL}/api/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputData)
    });
    
    expect(inputResponse.ok).toBe(true);
    const inputResult = await inputResponse.json();
    expect(inputResult.inputId).toBeDefined();
    
    // Step 3: 処理を待つ
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 4: State確認 - Issueが作成されているか
    const stateResponse = await fetch(`${API_URL}/api/state`);
    expect(stateResponse.ok).toBe(true);
    const state = await stateResponse.json();
    
    // Issueの確認
    expect(state.issues).toBeDefined();
    expect(Array.isArray(state.issues)).toBe(true);
    
    const createdIssue = state.issues.find((i: any) => 
      i.sourceInputIds?.includes(inputResult.inputId)
    );
    expect(createdIssue).toBeDefined();
    expect(createdIssue.labels).toContain('bug');
    expect(createdIssue.labels).toContain('feature');
    expect(createdIssue.labels).toContain('urgent');
    
    // Flowの確認
    expect(state.flows).toBeDefined();
    const relatedFlow = state.flows?.find((f: any) => 
      f.issueIds?.includes(createdIssue.id)
    );
    
    if (relatedFlow) {
      expect(relatedFlow.status).toBe('focused'); // urgentなので
      expect(relatedFlow.priorityScore).toBeGreaterThan(0.8);
    }
  });
  
  it('should handle request endpoint', async () => {
    // ユーザーリクエストのテスト
    const requestData = {
      request: 'test request for validation'
    };
    
    const response = await fetch(`${API_URL}/api/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
    
    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
    
    // State確認
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const stateResponse = await fetch(`${API_URL}/api/state`);
    const state = await stateResponse.json();
    
    // テストIssueが作成されているか確認
    const testIssue = state.issues?.find((i: any) => 
      i.title === 'Test Issue' && i.labels.includes('test')
    );
    expect(testIssue).toBeDefined();
  });
  
  it('should maintain data integrity across operations', async () => {
    // 複数の操作を連続実行
    const operations = [
      { source: 'test1', content: 'First bug report' },
      { source: 'test2', content: 'Second feature request' },
      { source: 'test3', content: 'Third urgent bug' }
    ];
    
    const inputIds: string[] = [];
    
    // 並列投入
    const promises = operations.map(async (op) => {
      const response = await fetch(`${API_URL}/api/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op)
      });
      const result = await response.json();
      return result.inputId;
    });
    
    const results = await Promise.all(promises);
    inputIds.push(...results);
    
    // 処理を待つ
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 全てのInputが処理されているか確認
    const stateResponse = await fetch(`${API_URL}/api/state`);
    const state = await stateResponse.json();
    
    for (const inputId of inputIds) {
      const issue = state.issues?.find((i: any) => 
        i.sourceInputIds?.includes(inputId)
      );
      expect(issue).toBeDefined();
    }
  });
});

/**
 * サーバーの起動を待つヘルパー関数
 */
async function waitForServer(url: string, timeout: number): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        console.log('Server is ready');
        return;
      }
    } catch (error) {
      // サーバーがまだ起動していない
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  throw new Error(`Server did not start within ${timeout}ms`);
}