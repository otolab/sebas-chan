/**
 * テスト用のモックドライバー
 */

export class MockDriver {
  private responses: any[];
  private currentIndex = 0;

  constructor(config: { responses: any[] }) {
    this.responses = config.responses || [];
  }

  async query(prompt: any, options?: any): Promise<{ content: string }> {
    if (this.currentIndex >= this.responses.length) {
      return { content: '{}' };
    }

    const response = this.responses[this.currentIndex++];
    const content = typeof response === 'string' ? response : JSON.stringify(response);

    return { content };
  }

  async complete(prompt: string, options?: any): Promise<string> {
    return this.query(prompt, options).then(r => r.content);
  }
}