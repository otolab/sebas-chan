/**
 * @file EventSource model with validation
 * @module @sebas-chan/reporters/models/EventSource
 */

import { z } from 'zod';
import {
  SourceType,
  SourceStatus,
  type IEventSource,
  type EventSourceConfig,
  BUFFER_CONSTANTS,
} from '../types';

/**
 * EventSourceConfigのZodスキーマ
 */
export const EventSourceConfigSchema = z.object({
  endpoint: z
    .string()
    .url('Endpoint must be a valid URL')
    .optional(),
  interval: z
    .number()
    .int()
    .min(BUFFER_CONSTANTS.MIN_POLLING_INTERVAL, {
      message: `Interval must be at least ${BUFFER_CONSTANTS.MIN_POLLING_INTERVAL}ms (1 second)`,
    })
    .optional(),
  filters: z.array(z.string()).optional(),
});

/**
 * EventSourceのZodスキーマ
 */
export const EventSourceSchema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z0-9-]+$/, {
      message: 'ID must contain only alphanumeric characters and hyphens',
    }),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(BUFFER_CONSTANTS.MAX_SOURCE_NAME_LENGTH, {
      message: `Name must be ${BUFFER_CONSTANTS.MAX_SOURCE_NAME_LENGTH} characters or less`,
    }),
  type: z.nativeEnum(SourceType),
  config: EventSourceConfigSchema,
  status: z.nativeEnum(SourceStatus),
  lastConnectedAt: z.coerce.date().optional(),
});

/**
 * EventSourceモデルクラス
 */
export class EventSource implements IEventSource {
  public readonly id: string;
  public readonly name: string;
  public readonly type: SourceType;
  public readonly config: EventSourceConfig;
  public status: SourceStatus;
  public lastConnectedAt?: Date;

  /**
   * コンストラクタ
   * @param data - イベントソースデータ
   */
  constructor(data: IEventSource) {
    const validated = EventSourceSchema.parse(data);
    this.id = validated.id;
    this.name = validated.name;
    this.type = validated.type;
    this.config = validated.config;
    this.status = validated.status;
    this.lastConnectedAt = validated.lastConnectedAt;
  }

  /**
   * 新しいイベントソースを作成
   * @param data - イベントソースデータ
   * @returns 新しいEventSourceインスタンス
   */
  static create(
    data: Omit<IEventSource, 'status' | 'lastConnectedAt'> & {
      status?: SourceStatus;
      lastConnectedAt?: Date;
    }
  ): EventSource {
    const sourceData: IEventSource = {
      ...data,
      status: data.status || SourceStatus.INACTIVE,
      lastConnectedAt: data.lastConnectedAt,
    };
    return new EventSource(sourceData);
  }

  /**
   * ステータスを更新
   * @param status - 新しいステータス
   * @returns 更新されたEventSourceインスタンス
   */
  updateStatus(status: SourceStatus): EventSource {
    return new EventSource({
      ...this,
      status,
      lastConnectedAt:
        status === SourceStatus.ACTIVE ? new Date() : this.lastConnectedAt,
    });
  }

  /**
   * アクティブ化
   * @returns 更新されたEventSourceインスタンス
   */
  activate(): EventSource {
    return this.updateStatus(SourceStatus.ACTIVE);
  }

  /**
   * 非アクティブ化
   * @returns 更新されたEventSourceインスタンス
   */
  deactivate(): EventSource {
    return this.updateStatus(SourceStatus.INACTIVE);
  }

  /**
   * エラー状態に設定
   * @returns 更新されたEventSourceインスタンス
   */
  setError(): EventSource {
    return this.updateStatus(SourceStatus.ERROR);
  }

  /**
   * 接続時刻を更新
   * @returns 更新されたEventSourceインスタンス
   */
  updateConnectionTime(): EventSource {
    return new EventSource({
      ...this,
      lastConnectedAt: new Date(),
    });
  }

  /**
   * 設定を更新
   * @param config - 新しい設定
   * @returns 更新されたEventSourceインスタンス
   */
  updateConfig(config: Partial<EventSourceConfig>): EventSource {
    const newConfig = {
      ...this.config,
      ...config,
    };
    return new EventSource({
      ...this,
      config: newConfig,
    });
  }

  /**
   * JSON形式に変換
   * @returns JSON形式のイベントソース
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      config: this.config,
      status: this.status,
      lastConnectedAt: this.lastConnectedAt?.toISOString(),
    };
  }

  /**
   * JSON文字列からEventSourceインスタンスを作成
   * @param json - JSON文字列
   * @returns EventSourceインスタンス
   */
  static fromJSON(json: string): EventSource {
    const data = JSON.parse(json);
    return new EventSource({
      id: data.id,
      name: data.name,
      type: data.type,
      config: data.config,
      status: data.status,
      lastConnectedAt: data.lastConnectedAt
        ? new Date(data.lastConnectedAt)
        : undefined,
    });
  }

  /**
   * 設定の検証
   * @param type - ソースタイプ
   * @param config - 設定
   * @returns 検証済みの設定
   */
  static validateConfig(
    type: SourceType,
    config: EventSourceConfig
  ): EventSourceConfig {
    // タイプ別の必須フィールドチェック
    switch (type) {
      case SourceType.WEBHOOK:
        if (!config.endpoint) {
          throw new Error('Webhook source requires an endpoint');
        }
        break;
      case SourceType.POLLING:
        if (!config.endpoint) {
          throw new Error('Polling source requires an endpoint');
        }
        if (!config.interval) {
          throw new Error('Polling source requires an interval');
        }
        break;
      case SourceType.STREAM:
        if (!config.endpoint) {
          throw new Error('Stream source requires an endpoint');
        }
        break;
    }

    return EventSourceConfigSchema.parse(config);
  }

  /**
   * イベントソースの検証
   * @param data - 検証するデータ
   * @returns 検証結果
   */
  static validate(
    data: unknown
  ): z.SafeParseReturnType<unknown, IEventSource> {
    return EventSourceSchema.safeParse(data);
  }

  /**
   * 複数のイベントソースを検証
   * @param data - 検証するデータ配列
   * @returns 検証結果
   */
  static validateMany(
    data: unknown[]
  ): z.SafeParseReturnType<unknown[], IEventSource[]> {
    return z.array(EventSourceSchema).safeParse(data);
  }

  /**
   * アクティブかどうかを判定
   * @returns アクティブな場合true
   */
  isActive(): boolean {
    return this.status === SourceStatus.ACTIVE;
  }

  /**
   * エラー状態かどうかを判定
   * @returns エラー状態の場合true
   */
  hasError(): boolean {
    return this.status === SourceStatus.ERROR;
  }
}

// 型エクスポート
export type EventSourceInput = z.input<typeof EventSourceSchema>;
export type EventSourceOutput = z.output<typeof EventSourceSchema>;