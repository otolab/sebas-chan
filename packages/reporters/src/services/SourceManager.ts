/**
 * SourceManager - Event source management
 * T030: イベントソース管理の実装
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import winston from 'winston';
import { EventSource, SourceType, SourceStatus, SourceConfig } from '../models/EventSource';
import { EventCollector } from './EventCollector';

/**
 * ソース管理設定
 */
export interface SourceManagerConfig {
  configPath: string;
  maxSources?: number;
  autoStart?: boolean;
  watchConfig?: boolean;
  logger?: winston.Logger;
}

/**
 * ソースフィルター
 */
export interface SourceFilter {
  type?: SourceType;
  status?: SourceStatus;
  name?: string;
  tags?: string[];
}

/**
 * ソース統計
 */
export interface SourceStats {
  total: number;
  byType: Record<SourceType, number>;
  byStatus: Record<SourceStatus, number>;
  lastUpdated: Date;
}

/**
 * ソース検証結果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class SourceManager {
  private config: Required<SourceManagerConfig>;
  private logger: winston.Logger;
  private sources: Map<string, EventSource> = new Map();
  private eventCollector: EventCollector;
  private configWatcher?: NodeJS.Timer;
  private isInitialized: boolean = false;

  constructor(
    config: SourceManagerConfig,
    eventCollector: EventCollector
  ) {
    this.config = {
      maxSources: 100,
      autoStart: true,
      watchConfig: false,
      logger: winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'SourceManager' },
        transports: [new winston.transports.Console()],
      }),
      ...config,
    };

    this.logger = this.config.logger;
    this.eventCollector = eventCollector;
  }

  /**
   * マネージャーの初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.logger.info('Initializing SourceManager', {
      configPath: this.config.configPath
    });

    // 設定ディレクトリの作成
    const configDir = path.dirname(this.config.configPath);
    await this.ensureDirectoryExists(configDir);

    // 既存の設定を読み込み
    await this.loadSources();

    // 設定ファイルの監視を開始
    if (this.config.watchConfig) {
      this.startConfigWatcher();
    }

    // 自動起動が有効な場合
    if (this.config.autoStart) {
      await this.startActiveSources();
    }

    this.isInitialized = true;
    this.logger.info('SourceManager initialized', {
      sourcesLoaded: this.sources.size
    });
  }

  /**
   * ソースの追加
   */
  async addSource(sourceConfig: SourceConfig): Promise<EventSource> {
    // バリデーション
    const validation = this.validateSourceConfig(sourceConfig);
    if (!validation.valid) {
      throw new Error(`Invalid source configuration: ${validation.errors.join(', ')}`);
    }

    // 最大数チェック
    if (this.sources.size >= this.config.maxSources) {
      throw new Error(`Maximum number of sources (${this.config.maxSources}) reached`);
    }

    // 重複チェック
    if (this.sources.has(sourceConfig.id)) {
      throw new Error(`Source with ID '${sourceConfig.id}' already exists`);
    }

    // ソースの作成
    const source = new EventSource(sourceConfig);

    // EventCollectorに登録
    await this.eventCollector.addSource(source);

    // 保存
    this.sources.set(source.getId(), source);
    await this.saveSources();

    this.logger.info('Source added', {
      id: source.getId(),
      name: source.getName(),
      type: source.getType()
    });

    return source;
  }

  /**
   * ソースの更新
   */
  async updateSource(
    sourceId: string,
    updates: Partial<SourceConfig>
  ): Promise<EventSource> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source '${sourceId}' not found`);
    }

    // 現在の設定とマージ
    const currentConfig = source.toJSON();
    const newConfig = { ...currentConfig, ...updates };

    // バリデーション
    const validation = this.validateSourceConfig(newConfig);
    if (!validation.valid) {
      throw new Error(`Invalid source configuration: ${validation.errors.join(', ')}`);
    }

    // 一旦停止
    const wasActive = source.getStatus() === 'active';
    if (wasActive) {
      await this.stopSource(sourceId);
    }

    // 更新
    source.updateConfig(updates.config || {});
    if (updates.name) source.setName(updates.name);
    if (updates.filters) source.setFilters(updates.filters);

    // 再起動
    if (wasActive && this.config.autoStart) {
      await this.startSource(sourceId);
    }

    // 保存
    await this.saveSources();

    this.logger.info('Source updated', {
      id: sourceId,
      updates: Object.keys(updates)
    });

    return source;
  }

  /**
   * ソースの削除
   */
  async removeSource(sourceId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) {
      return;
    }

    // 停止
    if (source.getStatus() === 'active') {
      await this.stopSource(sourceId);
    }

    // EventCollectorから削除
    await this.eventCollector.removeSource(sourceId);

    // 削除
    this.sources.delete(sourceId);
    await this.saveSources();

    this.logger.info('Source removed', { id: sourceId });
  }

  /**
   * ソースの取得
   */
  getSource(sourceId: string): EventSource | undefined {
    return this.sources.get(sourceId);
  }

  /**
   * すべてのソースを取得
   */
  getAllSources(filter?: SourceFilter): EventSource[] {
    let sources = Array.from(this.sources.values());

    if (filter) {
      sources = this.filterSources(sources, filter);
    }

    return sources;
  }

  /**
   * ソースの開始
   */
  async startSource(sourceId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source '${sourceId}' not found`);
    }

    if (source.getStatus() === 'active') {
      return;
    }

    source.setStatus('active');
    await this.saveSources();

    this.logger.info('Source started', { id: sourceId });
  }

  /**
   * ソースの停止
   */
  async stopSource(sourceId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source '${sourceId}' not found`);
    }

    if (source.getStatus() === 'inactive') {
      return;
    }

    source.setStatus('inactive');
    await this.saveSources();

    this.logger.info('Source stopped', { id: sourceId });
  }

  /**
   * すべてのソースを開始
   */
  async startAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const source of this.sources.values()) {
      if (source.getStatus() === 'inactive') {
        promises.push(this.startSource(source.getId()));
      }
    }

    await Promise.all(promises);
    this.logger.info('All sources started', { count: promises.length });
  }

  /**
   * すべてのソースを停止
   */
  async stopAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const source of this.sources.values()) {
      if (source.getStatus() === 'active') {
        promises.push(this.stopSource(source.getId()));
      }
    }

    await Promise.all(promises);
    this.logger.info('All sources stopped', { count: promises.length });
  }

  /**
   * ソースの再起動
   */
  async restartSource(sourceId: string): Promise<void> {
    await this.stopSource(sourceId);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
    await this.startSource(sourceId);
  }

  /**
   * 統計情報の取得
   */
  getStats(): SourceStats {
    const stats: SourceStats = {
      total: this.sources.size,
      byType: {
        webhook: 0,
        polling: 0,
        stream: 0,
      },
      byStatus: {
        active: 0,
        inactive: 0,
        error: 0,
      },
      lastUpdated: new Date(),
    };

    for (const source of this.sources.values()) {
      stats.byType[source.getType()]++;
      stats.byStatus[source.getStatus()]++;
    }

    return stats;
  }

  /**
   * ソース設定の検証
   */
  validateSourceConfig(config: SourceConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 必須フィールドのチェック
    if (!config.id) {
      errors.push('ID is required');
    } else if (!/^[a-zA-Z0-9-_]+$/.test(config.id)) {
      errors.push('ID must contain only alphanumeric characters, hyphens, and underscores');
    }

    if (!config.name) {
      errors.push('Name is required');
    } else if (config.name.length > 100) {
      errors.push('Name must be 100 characters or less');
    }

    if (!config.type) {
      errors.push('Type is required');
    } else if (!['webhook', 'polling', 'stream'].includes(config.type)) {
      errors.push('Type must be webhook, polling, or stream');
    }

    // タイプ別の検証
    if (config.type === 'polling') {
      if (!config.config?.interval) {
        warnings.push('Polling interval not specified, using default');
      } else if (config.config.interval < 1000) {
        errors.push('Polling interval must be at least 1000ms');
      }
    }

    if (config.config?.endpoint) {
      try {
        new URL(config.config.endpoint);
      } catch {
        errors.push('Invalid endpoint URL');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * ソースの複製
   */
  async cloneSource(
    sourceId: string,
    newId: string,
    newName?: string
  ): Promise<EventSource> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source '${sourceId}' not found`);
    }

    const config = source.toJSON();
    config.id = newId;
    config.name = newName || `${config.name} (Copy)`;
    config.status = 'inactive'; // 複製は非アクティブで作成

    return this.addSource(config);
  }

  /**
   * エクスポート
   */
  async exportSources(): Promise<string> {
    const sources = Array.from(this.sources.values())
      .map(source => source.toJSON());

    return JSON.stringify(sources, null, 2);
  }

  /**
   * インポート
   */
  async importSources(
    data: string,
    options: { replace?: boolean; merge?: boolean } = {}
  ): Promise<{ imported: number; skipped: number }> {
    const sources = JSON.parse(data) as SourceConfig[];
    let imported = 0;
    let skipped = 0;

    if (options.replace) {
      // 既存のソースをすべて削除
      await this.stopAll();
      this.sources.clear();
    }

    for (const sourceConfig of sources) {
      try {
        if (this.sources.has(sourceConfig.id)) {
          if (options.merge) {
            await this.updateSource(sourceConfig.id, sourceConfig);
            imported++;
          } else {
            skipped++;
          }
        } else {
          await this.addSource(sourceConfig);
          imported++;
        }
      } catch (error) {
        this.logger.warn('Failed to import source', {
          id: sourceConfig.id,
          error: (error as Error).message
        });
        skipped++;
      }
    }

    return { imported, skipped };
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    // 設定ファイルの監視を停止
    if (this.configWatcher) {
      clearInterval(this.configWatcher);
      this.configWatcher = undefined;
    }

    // すべてのソースを停止
    await this.stopAll();

    this.logger.info('SourceManager cleaned up');
  }

  // Private methods

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create directory', { path: dirPath, error });
      throw error;
    }
  }

  private async loadSources(): Promise<void> {
    try {
      const data = await fs.readFile(this.config.configPath, 'utf-8');
      const configs = JSON.parse(data) as SourceConfig[];

      for (const config of configs) {
        try {
          const source = new EventSource(config);
          this.sources.set(source.getId(), source);
          await this.eventCollector.addSource(source);
        } catch (error) {
          this.logger.warn('Failed to load source', {
            id: config.id,
            error: (error as Error).message
          });
        }
      }

      this.logger.info('Sources loaded', { count: this.sources.size });
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // ファイルが存在しない場合は空の設定を作成
        await this.saveSources();
      } else {
        this.logger.error('Failed to load sources', { error });
        throw error;
      }
    }
  }

  private async saveSources(): Promise<void> {
    const configs = Array.from(this.sources.values())
      .map(source => source.toJSON());

    const data = JSON.stringify(configs, null, 2);
    await fs.writeFile(this.config.configPath, data, 'utf-8');

    this.logger.debug('Sources saved', { count: configs.length });
  }

  private startConfigWatcher(): void {
    this.configWatcher = setInterval(async () => {
      try {
        await this.reloadSources();
      } catch (error) {
        this.logger.error('Failed to reload sources', { error });
      }
    }, 5000); // 5秒ごとにチェック
  }

  private async reloadSources(): Promise<void> {
    try {
      const data = await fs.readFile(this.config.configPath, 'utf-8');
      const configs = JSON.parse(data) as SourceConfig[];

      // 変更検出と適用
      const configMap = new Map(configs.map(c => [c.id, c]));

      // 削除されたソース
      for (const sourceId of this.sources.keys()) {
        if (!configMap.has(sourceId)) {
          await this.removeSource(sourceId);
        }
      }

      // 追加または更新されたソース
      for (const config of configs) {
        const existing = this.sources.get(config.id);
        if (!existing) {
          await this.addSource(config);
        } else if (JSON.stringify(existing.toJSON()) !== JSON.stringify(config)) {
          await this.updateSource(config.id, config);
        }
      }
    } catch (error) {
      // 設定ファイルの読み込みエラーは無視
    }
  }

  private filterSources(sources: EventSource[], filter: SourceFilter): EventSource[] {
    return sources.filter(source => {
      if (filter.type && source.getType() !== filter.type) {
        return false;
      }

      if (filter.status && source.getStatus() !== filter.status) {
        return false;
      }

      if (filter.name && !source.getName().includes(filter.name)) {
        return false;
      }

      // TODO: タグフィルターの実装

      return true;
    });
  }

  private async startActiveSources(): Promise<void> {
    const activeSources = this.getAllSources({ status: 'active' });

    for (const source of activeSources) {
      try {
        await this.eventCollector.addSource(source);
      } catch (error) {
        this.logger.error('Failed to start source', {
          id: source.getId(),
          error: (error as Error).message
        });
        source.setStatus('error');
      }
    }
  }
}