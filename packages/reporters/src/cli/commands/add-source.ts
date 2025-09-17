/**
 * Add source command implementation
 * T043: Add new event source
 */

import { Command } from 'commander';
import { sourceManager, logger } from '../../services';
import { SourceType, SourceStatus } from '../../types';
import { EventSource } from '../../models';

/**
 * Parse source type from string
 */
function parseSourceType(type: string): SourceType {
  const normalized = type.toLowerCase();
  switch (normalized) {
    case 'webhook':
      return SourceType.WEBHOOK;
    case 'polling':
      return SourceType.POLLING;
    case 'stream':
      return SourceType.STREAM;
    default:
      throw new Error(`Invalid source type: ${type}. Must be one of: webhook, polling, stream`);
  }
}

/**
 * Validate interval
 */
function validateInterval(interval: string): number {
  const value = parseInt(interval, 10);
  if (isNaN(value) || value < 1000) {
    throw new Error('Interval must be at least 1000ms (1 second)');
  }
  if (value > 86400000) {
    throw new Error('Interval cannot exceed 86400000ms (24 hours)');
  }
  return value;
}

/**
 * Format output based on format option
 */
function formatOutput(source: any, format: string): string {
  if (format === 'json') {
    return JSON.stringify(source, null, 2);
  }

  // Default human-readable format
  return `✓ Event source added successfully
  ID: ${source.id}
  Name: ${source.name}
  Type: ${source.type}
  Status: ${source.status}${
    source.config.endpoint ? `\n  Endpoint: ${source.config.endpoint}` : ''
  }${
    source.config.interval ? `\n  Interval: ${source.config.interval}ms` : ''
  }`;
}

/**
 * Create add-source command
 */
export function createAddSourceCommand(): Command {
  const command = new Command('add-source');

  command
    .description('Add a new event source')
    .requiredOption('--id <id>', 'Unique source identifier')
    .requiredOption('--name <name>', 'Source display name')
    .requiredOption('--type <type>', 'Source type (webhook, polling, stream)')
    .option('--endpoint <url>', 'Source endpoint URL (for webhook and polling)')
    .option('--interval <ms>', 'Polling interval in milliseconds (for polling sources)')
    .option('--filters <filters...>', 'Event filters')
    .option('--format <format>', 'Output format (text, json)', 'text')
    .option('--activate', 'Activate source immediately', false)
    .action(async (options) => {
      try {
        // Validate source type
        const sourceType = parseSourceType(options.type);

        // Build source configuration
        const config: any = {};

        // Validate type-specific options
        if (sourceType === SourceType.WEBHOOK) {
          if (!options.endpoint) {
            throw new Error('Webhook sources require --endpoint option');
          }
          config.endpoint = options.endpoint;
        } else if (sourceType === SourceType.POLLING) {
          if (!options.endpoint) {
            throw new Error('Polling sources require --endpoint option');
          }
          if (!options.interval) {
            throw new Error('Polling sources require --interval option');
          }
          config.endpoint = options.endpoint;
          config.interval = validateInterval(options.interval);
        } else if (sourceType === SourceType.STREAM) {
          if (options.endpoint) {
            config.endpoint = options.endpoint;
          }
        }

        // Add filters if provided
        if (options.filters && options.filters.length > 0) {
          config.filters = options.filters;
        }

        // Check if source already exists
        const existingSource = await sourceManager.getSource(options.id);
        if (existingSource) {
          throw new Error(`Source with ID '${options.id}' already exists`);
        }

        // Create new source
        const source = new EventSource(
          options.id,
          options.name,
          sourceType,
          config
        );

        // Set initial status
        source.status = options.activate ? SourceStatus.ACTIVE : SourceStatus.INACTIVE;

        // Add source
        await sourceManager.addSource(source);
        logger.info(`Added event source: ${source.id}`);

        // Activate if requested
        if (options.activate) {
          try {
            await sourceManager.updateSourceStatus(source.id, SourceStatus.ACTIVE);
            logger.info(`Activated source: ${source.id}`);
          } catch (activateError) {
            logger.warn(`Source added but activation failed: ${activateError}`);
            source.status = SourceStatus.ERROR;
          }
        }

        // Output result
        console.log(formatOutput(source, options.format));

        process.exit(0);
      } catch (error) {
        logger.error('Add source command failed:', error);

        if (options.format === 'json') {
          console.error(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2));
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : error}`);
        }

        process.exit(1);
      }
    });

  return command;
}