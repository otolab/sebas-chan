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
    const packageRoot = path.join(__dirname, '..');  // packages/db

    // uvコマンドが利用可能かチェック
    const uvExists = spawn('which', ['uv'], { stdio: 'pipe' }).on('exit', (code) => code === 0);
    
    let pythonCmd: string;
    let pythonArgs: string[];
    
    // uvが利用可能で、pyproject.tomlが存在する場合はuv経由で実行
    const pyprojectPath = path.join(packageRoot, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      // uv --project でPythonを実行（cwdからの相対パス）
      pythonCmd = 'uv';
      pythonArgs = ['--project', '.', 'run', 'python', pythonScript];
      console.log(`Using uv to run Python script from project: ${packageRoot}`);
    } else {
      // フォールバック: 直接Pythonを実行
      const venvPython = path.join(packageRoot, '.venv/bin/python');
      if (fs.existsSync(venvPython)) {
        pythonCmd = venvPython;
        pythonArgs = [pythonScript];
        console.log(`Using Python from venv: ${venvPython}`);
      } else {
        pythonCmd = 'python3';
        pythonArgs = [pythonScript];
        console.log('No venv found, using system Python');
      }
    }

    this.worker = spawn(pythonCmd, pythonArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: packageRoot,  // uvコマンドを正しいディレクトリで実行
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
      console.error('Python stderr:', data.toString());
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
    // sourceInputIds → source_input_ids に変換
    const issueData = {
      ...issueWithId,
      source_input_ids: issueWithId.sourceInputIds,
      updates: JSON.stringify(issueWithId.updates),
      relations: JSON.stringify(issueWithId.relations),
    };
    delete (issueData as any).sourceInputIds;

    await this.sendRequest('addIssue', issueData);
    return id;
  }

  async getIssue(id: string): Promise<Issue | null> {
    const result = await this.sendRequest('getIssue', { id }) as any;
    if (!result) return null;

    // JSON文字列をパース、source_input_ids → sourceInputIds に変換
    return {
      ...result,
      sourceInputIds: result.source_input_ids || [],
      updates: JSON.parse(result.updates || '[]'),
      relations: JSON.parse(result.relations || '[]'),
    } as Issue;
  }

  async searchIssues(query: string): Promise<Issue[]> {
    const results = (await this.sendRequest('searchIssues', { query })) as Array<any>;
    return results.map((r) => ({
      ...r,
      sourceInputIds: r.source_input_ids || [],
      updates: JSON.parse(r.updates || '[]'),
      relations: JSON.parse(r.relations || '[]'),
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
