import { Logger, LogEntry } from '@sebas-chan/shared-types';

class ConsoleLogger implements Logger {
  private isDevelopment = process.env.NODE_ENV !== 'production';
  
  debug(message: string, data?: any): void {
    if (this.isDevelopment) {
      console.debug(`[DEBUG] ${message}`, data || '');
    }
  }
  
  info(message: string, data?: any): void {
    console.log(`[INFO] ${message}`, data || '');
  }
  
  warn(message: string, data?: any): void {
    console.warn(`[WARN] ${message}`, data || '');
  }
  
  error(message: string, error?: any): void {
    console.error(`[ERROR] ${message}`, error || '');
  }
}

export const logger = new ConsoleLogger();