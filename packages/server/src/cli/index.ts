import * as readline from 'readline';
import { CoreEngine } from '../core/engine.js';

export class CLI {
  private rl: readline.Interface;
  private coreEngine: CoreEngine;
  private isRunning: boolean = false;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'sebas-chan> ',
    });
    this.coreEngine = new CoreEngine();
  }

  async start(): Promise<void> {
    console.log('sebas-chan CLI v0.1.0');
    console.log('Type "help" for available commands\n');

    await this.coreEngine.initialize();
    this.isRunning = true;

    this.rl.prompt();

    this.rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (trimmed) {
        await this.handleCommand(trimmed);
      }
      if (this.isRunning) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.stop();
    });
  }

  private async handleCommand(input: string): Promise<void> {
    const [command, ...args] = input.split(' ');

    switch (command.toLowerCase()) {
      case 'help':
        this.showHelp();
        break;

      case 'state':
        this.showState();
        break;

      case 'input':
        await this.createInput(args.join(' '));
        break;

      case 'issue':
        await this.createIssue(args.join(' '));
        break;

      case 'flow':
        await this.createFlow(args.join(' '));
        break;

      case 'process':
        await this.processRequest(args.join(' '));
        break;

      case 'queue':
        this.showQueue();
        break;

      case 'exit':
      case 'quit':
        this.stop();
        break;

      default:
        console.log(`Unknown command: ${command}`);
        console.log('Type "help" for available commands');
    }
  }

  private showHelp(): void {
    console.log(`
Available commands:
  help                  - Show this help message
  state                 - Show current state document
  input <content>       - Create a new input
  issue <title>         - Create a new issue
  flow <title>          - Create a new flow
  process <prompt>      - Process a user request
  queue                 - Show event queue status
  exit, quit           - Exit the CLI
    `);
  }

  private showState(): void {
    const state = this.coreEngine.getState();
    console.log('\n--- State Document ---');
    console.log(state);
    console.log('--- End of State ---\n');
  }

  private async createInput(content: string): Promise<void> {
    if (!content) {
      console.log('Usage: input <content>');
      return;
    }

    try {
      const input = await this.coreEngine.createInput({
        source: 'cli',
        content,
        timestamp: new Date(),
      });
      console.log(`Created input: ${input.id}`);
    } catch (error) {
      console.error('Failed to create input:', error);
    }
  }

  private async createIssue(title: string): Promise<void> {
    if (!title) {
      console.log('Usage: issue <title>');
      return;
    }

    try {
      const issue = await this.coreEngine.createIssue({
        title,
        description: '',
        status: 'open',
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
      });
      console.log(`Created issue: ${issue.id}`);
    } catch (error) {
      console.error('Failed to create issue:', error);
    }
  }

  private async createFlow(title: string): Promise<void> {
    if (!title) {
      console.log('Usage: flow <title>');
      return;
    }

    try {
      const flow = await this.coreEngine.createFlow({
        title,
        description: '',
        status: 'backlog',
        priorityScore: 0.5,
        issueIds: [],
      });
      console.log(`Created flow: ${flow.id}`);
    } catch (error) {
      console.error('Failed to create flow:', error);
    }
  }

  private async processRequest(prompt: string): Promise<void> {
    if (!prompt) {
      console.log('Usage: process <prompt>');
      return;
    }

    this.coreEngine.enqueueEvent({
      type: 'PROCESS_USER_REQUEST',
      priority: 'high',
      payload: { prompt },
    });
    console.log('Request queued for processing');
  }

  private showQueue(): void {
    const event = this.coreEngine.dequeueEvent();
    if (event) {
      console.log('Next event in queue:');
      console.log(JSON.stringify(event, null, 2));
      this.coreEngine.enqueueEvent(event);
    } else {
      console.log('Event queue is empty');
    }
  }

  private stop(): void {
    console.log('\nShutting down...');
    this.isRunning = false;
    this.coreEngine.stop();
    this.rl.close();
    process.exit(0);
  }
}
