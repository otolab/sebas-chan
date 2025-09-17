/**
 * List events command implementation
 * T048: List queued events
 */

import { Command } from 'commander';
import { bufferService, logger } from '../../services';
import { EventType, IEvent } from '../../types';
import Table from 'cli-table3';
import chalk from 'chalk';

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  // If less than 1 hour ago, show relative time
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    if (minutes === 0) return 'Just now';
    return `${minutes}m ago`;
  }

  // If today, show time only
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString();
  }

  // Otherwise show date and time
  return d.toLocaleString();
}

/**
 * Truncate string to specified length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Format payload for display
 */
function formatPayload(payload: unknown, maxLength: number = 50): string {
  if (!payload) return '-';

  if (typeof payload === 'string') {
    return truncate(payload, maxLength);
  }

  if (typeof payload === 'object') {
    const json = JSON.stringify(payload);
    return truncate(json, maxLength);
  }

  return String(payload);
}

/**
 * Format events for display
 */
function formatEvents(events: IEvent[], format: string, verbose: boolean): string {
  if (format === 'json') {
    return JSON.stringify(events, null, 2);
  }

  if (events.length === 0) {
    return 'No events in buffer';
  }

  // Create table for text output
  const table = new Table({
    head: verbose
      ? ['ID', 'Type', 'Source', 'Timestamp', 'Attempts', 'Payload']
      : ['Type', 'Source', 'Timestamp', 'Payload'],
    colWidths: verbose
      ? [12, 12, 15, 20, 10, 40]
      : [12, 15, 20, 50],
    style: {
      head: ['cyan'],
    },
  });

  events.forEach((event) => {
    const typeColor = event.type === EventType.NOTIFICATION ? chalk.yellow :
                     event.type === EventType.MESSAGE ? chalk.blue :
                     event.type === EventType.CALENDAR ? chalk.green :
                     event.type === EventType.TODO ? chalk.magenta :
                     chalk.gray;

    const row = verbose
      ? [
          truncate(event.id, 10),
          typeColor(event.type),
          event.sourceId,
          formatTimestamp(event.timestamp),
          event.metadata?.attempts?.toString() || '0',
          formatPayload(event.payload, 38),
        ]
      : [
          typeColor(event.type),
          event.sourceId,
          formatTimestamp(event.timestamp),
          formatPayload(event.payload, 48),
        ];

    table.push(row);
  });

  return table.toString();
}

/**
 * Apply filters to events
 */
function filterEvents(events: IEvent[], options: any): IEvent[] {
  let filtered = [...events];

  // Filter by source
  if (options.sourceId) {
    filtered = filtered.filter(e => e.sourceId === options.sourceId);
  }

  // Filter by type
  if (options.type) {
    const type = options.type.toLowerCase();
    filtered = filtered.filter(e => e.type.toLowerCase() === type);
  }

  // Filter by age
  if (options.olderThan) {
    const cutoff = parseDuration(options.olderThan);
    const cutoffTime = Date.now() - cutoff;
    filtered = filtered.filter(e => new Date(e.timestamp).getTime() < cutoffTime);
  }

  if (options.newerThan) {
    const cutoff = parseDuration(options.newerThan);
    const cutoffTime = Date.now() - cutoff;
    filtered = filtered.filter(e => new Date(e.timestamp).getTime() > cutoffTime);
  }

  // Sort events
  const sortField = options.sort || 'timestamp';
  filtered.sort((a, b) => {
    switch (sortField) {
      case 'type':
        return a.type.localeCompare(b.type);
      case 'source':
        return a.sourceId.localeCompare(b.sourceId);
      case 'attempts':
        return (a.metadata?.attempts || 0) - (b.metadata?.attempts || 0);
      case 'timestamp':
      default:
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    }
  });

  // Apply limit
  if (options.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

/**
 * Parse duration string (e.g., "1h", "30m", "7d")
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use format like "1h", "30m", "7d"`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Invalid duration unit: ${unit}`);
  }
}

/**
 * Create list-events command
 */
export function createListEventsCommand(): Command {
  const command = new Command('list-events');

  command
    .description('List events in the buffer queue')
    .option('--format <format>', 'Output format (text, json)', 'text')
    .option('--limit <n>', 'Limit number of events', '50')
    .option('--source-id <id>', 'Filter by source ID')
    .option('--type <type>', 'Filter by event type')
    .option('--older-than <duration>', 'Show events older than duration (e.g., 1h, 30m, 7d)')
    .option('--newer-than <duration>', 'Show events newer than duration')
    .option('--sort <field>', 'Sort by field (timestamp, type, source, attempts)', 'timestamp')
    .option('-v, --verbose', 'Show detailed event information', false)
    .option('--stats', 'Show statistics only', false)
    .action(async (options) => {
      try {
        // Get all events from buffer
        const allEvents = await bufferService.getEvents(10000); // Get up to 10k events

        // Apply filters
        const events = filterEvents(allEvents, {
          ...options,
          limit: options.stats ? 0 : parseInt(options.limit, 10),
        });

        if (options.stats) {
          // Show statistics only
          const stats = {
            total: allEvents.length,
            filtered: events.length,
            byType: {} as Record<string, number>,
            bySource: {} as Record<string, number>,
            oldestEvent: null as string | null,
            newestEvent: null as string | null,
            averageAttempts: 0,
            totalSize: 0,
          };

          // Calculate statistics
          allEvents.forEach((event) => {
            // By type
            stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;

            // By source
            stats.bySource[event.sourceId] = (stats.bySource[event.sourceId] || 0) + 1;

            // Timestamps
            const timestamp = new Date(event.timestamp).toISOString();
            if (!stats.oldestEvent || timestamp < stats.oldestEvent) {
              stats.oldestEvent = timestamp;
            }
            if (!stats.newestEvent || timestamp > stats.newestEvent) {
              stats.newestEvent = timestamp;
            }

            // Attempts
            stats.averageAttempts += event.metadata?.attempts || 0;

            // Size estimate (rough)
            stats.totalSize += JSON.stringify(event).length;
          });

          if (allEvents.length > 0) {
            stats.averageAttempts = stats.averageAttempts / allEvents.length;
          }

          if (options.format === 'json') {
            console.log(JSON.stringify(stats, null, 2));
          } else {
            console.log(chalk.bold.cyan('\n═══ Buffer Statistics ═══\n'));
            console.log(`Total Events: ${stats.total}`);
            if (options.sourceId || options.type) {
              console.log(`Filtered: ${stats.filtered}`);
            }
            console.log(`\nBy Type:`);
            Object.entries(stats.byType).forEach(([type, count]) => {
              console.log(`  ${type}: ${count}`);
            });
            console.log(`\nBy Source:`);
            Object.entries(stats.bySource).forEach(([source, count]) => {
              console.log(`  ${source}: ${count}`);
            });
            if (stats.oldestEvent) {
              console.log(`\nOldest Event: ${formatTimestamp(stats.oldestEvent)}`);
            }
            if (stats.newestEvent) {
              console.log(`Newest Event: ${formatTimestamp(stats.newestEvent)}`);
            }
            console.log(`Average Attempts: ${stats.averageAttempts.toFixed(1)}`);
            console.log(`Total Size: ${(stats.totalSize / 1024).toFixed(1)} KB`);
          }
        } else {
          // Show events
          console.log(formatEvents(events, options.format, options.verbose));

          // Add summary if text format
          if (options.format === 'text' && events.length > 0) {
            const hasMore = allEvents.length > events.length;
            console.log(`\nShowing ${events.length} of ${allEvents.length} event(s)`);

            if (hasMore) {
              console.log(chalk.gray('Use --limit to show more events'));
            }
          }
        }

        process.exit(0);
      } catch (error) {
        logger.error('List events command failed:', error);

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