import type { Input } from '@sebas-chan/shared-types';

export interface ReporterConfig {
  name: string;
  source: string;
  apiUrl?: string;
}

export interface ReporterClientOptions {
  apiUrl: string;
  retryOptions?: {
    maxRetries?: number;
    retryDelay?: number;
  };
}

export interface SubmitResult {
  success: boolean;
  inputId?: string;
  error?: string;
}