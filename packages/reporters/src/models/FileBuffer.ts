/**
 * @file FileBuffer model with JSON Lines support
 * @module @sebas-chan/reporters/models/FileBuffer
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { Event, EventSchema } from './Event';
import { type IFileBuffer, type IEvent, BUFFER_CONSTANTS } from '../types';

const fsWriteFile = promisify(fs.writeFile);
const fsAppendFile = promisify(fs.appendFile);
const fsReadFile = promisify(fs.readFile);
const fsStat = promisify(fs.stat);
const fsMkdir = promisify(fs.mkdir);
const fsAccess = promisify(fs.access);

/**
 * FileBufferのZodスキーマ
 */
export const FileBufferSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  events: z
    .array(EventSchema)
    .max(BUFFER_CONSTANTS.MAX_EVENTS_IN_MEMORY, {
      message: `Maximum ${BUFFER_CONSTANTS.MAX_EVENTS_IN_MEMORY} events can be held in memory`,
    }),
  size: z.number().int().min(0),
  maxSize: z
    .number()
    .int()
    .min(BUFFER_CONSTANTS.MIN_SIZE, {
      message: `Maximum size must be at least ${BUFFER_CONSTANTS.MIN_SIZE} bytes (1MB)`,
    })
    .max(BUFFER_CONSTANTS.MAX_SIZE, {
      message: `Maximum size must not exceed ${BUFFER_CONSTANTS.MAX_SIZE} bytes (1GB)`,
    }),
  createdAt: z.coerce.date(),
  rotatedAt: z.coerce.date().optional(),
});

/**
 * FileBufferモデルクラス
 * JSON Lines形式でイベントをファイルに保存
 */
export class FileBuffer implements IFileBuffer {
  public readonly filePath: string;
  public events: IEvent[];
  public size: number;
  public readonly maxSize: number;
  public readonly createdAt: Date;
  public rotatedAt?: Date;

  /**
   * コンストラクタ
   * @param data - ファイルバッファデータ
   */
  constructor(data: IFileBuffer) {
    const validated = FileBufferSchema.parse(data);
    this.filePath = validated.filePath;
    this.events = validated.events;
    this.size = validated.size;
    this.maxSize = validated.maxSize;
    this.createdAt = validated.createdAt;
    this.rotatedAt = validated.rotatedAt;
  }

  /**
   * 新しいファイルバッファを作成
   * @param filePath - ファイルパス
   * @param maxSize - 最大サイズ（バイト）
   * @returns 新しいFileBufferインスタンス
   */
  static create(
    filePath: string,
    maxSize: number = BUFFER_CONSTANTS.MIN_SIZE * 10 // デフォルト10MB
  ): FileBuffer {
    return new FileBuffer({
      filePath,
      events: [],
      size: 0,
      maxSize,
      createdAt: new Date(),
    });
  }

  /**
   * イベントを追加
   * @param event - 追加するイベント
   * @returns 更新されたFileBufferインスタンス
   */
  addEvent(event: IEvent): FileBuffer {
    const newEvent = new Event(event);
    const eventSize = Buffer.byteLength(newEvent.toJSONLine());

    // サイズチェック
    if (this.size + eventSize > this.maxSize) {
      throw new Error('Buffer size would exceed maximum size');
    }

    // メモリ内のイベント数チェック
    const newEvents = [...this.events, newEvent];
    if (newEvents.length > BUFFER_CONSTANTS.MAX_EVENTS_IN_MEMORY) {
      // 古いイベントを削除
      newEvents.shift();
    }

    return new FileBuffer({
      ...this,
      events: newEvents,
      size: this.size + eventSize,
    });
  }

  /**
   * 複数のイベントを追加
   * @param events - 追加するイベント配列
   * @returns 更新されたFileBufferインスタンス
   */
  addEvents(events: IEvent[]): FileBuffer {
    let buffer: FileBuffer = this;
    for (const event of events) {
      buffer = buffer.addEvent(event);
    }
    return buffer;
  }

  /**
   * イベントをファイルに書き込み（追記）
   * @param event - 書き込むイベント
   */
  async appendEventToFile(event: IEvent): Promise<void> {
    const eventLine = new Event(event).toJSONLine() + '\n';
    await this.ensureDirectoryExists();
    await fsAppendFile(this.filePath, eventLine);
  }

  /**
   * 複数のイベントをファイルに書き込み（追記）
   * @param events - 書き込むイベント配列
   */
  async appendEventsToFile(events: IEvent[]): Promise<void> {
    const lines = events
      .map((event) => new Event(event).toJSONLine())
      .join('\n') + '\n';
    await this.ensureDirectoryExists();
    await fsAppendFile(this.filePath, lines);
  }

  /**
   * ファイルからイベントを読み込み
   * @returns イベント配列
   */
  async loadEventsFromFile(): Promise<IEvent[]> {
    try {
      const content = await fsReadFile(this.filePath, 'utf-8');
      const lines = content.trim().split('\n');
      const events: IEvent[] = [];

      for (const line of lines) {
        if (line.trim()) {
          try {
            const event = Event.fromJSON(line);
            events.push(event);
          } catch (error) {
            console.error(`Failed to parse event line: ${line}`, error);
          }
        }
      }

      return events;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // ファイルが存在しない場合は空配列を返す
        return [];
      }
      throw error;
    }
  }

  /**
   * ファイルサイズを取得
   * @returns ファイルサイズ（バイト）
   */
  async getFileSize(): Promise<number> {
    try {
      const stats = await fsStat(this.filePath);
      return stats.size;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return 0;
      }
      throw error;
    }
  }

  /**
   * ファイルサイズを更新
   * @returns 更新されたFileBufferインスタンス
   */
  async updateSize(): Promise<FileBuffer> {
    const size = await this.getFileSize();
    return new FileBuffer({
      ...this,
      size,
    });
  }

  /**
   * バッファをローテート（新しいファイルを作成）
   * @param newFilePath - 新しいファイルパス
   * @returns 新しいFileBufferインスタンス
   */
  rotate(newFilePath: string): FileBuffer {
    return new FileBuffer({
      filePath: newFilePath,
      events: [],
      size: 0,
      maxSize: this.maxSize,
      createdAt: new Date(),
      rotatedAt: new Date(),
    });
  }

  /**
   * 自動ローテート用のファイル名を生成
   * @param basePath - ベースパス
   * @returns タイムスタンプ付きファイル名
   */
  static generateRotatedFilePath(basePath: string): string {
    const dir = path.dirname(basePath);
    const ext = path.extname(basePath);
    const base = path.basename(basePath, ext);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(dir, `${base}-${timestamp}${ext}`);
  }

  /**
   * バッファをクリア
   * @returns 更新されたFileBufferインスタンス
   */
  clear(): FileBuffer {
    return new FileBuffer({
      ...this,
      events: [],
      size: 0,
    });
  }

  /**
   * ファイルが書き込み可能かチェック
   * @returns 書き込み可能な場合true
   */
  async isWritable(): Promise<boolean> {
    try {
      await this.ensureDirectoryExists();
      // ファイルが存在する場合は書き込み権限をチェック
      try {
        await fsAccess(this.filePath, fs.constants.W_OK);
        return true;
      } catch {
        // ファイルが存在しない場合はディレクトリへの書き込み権限をチェック
        const dir = path.dirname(this.filePath);
        await fsAccess(dir, fs.constants.W_OK);
        return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * ディレクトリが存在することを確認（なければ作成）
   */
  private async ensureDirectoryExists(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fsMkdir(dir, { recursive: true });
  }

  /**
   * ローテーションが必要かチェック
   * @returns ローテーションが必要な場合true
   */
  needsRotation(): boolean {
    return this.size >= this.maxSize;
  }

  /**
   * JSON形式に変換
   * @returns JSON形式のファイルバッファ
   */
  toJSON(): Record<string, unknown> {
    return {
      filePath: this.filePath,
      eventsCount: this.events.length,
      size: this.size,
      maxSize: this.maxSize,
      createdAt: this.createdAt.toISOString(),
      rotatedAt: this.rotatedAt?.toISOString(),
    };
  }

  /**
   * ファイルバッファの検証
   * @param data - 検証するデータ
   * @returns 検証結果
   */
  static validate(
    data: unknown
  ): z.SafeParseReturnType<unknown, IFileBuffer> {
    return FileBufferSchema.safeParse(data);
  }

  /**
   * ロックファイルのパスを取得
   * @returns ロックファイルのパス
   */
  getLockFilePath(): string {
    return `${this.filePath}.lock`;
  }

  /**
   * ファイルロックを取得
   * @returns ロックの取得に成功した場合true
   */
  async acquireLock(): Promise<boolean> {
    const lockFile = this.getLockFilePath();
    try {
      await fsWriteFile(lockFile, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        // ロックファイルが既に存在
        return false;
      }
      throw error;
    }
  }

  /**
   * ファイルロックを解放
   */
  async releaseLock(): Promise<void> {
    const lockFile = this.getLockFilePath();
    try {
      await promisify(fs.unlink)(lockFile);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

// 型エクスポート
export type FileBufferInput = z.input<typeof FileBufferSchema>;
export type FileBufferOutput = z.output<typeof FileBufferSchema>;