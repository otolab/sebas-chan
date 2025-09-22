// DBベースの記録システム
// ファイルシステムへの依存を削除

/**
 * ワークフロー実行記録エントリ
 */
export interface WorkflowRecord {
  executionId: string; // 実行ID（UUID）
  workflowName: string; // ワークフロー名
  type: RecordType; // 記録タイプ
  timestamp: Date; // タイムスタンプ（自動生成）
  data: unknown; // 記録データ
}

/**
 * 記録タイプ
 */
export enum RecordType {
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
 * ワークフロー実行レコーダー
 * 実行の全記録を保持し、後で検証可能にする
 */
export class WorkflowRecorder {
  public readonly executionId: string;
  public readonly workflowName: string;

  private consoleOutput: boolean;
  private recordBuffer: WorkflowRecord[] = [];

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
  public record(type: RecordType, data: unknown): void {
    const entry: WorkflowRecord = {
      executionId: this.executionId,
      workflowName: this.workflowName,
      type,
      timestamp: new Date(),
      data,
    };

    // メモリバッファに追加（DBストレージはEngine側で実装）
    this.recordBuffer.push(entry);

    if (this.consoleOutput) {
      console.log(this.formatRecord(entry));
    }
  }

  /**
   * 記録エントリをフォーマット
   */
  private formatRecord(entry: WorkflowRecord): string {
    const timestamp = entry.timestamp.toISOString();
    const dataStr =
      typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2);
    return `[${timestamp}] [${entry.type}] [${entry.workflowName}:${entry.executionId}] ${dataStr}`;
  }

  /**
   * バッファをクリア
   */
  public clearBuffer(): WorkflowRecord[] {
    return this.recordBuffer.splice(0);
  }

  /**
   * レコーダーを終了
   */
  public close(): void {
    // DBベースの記録ではフラッシュ不要
    this.recordBuffer = [];
  }

  /**
   * 記録バッファを取得（テスト用）
   */
  public getBuffer(): WorkflowRecord[] {
    return [...this.recordBuffer];
  }
}
