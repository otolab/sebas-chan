export interface ReporterConfig {
  name?: string;
  source: string;
  apiUrl?: string;
  pollInterval?: number;
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
