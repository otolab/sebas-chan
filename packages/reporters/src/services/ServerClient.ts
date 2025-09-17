/**
 * ServerClient - API communication with sebas-chan server
 * T028: サーバーAPI通信クライアント実装
 */

import winston from 'winston';
import { Event } from '../models/Event';
import { ConnectionStatus } from '../models/ConnectionStatus';

/**
 * API応答インターフェース
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

/**
 * バッチ送信結果
 */
export interface BatchSendResult {
  successful: string[]; // 成功したイベントID
  failed: Array<{
    id: string;
    error: string;
  }>;
  totalSent: number;
  totalFailed: number;
}

/**
 * サーバー設定
 */
export interface ServerConfig {
  baseUrl: string;
  timeout?: number;
  maxBatchSize?: number;
  headers?: Record<string, string>;
  retryOnFailure?: boolean;
  logger?: winston.Logger;
}

/**
 * ヘルスチェック応答
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  services?: {
    database: boolean;
    cache: boolean;
    queue: boolean;
  };
}

export class ServerClient {
  private config: Required<ServerConfig>;
  private logger: winston.Logger;
  private connectionStatus: ConnectionStatus;
  private requestInProgress: boolean = false;

  constructor(config: ServerConfig) {
    this.config = {
      timeout: 30000, // 30秒
      maxBatchSize: 100,
      headers: {},
      retryOnFailure: true,
      logger: winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'ServerClient' },
        transports: [new winston.transports.Console()],
      }),
      ...config,
    };

    this.logger = this.config.logger;

    // 接続ステータスの初期化
    this.connectionStatus = new ConnectionStatus({
      targetId: 'sebas-server',
      targetType: 'server',
    });
  }

  /**
   * ヘルスチェック
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    try {
      const response = await this.request<HealthCheckResponse>(
        'GET',
        '/health'
      );

      if (response.success && response.data) {
        this.connectionStatus.markSuccess();
        return response.data;
      }

      throw new Error('Invalid health check response');
    } catch (error) {
      this.connectionStatus.markError(error as Error);
      throw error;
    }
  }

  /**
   * 単一イベントの送信
   */
  async sendEvent(event: Event): Promise<boolean> {
    try {
      this.logger.debug('Sending single event', { eventId: event.getId() });

      const response = await this.request<{ eventId: string }>(
        'POST',
        '/events',
        event.toJSON()
      );

      if (response.success) {
        this.connectionStatus.markSuccess();
        this.logger.info('Event sent successfully', { eventId: event.getId() });
        return true;
      }

      this.handleApiError(response);
      return false;
    } catch (error) {
      this.connectionStatus.markError(error as Error);
      this.logger.error('Failed to send event', {
        eventId: event.getId(),
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * バッチイベント送信
   */
  async sendBatch(events: Event[]): Promise<BatchSendResult> {
    const result: BatchSendResult = {
      successful: [],
      failed: [],
      totalSent: 0,
      totalFailed: 0,
    };

    if (events.length === 0) {
      return result;
    }

    try {
      // バッチサイズで分割
      const batches = this.splitIntoBatches(events, this.config.maxBatchSize);

      for (const batch of batches) {
        const batchResult = await this.sendSingleBatch(batch);
        result.successful.push(...batchResult.successful);
        result.failed.push(...batchResult.failed);
      }

      result.totalSent = result.successful.length;
      result.totalFailed = result.failed.length;

      if (result.totalSent > 0) {
        this.connectionStatus.markSuccess();
      }

      this.logger.info('Batch send completed', {
        totalSent: result.totalSent,
        totalFailed: result.totalFailed
      });

      return result;
    } catch (error) {
      this.connectionStatus.markError(error as Error);

      // 全て失敗扱い
      for (const event of events) {
        result.failed.push({
          id: event.getId(),
          error: (error as Error).message
        });
      }

      result.totalFailed = events.length;
      return result;
    }
  }

  /**
   * イベントの検証
   */
  async validateEvent(event: Event): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const response = await this.request<{ valid: boolean; errors?: string[] }>(
        'POST',
        '/events/validate',
        event.toJSON()
      );

      if (response.success && response.data) {
        return response.data;
      }

      return { valid: false, errors: ['Validation request failed'] };
    } catch (error) {
      this.logger.error('Event validation failed', {
        eventId: event.getId(),
        error: (error as Error).message
      });
      return { valid: false, errors: [(error as Error).message] };
    }
  }

  /**
   * サーバー情報の取得
   */
  async getServerInfo(): Promise<{
    version: string;
    features: string[];
    limits: {
      maxBatchSize: number;
      maxEventSize: number;
      rateLimit: number;
    };
  }> {
    try {
      const response = await this.request('GET', '/info');

      if (response.success && response.data) {
        this.connectionStatus.markSuccess();
        return response.data;
      }

      throw new Error('Failed to get server info');
    } catch (error) {
      this.connectionStatus.markError(error as Error);
      throw error;
    }
  }

  /**
   * 接続ステータスの取得
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * 接続テスト
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * サーバー接続のチェック
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await this.checkHealth();
      this.updateConnectionStatus(true);
      return response.status === 'healthy';
    } catch (error) {
      this.updateConnectionStatus(false, error as Error);
      return false;
    }
  }

  /**
   * 接続ステータスの取得
   */
  async getConnectionStatus(): Promise<{
    isConnected: boolean;
    lastCheckAt?: string;
    lastSuccessAt?: string;
    lastErrorAt?: string;
    lastError?: string;
    errorCount: number;
  }> {
    return {
      isConnected: this.connectionStatus.isConnected,
      lastCheckAt: this.connectionStatus.lastCheckAt?.toISOString(),
      lastSuccessAt: this.connectionStatus.lastSuccessAt?.toISOString(),
      lastErrorAt: this.connectionStatus.lastErrorAt?.toISOString(),
      lastError: this.connectionStatus.lastError,
      errorCount: this.connectionStatus.errorCount,
    };
  }

  /**
   * 送信中のイベントを取得
   */
  async getSendingEvents(): Promise<Event[]> {
    // TODO: 実際の送信中イベントのトラッキング実装
    return [];
  }

  /**
   * クライアントのクローズ
   */
  async close(): Promise<void> {
    // 進行中のリクエストを待つ
    while (this.requestInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.info('ServerClient closed');
  }

  // Private methods

  private async request<T = any>(
    method: string,
    path: string,
    body?: any
  ): Promise<ApiResponse<T>> {
    this.requestInProgress = true;

    try {
      const url = `${this.config.baseUrl}${path}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        signal: controller.signal,
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      this.logger.debug('Making API request', { method, path });

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: data.message || response.statusText,
            details: data,
          },
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if ((error as any).name === 'AbortError') {
        throw new Error('Request timeout');
      }

      throw error;
    } finally {
      this.requestInProgress = false;
    }
  }

  private async sendSingleBatch(events: Event[]): Promise<BatchSendResult> {
    const result: BatchSendResult = {
      successful: [],
      failed: [],
      totalSent: 0,
      totalFailed: 0,
    };

    try {
      const payload = {
        events: events.map(e => e.toJSON()),
        batchId: this.generateBatchId(),
        timestamp: new Date().toISOString(),
      };

      const response = await this.request<{
        results: Array<{
          id: string;
          success: boolean;
          error?: string;
        }>;
      }>('POST', '/events/batch', payload);

      if (response.success && response.data) {
        for (const item of response.data.results) {
          if (item.success) {
            result.successful.push(item.id);
          } else {
            result.failed.push({
              id: item.id,
              error: item.error || 'Unknown error',
            });
          }
        }
      } else {
        // バッチ全体が失敗
        for (const event of events) {
          result.failed.push({
            id: event.getId(),
            error: response.error?.message || 'Batch request failed',
          });
        }
      }
    } catch (error) {
      // ネットワークエラーなど
      for (const event of events) {
        result.failed.push({
          id: event.getId(),
          error: (error as Error).message,
        });
      }
    }

    result.totalSent = result.successful.length;
    result.totalFailed = result.failed.length;

    return result;
  }

  private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private generateBatchId(): string {
    return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleApiError(response: ApiResponse): void {
    if (response.error) {
      const error = new Error(response.error.message);
      (error as any).code = response.error.code;
      (error as any).details = response.error.details;
      throw error;
    }
  }

  /**
   * リトライ判定
   */
  isRetryableError(error: Error): boolean {
    // ネットワークエラー
    if (error.message.includes('fetch')) {
      return true;
    }

    // タイムアウト
    if (error.message.includes('timeout')) {
      return true;
    }

    // 特定のHTTPステータスコード
    const code = (error as any).code;
    if (code) {
      const retryableCodes = ['HTTP_429', 'HTTP_502', 'HTTP_503', 'HTTP_504'];
      return retryableCodes.includes(code);
    }

    return false;
  }

  /**
   * 統計情報
   */
  getStats(): {
    isConnected: boolean;
    lastSuccessAt?: Date;
    lastErrorAt?: Date;
    errorCount: number;
    successRate: number;
  } {
    const status = this.connectionStatus;
    const totalAttempts = status.getSuccessCount() + status.getErrorCount();
    const successRate = totalAttempts > 0
      ? (status.getSuccessCount() / totalAttempts) * 100
      : 0;

    return {
      isConnected: status.isConnected(),
      lastSuccessAt: status.getLastSuccessAt(),
      lastErrorAt: status.getLastErrorAt(),
      errorCount: status.getErrorCount(),
      successRate: Math.round(successRate * 100) / 100,
    };
  }
}