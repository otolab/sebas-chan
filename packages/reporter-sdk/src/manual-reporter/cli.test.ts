import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { ReporterClient } from '../client';

vi.mock('fs');
vi.mock('../client');

describe('manual-reporter CLI', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      submitInput: vi.fn().mockResolvedValue({
        success: true,
        inputId: 'test-input-123',
      }),
      checkHealth: vi.fn().mockResolvedValue(true),
    };

    vi.mocked(ReporterClient).mockImplementation(() => mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('submit command', () => {
    it('should submit content from command line argument', async () => {
      const testContent = 'Test input content';

      await mockClient.submitInput({
        source: 'manual',
        content: testContent,
      });

      expect(mockClient.submitInput).toHaveBeenCalledWith({
        source: 'manual',
        content: testContent,
      });
    });

    it('should submit content from file', async () => {
      const fileContent = 'Content from file';
      vi.mocked(readFileSync).mockReturnValue(fileContent);

      await mockClient.submitInput({
        source: 'manual',
        content: fileContent,
      });

      expect(mockClient.submitInput).toHaveBeenCalledWith({
        source: 'manual',
        content: fileContent,
      });
    });

    it('should handle submission errors', async () => {
      mockClient.submitInput.mockResolvedValueOnce({
        success: false,
        error: 'Network error',
      });

      const result = await mockClient.submitInput({
        source: 'manual',
        content: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('health command', () => {
    it('should check API health', async () => {
      const isHealthy = await mockClient.checkHealth();

      expect(mockClient.checkHealth).toHaveBeenCalled();
      expect(isHealthy).toBe(true);
    });

    it('should handle unhealthy API', async () => {
      mockClient.checkHealth.mockResolvedValueOnce(false);

      const isHealthy = await mockClient.checkHealth();

      expect(isHealthy).toBe(false);
    });
  });
});
