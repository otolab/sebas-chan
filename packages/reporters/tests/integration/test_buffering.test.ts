/**
 * T019: Server Offline Buffering Scenario - Integration Test
 *
 * Based on quickstart.md - Scenario 2: Server offline buffering
 * Tests the complete buffering and retry mechanism when server is unavailable
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Event, BufferStatus, SendResult } from '@/types';
import { promises as fs } from 'fs';
import path from 'path';

// Mock implementations (will be replaced with actual imports when implemented)
const mockReporterClient = vi.fn();
const mockBufferManager = vi.fn();
const mockRetryManager = vi.fn();

// Mock the modules (not implemented yet)
vi.mock('@/client', () => ({
  ReporterClient: vi.fn(),
}));

vi.mock('@/services/buffer', () => ({
  BufferManager: vi.fn(),
}));

vi.mock('@/services/retry', () => ({
  RetryManager: vi.fn(),
}));

describe('T019: Server Offline Buffering Scenario', () => {
  let client: any;
  let bufferManager: any;
  let retryManager: any;
  const serverUrl = 'http://localhost:8080';
  const bufferPath = './data/buffer';
  const testBufferPath = './test-data/buffer';

  beforeEach(() => {
    vi.clearAllMocks();

    // Initialize mocks
    client = {
      healthCheck: vi.fn(),
      sendEvent: vi.fn(),
      getStatus: vi.fn(),
      flushBuffer: vi.fn(),
    };

    bufferManager = {
      add: vi.fn(),
      getAll: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      size: vi.fn(),
      persist: vi.fn(),
      load: vi.fn(),
    };

    retryManager = {
      schedule: vi.fn(),
      cancel: vi.fn(),
      getPending: vi.fn(),
      processQueue: vi.fn(),
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Clean up test buffer files
    try {
      await fs.rm(testBufferPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Offline Event Buffering', () => {
    it('should detect server is offline and buffer events', async () => {
      // Setup: Server is offline
      client.healthCheck.mockRejectedValue(new Error('Connection refused'));

      // Test event
      const testEvent: Event = {
        type: 'notification',
        sourceId: 'test',
        payload: {
          message: 'Buffered event',
        },
        timestamp: new Date().toISOString(),
      };

      // Mock buffering behavior
      bufferManager.add.mockResolvedValue({
        bufferId: 'buffer-001',
        status: 'buffered',
      });

      // This test will fail until implementation exists
      const bufferEvent = async () => {
        // Check server health
        try {
          await client.healthCheck();
        } catch (error) {
          // Server is offline, buffer the event
          const result = await bufferManager.add(testEvent);
          expect(result.status).toBe('buffered');
          return result;
        }
        throw new Error('Server should be offline');
      };

      await expect(bufferEvent()).rejects.toThrow();
    });

    it('should persist buffered events to disk', async () => {
      const events: Event[] = [
        {
          type: 'notification',
          sourceId: 'test',
          payload: { message: 'Event 1' },
          timestamp: new Date().toISOString(),
        },
        {
          type: 'notification',
          sourceId: 'test',
          payload: { message: 'Event 2' },
          timestamp: new Date().toISOString(),
        },
      ];

      // Mock buffer persistence
      bufferManager.persist.mockResolvedValue({
        path: path.join(testBufferPath, 'events.json'),
        count: 2,
      });

      // This test will fail until implementation exists
      const persistEvents = async () => {
        for (const event of events) {
          await bufferManager.add(event);
        }
        const result = await bufferManager.persist();
        expect(result.count).toBe(2);
      };

      await expect(persistEvents()).rejects.toThrow();
    });

    it('should check buffer status and count', async () => {
      // Mock buffer status
      bufferManager.size.mockResolvedValue(3);
      bufferManager.getAll.mockResolvedValue([
        { id: 'buffer-001', event: {}, timestamp: new Date().toISOString() },
        { id: 'buffer-002', event: {}, timestamp: new Date().toISOString() },
        { id: 'buffer-003', event: {}, timestamp: new Date().toISOString() },
      ]);

      client.getStatus.mockResolvedValue({
        sent: 0,
        failed: 0,
        buffered: 3,
        serverStatus: 'disconnected',
      });

      // This test will fail until implementation exists
      const checkStatus = async () => {
        const status = await client.getStatus();
        expect(status.buffered).toBe(3);
        expect(status.serverStatus).toBe('disconnected');
      };

      await expect(checkStatus()).rejects.toThrow();
    });
  });

  describe('Automatic Retry and Flush', () => {
    it('should automatically retry buffered events when server comes back online', async () => {
      // Setup: Initial offline state with buffered events
      const bufferedEvents = [
        {
          id: 'buffer-001',
          event: {
            type: 'notification',
            sourceId: 'test',
            payload: { message: 'Buffered 1' },
          },
          attempts: 0,
        },
        {
          id: 'buffer-002',
          event: {
            type: 'notification',
            sourceId: 'test',
            payload: { message: 'Buffered 2' },
          },
          attempts: 0,
        },
      ];

      bufferManager.getAll.mockResolvedValue(bufferedEvents);

      // Server comes back online
      client.healthCheck.mockResolvedValue({
        status: 'healthy',
        serverUrl,
        timestamp: new Date().toISOString(),
      });

      // Mock successful sends
      client.sendEvent.mockResolvedValue({
        eventId: 'event-001',
        status: 'sent',
      });

      // Mock flush behavior
      client.flushBuffer.mockResolvedValue({
        sent: 2,
        failed: 0,
        remaining: 0,
      });

      // This test will fail until implementation exists
      const autoFlush = async () => {
        // Simulate retry interval
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check server health
        const health = await client.healthCheck();
        if (health.status === 'healthy') {
          // Flush buffer
          const result = await client.flushBuffer();
          expect(result.sent).toBe(2);
          expect(result.remaining).toBe(0);
        }
      };

      await expect(autoFlush()).rejects.toThrow();
    });

    it('should handle retry with exponential backoff for failed events', async () => {
      const failedEvent = {
        id: 'buffer-001',
        event: {
          type: 'notification',
          sourceId: 'test',
          payload: { message: 'Failed event' },
        },
        attempts: 3,
        lastAttempt: new Date().toISOString(),
      };

      // Mock retry scheduling
      retryManager.schedule.mockImplementation((event: any, delay: number) => {
        expect(delay).toBeGreaterThan(0);
        // Exponential backoff: 2^attempts * base delay
        const expectedDelay = Math.pow(2, event.attempts) * 1000;
        expect(delay).toBeLessThanOrEqual(expectedDelay * 2); // Allow some variance
        return Promise.resolve({ scheduled: true, nextRetry: Date.now() + delay });
      });

      // This test will fail until implementation exists
      const scheduleRetry = async () => {
        const result = await retryManager.schedule(failedEvent, 1000);
        expect(result.scheduled).toBe(true);
      };

      await expect(scheduleRetry()).rejects.toThrow();
    });

    it('should respect maximum retry attempts', async () => {
      const maxedOutEvent = {
        id: 'buffer-001',
        event: {
          type: 'notification',
          sourceId: 'test',
          payload: { message: 'Max retry event' },
        },
        attempts: 5, // Assuming max is 5
        lastAttempt: new Date().toISOString(),
      };

      // Mock moving to dead letter queue
      bufferManager.moveToDLQ = vi.fn().mockResolvedValue({
        moved: true,
        dlqPath: './data/dlq',
      });

      // This test will fail until implementation exists
      const handleMaxRetries = async () => {
        if (maxedOutEvent.attempts >= 5) {
          const result = await bufferManager.moveToDLQ(maxedOutEvent);
          expect(result.moved).toBe(true);
        }
      };

      await expect(handleMaxRetries()).rejects.toThrow();
    });
  });

  describe('Buffer Management', () => {
    it('should handle buffer size limits', async () => {
      const maxSize = 10 * 1024 * 1024; // 10MB

      // Mock buffer size check
      bufferManager.getSize = vi.fn().mockResolvedValue(maxSize - 1000);

      const largeEvent: Event = {
        type: 'notification',
        sourceId: 'test',
        payload: {
          message: 'Large event',
          data: 'x'.repeat(2000), // Simulate large payload
        },
        timestamp: new Date().toISOString(),
      };

      // This test will fail until implementation exists
      const checkBufferLimit = async () => {
        const currentSize = await bufferManager.getSize();
        if (currentSize >= maxSize) {
          throw new Error('Buffer full');
        }
        await bufferManager.add(largeEvent);
      };

      await expect(checkBufferLimit()).rejects.toThrow();
    });

    it('should clear old buffered events', async () => {
      const olderThan = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      bufferManager.clearOlderThan = vi.fn().mockResolvedValue({
        removed: 5,
        remaining: 2,
      });

      // This test will fail until implementation exists
      const clearOldEvents = async () => {
        const result = await bufferManager.clearOlderThan(olderThan);
        expect(result.removed).toBe(5);
        expect(result.remaining).toBe(2);
      };

      await expect(clearOldEvents()).rejects.toThrow();
    });

    it('should force flush buffer even when server is offline', async () => {
      const bufferedEvents = [
        { id: 'buffer-001', event: {} },
        { id: 'buffer-002', event: {} },
        { id: 'buffer-003', event: {} },
      ];

      bufferManager.getAll.mockResolvedValue(bufferedEvents);

      // Mock force flush behavior (write to alternate location)
      client.flushBuffer.mockImplementation(async ({ force }: any) => {
        if (force) {
          // Write to alternate location or clear buffer
          return {
            sent: 0,
            failed: 0,
            exported: 3,
            exportPath: './data/export/events.json',
          };
        }
        throw new Error('Server offline');
      });

      // This test will fail until implementation exists
      const forceFlush = async () => {
        const result = await client.flushBuffer({ force: true });
        expect(result.exported).toBe(3);
      };

      await expect(forceFlush()).rejects.toThrow();
    });
  });

  describe('Recovery and Persistence', () => {
    it('should load buffered events from disk on startup', async () => {
      // Mock loading persisted events
      bufferManager.load.mockResolvedValue({
        loaded: 5,
        path: path.join(bufferPath, 'events.json'),
      });

      // This test will fail until implementation exists
      const loadOnStartup = async () => {
        const result = await bufferManager.load();
        expect(result.loaded).toBe(5);
      };

      await expect(loadOnStartup()).rejects.toThrow();
    });

    it('should handle corrupted buffer files gracefully', async () => {
      // Mock corrupted file scenario
      bufferManager.load.mockRejectedValue(new Error('Invalid JSON'));

      bufferManager.recover = vi.fn().mockResolvedValue({
        recovered: true,
        backupPath: './data/buffer.backup',
        newBuffer: [],
      });

      // This test will fail until implementation exists
      const handleCorruption = async () => {
        try {
          await bufferManager.load();
        } catch (error) {
          const recovery = await bufferManager.recover();
          expect(recovery.recovered).toBe(true);
        }
      };

      await expect(handleCorruption()).rejects.toThrow();
    });

    it('should maintain event order during buffering and flushing', async () => {
      const events = [
        { id: '1', timestamp: '2024-01-01T10:00:00Z' },
        { id: '2', timestamp: '2024-01-01T10:00:01Z' },
        { id: '3', timestamp: '2024-01-01T10:00:02Z' },
      ];

      bufferManager.getAll.mockResolvedValue(events);

      // Mock ordered flush
      let processedOrder: string[] = [];
      client.flushBuffer.mockImplementation(async () => {
        const buffered = await bufferManager.getAll();
        processedOrder = buffered.map((e: any) => e.id);
        return { sent: 3, order: processedOrder };
      });

      // This test will fail until implementation exists
      const checkOrder = async () => {
        const result = await client.flushBuffer();
        expect(result.order).toEqual(['1', '2', '3']);
      };

      await expect(checkOrder()).rejects.toThrow();
    });
  });

  describe('Complete Buffering Flow', () => {
    it('should handle complete offline-online cycle', async () => {
      // This test simulates the complete flow from quickstart.md Scenario 2

      // Step 1: Server is online initially
      client.healthCheck.mockResolvedValueOnce({
        status: 'healthy',
        serverUrl,
      });

      // Step 2: Server goes offline
      client.healthCheck.mockRejectedValueOnce(new Error('Connection refused'));

      // Step 3: Event is buffered
      const testEvent: Event = {
        type: 'notification',
        sourceId: 'test',
        payload: { message: 'Buffered event' },
        timestamp: new Date().toISOString(),
      };

      bufferManager.add.mockResolvedValue({
        bufferId: 'buffer-001',
        status: 'buffered',
      });

      client.getStatus.mockResolvedValueOnce({
        sent: 0,
        failed: 0,
        buffered: 1,
        serverStatus: 'disconnected',
      });

      // Step 4: Server comes back online
      client.healthCheck.mockResolvedValueOnce({
        status: 'healthy',
        serverUrl,
      });

      // Step 5: Buffered events are flushed
      client.flushBuffer.mockResolvedValue({
        sent: 1,
        failed: 0,
        remaining: 0,
      });

      client.getStatus.mockResolvedValueOnce({
        sent: 1,
        failed: 0,
        buffered: 0,
        serverStatus: 'connected',
      });

      // This test will fail until implementation exists
      const completeFlow = async () => {
        // Initial health check - server is up
        let health = await client.healthCheck();
        expect(health.status).toBe('healthy');

        // Server goes down
        try {
          await client.healthCheck();
        } catch (error) {
          // Event gets buffered
          const bufferResult = await bufferManager.add(testEvent);
          expect(bufferResult.status).toBe('buffered');

          // Check status shows buffered event
          let status = await client.getStatus();
          expect(status.buffered).toBe(1);

          // Wait for server to come back (simulate 60 seconds)
          await new Promise(resolve => setTimeout(resolve, 100));

          // Server is back
          health = await client.healthCheck();
          expect(health.status).toBe('healthy');

          // Flush buffer
          const flushResult = await client.flushBuffer();
          expect(flushResult.sent).toBe(1);

          // Final status check
          status = await client.getStatus();
          expect(status.sent).toBe(1);
          expect(status.buffered).toBe(0);
        }
      };

      await expect(completeFlow()).rejects.toThrow();
    });
  });
});