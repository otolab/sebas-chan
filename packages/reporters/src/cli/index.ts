#!/usr/bin/env node
/**
 * CLI main entry point
 * @module cli
 */

import { Command } from 'commander';
import { createServerCommand } from './commands/server';
import { createSendEventCommand } from './commands/send-event';
import { createListSourcesCommand } from './commands/list-sources';
import { createAddSourceCommand } from './commands/add-source';
import { createRemoveSourceCommand } from './commands/remove-source';
import { createStatusCommand } from './commands/status';
import { createHealthCommand } from './commands/health';
import { createFlushBufferCommand } from './commands/flush-buffer';
import { createListEventsCommand } from './commands/list-events';
import { logger } from '../services';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
});

/**
 * Create the main CLI program
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name('reporters')
    .description('Event collection and reporting system for sebas-chan')
    .version('0.1.0')
    .option('--config <path>', 'Path to configuration file')
    .option('--log-level <level>', 'Set log level (error, warn, info, debug)', 'info');

  // Add subcommands
  // Server management
  program.addCommand(createServerCommand());

  // Event management
  program.addCommand(createSendEventCommand());
  program.addCommand(createListEventsCommand());
  program.addCommand(createFlushBufferCommand());

  // Source management
  program.addCommand(createListSourcesCommand());
  program.addCommand(createAddSourceCommand());
  program.addCommand(createRemoveSourceCommand());

  // System monitoring
  program.addCommand(createStatusCommand());
  program.addCommand(createHealthCommand());

  return program;
}

/**
 * Main CLI function
 */
async function main(): Promise<void> {
  try {
    const program = createProgram();

    // Parse command line arguments
    await program.parseAsync(process.argv);
  } catch (error) {
    logger.error('CLI error', {
      error: error instanceof Error ? error.message : error,
    });
    process.exit(1);
  }
}

// Error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason,
    promise,
  });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error', { error });
    process.exit(1);
  });
}

export { createProgram, main };