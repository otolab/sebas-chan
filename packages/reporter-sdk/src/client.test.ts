import { describe, it, expect, beforeAll, afterEach, vi, SpyInstance } from 'vitest';
import { ReporterClient } from './client';

describe('ReporterClient', () => {
  let client: ReporterClient;
  let mockedFetch: SpyInstance;

  beforeAll(() => {
    client = new ReporterClient({
      apiUrl: 'http://localhost:3001',
      retryOptions: {
        maxRetries: 2,
        retryDelay: 100,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('submitInput', () => {
    it('should submit input successfully', async () => {
      mockedFetch = vi.spyOn(global, 'fetch').mockImplementation(
        async () =>
          new Response(JSON.stringify({ data: { id: 'test-id-123' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      );

      const result = await client.submitInput({
        source: 'test',
        content: 'Test input content',
      });

      expect(result.success).toBe(true);
      expect(result.inputId).toBe('test-id-123');
      expect(result.error).toBeUndefined();
      expect(mockedFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/inputs',
        expect.any(Object)
      );
    });

    it('should handle API errors', async () => {
      mockedFetch = vi.spyOn(global, 'fetch').mockImplementation(
        async () =>
          new Response('Invalid input format', {
            status: 400,
            statusText: 'Bad Request',
          })
      );

      const result = await client.submitInput({
        source: 'test',
        content: 'Test input',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 400');
      expect(result.inputId).toBeUndefined();
    });

    it('should retry on server errors', async () => {
      let callCount = 0;
      mockedFetch = vi.spyOn(global, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('', {
            status: 500,
            statusText: 'Internal Server Error',
          });
        }
        return new Response(JSON.stringify({ data: { id: 'retry-success-id' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const result = await client.submitInput({
        source: 'test',
        content: 'Test with retry',
      });

      expect(mockedFetch).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.inputId).toBe('retry-success-id');
    });

    it('should handle network errors', async () => {
      mockedFetch = vi.spyOn(global, 'fetch').mockImplementation(async () => {
        throw new Error('Network error');
      });

      const result = await client.submitInput({
        source: 'test',
        content: 'Test input',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('submitBatch', () => {
    it('should submit multiple inputs', async () => {
      mockedFetch = vi.spyOn(global, 'fetch').mockImplementation(
        async () =>
          new Response(JSON.stringify({ data: { id: 'batch-id' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      );

      const inputs = [
        { source: 'test', content: 'Input 1' },
        { source: 'test', content: 'Input 2' },
      ];

      const result = await client.submitBatch(inputs);

      expect(result.success).toBe(true);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results.every((r) => r.success)).toBe(true);
    });
  });

  describe('checkHealth', () => {
    it('should return true when API is healthy', async () => {
      mockedFetch = vi
        .spyOn(global, 'fetch')
        .mockImplementation(async () => new Response('', { status: 200 }));

      const isHealthy = await client.checkHealth();
      expect(isHealthy).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      mockedFetch = vi
        .spyOn(global, 'fetch')
        .mockImplementation(async () => new Response('', { status: 503 }));

      const isHealthy = await client.checkHealth();
      expect(isHealthy).toBe(false);
    });

    it('should return false on network error', async () => {
      mockedFetch = vi.spyOn(global, 'fetch').mockImplementation(async () => {
        throw new Error('Network error');
      });

      const isHealthy = await client.checkHealth();
      expect(isHealthy).toBe(false);
    });
  });
});
