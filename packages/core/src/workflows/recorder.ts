// DBベースのログ記録システム
// ファイルシステムへの依存を削除

/**
 * 簡素化されたワークフローログエントリ
 */
export interface WorkflowLog {
  executionId: string; // 実行ID（UUID）
  workflowName: string; // ワークフロー名
  type: LogType; // ログタイプ
  timestamp: Date; // タイムスタンプ（自動生成）
  data: unknown; // ログデータ
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
  WARN = 'warn',
}

export interface WorkflowRecorderOptions {
  executionId?: string;
  consoleOutput?: boolean;
}

/**
 * 簡素化されたワークフローロガー
 * サブワークフロー機能なし、シンプルなログ記録のみ
 */
export class WorkflowRecorder {
  public readonly executionId: string;
  public readonly workflowName: string;

  private consoleOutput: boolean;
  private recordBuffer: WorkflowLog[] = [];

  constructor(workflowName: string, options: WorkflowRecorderOptions = {}) {
    this.executionId = options.executionId || this.generateExecutionId();
    this.workflowName = workflowName;
    this.consoleOutput = options.consoleOutput ?? false;
  }

  private generateExecutionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 実行記録を記録
   */
  public record(type: LogType, data: unknown): void {
    const entry: WorkflowLog = {
      executionId: this.executionId,
      workflowName: this.workflowName,
      type,
      timestamp: new Date(),
      data,
    };

    // メモリバッファに追加（DBストレージはEngine側で実装）
    this.recordBuffer.push(entry);

    if (this.consoleOutput) {
      console.log(this.formatLogEntry(entry));
    }
  }

  /**
   * ログエントリをフォーマット
   */
  private formatLogEntry(entry: WorkflowLog): string {
    const timestamp = entry.timestamp.toISOString();
    const dataStr =
      typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2);
    return `[${timestamp}] [${entry.type}] [${entry.workflowName}:${entry.executionId}] ${dataStr}`;
  }

  /**
   * バッファをクリア
   */
  public clearBuffer(): WorkflowLog[] {
    return this.recordBuffer.splice(0);
  }

  /**
   * レコーダーを終了
   */
  public close(): void {
    // DBベースのログではフラッシュ不要
    this.recordBuffer = [];
  }

  /**
   * ログレコードを取得（テスト用）
   */
  public getLogRecords(): WorkflowLog[] {
    return [...this.recordBuffer];
  }
}
