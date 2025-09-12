import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Issue } from '@sebas-chan/shared-types';
import { nanoid } from 'nanoid';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export interface DBClientOptions {
  /**
   * 使用する埋め込みモデル
   * - 'cl-nagoya/ruri-v3-30m': 小型モデル (120MB, 256次元)
   * - 'cl-nagoya/ruri-v3-310m': 大型モデル (1.2GB, 768次元)
   * @default 'cl-nagoya/ruri-v3-30m'
   */
  embeddingModel?: string;
}

export interface DBStatus {
  status: 'ok' | 'error';
  model_loaded?: boolean;
  tables?: string[];
  vector_dimension?: number;
}

export class DBClient extends EventEmitter {
  private worker: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private isReady = false;
  private buffer = ''; // 受信データのバッファ
  private options: DBClientOptions;

  constructor(options: DBClientOptions = {}) {
    super();
    this.options = {
      embeddingModel: 'cl-nagoya/ruri-v3-30m',
      ...options,
    };
  }

  /**
   * モデルを事前にダウンロード・初期化
   * connectの前に実行することで、初回接続時のタイムアウトを防ぐ
   */
  static async initialize(modelName?: string): Promise<void> {
    const packageRoot = path.join(__dirname, '..');
    const downloadScript = path.join(packageRoot, 'scripts/download_model.py');

    // モデル名が指定されていない場合はデフォルト
    const model = modelName || 'cl-nagoya/ruri-v3-30m';

    return new Promise((resolve, reject) => {
      const downloadProcess = spawn(
        'uv',
        ['--project', '.', 'run', 'python', downloadScript, `--model=${model}`],
        {
          cwd: packageRoot,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        }
      );

      let stdout = '';
      let stderr = '';

      downloadProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
        // プログレス表示（オプション）
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            console.log(`[Initialize] ${line}`);
          }
        }
      });

      downloadProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      downloadProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`Model ${model} initialized successfully`);
          resolve();
        } else {
          reject(new Error(`Model initialization failed with code ${code}: ${stderr || stdout}`));
        }
      });

      downloadProcess.on('error', (err) => {
        reject(new Error(`Failed to start initialization process: ${err.message}`));
      });
    });
  }

  async connect(): Promise<void> {
    if (this.worker) {
      throw new Error('Already connected');
    }

    const pythonScript = path.join(__dirname, '../src/python/lancedb_worker.py');
    const packageRoot = path.join(__dirname, '..'); // packages/db

    // uvを必須とする（環境未整備の場合はエラー）
    const pyprojectPath = path.join(packageRoot, 'pyproject.toml');
    if (!fs.existsSync(pyprojectPath)) {
      throw new Error(
        'pyproject.toml not found. Please ensure the Python environment is properly set up with uv.'
      );
    }

    // uv --project でPythonを実行
    const pythonCmd = 'uv';
    const pythonArgs = ['--project', '.', 'run', 'python', pythonScript];

    // モデル選択オプションを追加
    if (this.options.embeddingModel) {
      pythonArgs.push(`--model=${this.options.embeddingModel}`);
    }

    this.worker = spawn(pythonCmd, pythonArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: packageRoot, // uvコマンドを正しいディレクトリで実行
    });

    this.worker.stdout?.on('data', (data) => {
      // バッファに追加
      this.buffer += data.toString();

      // 改行で分割して処理
      const lines = this.buffer.split('\n');

      // 最後の要素は不完全な可能性があるので、バッファに残す
      this.buffer = lines.pop() || '';

      // 完全な行だけを処理
      for (const line of lines) {
        if (!line.trim()) continue;

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
          console.error('Line was:', line);
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

    // ワーカーの起動を待つ（実際にpingが通るまで）
    await this.waitForReady();
  }

  /**
   * DBが準備完了するまで待つ
   */
  private async waitForReady(): Promise<void> {
    const maxRetries = 30; // 最大30秒待つ
    const retryInterval = 1000; // 1秒ごとにリトライ

    for (let i = 0; i < maxRetries; i++) {
      try {
        const status = await this.ping();
        if (status.status === 'ok') {
          this.isReady = true;
          console.log('DB is ready:', status);
          return;
        }
      } catch (e) {
        // pingが失敗しても続ける
        console.log(`Waiting for DB to be ready... (${i + 1}/${maxRetries})`);
      }
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }

    throw new Error('Timeout waiting for DB to be ready');
  }

  /**
   * ヘルスチェック
   */
  async ping(): Promise<DBStatus> {
    // isReadyチェックをスキップ（起動中にも呼ばれるため）
    if (!this.worker) {
      throw new Error('Not connected to database');
    }

    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      method: 'ping',
      params: {},
      id,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Ping timeout'));
      }, 5000); // 5秒のタイムアウト

      this.worker!.stdin?.write(JSON.stringify(request) + '\n');

      // タイムアウトをクリア
      const originalResolve = this.pendingRequests.get(id)!.resolve;
      this.pendingRequests.get(id)!.resolve = (value) => {
        clearTimeout(timeout);
        originalResolve(value);
      };
    }) as Promise<DBStatus>;
  }

  /**
   * モデルを初期化
   * connect後に明示的に呼び出す
   */
  async initModel(): Promise<boolean> {
    const result = await this.sendRequest('initModel');
    return result as boolean;
  }

  async disconnect(): Promise<void> {
    if (this.worker) {
      this.worker.kill();
      this.worker = null;
      this.isReady = false;
      this.buffer = ''; // バッファをクリア
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
      }, 30000); // 30秒のタイムアウト（CI環境での初期化を考慮）

      // TODO: 大きなJSONデータ（8KB以上）の送信時にバッファオーバーフローが発生する問題がある
      // Node.jsのstdioバッファサイズ制限により、大きなデータが途切れる可能性がある
      // 解決策: 1) チャンク分割送信の実装, 2) spawnオプションでバッファサイズ拡張, 3) IPC通信への移行
      // Issue: https://github.com/otolab/sebas-chan/issues/2
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
    delete (issueData as Record<string, unknown>).sourceInputIds;

    await this.sendRequest('addIssue', issueData);
    return id;
  }

  async getIssue(id: string): Promise<Issue | null> {
    const result = (await this.sendRequest('getIssue', { id })) as Record<string, unknown>;
    if (!result) return null;

    // JSON文字列をパース、source_input_ids → sourceInputIds に変換
    return {
      ...result,
      sourceInputIds: result.source_input_ids || [],
      updates: JSON.parse((result.updates as string) || '[]'),
      relations: JSON.parse((result.relations as string) || '[]'),
    } as Issue;
  }

  async searchIssues(query: string): Promise<Issue[]> {
    const results = (await this.sendRequest('searchIssues', { query })) as Array<
      Record<string, unknown>
    >;
    return results.map((r) => ({
      ...r,
      sourceInputIds: r.source_input_ids || [],
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

  // Pond関連のメソッド
  async addPondEntry(entry: {
    id: string;
    content: string;
    source: string;
    timestamp: Date | string;
  }): Promise<boolean> {
    const timestamp =
      entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp;

    return (await this.sendRequest('addPondEntry', {
      ...entry,
      timestamp,
    })) as boolean;
  }

  async getPondEntry(id: string): Promise<{
    id: string;
    content: string;
    source: string;
    timestamp: string;
    vector?: number[];
  } | null> {
    return (await this.sendRequest('getPondEntry', { id })) as {
      id: string;
      content: string;
      source: string;
      timestamp: string;
      vector?: number[];
    } | null;
  }

  async getPondSources(): Promise<string[]> {
    return (await this.sendRequest('getPondSources')) as string[];
  }

  async searchPond(filters: {
    q?: string;
    source?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    data: Array<{
      id: string;
      content: string;
      source: string;
      timestamp: string;
      vector?: number[];
      score?: number;
      distance?: number;
    }>;
    meta: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    console.log('[DBClient] searchPond called with filters:', filters);

    // 日付をISO文字列に変換
    const params = {
      ...filters,
      dateFrom:
        filters.dateFrom instanceof Date ? filters.dateFrom.toISOString() : filters.dateFrom,
      dateTo: filters.dateTo instanceof Date ? filters.dateTo.toISOString() : filters.dateTo,
    };

    return (await this.sendRequest('searchPond', params)) as {
      data: Array<{
        id: string;
        content: string;
        source: string;
        timestamp: string;
        vector?: number[];
      }>;
      meta: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
    };
  }

  // テスト用メソッド
  async clearDatabase(): Promise<void> {
    await this.sendRequest('clearDatabase');
  }

  /**
   * 現在のステータスを取得
   */
  async getStatus(): Promise<DBStatus> {
    if (!this.isReady) {
      return {
        status: 'error',
        model_loaded: false,
      };
    }
    try {
      return await this.ping();
    } catch (e) {
      return {
        status: 'error',
        model_loaded: false,
      };
    }
  }
}

export default DBClient;
export type { DBStatus, DBClientOptions };
