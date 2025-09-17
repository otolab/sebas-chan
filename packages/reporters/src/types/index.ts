/**
 * @file Type definitions and enums for the reporters package
 * @module @sebas-chan/reporters/types
 */

/**
 * イベントタイプの定義
 */
export enum EventType {
  NOTIFICATION = 'notification',
  MESSAGE = 'message',
  CALENDAR = 'calendar',
  TODO = 'todo',
  OTHER = 'other',
}

/**
 * イベントソースタイプの定義
 */
export enum SourceType {
  WEBHOOK = 'webhook',
  POLLING = 'polling',
  STREAM = 'stream',
}

/**
 * イベントソースステータスの定義
 */
export enum SourceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
}

/**
 * 接続対象タイプの定義
 */
export enum TargetType {
  SERVER = 'server',
  SOURCE = 'source',
}

/**
 * イベントメタデータ
 */
export interface EventMetadata {
  collectedAt: Date;
  attempts: number;
  lastAttemptAt?: Date;
}

/**
 * イベントインターフェース
 */
export interface IEvent {
  id: string;
  type: EventType;
  sourceId: string;
  timestamp: Date;
  payload: unknown;
  metadata: EventMetadata;
}

/**
 * イベントソース設定
 */
export interface EventSourceConfig {
  endpoint?: string;
  interval?: number;
  filters?: string[];
}

/**
 * イベントソースインターフェース
 */
export interface IEventSource {
  id: string;
  name: string;
  type: SourceType;
  config: EventSourceConfig;
  status: SourceStatus;
  lastConnectedAt?: Date;
}

/**
 * ファイルバッファインターフェース
 */
export interface IFileBuffer {
  filePath: string;
  events: IEvent[];
  size: number;
  maxSize: number;
  createdAt: Date;
  rotatedAt?: Date;
}

/**
 * 接続ステータスインターフェース
 */
export interface IConnectionStatus {
  targetId: string;
  targetType: TargetType;
  isConnected: boolean;
  lastSuccessAt?: Date;
  lastErrorAt?: Date;
  errorCount: number;
  errorMessage?: string;
}

/**
 * イベントステート
 */
export enum EventState {
  CREATED = 'created',
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  BUFFERED = 'buffered',
  FAILED = 'failed',
}

/**
 * 接続ステート
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * バッファ設定の定数
 */
export const BUFFER_CONSTANTS = {
  MIN_SIZE: 1024 * 1024, // 1MB
  MAX_SIZE: 1024 * 1024 * 1024, // 1GB
  MAX_EVENTS_IN_MEMORY: 1000,
  MIN_POLLING_INTERVAL: 1000, // 1秒
  MAX_ERROR_MESSAGE_LENGTH: 500,
  MAX_SOURCE_NAME_LENGTH: 100,
  MAX_CONCURRENT_SOURCES: 10,
} as const;

/**
 * ファイルパス定数
 */
export const FILE_PATHS = {
  DATA_DIR: 'data',
  BUFFER_DIR: 'data/buffer',
  CONFIG_DIR: 'data/config',
  STATE_DIR: 'data/state',
  SOURCES_FILE: 'data/config/sources.json',
  CONNECTIONS_FILE: 'data/state/connections.json',
} as const;

/**
 * JSON Lines形式のイベントレコード
 */
export interface EventRecord {
  id: string;
  type: string;
  sourceId: string;
  timestamp: string;
  payload: unknown;
  metadata: {
    collectedAt: string;
    attempts: number;
    lastAttemptAt?: string;
  };
}