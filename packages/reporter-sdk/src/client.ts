import type { Input } from '@sebas-chan/shared-types';
import type { ReporterClientOptions, SubmitResult } from './types.js';

export class ReporterClient {
  private apiUrl: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor(options: ReporterClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, '');
    this.maxRetries = options.retryOptions?.maxRetries ?? 3;
    this.retryDelay = options.retryOptions?.retryDelay ?? 1000;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = 0
  ): Promise<Response> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok && retries < this.maxRetries) {
        if (response.status >= 500) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * (retries + 1)));
          return this.fetchWithRetry(url, options, retries + 1);
        }
      }

      return response;
    } catch (error) {
      if (retries < this.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * (retries + 1)));
        return this.fetchWithRetry(url, options, retries + 1);
      }
      throw error;
    }
  }

  async submitInput(input: Omit<Input, 'id' | 'timestamp'>): Promise<SubmitResult> {
    try {
      const response = await this.fetchWithRetry(
        `${this.apiUrl}/api/inputs`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText || response.statusText}`,
        };
      }

      const result = await response.json();
      return {
        success: true,
        inputId: result.data?.id || result.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async submitBatch(inputs: Array<Omit<Input, 'id' | 'timestamp'>>): Promise<{
    success: boolean;
    succeeded: number;
    failed: number;
    results: SubmitResult[];
  }> {
    const results: SubmitResult[] = [];
    let succeeded = 0;
    let failed = 0;
    
    for (const input of inputs) {
      const result = await this.submitInput(input);
      results.push(result);
      
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return {
      success: failed === 0,
      succeeded,
      failed,
      results
    };
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getState(): Promise<any> {
    const response = await fetch(`${this.apiUrl}/state`);
    if (!response.ok) {
      throw new Error(`Failed to get state: ${response.statusText}`);
    }
    return response.json();
  }
}