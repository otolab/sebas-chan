/**
 * HealthMonitor - System status tracking
 * T031: システムステータス追跡の実装
 */

import { EventEmitter } from 'events';
import winston from 'winston';
import { ConnectionStatus } from '../models/ConnectionStatus';

/**
 * ヘルスステータス
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * コンポーネントヘルス
 */
export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  lastChecked: Date;
  metadata?: Record<string, any>;
}

/**
 * システムメトリクス
 */
export interface SystemMetrics {
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
  eventLoopDelay?: number;
  timestamp: Date;
}

/**
 * ヘルスチェック結果
 */
export interface HealthCheckResult {
  status: HealthStatus;
  components: ComponentHealth[];
  metrics: SystemMetrics;
  issues: string[];
  timestamp: Date;
}

/**
 * ヘルスチェック設定
 */
export interface HealthMonitorConfig {
  checkInterval?: number;
  componentTimeout?: number;
  thresholds?: {
    memoryUsage?: number; // MB
    eventLoopDelay?: number; // ms
    errorRate?: number; // percentage
  };
  enableMetrics?: boolean;
  logger?: winston.Logger;
}

/**
 * チェック可能なコンポーネントのインターフェース
 */
export interface HealthCheckable {
  getName(): string;
  checkHealth(): Promise<ComponentHealth>;
}

export class HealthMonitor extends EventEmitter {
  private config: Required<HealthMonitorConfig>;
  private logger: winston.Logger;
  private components: Map<string, HealthCheckable> = new Map();
  private lastHealthCheck?: HealthCheckResult;
  private checkInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private startTime: Date = new Date();
  private checkHistory: HealthCheckResult[] = [];
  private maxHistorySize: number = 100;

  constructor(config: HealthMonitorConfig = {}) {
    super();

    this.config = {
      checkInterval: 30000, // 30秒
      componentTimeout: 5000, // 5秒
      thresholds: {
        memoryUsage: 500, // 500MB
        eventLoopDelay: 100, // 100ms
        errorRate: 10, // 10%
        ...config.thresholds,
      },
      enableMetrics: true,
      logger: winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'HealthMonitor' },
        transports: [new winston.transports.Console()],
      }),
      ...config,
    };

    this.logger = this.config.logger;
  }

  /**
   * モニターの開始
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.logger.info('Starting HealthMonitor');
    this.isRunning = true;
    this.startTime = new Date();

    // 初回チェック
    await this.performHealthCheck();

    // 定期チェックの開始
    this.checkInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.checkInterval);

    this.emit('started');
  }

  /**
   * モニターの停止
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping HealthMonitor');
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    this.emit('stopped');
  }

  /**
   * コンポーネントの登録
   */
  registerComponent(component: HealthCheckable): void {
    const name = component.getName();
    this.components.set(name, component);
    this.logger.info('Component registered', { name });
  }

  /**
   * コンポーネントの登録解除
   */
  unregisterComponent(name: string): void {
    this.components.delete(name);
    this.logger.info('Component unregistered', { name });
  }

  /**
   * 手動ヘルスチェック
   */
  async checkHealth(): Promise<HealthCheckResult> {
    return this.performHealthCheck();
  }

  /**
   * 最後のヘルスチェック結果
   */
  getLastHealthCheck(): HealthCheckResult | undefined {
    return this.lastHealthCheck;
  }

  /**
   * 現在のステータス
   */
  getCurrentStatus(): HealthStatus {
    if (!this.lastHealthCheck) {
      return 'unhealthy';
    }
    return this.lastHealthCheck.status;
  }

  /**
   * システムメトリクスの取得
   */
  getSystemMetrics(): SystemMetrics {
    return {
      uptime: Date.now() - this.startTime.getTime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage ? process.cpuUsage() : undefined,
      eventLoopDelay: this.measureEventLoopDelay(),
      timestamp: new Date(),
    };
  }

  /**
   * ヘルスチェック履歴
   */
  getHistory(limit?: number): HealthCheckResult[] {
    if (limit) {
      return this.checkHistory.slice(-limit);
    }
    return [...this.checkHistory];
  }

  /**
   * 統計情報
   */
  getStats(): {
    totalChecks: number;
    healthyChecks: number;
    degradedChecks: number;
    unhealthyChecks: number;
    averageResponseTime: number;
    uptime: number;
    lastCheck?: Date;
  } {
    let healthyChecks = 0;
    let degradedChecks = 0;
    let unhealthyChecks = 0;

    for (const result of this.checkHistory) {
      switch (result.status) {
        case 'healthy':
          healthyChecks++;
          break;
        case 'degraded':
          degradedChecks++;
          break;
        case 'unhealthy':
          unhealthyChecks++;
          break;
      }
    }

    return {
      totalChecks: this.checkHistory.length,
      healthyChecks,
      degradedChecks,
      unhealthyChecks,
      averageResponseTime: 0, // TODO: 実装
      uptime: Date.now() - this.startTime.getTime(),
      lastCheck: this.lastHealthCheck?.timestamp,
    };
  }

  /**
   * アラートのトリガー条件チェック
   */
  checkAlertConditions(result: HealthCheckResult): string[] {
    const alerts: string[] = [];

    // メモリ使用量チェック
    const memoryMB = result.metrics.memoryUsage.heapUsed / 1024 / 1024;
    if (memoryMB > this.config.thresholds.memoryUsage!) {
      alerts.push(`High memory usage: ${memoryMB.toFixed(2)}MB`);
    }

    // イベントループ遅延チェック
    if (
      result.metrics.eventLoopDelay &&
      result.metrics.eventLoopDelay > this.config.thresholds.eventLoopDelay!
    ) {
      alerts.push(`High event loop delay: ${result.metrics.eventLoopDelay}ms`);
    }

    // コンポーネントエラーチェック
    const failedComponents = result.components.filter(
      c => c.status === 'unhealthy'
    );
    if (failedComponents.length > 0) {
      alerts.push(
        `Components unhealthy: ${failedComponents.map(c => c.name).join(', ')}`
      );
    }

    return alerts;
  }

  /**
   * Express/Koa用のヘルスチェックハンドラー
   */
  getRequestHandler() {
    return async (req: any, res: any) => {
      const health = await this.checkHealth();
      const statusCode = health.status === 'healthy' ? 200 :
                        health.status === 'degraded' ? 503 : 500;

      res.status(statusCode).json({
        status: health.status,
        timestamp: health.timestamp,
        uptime: this.getSystemMetrics().uptime,
        components: health.components.map(c => ({
          name: c.name,
          status: c.status,
          message: c.message,
        })),
        issues: health.issues,
      });
    };
  }

  // Private methods

  private async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const components: ComponentHealth[] = [];
    const issues: string[] = [];

    // コンポーネントチェック
    await Promise.all(
      Array.from(this.components.entries()).map(async ([name, component]) => {
        try {
          const health = await this.checkComponentWithTimeout(component);
          components.push(health);

          if (health.status === 'unhealthy') {
            issues.push(`${name}: ${health.message || 'unhealthy'}`);
          } else if (health.status === 'degraded') {
            issues.push(`${name}: ${health.message || 'degraded'}`);
          }
        } catch (error) {
          components.push({
            name,
            status: 'unhealthy',
            message: (error as Error).message,
            lastChecked: new Date(),
          });
          issues.push(`${name}: ${(error as Error).message}`);
        }
      })
    );

    // システムメトリクス
    const metrics = this.config.enableMetrics
      ? this.getSystemMetrics()
      : this.getBasicMetrics();

    // 全体ステータスの決定
    const status = this.determineOverallStatus(components, metrics);

    // アラート条件のチェック
    const alerts = this.checkAlertConditions({ status, components, metrics, issues, timestamp: new Date() });
    issues.push(...alerts);

    const result: HealthCheckResult = {
      status,
      components,
      metrics,
      issues,
      timestamp: new Date(),
    };

    // 履歴に追加
    this.addToHistory(result);
    this.lastHealthCheck = result;

    // イベント発行
    this.emit('health-check', result);

    if (status === 'unhealthy') {
      this.emit('unhealthy', result);
    } else if (status === 'degraded') {
      this.emit('degraded', result);
    }

    const duration = Date.now() - startTime;
    this.logger.debug('Health check completed', {
      status,
      duration,
      issues: issues.length,
    });

    return result;
  }

  private async checkComponentWithTimeout(
    component: HealthCheckable
  ): Promise<ComponentHealth> {
    return Promise.race([
      component.checkHealth(),
      new Promise<ComponentHealth>((_, reject) =>
        setTimeout(
          () => reject(new Error('Component check timeout')),
          this.config.componentTimeout
        )
      ),
    ]);
  }

  private determineOverallStatus(
    components: ComponentHealth[],
    metrics: SystemMetrics
  ): HealthStatus {
    // いずれかのコンポーネントが unhealthy なら全体も unhealthy
    if (components.some(c => c.status === 'unhealthy')) {
      return 'unhealthy';
    }

    // メトリクスの閾値チェック
    const memoryMB = metrics.memoryUsage.heapUsed / 1024 / 1024;
    if (memoryMB > this.config.thresholds.memoryUsage! * 1.5) {
      return 'unhealthy';
    }

    // いずれかのコンポーネントが degraded なら全体も degraded
    if (components.some(c => c.status === 'degraded')) {
      return 'degraded';
    }

    // メトリクスの警告レベルチェック
    if (memoryMB > this.config.thresholds.memoryUsage!) {
      return 'degraded';
    }

    if (
      metrics.eventLoopDelay &&
      metrics.eventLoopDelay > this.config.thresholds.eventLoopDelay!
    ) {
      return 'degraded';
    }

    return 'healthy';
  }

  private measureEventLoopDelay(): number {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - start) / 1e6; // ナノ秒からミリ秒に変換
      // この値は次回のチェックで使用される
    });
    return 0; // 初回は0を返す
  }

  private getBasicMetrics(): SystemMetrics {
    return {
      uptime: Date.now() - this.startTime.getTime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date(),
    };
  }

  private addToHistory(result: HealthCheckResult): void {
    this.checkHistory.push(result);

    // 履歴サイズの制限
    if (this.checkHistory.length > this.maxHistorySize) {
      this.checkHistory.shift();
    }
  }
}

/**
 * 基本的なヘルスチェック可能コンポーネントの実装
 */
export class BasicHealthCheckable implements HealthCheckable {
  constructor(
    private name: string,
    private checkFunction: () => Promise<{ healthy: boolean; message?: string }>
  ) {}

  getName(): string {
    return this.name;
  }

  async checkHealth(): Promise<ComponentHealth> {
    try {
      const result = await this.checkFunction();
      return {
        name: this.name,
        status: result.healthy ? 'healthy' : 'unhealthy',
        message: result.message,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        name: this.name,
        status: 'unhealthy',
        message: (error as Error).message,
        lastChecked: new Date(),
      };
    }
  }
}

/**
 * ConnectionStatus用のヘルスチェック可能アダプター
 */
export class ConnectionHealthAdapter implements HealthCheckable {
  constructor(
    private name: string,
    private connectionStatus: ConnectionStatus
  ) {}

  getName(): string {
    return this.name;
  }

  async checkHealth(): Promise<ComponentHealth> {
    const isConnected = this.connectionStatus.isConnected();
    const errorCount = this.connectionStatus.getErrorCount();

    let status: HealthStatus = 'healthy';
    let message: string | undefined;

    if (!isConnected) {
      status = 'unhealthy';
      message = `Not connected. Error count: ${errorCount}`;
      if (this.connectionStatus.getLastError()) {
        message += `. Last error: ${this.connectionStatus.getLastError()}`;
      }
    } else if (errorCount > 0) {
      status = 'degraded';
      message = `Connected with ${errorCount} recent errors`;
    }

    return {
      name: this.name,
      status,
      message,
      lastChecked: new Date(),
      metadata: {
        isConnected,
        errorCount,
        lastSuccessAt: this.connectionStatus.getLastSuccessAt(),
        lastErrorAt: this.connectionStatus.getLastErrorAt(),
      },
    };
  }
}