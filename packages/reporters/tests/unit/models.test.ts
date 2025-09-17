/**
 * @file Unit tests for data models
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  Event,
  EventSource,
  FileBuffer,
  ConnectionStatus,
  EventType,
  SourceType,
  SourceStatus,
  TargetType,
} from '../../src/models';

describe('Event Model', () => {
  it('should create a valid event', () => {
    const event = Event.create({
      type: EventType.NOTIFICATION,
      sourceId: 'test-source',
      timestamp: new Date(),
      payload: { message: 'test notification' },
    });

    expect(event.id).toBeDefined();
    expect(event.type).toBe(EventType.NOTIFICATION);
    expect(event.sourceId).toBe('test-source');
    expect(event.payload).toEqual({ message: 'test notification' });
    expect(event.metadata.collectedAt).toBeInstanceOf(Date);
    expect(event.metadata.attempts).toBe(0);
  });

  it('should validate event data', () => {
    const validData = {
      id: uuidv4(),
      type: EventType.MESSAGE,
      sourceId: 'slack',
      timestamp: new Date(),
      payload: { text: 'Hello' },
      metadata: {
        collectedAt: new Date(),
        attempts: 0,
      },
    };

    const result = Event.validate(validData);
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID', () => {
    const invalidData = {
      id: 'invalid-uuid',
      type: EventType.MESSAGE,
      sourceId: 'slack',
      timestamp: new Date(),
      payload: { text: 'Hello' },
      metadata: {
        collectedAt: new Date(),
        attempts: 0,
      },
    };

    const result = Event.validate(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject future timestamp', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const invalidData = {
      id: uuidv4(),
      type: EventType.MESSAGE,
      sourceId: 'slack',
      timestamp: futureDate,
      payload: { text: 'Hello' },
      metadata: {
        collectedAt: new Date(),
        attempts: 0,
      },
    };

    const result = Event.validate(invalidData);
    expect(result.success).toBe(false);
  });

  it('should convert to JSON Line format', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // Yesterday

    const event = Event.create({
      type: EventType.CALENDAR,
      sourceId: 'google',
      timestamp: pastDate,
      payload: { title: 'Meeting' },
    });

    const jsonLine = event.toJSONLine();
    expect(jsonLine).toContain('"type":"calendar"');
    expect(jsonLine).toContain('"sourceId":"google"');
    expect(jsonLine).not.toContain('\n');
  });

  it('should record attempt', () => {
    const event = Event.create({
      type: EventType.TODO,
      sourceId: 'todoist',
      timestamp: new Date(),
      payload: { task: 'Test' },
    });

    const updatedEvent = event.recordAttempt();
    expect(updatedEvent.metadata.attempts).toBe(1);
    expect(updatedEvent.metadata.lastAttemptAt).toBeInstanceOf(Date);
  });
});

describe('EventSource Model', () => {
  it('should create a valid event source', () => {
    const source = EventSource.create({
      id: 'slack-webhook',
      name: 'Slack Webhook',
      type: SourceType.WEBHOOK,
      config: {
        endpoint: 'https://api.slack.com/webhook',
      },
    });

    expect(source.id).toBe('slack-webhook');
    expect(source.name).toBe('Slack Webhook');
    expect(source.type).toBe(SourceType.WEBHOOK);
    expect(source.status).toBe(SourceStatus.INACTIVE);
    expect(source.config.endpoint).toBe('https://api.slack.com/webhook');
  });

  it('should validate source ID format', () => {
    const validData = {
      id: 'test-source-123',
      name: 'Test Source',
      type: SourceType.POLLING,
      config: {
        endpoint: 'https://api.example.com',
        interval: 5000,
      },
      status: SourceStatus.ACTIVE,
    };

    const result = EventSource.validate(validData);
    expect(result.success).toBe(true);
  });

  it('should reject invalid source ID', () => {
    const invalidData = {
      id: 'test source!@#',
      name: 'Test Source',
      type: SourceType.POLLING,
      config: {
        endpoint: 'https://api.example.com',
        interval: 5000,
      },
      status: SourceStatus.ACTIVE,
    };

    const result = EventSource.validate(invalidData);
    expect(result.success).toBe(false);
  });

  it('should validate polling interval', () => {
    const invalidData = {
      id: 'test-source',
      name: 'Test Source',
      type: SourceType.POLLING,
      config: {
        endpoint: 'https://api.example.com',
        interval: 500, // Less than 1000ms
      },
      status: SourceStatus.ACTIVE,
    };

    const result = EventSource.validate(invalidData);
    expect(result.success).toBe(false);
  });

  it('should update status', () => {
    const source = EventSource.create({
      id: 'test-source',
      name: 'Test Source',
      type: SourceType.STREAM,
      config: {
        endpoint: 'wss://stream.example.com',
      },
    });

    const activeSource = source.activate();
    expect(activeSource.status).toBe(SourceStatus.ACTIVE);
    expect(activeSource.lastConnectedAt).toBeInstanceOf(Date);

    const errorSource = activeSource.setError();
    expect(errorSource.status).toBe(SourceStatus.ERROR);
  });
});

describe('FileBuffer Model', () => {
  it('should create a valid file buffer', () => {
    const buffer = FileBuffer.create(
      '/tmp/events.jsonl',
      1024 * 1024 * 10 // 10MB
    );

    expect(buffer.filePath).toBe('/tmp/events.jsonl');
    expect(buffer.events).toEqual([]);
    expect(buffer.size).toBe(0);
    expect(buffer.maxSize).toBe(1024 * 1024 * 10);
    expect(buffer.createdAt).toBeInstanceOf(Date);
  });

  it('should add events to buffer', () => {
    const buffer = FileBuffer.create('/tmp/events.jsonl');
    const event = Event.create({
      type: EventType.NOTIFICATION,
      sourceId: 'test',
      timestamp: new Date(),
      payload: { message: 'test' },
    });

    const updatedBuffer = buffer.addEvent(event);
    expect(updatedBuffer.events).toHaveLength(1);
    expect(updatedBuffer.size).toBeGreaterThan(0);
  });

  it('should validate max size constraints', () => {
    const validData = {
      filePath: '/tmp/events.jsonl',
      events: [],
      size: 0,
      maxSize: 1024 * 1024 * 100, // 100MB
      createdAt: new Date(),
    };

    const result = FileBuffer.validate(validData);
    expect(result.success).toBe(true);
  });

  it('should reject size exceeding limit', () => {
    const invalidData = {
      filePath: '/tmp/events.jsonl',
      events: [],
      size: 0,
      maxSize: 1024 * 1024 * 1024 * 2, // 2GB - exceeds 1GB limit
      createdAt: new Date(),
    };

    const result = FileBuffer.validate(invalidData);
    expect(result.success).toBe(false);
  });

  it('should check rotation need', () => {
    const buffer = new FileBuffer({
      filePath: '/tmp/events.jsonl',
      events: [],
      size: 1024 * 1024 * 9,
      maxSize: 1024 * 1024 * 10, // 10MB
      createdAt: new Date(),
    });

    expect(buffer.needsRotation()).toBe(false);

    const fullBuffer = new FileBuffer({
      ...buffer,
      size: 1024 * 1024 * 10,
    });

    expect(fullBuffer.needsRotation()).toBe(true);
  });

  it('should generate rotated file path', () => {
    const rotatedPath = FileBuffer.generateRotatedFilePath('/tmp/events.jsonl');
    expect(rotatedPath).toMatch(/\/tmp\/events-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.jsonl/);
  });
});

describe('ConnectionStatus Model', () => {
  it('should create a valid connection status', () => {
    const status = ConnectionStatus.create('server-1', TargetType.SERVER);

    expect(status.targetId).toBe('server-1');
    expect(status.targetType).toBe(TargetType.SERVER);
    expect(status.isConnected).toBe(false);
    expect(status.errorCount).toBe(0);
  });

  it('should record success', () => {
    const status = ConnectionStatus.create('source-1', TargetType.SOURCE);
    const successStatus = status.recordSuccess();

    expect(successStatus.isConnected).toBe(true);
    expect(successStatus.lastSuccessAt).toBeInstanceOf(Date);
    expect(successStatus.errorCount).toBe(0);
    expect(successStatus.errorMessage).toBeUndefined();
  });

  it('should record error', () => {
    const status = ConnectionStatus.create('server-1', TargetType.SERVER);
    const errorStatus = status.recordError('Connection timeout');

    expect(errorStatus.isConnected).toBe(false);
    expect(errorStatus.lastErrorAt).toBeInstanceOf(Date);
    expect(errorStatus.errorCount).toBe(1);
    expect(errorStatus.errorMessage).toBe('Connection timeout');
  });

  it('should calculate backoff delay', () => {
    let status = ConnectionStatus.create('source-1', TargetType.SOURCE);

    // First error - base delay
    status = status.recordError();
    const delay1 = status.calculateBackoffDelay(1000);
    expect(delay1).toBeGreaterThanOrEqual(1800); // 1000 * 2^1 * 0.9
    expect(delay1).toBeLessThanOrEqual(2200); // 1000 * 2^1 * 1.1

    // Second error - doubled
    status = status.recordError();
    const delay2 = status.calculateBackoffDelay(1000);
    expect(delay2).toBeGreaterThanOrEqual(3600); // 1000 * 2^2 * 0.9
    expect(delay2).toBeLessThanOrEqual(4400); // 1000 * 2^2 * 1.1
  });

  it('should check health status', () => {
    const healthyStatus = new ConnectionStatus({
      targetId: 'server-1',
      targetType: TargetType.SERVER,
      isConnected: true,
      lastSuccessAt: new Date(),
      errorCount: 0,
    });

    expect(healthyStatus.isHealthy()).toBe(true);

    const unhealthyStatus = new ConnectionStatus({
      targetId: 'server-1',
      targetType: TargetType.SERVER,
      isConnected: false,
      errorCount: 5,
    });

    expect(unhealthyStatus.isHealthy()).toBe(false);
  });

  it('should check reconnection need', () => {
    const status = new ConnectionStatus({
      targetId: 'source-1',
      targetType: TargetType.SOURCE,
      isConnected: false,
      errorCount: 2,
    });

    expect(status.needsReconnection(3)).toBe(true);
    expect(status.needsReconnection(2)).toBe(false);
  });

  it('should truncate long error messages', () => {
    const longMessage = 'a'.repeat(600);
    const status = ConnectionStatus.create('server-1', TargetType.SERVER);
    const errorStatus = status.recordError(longMessage);

    expect(errorStatus.errorMessage?.length).toBe(500);
  });
});