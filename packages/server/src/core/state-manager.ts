import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export class StateManager extends EventEmitter {
  private state: string = '';
  private data: Record<string, any> = {};
  private lastUpdate: Date = new Date();

  async initialize(): Promise<void> {
    this.state = this.getInitialState();
    logger.info('State manager initialized');
  }

  private getInitialState(): string {
    return `# sebas-chan State Document
    
## 現在の状態
- システム: 起動中
- 時刻: ${new Date().toISOString()}

## アクティブなFlow
なし

## 保留中のInput
なし

## 最近の活動
- システム起動

## 注意事項
なし
`;
  }

  getState(): string {
    return this.state;
  }

  updateState(content: string): void {
    const previousState = this.state;
    this.state = content;
    this.lastUpdate = new Date();

    this.emit('state:updated', {
      previous: previousState,
      current: content,
      timestamp: this.lastUpdate,
    });

    logger.debug('State updated', {
      length: content.length,
      timestamp: this.lastUpdate,
    });
  }

  appendToState(section: string, content: string): void {
    const sectionHeader = `## ${section}`;
    const lines = this.state.split('\n');
    const sectionIndex = lines.findIndex((line) => line.startsWith(sectionHeader));

    if (sectionIndex === -1) {
      this.state += `\n${sectionHeader}\n${content}\n`;
    } else {
      let insertIndex = sectionIndex + 1;
      while (insertIndex < lines.length && !lines[insertIndex].startsWith('## ')) {
        insertIndex++;
      }
      lines.splice(insertIndex, 0, content);
      this.state = lines.join('\n');
    }

    this.lastUpdate = new Date();
    this.emit('state:appended', { section, content });
  }

  getLastUpdate(): Date {
    return this.lastUpdate;
  }

  /**
   * データストアから値を取得
   */
  async get<T>(key: string): Promise<T | undefined> {
    return this.data[key] as T;
  }

  /**
   * データストアに値を設定
   */
  async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value;
    this.lastUpdate = new Date();
    this.emit('data:set', { key, value });
    logger.debug(`Data set: ${key}`);
  }

  /**
   * データストアの値を更新
   */
  async update<T>(key: string, updater: (current: T | undefined) => T): Promise<void> {
    const current = this.data[key] as T | undefined;
    const updated = updater(current);
    this.data[key] = updated;
    this.lastUpdate = new Date();
    this.emit('data:updated', { key, previous: current, current: updated });
    logger.debug(`Data updated: ${key}`);
  }
}
