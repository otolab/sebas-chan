/**
 * @file Event model with validation
 * @module @sebas-chan/reporters/models/Event
 */

import { z } from 'zod';
import { v4 as uuidv4, validate as validateUuid } from 'uuid';
import { EventType, type IEvent, type EventMetadata } from '../types';

/**
 * EventMetadataのZodスキーマ
 */
export const EventMetadataSchema = z.object({
  collectedAt: z.coerce.date(),
  attempts: z.number().int().min(0),
  lastAttemptAt: z.coerce.date().optional(),
});

/**
 * EventのZodスキーマ
 */
export const EventSchema = z.object({
  id: z
    .string()
    .refine((val) => validateUuid(val), {
      message: 'ID must be a valid UUID v4',
    }),
  type: z.nativeEnum(EventType),
  sourceId: z.string().min(1, 'Source ID cannot be empty'),
  timestamp: z.coerce
    .date()
    .refine((date) => date <= new Date(), {
      message: 'Timestamp cannot be in the future',
    }),
  payload: z.unknown().refine((val) => val !== null && val !== undefined, {
    message: 'Payload cannot be null or undefined',
  }),
  metadata: EventMetadataSchema,
});

/**
 * Eventモデルクラス
 */
export class Event implements IEvent {
  public readonly id: string;
  public readonly type: EventType;
  public readonly sourceId: string;
  public readonly timestamp: Date;
  public readonly payload: unknown;
  public readonly metadata: EventMetadata;

  /**
   * コンストラクタ
   * @param data - イベントデータ
   */
  constructor(data: IEvent) {
    const validated = EventSchema.parse(data);
    this.id = validated.id;
    this.type = validated.type;
    this.sourceId = validated.sourceId;
    this.timestamp = validated.timestamp;
    this.payload = validated.payload;
    this.metadata = validated.metadata;
  }

  /**
   * 新しいイベントを作成
   * @param data - イベントデータ（IDは自動生成可能）
   * @returns 新しいEventインスタンス
   */
  static create(
    data: Omit<IEvent, 'id' | 'metadata'> & {
      id?: string;
      metadata?: Partial<EventMetadata>;
    }
  ): Event {
    const eventData: IEvent = {
      id: data.id || uuidv4(),
      type: data.type,
      sourceId: data.sourceId,
      timestamp: data.timestamp,
      payload: data.payload,
      metadata: {
        collectedAt: data.metadata?.collectedAt || new Date(),
        attempts: data.metadata?.attempts || 0,
        lastAttemptAt: data.metadata?.lastAttemptAt,
      },
    };
    return new Event(eventData);
  }

  /**
   * イベントをJSON形式に変換
   * @returns JSON形式のイベント
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      sourceId: this.sourceId,
      timestamp: this.timestamp.toISOString(),
      payload: this.payload,
      metadata: {
        collectedAt: this.metadata.collectedAt.toISOString(),
        attempts: this.metadata.attempts,
        lastAttemptAt: this.metadata.lastAttemptAt?.toISOString(),
      },
    };
  }

  /**
   * JSON Lines形式の文字列に変換
   * @returns JSON Lines形式の文字列
   */
  toJSONLine(): string {
    return JSON.stringify(this.toJSON());
  }

  /**
   * JSON文字列からEventインスタンスを作成
   * @param json - JSON文字列
   * @returns Eventインスタンス
   */
  static fromJSON(json: string): Event {
    const data = JSON.parse(json);
    return new Event({
      id: data.id,
      type: data.type,
      sourceId: data.sourceId,
      timestamp: new Date(data.timestamp),
      payload: data.payload,
      metadata: {
        collectedAt: new Date(data.metadata.collectedAt),
        attempts: data.metadata.attempts,
        lastAttemptAt: data.metadata.lastAttemptAt
          ? new Date(data.metadata.lastAttemptAt)
          : undefined,
      },
    });
  }

  /**
   * 送信試行を記録
   * @returns 更新されたEventインスタンス
   */
  recordAttempt(): Event {
    return new Event({
      ...this,
      metadata: {
        ...this.metadata,
        attempts: this.metadata.attempts + 1,
        lastAttemptAt: new Date(),
      },
    });
  }

  /**
   * イベントの検証
   * @param data - 検証するデータ
   * @returns 検証結果
   */
  static validate(data: unknown): z.SafeParseReturnType<unknown, IEvent> {
    return EventSchema.safeParse(data);
  }

  /**
   * 複数のイベントを検証
   * @param data - 検証するデータ配列
   * @returns 検証結果
   */
  static validateMany(
    data: unknown[]
  ): z.SafeParseReturnType<unknown[], IEvent[]> {
    return z.array(EventSchema).safeParse(data);
  }
}

// 型エクスポート
export type EventInput = z.input<typeof EventSchema>;
export type EventOutput = z.output<typeof EventSchema>;