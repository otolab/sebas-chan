import { Input } from '@sebas-chan/shared-types';
import * as winston from 'winston';

export interface ReporterConfig {
  name: string;
  apiUrl: string;
  apiKey?: string;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

export interface ReportResult {
  success: boolean;
  inputId?: string;
  issueId?: string;
  error?: string;
}

export class ReporterSDK {
  private readonly name: string;
  private readonly apiUrl: string;
  private readonly apiKey?: string;
  private readonly logger: winston.Logger;

  constructor(config: ReporterConfig) {
    this.name = config.name;
    this.apiUrl = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;

    // Setup logger
    this.logger = winston.createLogger({
      level: config.logLevel || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `[${timestamp}] [${this.name}] ${level}: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta) : ''
          }`;
        })
      ),
      transports: [new winston.transports.Console()]
    });
  }

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.apiUrl}${path}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.apiKey && { 'X-API-Key': this.apiKey }),
      ...options.headers
    };

    this.logger.debug(`Request: ${options.method || 'GET'} ${url}`, {
      body: options.body
    });

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      this.logger.debug(`Response: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('Response error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      return response;
    } catch (error) {
      this.logger.error('Request failed:', error);
      throw error;
    }
  }

  /**
   * Report a new input to the system
   */
  async reportInput(content: string, metadata?: Record<string, any>): Promise<ReportResult> {
    try {
      this.logger.info('Reporting new input');
      
      const input: Omit<Input, 'id' | 'timestamp'> = {
        source: this.name,
        content,
        ...metadata
      };

      const response = await this.request('/api/input', {
        method: 'POST',
        body: JSON.stringify(input)
      });
      
      const data = await response.json();
      
      this.logger.info('Input reported successfully', {
        inputId: data.inputId
      });

      return {
        success: true,
        inputId: data.inputId,
        issueId: data.issueId
      };
    } catch (error) {
      this.logger.error('Failed to report input:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Report multiple inputs in batch
   */
  async reportBatch(inputs: Array<{ content: string; metadata?: Record<string, any> }>): Promise<ReportResult[]> {
    this.logger.info(`Reporting batch of ${inputs.length} inputs`);
    
    const results: ReportResult[] = [];
    
    for (const input of inputs) {
      const result = await this.reportInput(input.content, input.metadata);
      results.push(result);
      
      // Add small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const successCount = results.filter(r => r.success).length;
    this.logger.info(`Batch complete: ${successCount}/${inputs.length} succeeded`);
    
    return results;
  }

  /**
   * Check API health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.request('/health');
      const data = await response.json();
      return data.status === 'healthy';
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Get current system state
   */
  async getState(): Promise<any> {
    try {
      const response = await this.request('/api/state');
      return await response.json();
    } catch (error) {
      this.logger.error('Failed to get state:', error);
      throw error;
    }
  }

  /**
   * Subscribe to system events (if WebSocket support is added)
   */
  async subscribe(eventTypes: string[], callback: (event: any) => void): Promise<() => void> {
    // TODO: Implement WebSocket or SSE subscription
    this.logger.warn('Event subscription not yet implemented');
    
    // Return unsubscribe function
    return () => {
      this.logger.info('Unsubscribed from events');
    };
  }
}

/**
 * Base class for creating custom reporters
 */
export abstract class BaseReporter {
  protected sdk: ReporterSDK;
  protected isRunning = false;
  protected pollInterval?: NodeJS.Timeout;

  constructor(config: ReporterConfig) {
    this.sdk = new ReporterSDK(config);
  }

  /**
   * Start the reporter
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Reporter is already running');
    }

    // Check API health
    const isHealthy = await this.sdk.checkHealth();
    if (!isHealthy) {
      throw new Error('API is not healthy');
    }

    this.isRunning = true;
    await this.onStart();
  }

  /**
   * Stop the reporter
   */
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

  /**
   * Report an input
   */
  protected async report(content: string, metadata?: Record<string, any>): Promise<ReportResult> {
    return this.sdk.reportInput(content, metadata);
  }

  /**
   * Setup polling for a data source
   */
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

  /**
   * Hook called when reporter starts
   */
  protected abstract onStart(): Promise<void>;

  /**
   * Hook called when reporter stops
   */
  protected abstract onStop(): Promise<void>;
}

export default ReporterSDK;