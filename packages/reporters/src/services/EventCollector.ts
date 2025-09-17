/**
 * EventCollector - Gathering events from sources
 * T027: イベント収集ロジック（プラグインベース）
 */

import { EventEmitter } from 'events';
import winston from 'winston';
import { Event, EventType } from '../models/Event';
import { EventSource, SourceType, SourceStatus } from '../models/EventSource';

/**
 * コレクタープラグインのインターフェース
 */
export interface CollectorPlugin {
  name: string;
  type: SourceType;

  /**
   * プラグインの初期化
   */
  initialize(config: any): Promise<void>;

  /**
   * イベント収集の開始
   */
  start(): Promise<void>;

  /**
   * イベント収集の停止
   */
  stop(): Promise<void>;

  /**
   * プラグインの状態取得
   */
  getStatus(): SourceStatus;

  /**
   * イベントエミッター（新しいイベントを通知）
   */
  on(event: 'event', listener: (event: Event) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'status', listener: (status: SourceStatus) => void): this;
}

/**
 * 基底コレクタークラス
 */
export abstract class BaseCollectorPlugin extends EventEmitter implements CollectorPlugin {
  abstract name: string;
  abstract type: SourceType;

  protected status: SourceStatus = 'inactive';
  protected config: any;
  protected logger: winston.Logger;

  constructor(logger?: winston.Logger) {
    super();
    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      defaultMeta: { service: 'CollectorPlugin' },
      transports: [new winston.transports.Console()],
    });
  }

  async initialize(config: any): Promise<void> {
    this.config = config;
    this.logger.info(`Initializing ${this.name} collector`, { config });
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  getStatus(): SourceStatus {
    return this.status;
  }

  protected setStatus(status: SourceStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit('status', status);
      this.logger.info(`${this.name} status changed`, { status });
    }
  }

  protected emitEvent(event: Event): void {
    this.emit('event', event);
  }

  protected emitError(error: Error): void {
    this.emit('error', error);
    this.logger.error(`${this.name} error`, { error: error.message });
  }
}

/**
 * Webhookコレクター
 */
export class WebhookCollector extends BaseCollectorPlugin {
  name = 'webhook';
  type: SourceType = 'webhook';

  private server: any; // Express/HTTP server instance

  async start(): Promise<void> {
    this.setStatus('active');
    // Webhook サーバーの起動
    this.logger.info('Starting webhook server', {
      endpoint: this.config.endpoint,
      port: this.config.port || 3000
    });

    // TODO: Express サーバーの実装
    // this.server = express();
    // this.server.post(this.config.endpoint, this.handleWebhook.bind(this));
  }

  async stop(): Promise<void> {
    this.setStatus('inactive');
    if (this.server) {
      // サーバーの停止
      this.logger.info('Stopping webhook server');
      // this.server.close();
    }
  }

  private handleWebhook(data: any): void {
    try {
      const event = new Event({
        type: this.mapToEventType(data),
        sourceId: this.name,
        timestamp: new Date(),
        payload: data,
      });

      this.emitEvent(event);
    } catch (error) {
      this.emitError(error as Error);
    }
  }

  private mapToEventType(data: any): EventType {
    // データからイベントタイプを推定
    if (data.type) {
      return data.type as EventType;
    }
    return 'other';
  }
}

/**
 * ポーリングコレクター
 */
export class PollingCollector extends BaseCollectorPlugin {
  name = 'polling';
  type: SourceType = 'polling';

  private intervalId?: NodeJS.Timeout;
  private lastPollTime?: Date;

  async start(): Promise<void> {
    this.setStatus('active');
    const interval = this.config.interval || 60000; // デフォルト1分

    this.logger.info('Starting polling collector', { interval });

    // 初回実行
    await this.poll();

    // 定期実行
    this.intervalId = setInterval(async () => {
      await this.poll();
    }, interval);
  }

  async stop(): Promise<void> {
    this.setStatus('inactive');
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private async poll(): Promise<void> {
    try {
      this.logger.debug('Polling for events');

      // TODO: 実際のポーリング実装
      // const response = await fetch(this.config.endpoint);
      // const data = await response.json();

      // モックデータ
      const mockData = {
        events: [
          { id: Date.now(), message: 'Polled event' }
        ]
      };

      // 新しいイベントのみを処理
      const newEvents = this.filterNewEvents(mockData.events);

      for (const eventData of newEvents) {
        const event = new Event({
          type: 'other',
          sourceId: this.name,
          timestamp: new Date(),
          payload: eventData,
        });

        this.emitEvent(event);
      }

      this.lastPollTime = new Date();
    } catch (error) {
      this.setStatus('error');
      this.emitError(error as Error);
    }
  }

  private filterNewEvents(events: any[]): any[] {
    if (!this.lastPollTime) {
      return events;
    }

    // タイムスタンプベースのフィルタリング
    return events.filter(e => {
      const eventTime = new Date(e.timestamp || Date.now());
      return eventTime > this.lastPollTime!;
    });
  }
}

/**
 * ストリーミングコレクター
 */
export class StreamCollector extends BaseCollectorPlugin {
  name = 'stream';
  type: SourceType = 'stream';

  private connection: any; // WebSocket/SSE connection

  async start(): Promise<void> {
    this.setStatus('active');
    this.logger.info('Starting stream collector', {
      endpoint: this.config.endpoint
    });

    // TODO: WebSocket/SSE接続の実装
    // this.connection = new WebSocket(this.config.endpoint);
    // this.connection.on('message', this.handleMessage.bind(this));
    // this.connection.on('error', this.handleError.bind(this));
  }

  async stop(): Promise<void> {
    this.setStatus('inactive');
    if (this.connection) {
      this.logger.info('Closing stream connection');
      // this.connection.close();
    }
  }

  private handleMessage(data: any): void {
    try {
      const event = new Event({
        type: 'other',
        sourceId: this.name,
        timestamp: new Date(),
        payload: JSON.parse(data),
      });

      this.emitEvent(event);
    } catch (error) {
      this.emitError(error as Error);
    }
  }

  private handleError(error: Error): void {
    this.setStatus('error');
    this.emitError(error);
  }
}

/**
 * EventCollector設定
 */
export interface EventCollectorConfig {
  batchSize?: number;
  batchInterval?: number;
  plugins?: CollectorPlugin[];
  logger?: winston.Logger;
}

/**
 * EventCollectorサービス
 */
export class EventCollector {
  private plugins: Map<string, CollectorPlugin> = new Map();
  private sources: Map<string, EventSource> = new Map();
  private logger: winston.Logger;
  private eventHandlers: ((event: Event) => void)[] = [];
  private config: EventCollectorConfig;

  constructor(config: EventCollectorConfig = {}) {
    this.config = {
      batchSize: 100,
      batchInterval: 10000,
      ...config,
    };

    this.logger = config.logger || winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      defaultMeta: { service: 'EventCollector' },
      transports: [new winston.transports.Console()],
    });

    // Register initial plugins if provided
    if (config.plugins) {
      config.plugins.forEach(plugin => this.registerPlugin(plugin));
    }
  }

  /**
   * コレクタープラグインの登録
   */
  registerPlugin(plugin: CollectorPlugin): void {
    const key = `${plugin.type}:${plugin.name}`;
    this.plugins.set(key, plugin);

    // イベントリスナーの設定
    plugin.on('event', (event) => this.handleEvent(event));
    plugin.on('error', (error) => this.handleError(plugin.name, error));
    plugin.on('status', (status) => this.handleStatusChange(plugin.name, status));

    this.logger.info('Plugin registered', {
      name: plugin.name,
      type: plugin.type
    });
  }

  /**
   * イベントソースの追加
   */
  async addSource(source: EventSource): Promise<void> {
    this.sources.set(source.getId(), source);

    // 対応するプラグインを取得
    const plugin = this.getPluginForSource(source);
    if (!plugin) {
      throw new Error(`No plugin found for source type: ${source.getType()}`);
    }

    // プラグインの初期化と開始
    await plugin.initialize(source.getConfig());

    if (source.getStatus() === 'active') {
      await plugin.start();
    }

    this.logger.info('Source added', {
      id: source.getId(),
      type: source.getType()
    });
  }

  /**
   * イベントソースの削除
   */
  async removeSource(sourceId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) {
      return;
    }

    // プラグインの停止
    const plugin = this.getPluginForSource(source);
    if (plugin) {
      await plugin.stop();
    }

    this.sources.delete(sourceId);
    this.logger.info('Source removed', { id: sourceId });
  }

  /**
   * すべてのソースを開始
   */
  async startAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const source of this.sources.values()) {
      if (source.getStatus() === 'inactive') {
        const plugin = this.getPluginForSource(source);
        if (plugin) {
          source.setStatus('active');
          promises.push(plugin.start());
        }
      }
    }

    await Promise.all(promises);
    this.logger.info('All sources started');
  }

  /**
   * すべてのソースを停止
   */
  async stopAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const source of this.sources.values()) {
      if (source.getStatus() === 'active') {
        const plugin = this.getPluginForSource(source);
        if (plugin) {
          source.setStatus('inactive');
          promises.push(plugin.stop());
        }
      }
    }

    await Promise.all(promises);
    this.logger.info('All sources stopped');
  }

  /**
   * イベントハンドラーの登録
   */
  onEvent(handler: (event: Event) => void): void {
    this.eventHandlers.push(handler);
  }

  /**
   * アクティブなソースの統計
   */
  getStats(): {
    totalSources: number;
    activeSources: number;
    errorSources: number;
    collectedEvents: number;
  } {
    let activeSources = 0;
    let errorSources = 0;

    for (const source of this.sources.values()) {
      if (source.getStatus() === 'active') activeSources++;
      if (source.getStatus() === 'error') errorSources++;
    }

    return {
      totalSources: this.sources.size,
      activeSources,
      errorSources,
      collectedEvents: 0, // TODO: イベントカウンターの実装
    };
  }

  /**
   * キューに入っているイベントを取得
   */
  async getQueuedEvents(limit: number = 100): Promise<Event[]> {
    // TODO: 実際のキュー実装が必要
    // 現在は空の配列を返す
    return [];
  }

  /**
   * 新しいイベントの通知
   */
  async notifyNewEvent(event: Event): Promise<void> {
    // イベントハンドラーに通知
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        this.logger.error('Event handler error', { error });
      }
    });
  }

  // Private methods

  private getPluginForSource(source: EventSource): CollectorPlugin | undefined {
    const type = source.getType();

    // 登録されているプラグインから適切なものを検索
    for (const [key, plugin] of this.plugins) {
      if (plugin.type === type) {
        return plugin;
      }
    }

    // デフォルトプラグインの作成
    switch (type) {
      case 'webhook':
        const webhook = new WebhookCollector(this.logger);
        this.registerPlugin(webhook);
        return webhook;

      case 'polling':
        const polling = new PollingCollector(this.logger);
        this.registerPlugin(polling);
        return polling;

      case 'stream':
        const stream = new StreamCollector(this.logger);
        this.registerPlugin(stream);
        return stream;

      default:
        return undefined;
    }
  }

  private handleEvent(event: Event): void {
    this.logger.debug('Event collected', {
      id: event.getId(),
      type: event.getType(),
      sourceId: event.getSourceId()
    });

    // 登録されたハンドラーに通知
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.logger.error('Event handler error', { error });
      }
    }
  }

  private handleError(sourceName: string, error: Error): void {
    this.logger.error('Collector error', {
      source: sourceName,
      error: error.message
    });

    // ソースのステータスを更新
    for (const source of this.sources.values()) {
      if (source.getName() === sourceName) {
        source.setStatus('error');
        break;
      }
    }
  }

  private handleStatusChange(sourceName: string, status: SourceStatus): void {
    this.logger.info('Source status changed', {
      source: sourceName,
      status
    });

    // ソースのステータスを更新
    for (const source of this.sources.values()) {
      if (source.getName() === sourceName) {
        source.setStatus(status);
        source.updateLastConnectedAt();
        break;
      }
    }
  }
}