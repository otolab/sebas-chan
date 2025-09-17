/**
 * Services barrel export
 * T026-T031: Core service implementations
 */

// Logger service
export { createLogger, logger, structuredLogger, createChildLogger, setLogLevel, StructuredLogger } from './Logger';
export type { LogLevel, LoggerConfig } from './Logger';

// T026: File-based persistence with JSON Lines
export { BufferService } from './BufferService';
export type { BufferServiceConfig } from './BufferService';

// T027: Event collection logic (plugin-based)
export { EventCollector, BaseCollectorPlugin, WebhookCollector, PollingCollector, StreamCollector } from './EventCollector';
export type { CollectorPlugin } from './EventCollector';

// T028: Server API communication client
export { ServerClient } from './ServerClient';
export type {
  ServerConfig,
  ApiResponse,
  BatchSendResult,
  HealthCheckResponse
} from './ServerClient';

// T029: Retry logic with exponential backoff
export { RetryManager, defaultRetryManager, withRetry, retryWhile } from './RetryManager';
export type {
  RetryConfig,
  RetryStats,
  RetryContext,
  RetryResult
} from './RetryManager';

// T030: Event source management
export { SourceManager } from './SourceManager';
export type {
  SourceManagerConfig,
  SourceFilter,
  SourceStats,
  ValidationResult
} from './SourceManager';

// T031: System health monitoring
export { HealthMonitor, BasicHealthCheckable, ConnectionHealthAdapter } from './HealthMonitor';
export type {
  HealthStatus,
  ComponentHealth,
  SystemMetrics,
  HealthCheckResult,
  HealthMonitorConfig,
  HealthCheckable
} from './HealthMonitor';

// Service instances (singleton pattern for shared state)
import { BufferService } from './BufferService';
import { EventCollector } from './EventCollector';
import { ServerClient } from './ServerClient';
import { SourceManager } from './SourceManager';
import { HealthMonitor } from './HealthMonitor';

// Create singleton instances
export const bufferService = new BufferService({
  dataDir: process.env.BUFFER_DATA_DIR || './data/buffer',
  maxFileSize: parseInt(process.env.BUFFER_MAX_FILE_SIZE || '10485760', 10), // 10MB
  maxFiles: parseInt(process.env.BUFFER_MAX_FILES || '10', 10),
  flushInterval: parseInt(process.env.BUFFER_FLUSH_INTERVAL || '5000', 10), // 5 seconds
});

export const eventCollector = new EventCollector({
  batchSize: parseInt(process.env.COLLECTOR_BATCH_SIZE || '100', 10),
  batchInterval: parseInt(process.env.COLLECTOR_BATCH_INTERVAL || '10000', 10), // 10 seconds
  plugins: [],
});

export const serverClient = new ServerClient({
  baseUrl: process.env.SERVER_BASE_URL || 'http://localhost:8080',
  apiKey: process.env.SERVER_API_KEY,
  timeout: parseInt(process.env.SERVER_TIMEOUT || '30000', 10), // 30 seconds
  maxRetries: parseInt(process.env.SERVER_MAX_RETRIES || '3', 10),
});

export const sourceManager = new SourceManager({
  dataDir: process.env.SOURCE_DATA_DIR || './data/sources',
  maxSources: parseInt(process.env.MAX_SOURCES || '100', 10),
  validateOnAdd: true,
  enableMetrics: process.env.NODE_ENV === 'production',
});

export const healthMonitor = new HealthMonitor({
  checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10), // 30 seconds
  historySize: parseInt(process.env.HEALTH_HISTORY_SIZE || '100', 10),
  thresholds: {
    errorRate: parseFloat(process.env.HEALTH_ERROR_RATE_THRESHOLD || '0.1'),
    responseTime: parseInt(process.env.HEALTH_RESPONSE_TIME_THRESHOLD || '5000', 10),
    memoryUsage: parseFloat(process.env.HEALTH_MEMORY_USAGE_THRESHOLD || '0.9'),
  },
});