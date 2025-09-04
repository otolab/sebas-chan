import { Logger } from '@sebas-chan/shared-types';

class ConsoleLogger implements Logger {
  private isDevelopment = process.env.NODE_ENV !== 'production';

  debug(message: string, data?: unknown): void {
    if (this.isDevelopment) {
      console.debug(`[DEBUG] ${message}`, data || '');
    }
  }

  info(message: string, data?: unknown): void {
    console.log(`[INFO] ${message}`, data || '');
  }

  warn(message: string, data?: unknown): void {
    console.warn(`[WARN] ${message}`, data || '');
  }

  error(message: string, error?: unknown): void {
    console.error(`[ERROR] ${message}`, error || '');
  }
}

export const logger = new ConsoleLogger();
