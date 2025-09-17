/**
 * ロギングサービス
 * @module services/Logger
 */

import winston from 'winston';
import path from 'path';

/**
 * ログレベル定義
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

/**
 * ロガー設定
 */
export interface LoggerConfig {
  level?: LogLevel;
  console?: boolean;
  file?: {
    enabled: boolean;
    filename?: string;
    maxsize?: number;
    maxFiles?: number;
  };
  format?: 'json' | 'simple';
}

/**
 * デフォルト設定
 */
const defaultConfig: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  console: true,
  file: {
    enabled: process.env.NODE_ENV === 'production',
    filename: 'reporters.log',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  },
  format: process.env.NODE_ENV === 'production' ? 'json' : 'simple',
};

/**
 * ロガーインスタンスの作成
 */
export function createLogger(config: LoggerConfig = {}): winston.Logger {
  const mergedConfig = { ...defaultConfig, ...config };

  // フォーマットの設定
  const formats = [];

  // タイムスタンプ追加
  formats.push(winston.format.timestamp());

  // エラーのスタックトレース展開
  formats.push(winston.format.errors({ stack: true }));

  // フォーマット選択
  if (mergedConfig.format === 'json') {
    formats.push(winston.format.json());
  } else {
    formats.push(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, ...rest }) => {
        const extra = Object.keys(rest).length > 0 ? JSON.stringify(rest) : '';
        return `${timestamp} [${level}]: ${message} ${extra}`;
      })
    );
  }

  const format = winston.format.combine(...formats);

  // トランスポートの設定
  const transports: winston.transport[] = [];

  // コンソール出力
  if (mergedConfig.console) {
    transports.push(
      new winston.transports.Console({
        level: mergedConfig.level,
        format,
      })
    );
  }

  // ファイル出力
  if (mergedConfig.file?.enabled) {
    const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
    const filename = path.join(logDir, mergedConfig.file.filename || 'reporters.log');

    transports.push(
      new winston.transports.File({
        filename,
        level: mergedConfig.level,
        maxsize: mergedConfig.file.maxsize,
        maxFiles: mergedConfig.file.maxFiles,
        format: winston.format.json(), // ファイルは常にJSON
      })
    );

    // エラーログ専用ファイル
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: mergedConfig.file.maxsize,
        maxFiles: mergedConfig.file.maxFiles,
        format: winston.format.json(),
      })
    );
  }

  return winston.createLogger({
    level: mergedConfig.level,
    format,
    transports,
    exitOnError: false,
  });
}

/**
 * デフォルトロガーインスタンス
 */
export const logger = createLogger();

/**
 * 子ロガーの作成
 */
export function createChildLogger(meta: Record<string, unknown>): winston.Logger {
  return logger.child(meta);
}

/**
 * ログレベルの動的変更
 */
export function setLogLevel(level: LogLevel): void {
  logger.level = level;
  logger.transports.forEach((transport) => {
    transport.level = level;
  });
}

/**
 * 構造化ログのヘルパー関数
 */
export class StructuredLogger {
  private logger: winston.Logger;
  private defaultMeta: Record<string, unknown>;

  constructor(logger: winston.Logger = createLogger(), defaultMeta: Record<string, unknown> = {}) {
    this.logger = logger;
    this.defaultMeta = defaultMeta;
  }

  /**
   * エラーログ
   */
  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, { ...this.defaultMeta, ...meta });
  }

  /**
   * 警告ログ
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, { ...this.defaultMeta, ...meta });
  }

  /**
   * 情報ログ
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, { ...this.defaultMeta, ...meta });
  }

  /**
   * デバッグログ
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, { ...this.defaultMeta, ...meta });
  }

  /**
   * 詳細ログ
   */
  verbose(message: string, meta?: Record<string, unknown>): void {
    this.logger.verbose(message, { ...this.defaultMeta, ...meta });
  }

  /**
   * メトリクスログ
   */
  metric(name: string, value: number, tags?: Record<string, string>): void {
    this.logger.info('metric', {
      ...this.defaultMeta,
      metric: {
        name,
        value,
        tags,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * イベントログ
   */
  event(type: string, payload: unknown): void {
    this.logger.info('event', {
      ...this.defaultMeta,
      event: {
        type,
        payload,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * デフォルトの構造化ロガー
 */
export const structuredLogger = new StructuredLogger(logger);