import { promises as fs } from 'fs';
import path from 'path';

export interface WorkflowLogEntry {
  executionId: string;  // 実行ID
  workflowName: string;
  timestamp: Date;
  phase: 'start' | 'input' | 'output' | 'error' | 'db_query' | 'ai_call' | 'custom';
  data: {
    input?: any;
    output?: any;
    query?: any;
    resultIds?: string[];
    aiModule?: string;
    aiParams?: any;
    aiResponse?: any;
    error?: any;
    message?: string;
    metadata?: Record<string, any>;
  };
  duration?: number;
  parentExecutionId?: string;
}

export interface WorkflowLoggerOptions {
  logDir?: string;
  maxLogSize?: number;
  rotateLogFiles?: boolean;
  consoleOutput?: boolean;
  jsonFormat?: boolean;
}

export class WorkflowLogger {
  public readonly executionId: string;
  public readonly workflowName: string;
  public readonly parentExecutionId?: string;

  private options: Required<WorkflowLoggerOptions>;
  private currentLogFile: string | null = null;
  private logBuffer: WorkflowLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private startTime: number;

  constructor(
    workflowName: string,
    options: WorkflowLoggerOptions = {},
    parentExecutionId?: string
  ) {
    this.executionId = this.generateExecutionId();
    this.workflowName = workflowName;
    this.parentExecutionId = parentExecutionId;
    this.startTime = Date.now();

    this.options = {
      logDir: options.logDir || path.join(process.cwd(), 'logs', 'workflows'),
      maxLogSize: options.maxLogSize || 10 * 1024 * 1024, // 10MB
      rotateLogFiles: options.rotateLogFiles ?? true,
      consoleOutput: options.consoleOutput ?? false,
      jsonFormat: options.jsonFormat ?? true,
    };

    this.initialize();
    this.logStart();
  }

  private async initialize() {
    // ログディレクトリの作成
    await fs.mkdir(this.options.logDir, { recursive: true });

    // 現在のログファイル名を設定
    this.currentLogFile = this.generateLogFileName();

    // 定期的なフラッシュ
    this.flushInterval = setInterval(() => {
      this.flush().catch(console.error);
    }, 5000);
  }

  private generateLogFileName(): string {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    return path.join(this.options.logDir, `workflow-${dateStr}-${timeStr}.log`);
  }

  private generateExecutionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * ワークフロー開始をログ
   */
  private async logStart(): Promise<void> {
    const entry: WorkflowLogEntry = {
      executionId: this.executionId,
      workflowName: this.workflowName,
      timestamp: new Date(),
      phase: 'start',
      data: {},
      parentExecutionId: this.parentExecutionId,
    };

    await this.logEntry(entry);
  }

  /**
   * 入力データをログ
   */
  async logInput(input: any): Promise<void> {
    const entry: WorkflowLogEntry = {
      executionId: this.executionId,
      workflowName: this.workflowName,
      timestamp: new Date(),
      phase: 'input',
      data: { input },
    };

    await this.logEntry(entry);
  }

  /**
   * 出力データをログ
   */
  async logOutput(output: any): Promise<void> {
    const entry: WorkflowLogEntry = {
      executionId: this.executionId,
      workflowName: this.workflowName,
      timestamp: new Date(),
      phase: 'output',
      data: { output },
      duration: Date.now() - this.startTime,
    };

    await this.logEntry(entry);
  }

  /**
   * DBクエリをログ
   */
  async logDbQuery(operation: string, query: any, resultIds: string[]): Promise<void> {
    const entry: WorkflowLogEntry = {
      executionId: this.executionId,
      workflowName: this.workflowName,
      timestamp: new Date(),
      phase: 'db_query',
      data: {
        message: operation,
        query,
        resultIds,
        metadata: {
          operation,
          resultCount: resultIds.length,
        },
      },
    };

    await this.logEntry(entry);
  }

  /**
   * AI呼び出しをログ
   */
  async logAiCall(module: string, params: any, response: any): Promise<void> {
    const entry: WorkflowLogEntry = {
      executionId: this.executionId,
      workflowName: this.workflowName,
      timestamp: new Date(),
      phase: 'ai_call',
      data: {
        aiModule: module,
        aiParams: params,
        aiResponse: response,
      },
    };

    await this.logEntry(entry);
  }

  /**
   * エラーをログ
   */
  async logError(error: Error, context?: any): Promise<void> {
    const entry: WorkflowLogEntry = {
      executionId: this.executionId,
      workflowName: this.workflowName,
      timestamp: new Date(),
      phase: 'error',
      data: {
        error: {
          message: error.message || String(error),
          stack: error.stack,
          name: error.name,
        },
        metadata: { context },
      },
      duration: Date.now() - this.startTime,
    };

    await this.logEntry(entry);
  }

  /**
   * サブワークフロー用のロガーを作成
   */
  createChildLogger(workflowName: string): WorkflowLogger {
    return new WorkflowLogger(
      workflowName,
      this.options,
      this.executionId
    );
  }

  /**
   * カスタムログエントリ
   */
  async log(level: 'info' | 'debug' | 'warn' | 'error', message: string, data?: any): Promise<void> {
    const entry: WorkflowLogEntry = {
      executionId: this.executionId,
      workflowName: this.workflowName,
      timestamp: new Date(),
      phase: 'custom',
      data: { message, metadata: { ...data, level } },
    };

    await this.logEntry(entry);
  }

  /**
   * ログエントリを記録
   */
  private async logEntry(entry: WorkflowLogEntry) {
    // コンソール出力
    if (this.options.consoleOutput) {
      console.log(`[${entry.workflowName}:${entry.phase}] ${entry.executionId}`);
      if (entry.data.message) {
        console.log(`  ${entry.data.message}`);
      }
    }

    // バッファに追加
    this.logBuffer.push(entry);

    // バッファが一定サイズを超えたらフラッシュ
    if (this.logBuffer.length >= 10) {
      await this.flush();
    }
  }

  /**
   * バッファをファイルにフラッシュ
   */
  async flush() {
    if (this.logBuffer.length === 0 || !this.currentLogFile) {
      return;
    }

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // ログファイルのサイズチェック
      if (this.options.rotateLogFiles) {
        await this.checkRotation();
      }

      // ログエントリを書き込み
      const lines =
        entries
          .map((entry) =>
            this.options.jsonFormat ? JSON.stringify(entry) : this.formatTextLog(entry)
          )
          .join('\n') + '\n';

      await fs.appendFile(this.currentLogFile, lines, 'utf-8');
    } catch (error) {
      console.error('Failed to write log:', error);
      // 失敗したエントリをバッファに戻す
      this.logBuffer.unshift(...entries);
    }
  }

  /**
   * テキスト形式でログをフォーマット
   */
  private formatTextLog(entry: WorkflowLogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const duration = entry.duration ? ` (${entry.duration}ms)` : '';
    let message = `[${timestamp}] ${entry.workflowName}:${entry.phase}${duration} - ${entry.executionId}`;

    if (entry.parentExecutionId) {
      message += ` (parent: ${entry.parentExecutionId})`;
    }

    if (entry.data.message) {
      message += `\n  Message: ${entry.data.message}`;
    }

    if (entry.data.error) {
      message += `\n  Error: ${entry.data.error.message}`;
    }

    return message;
  }

  /**
   * ログローテーションチェック
   */
  private async checkRotation() {
    if (!this.currentLogFile) return;

    try {
      const stats = await fs.stat(this.currentLogFile);
      if (stats.size >= this.options.maxLogSize) {
        // 新しいログファイルを作成
        this.currentLogFile = this.generateLogFileName();
      }
    } catch (error) {
      // ファイルが存在しない場合は無視
    }
  }

  /**
   * ログファイルを検索
   */
  async searchLogs(query: {
    workflowName?: string;
    startDate?: Date;
    endDate?: Date;
    phase?: WorkflowLogEntry['phase'];
    id?: string;
  }): Promise<WorkflowLogEntry[]> {
    const logFiles = await fs.readdir(this.options.logDir);
    const results: WorkflowLogEntry[] = [];

    for (const file of logFiles) {
      if (!file.endsWith('.log')) continue;

      const content = await fs.readFile(path.join(this.options.logDir, file), 'utf-8');

      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as WorkflowLogEntry;

          // フィルタリング
          if (query.workflowName && entry.workflowName !== query.workflowName) continue;
          if (query.phase && entry.phase !== query.phase) continue;
          if (query.id && entry.executionId !== query.id) continue;

          const entryDate = new Date(entry.timestamp);
          if (query.startDate && entryDate < query.startDate) continue;
          if (query.endDate && entryDate > query.endDate) continue;

          results.push(entry);
        } catch {
          // パースエラーは無視
        }
      }
    }

    return results.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * 統計情報を取得
   */
  async getStatistics(
    workflowName?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    executionsByWorkflow: Record<string, number>;
  }> {
    const logs = await this.searchLogs({ workflowName, startDate, endDate });

    const stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageDuration: 0,
      executionsByWorkflow: {} as Record<string, number>,
    };

    const durations: number[] = [];
    const executions = new Set<string>();

    for (const log of logs) {
      if (log.phase === 'start') {
        executions.add(log.executionId);
        stats.totalExecutions++;
        stats.executionsByWorkflow[log.workflowName] =
          (stats.executionsByWorkflow[log.workflowName] || 0) + 1;
      }

      if (log.phase === 'output') {
        stats.successfulExecutions++;
        if (log.duration) {
          durations.push(log.duration);
        }
      }

      if (log.phase === 'error') {
        stats.failedExecutions++;
      }
    }

    if (durations.length > 0) {
      stats.averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    }

    return stats;
  }

  /**
   * クリーンアップ
   */
  async cleanup() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flush();
  }
}

// シングルトンインスタンス
let defaultLogger: WorkflowLogger | null = null;

export function getDefaultLogger(): WorkflowLogger {
  if (!defaultLogger) {
    defaultLogger = new WorkflowLogger('default');
  }
  return defaultLogger;
}

export function setDefaultLogger(logger: WorkflowLogger) {
  defaultLogger = logger;
}
