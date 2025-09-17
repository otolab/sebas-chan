/**
 * RetryManager - Exponential backoff retry logic
 * T029: 指数バックオフを使用したリトライロジック実装
 */

import pRetry, { AbortError, Options as PRetryOptions } from 'p-retry';
import winston from 'winston';

/**
 * リトライ設定
 */
export interface RetryConfig {
  /**
   * 最大リトライ回数
   */
  maxAttempts?: number;

  /**
   * 初期待機時間（ミリ秒）
   */
  initialDelay?: number;

  /**
   * 最大待機時間（ミリ秒）
   */
  maxDelay?: number;

  /**
   * バックオフ係数
   */
  factor?: number;

  /**
   * ジッターを追加するか
   */
  jitter?: boolean;

  /**
   * リトライ可能なエラーを判定する関数
   */
  isRetryable?: (error: Error) => boolean;

  /**
   * タイムアウト（ミリ秒）
   */
  timeout?: number;

  /**
   * ロガー
   */
  logger?: winston.Logger;
}

/**
 * リトライ統計
 */
export interface RetryStats {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  totalRetries: number;
  averageRetries: number;
  maxRetries: number;
  lastError?: Error;
  lastRetryAt?: Date;
}

/**
 * リトライコンテキスト
 */
export interface RetryContext {
  attemptNumber: number;
  retriesLeft: number;
  previousError?: Error;
  startTime: Date;
  elapsedTime: number;
}

/**
 * リトライ操作の結果
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  duration: number;
}

export class RetryManager {
  private config: Required<RetryConfig>;
  private logger: winston.Logger;
  private stats: RetryStats;

  constructor(config: RetryConfig = {}) {
    this.config = {
      maxAttempts: 3,
      initialDelay: 1000, // 1秒
      maxDelay: 30000, // 30秒
      factor: 2,
      jitter: true,
      isRetryable: this.defaultIsRetryable,
      timeout: 60000, // 1分
      logger: winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'RetryManager' },
        transports: [new winston.transports.Console()],
      }),
      ...config,
    };

    this.logger = this.config.logger;

    // 統計の初期化
    this.stats = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      totalRetries: 0,
      averageRetries: 0,
      maxRetries: 0,
    };
  }

  /**
   * リトライ付きで操作を実行
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation',
    customConfig?: Partial<RetryConfig>
  ): Promise<RetryResult<T>> {
    const config = { ...this.config, ...customConfig };
    const startTime = Date.now();

    let attempts = 0;
    let lastError: Error | undefined;

    const wrappedOperation = async () => {
      attempts++;
      this.stats.totalAttempts++;

      const context: RetryContext = {
        attemptNumber: attempts,
        retriesLeft: config.maxAttempts - attempts,
        previousError: lastError,
        startTime: new Date(startTime),
        elapsedTime: Date.now() - startTime,
      };

      this.logger.debug(`Executing ${operationName}`, {
        attempt: attempts,
        maxAttempts: config.maxAttempts,
      });

      try {
        const result = await this.executeWithTimeout(operation, config.timeout);

        // 成功
        this.stats.successfulAttempts++;
        this.updateStats(attempts - 1);

        this.logger.info(`${operationName} succeeded`, {
          attempts,
          duration: Date.now() - startTime,
        });

        return result;
      } catch (error) {
        lastError = error as Error;

        // リトライ可能かチェック
        if (!config.isRetryable(lastError)) {
          this.logger.warn(`${operationName} failed with non-retryable error`, {
            error: lastError.message,
            attempts,
          });
          throw new AbortError(lastError.message);
        }

        // タイムアウトチェック
        if (Date.now() - startTime > config.timeout) {
          this.logger.error(`${operationName} timed out`, {
            attempts,
            duration: Date.now() - startTime,
          });
          throw new AbortError('Operation timeout');
        }

        this.logger.warn(`${operationName} failed, will retry`, {
          error: lastError.message,
          attempt: attempts,
          retriesLeft: config.maxAttempts - attempts,
        });

        throw lastError;
      }
    };

    try {
      const options = this.buildPRetryOptions(config);
      const data = await pRetry(wrappedOperation, options);

      return {
        success: true,
        data,
        attempts,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.stats.failedAttempts++;
      this.stats.lastError = error as Error;
      this.stats.lastRetryAt = new Date();

      this.logger.error(`${operationName} failed after all retries`, {
        error: (error as Error).message,
        attempts,
        duration: Date.now() - startTime,
      });

      return {
        success: false,
        error: error as Error,
        attempts,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * バッチ操作のリトライ実行
   */
  async executeBatch<T, R>(
    items: T[],
    operation: (item: T) => Promise<R>,
    operationName: string = 'batch operation',
    config?: Partial<RetryConfig>
  ): Promise<{
    successful: Array<{ item: T; result: R }>;
    failed: Array<{ item: T; error: Error }>;
    totalDuration: number;
  }> {
    const startTime = Date.now();
    const successful: Array<{ item: T; result: R }> = [];
    const failed: Array<{ item: T; error: Error }> = [];

    for (const item of items) {
      const result = await this.execute(
        () => operation(item),
        `${operationName} (item)`,
        config
      );

      if (result.success && result.data !== undefined) {
        successful.push({ item, result: result.data });
      } else if (result.error) {
        failed.push({ item, error: result.error });
      }
    }

    const totalDuration = Date.now() - startTime;

    this.logger.info(`Batch ${operationName} completed`, {
      total: items.length,
      successful: successful.length,
      failed: failed.length,
      duration: totalDuration,
    });

    return {
      successful,
      failed,
      totalDuration,
    };
  }

  /**
   * 指数バックオフの計算
   */
  calculateDelay(attemptNumber: number): number {
    // 基本的な指数バックオフ
    let delay = Math.min(
      this.config.initialDelay * Math.pow(this.config.factor, attemptNumber - 1),
      this.config.maxDelay
    );

    // ジッターの追加（±25%のランダム性）
    if (this.config.jitter) {
      const jitterRange = delay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }

    return Math.round(delay);
  }

  /**
   * 統計情報の取得
   */
  getStats(): RetryStats {
    return { ...this.stats };
  }

  /**
   * 統計のリセット
   */
  resetStats(): void {
    this.stats = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      totalRetries: 0,
      averageRetries: 0,
      maxRetries: 0,
    };
  }

  /**
   * カスタムリトライ戦略の作成
   */
  createCustomStrategy(config: RetryConfig): (operation: () => Promise<any>) => Promise<any> {
    const mergedConfig = { ...this.config, ...config };

    return async (operation: () => Promise<any>) => {
      return this.execute(operation, 'custom operation', mergedConfig);
    };
  }

  // Private methods

  private buildPRetryOptions(config: Required<RetryConfig>): PRetryOptions {
    return {
      retries: config.maxAttempts - 1, // p-retryは初回試行を含まない
      minTimeout: config.initialDelay,
      maxTimeout: config.maxDelay,
      factor: config.factor,
      randomize: config.jitter,
      onFailedAttempt: (error) => {
        this.logger.debug('Retry attempt failed', {
          attemptNumber: error.attemptNumber,
          retriesLeft: error.retriesLeft,
          error: error.message,
        });
      },
    };
  }

  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), timeout)
      ),
    ]);
  }

  private defaultIsRetryable(error: Error): boolean {
    // ネットワークエラー
    if (this.isNetworkError(error)) {
      return true;
    }

    // タイムアウトエラー
    if (error.message.includes('timeout')) {
      return true;
    }

    // 特定のエラーコード
    const retryableCodes = [
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EADDRINUSE',
      'EPIPE',
      'ENETUNREACH',
    ];

    if ((error as any).code && retryableCodes.includes((error as any).code)) {
      return true;
    }

    // HTTPステータスコード
    if ((error as any).statusCode) {
      const statusCode = (error as any).statusCode;
      // 429 (Too Many Requests), 502 (Bad Gateway), 503 (Service Unavailable), 504 (Gateway Timeout)
      return [429, 502, 503, 504].includes(statusCode);
    }

    return false;
  }

  private isNetworkError(error: Error): boolean {
    const networkErrorPatterns = [
      'fetch failed',
      'network',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'socket hang up',
    ];

    const errorMessage = error.message.toLowerCase();
    return networkErrorPatterns.some(pattern =>
      errorMessage.includes(pattern.toLowerCase())
    );
  }

  private updateStats(retries: number): void {
    this.stats.totalRetries += retries;

    if (retries > this.stats.maxRetries) {
      this.stats.maxRetries = retries;
    }

    // 平均リトライ数の計算
    if (this.stats.successfulAttempts > 0) {
      this.stats.averageRetries = this.stats.totalRetries / this.stats.successfulAttempts;
    }
  }
}

/**
 * デフォルトのリトライマネージャーインスタンス
 */
export const defaultRetryManager = new RetryManager();

/**
 * 便利なヘルパー関数
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config?: RetryConfig
): Promise<T> {
  const manager = new RetryManager(config);
  const result = await manager.execute(operation);

  if (result.success && result.data !== undefined) {
    return result.data;
  }

  throw result.error || new Error('Operation failed');
}

/**
 * 条件付きリトライ
 */
export async function retryWhile<T>(
  operation: () => Promise<T>,
  condition: (result: T) => boolean,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await operation();

    if (!condition(result)) {
      return result;
    }

    if (i < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Condition not met after ${maxAttempts} attempts`);
}