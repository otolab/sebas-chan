import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

/**
 * StateManager - State文書の管理
 *
 * State文書はシステム全体で共有される単一の自然言語ワーキングメモリです。
 * - 共有された意識
 * - 思考の出発点
 * - 流動的な情報の置き場
 *
 * 注意: このクラスはState文書（自然言語テキスト）のみを管理します。
 * Issue、Flow、Knowledgeなどの構造化データはDBパッケージで管理されます。
 */
export class StateManager extends EventEmitter {
  private state: string = '';
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
}
