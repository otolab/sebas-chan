/**
 * BufferService - File-based persistence with JSON Lines
 * T026: ファイルベースの永続化実装（JSON Lines形式）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { createInterface } from 'readline';
import winston from 'winston';
import { FileBuffer } from '../models/FileBuffer';
import { Event } from '../models/Event';

export interface BufferServiceConfig {
  basePath: string;
  maxFileSize: number;
  maxEventsInMemory: number;
  rotationPolicy: 'size' | 'daily';
  compressionEnabled?: boolean;
  logger?: winston.Logger;
}

export class BufferService {
  private config: Required<BufferServiceConfig>;
  private logger: winston.Logger;
  private activeBuffer: FileBuffer | null = null;
  private lockFiles: Set<string> = new Set();

  constructor(config: BufferServiceConfig) {
    this.config = {
      compressionEnabled: false,
      logger: winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'BufferService' },
        transports: [new winston.transports.Console()],
      }),
      ...config,
    };
    this.logger = this.config.logger;
  }

  /**
   * サービスの初期化
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing BufferService', { basePath: this.config.basePath });

    // ベースディレクトリの作成
    await this.ensureDirectoryExists(this.config.basePath);
    await this.ensureDirectoryExists(path.join(this.config.basePath, 'buffer'));

    // 既存のバッファファイルを読み込み
    await this.loadActiveBuffer();

    this.logger.info('BufferService initialized successfully');
  }

  /**
   * イベントをバッファに追加
   */
  async addEvent(event: Event): Promise<void> {
    if (!this.activeBuffer) {
      await this.createNewBuffer();
    }

    // メモリバッファに追加
    this.activeBuffer!.addEvent(event);

    // ファイルに追記（JSON Lines形式）
    const filePath = this.activeBuffer!.getFilePath();
    const line = JSON.stringify(event.toJSON()) + '\n';

    try {
      await this.appendToFile(filePath, line);
      this.activeBuffer!.updateSize(Buffer.byteLength(line));

      // ローテーションチェック
      if (await this.shouldRotate()) {
        await this.rotateBuffer();
      }

      this.logger.debug('Event added to buffer', { eventId: event.getId() });
    } catch (error) {
      this.logger.error('Failed to add event to buffer', { error, eventId: event.getId() });
      throw error;
    }
  }

  /**
   * バッファからイベントを取得（バッチ）
   */
  async getEvents(limit: number): Promise<Event[]> {
    if (!this.activeBuffer) {
      return [];
    }

    // メモリからの取得を優先
    const memoryEvents = this.activeBuffer.getEvents(limit);
    if (memoryEvents.length >= limit) {
      return memoryEvents;
    }

    // 不足分をファイルから読み込み
    const needed = limit - memoryEvents.length;
    const fileEvents = await this.readEventsFromFile(
      this.activeBuffer.getFilePath(),
      needed,
      memoryEvents.length
    );

    return [...memoryEvents, ...fileEvents];
  }

  /**
   * 送信済みイベントを削除
   */
  async removeEvents(eventIds: string[]): Promise<void> {
    if (!this.activeBuffer) {
      return;
    }

    const idSet = new Set(eventIds);

    // メモリから削除
    this.activeBuffer.removeEvents(eventIds);

    // ファイルから削除（新しいファイルに書き換え）
    await this.rewriteBufferFile(idSet);

    this.logger.info('Events removed from buffer', { count: eventIds.length });
  }

  /**
   * バッファの統計情報を取得
   */
  async getStats(): Promise<{
    totalEvents: number;
    bufferSize: number;
    oldestEvent?: Date;
    newestEvent?: Date;
    filesCount: number;
  }> {
    const files = await this.listBufferFiles();
    let totalEvents = 0;
    let bufferSize = 0;
    let oldestEvent: Date | undefined;
    let newestEvent: Date | undefined;

    for (const file of files) {
      const filePath = path.join(this.config.basePath, 'buffer', file);
      const stats = await fs.stat(filePath);
      bufferSize += stats.size;

      const events = await this.countEventsInFile(filePath);
      totalEvents += events.count;

      if (events.oldest && (!oldestEvent || events.oldest < oldestEvent)) {
        oldestEvent = events.oldest;
      }
      if (events.newest && (!newestEvent || events.newest > newestEvent)) {
        newestEvent = events.newest;
      }
    }

    return {
      totalEvents,
      bufferSize,
      oldestEvent,
      newestEvent,
      filesCount: files.length,
    };
  }

  /**
   * デッドレターキューに移動
   */
  async moveToDeadLetter(events: Event[]): Promise<void> {
    const dlqPath = path.join(this.config.basePath, 'dead-letter');
    await this.ensureDirectoryExists(dlqPath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dlqFile = path.join(dlqPath, `failed-${timestamp}.jsonl`);

    const lines = events.map(e => JSON.stringify({
      ...e.toJSON(),
      movedToDLQ: new Date().toISOString(),
    })).join('\n') + '\n';

    await fs.writeFile(dlqFile, lines, 'utf-8');
    this.logger.warn('Events moved to dead letter queue', {
      count: events.length,
      file: dlqFile
    });
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    // ロックファイルの解放
    for (const lockFile of this.lockFiles) {
      try {
        await fs.unlink(lockFile);
      } catch (error) {
        // ロックファイルが既に削除されている場合は無視
      }
    }
    this.lockFiles.clear();

    this.logger.info('BufferService cleaned up');
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

  private async loadActiveBuffer(): Promise<void> {
    const files = await this.listBufferFiles();
    if (files.length === 0) {
      await this.createNewBuffer();
      return;
    }

    // 最新のファイルを選択
    const latestFile = files[files.length - 1];
    const filePath = path.join(this.config.basePath, 'buffer', latestFile);

    const stats = await fs.stat(filePath);
    this.activeBuffer = new FileBuffer({
      filePath,
      maxSize: this.config.maxFileSize,
      maxEventsInMemory: this.config.maxEventsInMemory,
    });

    this.activeBuffer.updateSize(stats.size);

    // 最新のイベントをメモリに読み込み
    const recentEvents = await this.readEventsFromFile(
      filePath,
      this.config.maxEventsInMemory,
      0,
      true // 最後から読む
    );

    for (const event of recentEvents) {
      this.activeBuffer.addEvent(event);
    }
  }

  private async createNewBuffer(): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `events-${timestamp}.jsonl`;
    const filePath = path.join(this.config.basePath, 'buffer', fileName);

    // ファイルが既に存在する場合は連番を付ける
    let finalPath = filePath;
    let counter = 1;
    while (await this.fileExists(finalPath)) {
      finalPath = filePath.replace('.jsonl', `-${counter}.jsonl`);
      counter++;
    }

    await fs.writeFile(finalPath, '', 'utf-8');

    this.activeBuffer = new FileBuffer({
      filePath: finalPath,
      maxSize: this.config.maxFileSize,
      maxEventsInMemory: this.config.maxEventsInMemory,
    });

    this.logger.info('Created new buffer file', { path: finalPath });
  }

  private async shouldRotate(): Promise<boolean> {
    if (!this.activeBuffer) {
      return false;
    }

    if (this.config.rotationPolicy === 'size') {
      return this.activeBuffer.getSize() >= this.config.maxFileSize;
    }

    if (this.config.rotationPolicy === 'daily') {
      const createdAt = this.activeBuffer.getCreatedAt();
      const now = new Date();
      return now.getDate() !== createdAt.getDate() ||
             now.getMonth() !== createdAt.getMonth() ||
             now.getFullYear() !== createdAt.getFullYear();
    }

    return false;
  }

  private async rotateBuffer(): Promise<void> {
    this.logger.info('Rotating buffer file');

    // 現在のバッファをアーカイブ
    if (this.activeBuffer && this.config.compressionEnabled) {
      await this.compressBuffer(this.activeBuffer.getFilePath());
    }

    // 新しいバッファを作成
    await this.createNewBuffer();
  }

  private async appendToFile(filePath: string, content: string): Promise<void> {
    const lockFile = `${filePath}.lock`;

    try {
      // ロックファイルを作成
      await fs.writeFile(lockFile, process.pid.toString(), { flag: 'wx' });
      this.lockFiles.add(lockFile);

      // ファイルに追記
      await fs.appendFile(filePath, content, 'utf-8');
    } finally {
      // ロックファイルを削除
      try {
        await fs.unlink(lockFile);
        this.lockFiles.delete(lockFile);
      } catch (error) {
        // ロック解除エラーは警告レベル
        this.logger.warn('Failed to remove lock file', { lockFile, error });
      }
    }
  }

  private async readEventsFromFile(
    filePath: string,
    limit: number,
    skip: number = 0,
    reverse: boolean = false
  ): Promise<Event[]> {
    const events: Event[] = [];
    const lines: string[] = [];

    // ストリーミング読み込み
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        lines.push(line);
      }
    }

    // 逆順の場合は配列を反転
    if (reverse) {
      lines.reverse();
    }

    // スキップとリミット適用
    const targetLines = lines.slice(skip, skip + limit);

    for (const line of targetLines) {
      try {
        const data = JSON.parse(line);
        events.push(Event.fromJSON(data));
      } catch (error) {
        this.logger.warn('Failed to parse event from buffer', { line, error });
      }
    }

    return events;
  }

  private async rewriteBufferFile(excludeIds: Set<string>): Promise<void> {
    if (!this.activeBuffer) {
      return;
    }

    const originalPath = this.activeBuffer.getFilePath();
    const tempPath = `${originalPath}.tmp`;

    // 新しいファイルに有効なイベントのみを書き込み
    const writeStream = createWriteStream(tempPath);
    const rl = createInterface({
      input: createReadStream(originalPath),
      crlfDelay: Infinity,
    });

    let newSize = 0;
    for await (const line of rl) {
      if (line.trim()) {
        try {
          const data = JSON.parse(line);
          if (!excludeIds.has(data.id)) {
            writeStream.write(line + '\n');
            newSize += Buffer.byteLength(line + '\n');
          }
        } catch (error) {
          // パースエラーの行はスキップ
          this.logger.warn('Skipping invalid line during rewrite', { error });
        }
      }
    }

    writeStream.end();
    await new Promise(resolve => writeStream.on('finish', resolve));

    // アトミックな置き換え
    await fs.rename(tempPath, originalPath);
    this.activeBuffer.updateSize(newSize);
  }

  /**
   * 単一イベントの削除
   */
  async removeEvent(eventId: string): Promise<void> {
    await this.removeEvents([eventId]);
  }

  /**
   * 失敗したイベントとしてマーク
   */
  async markEventFailed(eventId: string): Promise<void> {
    // TODO: 失敗したイベントのメタデータを更新
    // 現在は簡易実装
    this.logger.warn('Event marked as failed', { eventId });
  }

  /**
   * 失敗したイベントを取得
   */
  async getFailedEvents(limit: number): Promise<Event[]> {
    // TODO: 失敗したイベントのみをフィルタリング
    // 現在は空の配列を返す
    return [];
  }

  /**
   * バッファ内のイベント数を取得
   */
  async getEventCount(): Promise<number> {
    const stats = await this.getStats();
    return stats.eventCount;
  }

  private async listBufferFiles(): Promise<string[]> {
    const bufferDir = path.join(this.config.basePath, 'buffer');
    try {
      const files = await fs.readdir(bufferDir);
      return files
        .filter(f => f.endsWith('.jsonl'))
        .sort(); // ファイル名でソート（日付順になる）
    } catch (error) {
      return [];
    }
  }

  private async countEventsInFile(filePath: string): Promise<{
    count: number;
    oldest?: Date;
    newest?: Date;
  }> {
    let count = 0;
    let oldest: Date | undefined;
    let newest: Date | undefined;

    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        count++;
        try {
          const data = JSON.parse(line);
          const timestamp = new Date(data.timestamp);

          if (!oldest || timestamp < oldest) {
            oldest = timestamp;
          }
          if (!newest || timestamp > newest) {
            newest = timestamp;
          }
        } catch (error) {
          // パースエラーは無視
        }
      }
    }

    return { count, oldest, newest };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async compressBuffer(filePath: string): Promise<void> {
    // 圧縮実装（オプション）
    // zlib を使用してgzip圧縮を行う
    this.logger.info('Buffer compression not implemented yet', { filePath });
  }
}