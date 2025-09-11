import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReporterSDK, BaseReporter } from './index';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ReporterSDK', () => {
  let sdk: ReporterSDK;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    
    sdk = new ReporterSDK({
      name: 'test-reporter',
      apiUrl: 'http://localhost:3000',
      apiKey: 'test-key'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create an instance', () => {
    expect(sdk).toBeInstanceOf(ReporterSDK);
  });

  it('should report input successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ inputId: 'input-123', issueId: 'issue-456' })
    });

    const result = await sdk.reportInput('Test content');

    expect(result).toEqual({
      success: true,
      inputId: 'input-123',
      issueId: 'issue-456'
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/input',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          source: 'test-reporter',
          content: 'Test content'
        })
      })
    );
  });

  it('should handle report input error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await sdk.reportInput('Test content');

    expect(result).toEqual({
      success: false,
      error: 'Network error'
    });
  });

  it('should check health', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy' })
    });

    const isHealthy = await sdk.checkHealth();

    expect(isHealthy).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/health',
      expect.any(Object)
    );
  });

  it('should report batch of inputs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ inputId: 'input-123', issueId: 'issue-456' })
    });

    const inputs = [
      { content: 'Content 1' },
      { content: 'Content 2' }
    ];

    const results = await sdk.reportBatch(inputs);

    expect(results).toHaveLength(2);
    expect(results.every(r => r.success)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('BaseReporter', () => {
  class TestReporter extends BaseReporter {
    async onStart(): Promise<void> {
      // Test implementation
    }

    async onStop(): Promise<void> {
      // Test implementation
    }
  }

  let reporter: TestReporter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy' })
    });

    reporter = new TestReporter({
      name: 'test-reporter',
      apiUrl: 'http://localhost:3000'
    });
  });

  it('should create an instance', () => {
    expect(reporter).toBeInstanceOf(BaseReporter);
  });

  it('should start and stop', async () => {
    await reporter.start();
    expect(reporter['isRunning']).toBe(true);

    await reporter.stop();
    expect(reporter['isRunning']).toBe(false);
  });

  it('should not start if already running', async () => {
    await reporter.start();
    
    await expect(reporter.start()).rejects.toThrow('Reporter is already running');
  });
});