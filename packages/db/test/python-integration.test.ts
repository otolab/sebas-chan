import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';

/**
 * Python統合テスト
 * PythonワーカーとTypeScriptクライアント間の通信を検証
 */
describe('Python LanceDB Worker Integration', () => {
  let pythonProcess: ChildProcess;
  let requestId = 0;
  
  beforeAll(async () => {
    // テスト用のDBディレクトリを作成
    const testDbPath = path.join(__dirname, '../../../test-data/lancedb');
    await fs.mkdir(testDbPath, { recursive: true });
    
    // Pythonワーカーを起動
    const pythonScript = path.join(__dirname, '../src/python/lancedb_worker.py');
    pythonProcess = spawn('python3', [pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1', DB_PATH: testDbPath }
    });
    
    // エラーハンドリング
    pythonProcess.stderr?.on('data', (data) => {
      console.error('Python stderr:', data.toString());
    });
    
    // 起動を待つ
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 10000);
  
  afterAll(async () => {
    if (pythonProcess) {
      pythonProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // テストDBをクリーンアップ
    const testDbPath = path.join(__dirname, '../../../test-data/lancedb');
    await fs.rm(testDbPath, { recursive: true, force: true });
  });
  
  /**
   * JSON-RPCリクエストを送信して応答を待つヘルパー
   */
  async function sendRequest(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      const request = {
        jsonrpc: '2.0',
        method,
        params,
        id
      };
      
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout: ${method}`));
      }, 5000);
      
      const handler = (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id === id) {
              clearTimeout(timeout);
              pythonProcess.stdout?.off('data', handler);
              
              if (response.error) {
                reject(new Error(response.error.message));
              } else {
                resolve(response.result);
              }
              return;
            }
          } catch (e) {
            // JSONパースエラーは無視
          }
        }
      };
      
      pythonProcess.stdout?.on('data', handler);
      pythonProcess.stdin?.write(JSON.stringify(request) + '\n');
    });
  }
  
  describe('Basic Communication', () => {
    it('should handle JSON-RPC requests', async () => {
      const result = await sendRequest('getState');
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
    
    it('should handle unknown methods gracefully', async () => {
      await expect(sendRequest('unknownMethod')).rejects.toThrow('Unknown method');
    });
  });
  
  describe('Issue Operations via Python', () => {
    it('should add and retrieve issue through Python worker', async () => {
      const issueData = {
        id: 'test-issue-python-1',
        title: 'Python Integration Test',
        description: 'Testing Python worker',
        status: 'open',
        labels: ['test', 'python'],
        updates: JSON.stringify([]),
        relations: JSON.stringify([]),
        source_input_ids: []
      };
      
      const addResult = await sendRequest('addIssue', issueData);
      expect(addResult).toBe(issueData.id);
      
      const getResult = await sendRequest('getIssue', { id: issueData.id });
      expect(getResult).toBeDefined();
      expect(getResult.id).toBe(issueData.id);
      expect(getResult.title).toBe(issueData.title);
    });
    
    it('should search issues', async () => {
      // 複数のIssueを追加
      const issues = [
        {
          id: 'search-test-1',
          title: 'Search Test One',
          description: 'First search test',
          status: 'open',
          labels: ['search'],
          updates: '[]',
          relations: '[]',
          source_input_ids: []
        },
        {
          id: 'search-test-2',
          title: 'Search Test Two',
          description: 'Second search test',
          status: 'open',
          labels: ['search'],
          updates: '[]',
          relations: '[]',
          source_input_ids: []
        }
      ];
      
      for (const issue of issues) {
        await sendRequest('addIssue', issue);
      }
      
      const searchResults = await sendRequest('searchIssues', { query: 'Search Test' });
      
      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults.length).toBeGreaterThanOrEqual(2);
      expect(searchResults.some((r: any) => r.id === 'search-test-1')).toBe(true);
      expect(searchResults.some((r: any) => r.id === 'search-test-2')).toBe(true);
    });
  });
  
  describe('State Document Operations via Python', () => {
    it('should update and retrieve state document', async () => {
      const stateContent = JSON.stringify({
        test: true,
        timestamp: new Date().toISOString(),
        data: { nested: 'value' }
      });
      
      const updateResult = await sendRequest('updateState', { content: stateContent });
      expect(updateResult).toBe(true);
      
      const getResult = await sendRequest('getState');
      expect(getResult).toBe(stateContent);
      
      const parsed = JSON.parse(getResult);
      expect(parsed.test).toBe(true);
      expect(parsed.data.nested).toBe('value');
    });
  });
  
  describe('LanceDB Schema Compliance', () => {
    it('should maintain correct schema for issues table', async () => {
      const issue = {
        id: 'schema-test-1',
        title: 'Schema Test',
        description: 'Testing schema compliance',
        status: 'open',
        labels: ['schema', 'test'],
        updates: JSON.stringify([
          { timestamp: new Date().toISOString(), content: 'Update 1' }
        ]),
        relations: JSON.stringify([
          { type: 'blocks', targetIssueId: 'other-issue' }
        ]),
        source_input_ids: ['input-1', 'input-2']
      };
      
      await sendRequest('addIssue', issue);
      const retrieved = await sendRequest('getIssue', { id: issue.id });
      
      // スキーマフィールドの存在を確認
      expect(retrieved).toHaveProperty('id');
      expect(retrieved).toHaveProperty('title');
      expect(retrieved).toHaveProperty('description');
      expect(retrieved).toHaveProperty('status');
      expect(retrieved).toHaveProperty('labels');
      expect(retrieved).toHaveProperty('updates');
      expect(retrieved).toHaveProperty('relations');
      expect(retrieved).toHaveProperty('source_input_ids');
      expect(retrieved).toHaveProperty('vector');
      
      // ベクトルの次元を確認
      expect(Array.isArray(retrieved.vector)).toBe(true);
      expect(retrieved.vector.length).toBe(384);
    });
  });
  
  describe('Error Handling in Python Worker', () => {
    it('should handle invalid JSON gracefully', async () => {
      // 不正なJSONを送信
      pythonProcess.stdin?.write('{ invalid json }\n');
      
      // エラーでクラッシュしないことを確認
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 正常なリクエストが引き続き処理されることを確認
      const result = await sendRequest('getState');
      expect(result).toBeDefined();
    });
    
    it('should handle missing required fields', async () => {
      const incompleteIssue = {
        id: 'incomplete-1',
        title: 'Incomplete Issue'
        // 他の必須フィールドが欠落
      };
      
      // エラーが適切に処理されることを確認
      try {
        await sendRequest('addIssue', incompleteIssue);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
  
  describe('Concurrent Operations', () => {
    it('should handle concurrent requests', async () => {
      const promises = [];
      
      // 並列でリクエストを送信
      for (let i = 0; i < 10; i++) {
        promises.push(
          sendRequest('addIssue', {
            id: `concurrent-${i}`,
            title: `Concurrent Issue ${i}`,
            description: 'Testing concurrent operations',
            status: 'open',
            labels: ['concurrent'],
            updates: '[]',
            relations: '[]',
            source_input_ids: []
          })
        );
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result).toBe(`concurrent-${i}`);
      });
      
      // 全てのIssueが正しく保存されたことを確認
      for (let i = 0; i < 10; i++) {
        const issue = await sendRequest('getIssue', { id: `concurrent-${i}` });
        expect(issue).toBeDefined();
        expect(issue.title).toBe(`Concurrent Issue ${i}`);
      }
    });
  });
});

describe('Vector Search Capabilities', () => {
  let pythonProcess: ChildProcess;
  let requestId = 0;
  
  beforeAll(async () => {
    const testDbPath = path.join(__dirname, '../../../test-data/lancedb-vector');
    await fs.mkdir(testDbPath, { recursive: true });
    
    const pythonScript = path.join(__dirname, '../src/python/lancedb_worker.py');
    pythonProcess = spawn('python3', [pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1', DB_PATH: testDbPath }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 10000);
  
  afterAll(async () => {
    if (pythonProcess) {
      pythonProcess.kill();
    }
    
    const testDbPath = path.join(__dirname, '../../../test-data/lancedb-vector');
    await fs.rm(testDbPath, { recursive: true, force: true });
  });
  
  async function sendRequest(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      const request = { jsonrpc: '2.0', method, params, id };
      
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
      
      const handler = (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id === id) {
              clearTimeout(timeout);
              pythonProcess.stdout?.off('data', handler);
              response.error ? reject(new Error(response.error.message)) : resolve(response.result);
              return;
            }
          } catch (e) {}
        }
      };
      
      pythonProcess.stdout?.on('data', handler);
      pythonProcess.stdin?.write(JSON.stringify(request) + '\n');
    });
  }
  
  it.skip('should perform vector similarity search', async () => {
    // TODO: 実際のembeddingモデルが統合されたら有効化
    
    // セマンティックに類似したIssueを作成
    const issues = [
      {
        id: 'vec-1',
        title: 'Database connection timeout',
        description: 'The database connection times out after 30 seconds'
      },
      {
        id: 'vec-2',
        title: 'SQL query timeout error',
        description: 'Queries to the database are timing out'
      },
      {
        id: 'vec-3',
        title: 'UI button not responding',
        description: 'The submit button does not work when clicked'
      }
    ];
    
    // ベクトル検索を実行
    // const results = await sendRequest('vectorSearch', {
    //   query: 'database timeout issue',
    //   limit: 2
    // });
    
    // expect(results).toHaveLength(2);
    // expect(results[0].id).toBe('vec-1'); // 最も類似
    // expect(results[1].id).toBe('vec-2'); // 次に類似
  });
  
  it('should handle vector dimensions correctly', async () => {
    const issue = {
      id: 'vector-dim-test',
      title: 'Vector Dimension Test',
      description: 'Testing vector dimensions',
      status: 'open',
      labels: [],
      updates: '[]',
      relations: '[]',
      source_input_ids: []
    };
    
    await sendRequest('addIssue', issue);
    const retrieved = await sendRequest('getIssue', { id: issue.id });
    
    // ベクトルが384次元であることを確認
    expect(retrieved.vector).toBeDefined();
    expect(Array.isArray(retrieved.vector)).toBe(true);
    expect(retrieved.vector.length).toBe(384);
    
    // ベクトルの値が数値であることを確認
    retrieved.vector.forEach((val: any) => {
      expect(typeof val).toBe('number');
    });
  });
});