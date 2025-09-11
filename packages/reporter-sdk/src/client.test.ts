import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ReporterClient } from './client';

describe('ReporterClient', () => {
  let client: ReporterClient;

  beforeAll(() => {
    client = new ReporterClient({
      apiUrl: 'http://localhost:3001',
      retryOptions: {
        maxRetries: 2,
        retryDelay: 100,
      },
    });
  });

  describe('submitInput', () => {
    it('should submit input successfully', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'test-id-123' }),
      };
      
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse as any);

      const result = await client.submitInput({
        source: 'test',
        content: 'Test input content',
      });

      expect(result.success).toBe(true);
      expect(result.inputId).toBe('test-id-123');
      expect(result.error).toBeUndefined();
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid input format',
      };
      
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse as any);

      const result = await client.submitInput({
        source: 'test',
        content: 'Test input',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 400');
      expect(result.inputId).toBeUndefined();
    });

    it('should retry on server errors', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      
      fetchSpy
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => '',
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'retry-success-id' }),
        } as any);

      const result = await client.submitInput({
        source: 'test',
        content: 'Test with retry',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.inputId).toBe('retry-success-id');
    });

    it('should handle network errors', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const result = await client.submitInput({
        source: 'test',
        content: 'Test input',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('fetch failed');
    });
  });

  describe('submitBatch', () => {
    it('should submit multiple inputs', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'batch-id' }),
      };
      
      vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

      const inputs = [
        { source: 'test', content: 'Input 1' },
        { source: 'test', content: 'Input 2' },
      ];

      const results = await client.submitBatch(inputs);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('checkHealth', () => {
    it('should return true when API is healthy', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
      } as any);

      const isHealthy = await client.checkHealth();
      expect(isHealthy).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
      } as any);

      const isHealthy = await client.checkHealth();
      expect(isHealthy).toBe(false);
    });

    it('should return false on network error', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const isHealthy = await client.checkHealth();
      expect(isHealthy).toBe(false);
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });
});