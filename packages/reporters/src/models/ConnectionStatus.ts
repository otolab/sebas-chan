/**
 * @file ConnectionStatus model
 * @module @sebas-chan/reporters/models/ConnectionStatus
 */

import { z } from 'zod';
import {
  TargetType,
  type IConnectionStatus,
  BUFFER_CONSTANTS,
} from '../types';

/**
 * ConnectionStatusのZodスキーマ
 */
export const ConnectionStatusSchema = z.object({
  targetId: z.string().min(1, 'Target ID is required'),
  targetType: z.nativeEnum(TargetType),
  isConnected: z.boolean(),
  lastSuccessAt: z.coerce.date().optional(),
  lastErrorAt: z.coerce.date().optional(),
  errorCount: z.number().int().min(0),
  errorMessage: z
    .string()
    .max(BUFFER_CONSTANTS.MAX_ERROR_MESSAGE_LENGTH, {
      message: `Error message must be ${BUFFER_CONSTANTS.MAX_ERROR_MESSAGE_LENGTH} characters or less`,
    })
    .optional(),
});

/**
 * ConnectionStatusモデルクラス
 */
export class ConnectionStatus implements IConnectionStatus {
  public readonly targetId: string;
  public readonly targetType: TargetType;
  public isConnected: boolean;
  public lastSuccessAt?: Date;
  public lastErrorAt?: Date;
  public errorCount: number;
  public errorMessage?: string;

  /**
   * コンストラクタ
   * @param data - 接続ステータスデータ
   */
  constructor(data: IConnectionStatus) {
    const validated = ConnectionStatusSchema.parse(data);
    this.targetId = validated.targetId;
    this.targetType = validated.targetType;
    this.isConnected = validated.isConnected;
    this.lastSuccessAt = validated.lastSuccessAt;
    this.lastErrorAt = validated.lastErrorAt;
    this.errorCount = validated.errorCount;
    this.errorMessage = validated.errorMessage;
  }

  /**
   * 新しい接続ステータスを作成
   * @param targetId - 接続先ID
   * @param targetType - 接続先タイプ
   * @returns 新しいConnectionStatusインスタンス
   */
  static create(
    targetId: string,
    targetType: TargetType
  ): ConnectionStatus {
    return new ConnectionStatus({
      targetId,
      targetType,
      isConnected: false,
      errorCount: 0,
    });
  }

  /**
   * 接続成功を記録
   * @returns 更新されたConnectionStatusインスタンス
   */
  recordSuccess(): ConnectionStatus {
    return new ConnectionStatus({
      ...this,
      isConnected: true,
      lastSuccessAt: new Date(),
      errorCount: 0, // エラーカウントをリセット
      errorMessage: undefined, // エラーメッセージをクリア
    });
  }

  /**
   * 接続エラーを記録
   * @param errorMessage - エラーメッセージ
   * @returns 更新されたConnectionStatusインスタンス
   */
  recordError(errorMessage?: string): ConnectionStatus {
    return new ConnectionStatus({
      ...this,
      isConnected: false,
      lastErrorAt: new Date(),
      errorCount: this.errorCount + 1,
      errorMessage: errorMessage
        ? errorMessage.substring(0, BUFFER_CONSTANTS.MAX_ERROR_MESSAGE_LENGTH)
        : undefined,
    });
  }

  /**
   * 切断を記録
   * @returns 更新されたConnectionStatusインスタンス
   */
  recordDisconnection(): ConnectionStatus {
    return new ConnectionStatus({
      ...this,
      isConnected: false,
    });
  }

  /**
   * 接続中状態に設定
   * @returns 更新されたConnectionStatusインスタンス
   */
  setConnecting(): ConnectionStatus {
    return new ConnectionStatus({
      ...this,
      isConnected: false,
      // 接続中は状態のみ変更、他のフィールドは保持
    });
  }

  /**
   * エラーカウントをリセット
   * @returns 更新されたConnectionStatusインスタンス
   */
  resetErrorCount(): ConnectionStatus {
    return new ConnectionStatus({
      ...this,
      errorCount: 0,
      errorMessage: undefined,
    });
  }

  /**
   * 再接続が必要かチェック
   * @param maxRetries - 最大リトライ回数
   * @returns 再接続が必要な場合true
   */
  needsReconnection(maxRetries: number = 3): boolean {
    return !this.isConnected && this.errorCount < maxRetries;
  }

  /**
   * 指数バックオフの遅延時間を計算
   * @param baseDelay - 基本遅延時間（ミリ秒）
   * @param maxDelay - 最大遅延時間（ミリ秒）
   * @returns 遅延時間（ミリ秒）
   */
  calculateBackoffDelay(
    baseDelay: number = 1000,
    maxDelay: number = 30000
  ): number {
    const delay = Math.min(
      baseDelay * Math.pow(2, this.errorCount),
      maxDelay
    );
    // ジッターを追加（±20%）
    const jitter = delay * 0.2;
    return Math.floor(delay + (Math.random() - 0.5) * jitter);
  }

  /**
   * 接続の健全性をチェック
   * @param staleThreshold - 古いとみなす閾値（ミリ秒）
   * @returns 健全な場合true
   */
  isHealthy(staleThreshold: number = 60000): boolean {
    if (!this.isConnected) {
      return false;
    }

    if (!this.lastSuccessAt) {
      return false;
    }

    const now = new Date();
    const timeSinceLastSuccess = now.getTime() - this.lastSuccessAt.getTime();
    return timeSinceLastSuccess < staleThreshold;
  }

  /**
   * エラー率を計算
   * @param totalAttempts - 総試行回数
   * @returns エラー率（0-1）
   */
  calculateErrorRate(totalAttempts: number): number {
    if (totalAttempts === 0) {
      return 0;
    }
    return Math.min(this.errorCount / totalAttempts, 1);
  }

  /**
   * JSON形式に変換
   * @returns JSON形式の接続ステータス
   */
  toJSON(): Record<string, unknown> {
    return {
      targetId: this.targetId,
      targetType: this.targetType,
      isConnected: this.isConnected,
      lastSuccessAt: this.lastSuccessAt?.toISOString(),
      lastErrorAt: this.lastErrorAt?.toISOString(),
      errorCount: this.errorCount,
      errorMessage: this.errorMessage,
    };
  }

  /**
   * JSON文字列からConnectionStatusインスタンスを作成
   * @param json - JSON文字列
   * @returns ConnectionStatusインスタンス
   */
  static fromJSON(json: string): ConnectionStatus {
    const data = JSON.parse(json);
    return new ConnectionStatus({
      targetId: data.targetId,
      targetType: data.targetType,
      isConnected: data.isConnected,
      lastSuccessAt: data.lastSuccessAt
        ? new Date(data.lastSuccessAt)
        : undefined,
      lastErrorAt: data.lastErrorAt
        ? new Date(data.lastErrorAt)
        : undefined,
      errorCount: data.errorCount,
      errorMessage: data.errorMessage,
    });
  }

  /**
   * 接続ステータスの検証
   * @param data - 検証するデータ
   * @returns 検証結果
   */
  static validate(
    data: unknown
  ): z.SafeParseReturnType<unknown, IConnectionStatus> {
    return ConnectionStatusSchema.safeParse(data);
  }

  /**
   * 複数の接続ステータスを検証
   * @param data - 検証するデータ配列
   * @returns 検証結果
   */
  static validateMany(
    data: unknown[]
  ): z.SafeParseReturnType<unknown[], IConnectionStatus[]> {
    return z.array(ConnectionStatusSchema).safeParse(data);
  }

  /**
   * サマリー情報を取得
   * @returns サマリー文字列
   */
  getSummary(): string {
    const status = this.isConnected ? 'Connected' : 'Disconnected';
    const errors = this.errorCount > 0 ? ` (${this.errorCount} errors)` : '';
    const lastSuccess = this.lastSuccessAt
      ? ` Last success: ${this.lastSuccessAt.toISOString()}`
      : '';
    return `${this.targetType}:${this.targetId} - ${status}${errors}${lastSuccess}`;
  }

  /**
   * 接続時間を取得
   * @returns 接続時間（ミリ秒）、未接続の場合は0
   */
  getConnectionDuration(): number {
    if (!this.isConnected || !this.lastSuccessAt) {
      return 0;
    }
    return new Date().getTime() - this.lastSuccessAt.getTime();
  }

  /**
   * 最後のエラーからの経過時間を取得
   * @returns 経過時間（ミリ秒）、エラーがない場合はInfinity
   */
  getTimeSinceLastError(): number {
    if (!this.lastErrorAt) {
      return Infinity;
    }
    return new Date().getTime() - this.lastErrorAt.getTime();
  }
}

// 型エクスポート
export type ConnectionStatusInput = z.input<typeof ConnectionStatusSchema>;
export type ConnectionStatusOutput = z.output<typeof ConnectionStatusSchema>;