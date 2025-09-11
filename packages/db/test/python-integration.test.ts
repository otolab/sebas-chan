import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';

/**
 * Python JSON-RPCワーカーの基本的な通信テスト
 * DBClientでカバーされない低レベルの通信を検証
 */
describe('Python JSON-RPC Worker', () => {
  let pythonProcess: ChildProcess;
  let requestId = 0;
  let buffer = ''; // 受信データのバッファ
  
  beforeAll(async () => {
    // テスト用のDBディレクトリを作成
    const testDbPath = path.join(__dirname, '../../../test-data/lancedb-basic');
    await fs.mkdir(testDbPath, { recursive: true });
    
    // Pythonワーカーを起動（uvを使用）
    const pythonScript = path.join(__dirname, '../src/python/lancedb_worker.py');
    const packageRoot = path.join(__dirname, '..');
    pythonProcess = spawn('uv', ['--project', '.', 'run', 'python', pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: packageRoot,
      env: { ...process.env, PYTHONUNBUFFERED: '1', DB_PATH: testDbPath }
    });
    
    // エラーハンドリング
    pythonProcess.stderr?.on('data', (data) => {
      console.error('Python stderr:', data.toString());
    });
    
    // 起動を待つ（Ruriモデルの初期化に時間がかかる）
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 15000);
  
  afterAll(async () => {
    if (pythonProcess) {
      pythonProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // テストDBをクリーンアップ
    const testDbPath = path.join(__dirname, '../../../test-data/lancedb-basic');
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
      }, 10000);
      
      const handler = (data: Buffer) => {
        // バッファに追加
        buffer += data.toString();
        
        // 改行で分割
        const lines = buffer.split('\n');
        
        // 最後の要素は不完全な可能性があるので、バッファに残す
        buffer = lines.pop() || '';
        
        // 完全な行だけを処理
        for (const line of lines) {
          if (!line.trim()) continue;
          
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
  
  describe('JSON-RPC Communication', () => {
    it('should handle valid JSON-RPC requests', async () => {
      // 基本的なメソッド呼び出しをテスト
      const result = await sendRequest('getState');
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
    
    it('should handle unknown methods gracefully', async () => {
      // 存在しないメソッドを呼び出した時のエラー処理を確認
      await expect(sendRequest('unknownMethod')).rejects.toThrow('Unknown method');
    });
    
    it('should process requests with proper JSON-RPC format', async () => {
      // 簡単なIssue追加でJSON-RPC形式を確認
      const issueData = {
        id: 'test-rpc-1',
        title: 'RPC Test',
        description: 'Testing JSON-RPC',
        status: 'open',
        labels: [],
        updates: '[]',
        relations: '[]',
        source_input_ids: []
      };
      
      const result = await sendRequest('addIssue', issueData);
      expect(result).toBe('test-rpc-1');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      // 不正なJSONを送信してもクラッシュしないことを確認
      pythonProcess.stdin?.write('{ invalid json }\n');
      
      // エラーでクラッシュしないことを確認（少し待機）
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
      await expect(sendRequest('addIssue', incompleteIssue)).rejects.toThrow();
    });
  });
});