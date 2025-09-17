/**
 * List sources command implementation
 * T042: List event sources
 */

import { Command } from 'commander';
import { sourceManager, logger } from '../../services';
import { SourceStatus, SourceType } from '../../types';
import Table from 'cli-table3';

/**
 * Format source for display
 */
function formatSource(source: any) {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    status: source.status,
    endpoint: source.config?.endpoint || '-',
    interval: source.config?.interval ? `${source.config.interval}ms` : '-',
    lastConnected: source.lastConnectedAt
      ? new Date(source.lastConnectedAt).toLocaleString()
      : 'Never',
  };
}

/**
 * Format output based on format option
 */
function formatOutput(sources: any[], format: string): string {
  if (format === 'json') {
    return JSON.stringify(sources, null, 2);
  }

  // Create a nice table for text output
  if (sources.length === 0) {
    return 'No event sources configured';
  }

  const table = new Table({
    head: ['ID', 'Name', 'Type', 'Status', 'Endpoint/Interval', 'Last Connected'],
    colWidths: [15, 25, 10, 10, 30, 20],
    style: {
      head: ['cyan'],
    },
  });

  sources.forEach((source) => {
    const formatted = formatSource(source);
    const endpointInfo =
      source.type === SourceType.WEBHOOK
        ? formatted.endpoint
        : source.type === SourceType.POLLING
        ? formatted.interval
        : '-';

    // Color status based on value
    let statusDisplay = formatted.status;
    if (formatted.status === SourceStatus.ACTIVE) {
      statusDisplay = `✓ ${formatted.status}`;
    } else if (formatted.status === SourceStatus.ERROR) {
      statusDisplay = `✗ ${formatted.status}`;
    } else {
      statusDisplay = `○ ${formatted.status}`;
    }

    table.push([
      formatted.id,
      formatted.name,
      formatted.type,
      statusDisplay,
      endpointInfo,
      formatted.lastConnected,
    ]);
  });

  return table.toString();
}

/**
 * Create list-sources command
 */
export function createListSourcesCommand(): Command {
  const command = new Command('list-sources');

  command
    .description('List all configured event sources')
    .option('--format <format>', 'Output format (text, json)', 'text')
    .option('--status <status>', 'Filter by status (active, inactive, error)')
    .option('--type <type>', 'Filter by type (webhook, polling, stream)')
    .option('--limit <n>', 'Limit number of results', '100')
    .option('--sort <field>', 'Sort by field (id, name, type, status)', 'id')
    .action(async (options) => {
      try {
        // Get all sources
        let sources = await sourceManager.listSources();

        // Apply filters
        if (options.status) {
          const statusFilter = options.status.toUpperCase() as SourceStatus;
          sources = sources.filter((s) => s.status === statusFilter);
        }

        if (options.type) {
          const typeFilter = options.type.toUpperCase() as SourceType;
          sources = sources.filter((s) => s.type === typeFilter);
        }

        // Sort sources
        const sortField = options.sort.toLowerCase();
        sources.sort((a, b) => {
          switch (sortField) {
            case 'name':
              return a.name.localeCompare(b.name);
            case 'type':
              return a.type.localeCompare(b.type);
            case 'status':
              return a.status.localeCompare(b.status);
            case 'id':
            default:
              return a.id.localeCompare(b.id);
          }
        });

        // Apply limit
        const limit = parseInt(options.limit, 10);
        if (limit > 0 && sources.length > limit) {
          sources = sources.slice(0, limit);
        }

        // Output results
        console.log(formatOutput(sources, options.format));

        // Add summary if text format
        if (options.format === 'text' && sources.length > 0) {
          const activeCount = sources.filter(s => s.status === SourceStatus.ACTIVE).length;
          const errorCount = sources.filter(s => s.status === SourceStatus.ERROR).length;

          console.log(`\nTotal: ${sources.length} source(s)`);
          if (activeCount > 0) console.log(`  Active: ${activeCount}`);
          if (errorCount > 0) console.log(`  Errors: ${errorCount}`);
        }

        process.exit(0);
      } catch (error) {
        logger.error('List sources command failed:', error);

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