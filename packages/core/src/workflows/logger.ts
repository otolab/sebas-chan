import { promises as fs } from 'fs';
import path from 'path';

/**
 * 簡素化されたワークフローログエントリ
 */
export interface WorkflowLog {
  executionId: string;      // 実行ID（UUID）
  workflowName: string;     // ワークフロー名
  type: LogType;           // ログタイプ
  timestamp: Date;         // タイムスタンプ（自動生成）
  data: unknown;           // ログデータ
}

/**
 * ログタイプ
 */
export enum LogType {
  INPUT = 'input',
  OUTPUT = 'output',
  ERROR = 'error',
  DB_QUERY = 'db_query',
  AI_CALL = 'ai_call',
  INFO = 'info',
  DEBUG = 'debug',
  WARN = 'warn'
}

export interface WorkflowLoggerOptions {
  logDir?: string;
  consoleOutput?: boolean;
  jsonFormat?: boolean;
}

/**
 * 簡素化されたワークフローロガー
 * サブワークフロー機能なし、シンプルなログ記録のみ
 */
export class WorkflowLogger {
  public readonly executionId: string;
  public readonly workflowName: string;

  private options: Required<WorkflowLoggerOptions>;
  private currentLogFile: string | null = null;
  private logBuffer: WorkflowLog[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(workflowName: string, options: WorkflowLoggerOptions = {}) {
    this.executionId = this.generateExecutionId();
    this.workflowName = workflowName;

    this.options = {
      logDir: options.logDir || path.join(process.cwd(), 'logs', 'workflows'),
      consoleOutput: options.consoleOutput ?? false,
      jsonFormat: options.jsonFormat ?? true,
    };

    this.initialize();
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
   * ログを記録
   */
  public async log(type: LogType, data: unknown): Promise<void> {
    const entry: WorkflowLog = {
      executionId: this.executionId,
      workflowName: this.workflowName,
      type,
      timestamp: new Date(),
      data,
    };

    this.logBuffer.push(entry);

    if (this.options.consoleOutput) {
      console.log(this.formatLogEntry(entry));
    }

    // バッファが一定サイズを超えたら即座にフラッシュ
    if (this.logBuffer.length >= 100) {
      await this.flush();
    }
  }

  /**
   * 入力をログ
   */
  public async logInput(input: unknown): Promise<void> {
    await this.log(LogType.INPUT, { input });
  }

  /**
   * 出力をログ
   */
  public async logOutput(output: unknown): Promise<void> {
    await this.log(LogType.OUTPUT, { output });
  }

  /**
   * エラーをログ
   */
  public async logError(error: Error, context?: unknown): Promise<void> {
    await this.log(LogType.ERROR, {
      message: error.message,
      stack: error.stack,
      context,
    });
  }


  /**
   * ログエントリをフォーマット
   */
  private formatLogEntry(entry: WorkflowLog): string {
    if (this.options.jsonFormat) {
      return JSON.stringify(entry);
    }

    const timestamp = entry.timestamp.toISOString();
    const dataStr = typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2);
    return `[${timestamp}] [${entry.type}] [${entry.workflowName}:${entry.executionId}] ${dataStr}`;
  }

  /**
   * バッファをファイルにフラッシュ
   */
  private async flush(): Promise<void> {
    if (this.logBuffer.length === 0 || !this.currentLogFile) {
      return;
    }

    const entries = this.logBuffer.splice(0);
    const content = entries.map((e) => this.formatLogEntry(e)).join('\n') + '\n';

    await fs.appendFile(this.currentLogFile, content, 'utf-8');
  }

  /**
   * ロガーを終了
   */
  public async close(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flush();
  }

  /**
   * ログレコードを取得（テスト用）
   */
  public getLogRecords(): WorkflowLog[] {
    return [...this.logBuffer];
  }
}