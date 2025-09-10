import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Issue } from '@sebas-chan/shared-types';
import { nanoid } from 'nanoid';
import * as path from 'path';
import * as fs from 'fs';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export class DBClient extends EventEmitter {
  private worker: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private isReady = false;

  async connect(): Promise<void> {
    if (this.worker) {
      throw new Error('Already connected');
    }

    const pythonScript = path.join(__dirname, '../src/python/lancedb_worker.py');

    // プロジェクトルートからの仮想環境パスを試す
    const projectRoot = path.join(__dirname, '../..');
    const venvPaths = [
      path.join(projectRoot, '.venv/bin/python'), // パッケージルートの.venv
      path.join(projectRoot, '../../../.venv/bin/python'), // モノレポルートの.venv（もしあれば）
      path.join(__dirname, '../../.venv/bin/python'), // 従来のパス（互換性のため）
    ];

    // 最初に見つかった仮想環境のPythonを使用
    let pythonCmd = 'python3';
    for (const venvPath of venvPaths) {
      if (fs.existsSync(venvPath)) {
        pythonCmd = venvPath;
        console.log(`Using Python from venv: ${venvPath}`);
        break;
      }
    }

    if (pythonCmd === 'python3') {
      console.log('No venv found, using system Python');
    }

    this.worker = spawn(pythonCmd, [pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.worker.stdout?.on('data', (data) => {
      const lines = data
        .toString()
        .split('\n')
        .filter((line: string) => line.trim());
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          const request = this.pendingRequests.get(response.id);
          if (request) {
            this.pendingRequests.delete(response.id);
            if (response.error) {
              request.reject(new Error(response.error.message));
            } else {
              request.resolve(response.result);
            }
          }
        } catch (e) {
          console.error('Failed to parse response:', e);
        }
      }
    });

    this.worker.stderr?.on('data', (data) => {
      console.error('Python worker error:', data.toString());
    });

    this.worker.on('error', (error) => {
      console.error('Failed to start Python worker:', error);
      this.emit('error', error);
    });

    this.worker.on('exit', (code) => {
      console.log(`Python worker exited with code ${code}`);
      this.isReady = false;
      this.worker = null;
    });

    // ワーカーの起動を待つ
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.isReady = true;
  }

  async disconnect(): Promise<void> {
    if (this.worker) {
      this.worker.kill();
      this.worker = null;
      this.isReady = false;
    }
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.worker || !this.isReady) {
      throw new Error('Not connected to database');
    }

    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, 10000); // 10秒のタイムアウト

      this.worker!.stdin?.write(JSON.stringify(request) + '\n');

      // タイムアウトをクリア
      const originalResolve = this.pendingRequests.get(id)!.resolve;
      this.pendingRequests.get(id)!.resolve = (value) => {
        clearTimeout(timeout);
        originalResolve(value);
      };
    });
  }

  // Issue関連のメソッド
  async addIssue(issue: Omit<Issue, 'id'>): Promise<string> {
    const id = nanoid();
    const issueWithId = { ...issue, id };

    // 複雑なオブジェクトはJSON文字列として保存
    const issueData = {
      ...issueWithId,
      updates: JSON.stringify(issueWithId.updates),
      relations: JSON.stringify(issueWithId.relations),
    };

    await this.sendRequest('addIssue', issueData);
    return id;
  }

  async getIssue(id: string): Promise<Issue | null> {
    const result = await this.sendRequest('getIssue', { id });
    if (!result) return null;

    // JSON文字列をパース
    return {
      ...result,
      updates: JSON.parse((result as { updates?: string }).updates || '[]'),
      relations: JSON.parse((result as { relations?: string }).relations || '[]'),
    } as Issue;
  }

  async searchIssues(query: string): Promise<Issue[]> {
    const results = (await this.sendRequest('searchIssues', { query })) as Array<
      Record<string, unknown>
    >;
    return results.map((r) => ({
      ...r,
      updates: JSON.parse((r.updates as string) || '[]'),
      relations: JSON.parse((r.relations as string) || '[]'),
    })) as Issue[];
  }

  // State文書関連のメソッド
  async getStateDocument(): Promise<string> {
    return (await this.sendRequest('getState')) as string;
  }

  async updateStateDocument(content: string): Promise<void> {
    await this.sendRequest('updateState', { content });
  }
}

export default DBClient;
