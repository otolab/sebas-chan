import type { Input } from '@sebas-chan/shared-types';
import { ReporterClient } from './client.js';
import type { ReporterConfig, SubmitResult } from './types.js';

export abstract class BaseReporter {
  protected client: ReporterClient;
  protected config: ReporterConfig;
  private isRunning = false;
  private pollInterval?: NodeJS.Timeout;

  constructor(config: ReporterConfig) {
    this.config = config;
    this.client = new ReporterClient({
      apiUrl: config.apiUrl || 'http://localhost:3001',
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Reporter is already running');
    }

    const isHealthy = await this.client.checkHealth();
    if (!isHealthy) {
      throw new Error('API is not healthy');
    }

    this.isRunning = true;
    
    if (this.config.pollInterval) {
      this.setupPolling(this.config.pollInterval, async () => {
        await this.submitCollected();
      });
    }
    
    await this.onStart();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    await this.onStop();
  }

  async submitCollected(): Promise<number> {
    try {
      const inputs = await this.collect();
      if (inputs.length === 0) {
        return 0;
      }

      const result = await this.client.submitBatch(inputs);
      return result.succeeded;
    } catch (error) {
      console.error('Error collecting or submitting inputs:', error);
      return 0;
    }
  }

  protected async submitInput(content: string, metadata?: Record<string, any>): Promise<SubmitResult> {
    const input: Omit<Input, 'id' | 'timestamp'> = {
      source: this.config.source,
      content,
      ...metadata,
    };

    return this.client.submitInput(input);
  }

  protected setupPolling(intervalMs: number, pollFunction: () => Promise<void>): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        await pollFunction();
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, intervalMs);
  }

  protected abstract onStart(): Promise<void>;
  protected abstract onStop(): Promise<void>;
  abstract collect(): Promise<Input[]>;
}