/**
 * @file Models export
 * @module @sebas-chan/reporters/models
 */

// Event
export { Event, EventSchema, EventMetadataSchema } from './Event';
export type { EventInput, EventOutput } from './Event';

// EventSource
export { EventSource, EventSourceSchema, EventSourceConfigSchema } from './EventSource';
export type { EventSourceInput, EventSourceOutput } from './EventSource';

// FileBuffer
export { FileBuffer, FileBufferSchema } from './FileBuffer';
export type { FileBufferInput, FileBufferOutput } from './FileBuffer';

// ConnectionStatus
export { ConnectionStatus, ConnectionStatusSchema } from './ConnectionStatus';
export type { ConnectionStatusInput, ConnectionStatusOutput } from './ConnectionStatus';

// Re-export types from types/index.ts
export {
  EventType,
  SourceType,
  SourceStatus,
  TargetType,
  EventState,
  ConnectionState,
  BUFFER_CONSTANTS,
  FILE_PATHS,
} from '../types';

export type {
  IEvent,
  EventMetadata,
  IEventSource,
  EventSourceConfig,
  IFileBuffer,
  IConnectionStatus,
  EventRecord,
} from '../types';