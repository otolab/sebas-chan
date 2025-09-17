/**
 * Flush buffer command implementation
 * T047: Flush buffer to server
 */

import { Command } from 'commander';
import { bufferService, serverClient, logger } from '../../services';
import chalk from 'chalk';
import { ProgressBar } from 'cli-progress';

/**
 * Flush events from buffer to server
 */
async function flushBuffer(options: any): Promise<any> {
  const stats = await bufferService.getStats();

  if (stats.totalEvents === 0) {
    return {
      success: true,
      message: 'Buffer is empty',
      processed: 0,
      sent: 0,
      failed: 0,
    };
  }

  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  // Create progress bar if not in JSON format
  let progressBar: ProgressBar | null = null;
  if (options.format !== 'json' && !options.quiet) {
    progressBar = new ProgressBar({
      format: 'Flushing |{bar}| {percentage}% | {value}/{total} events | ETA: {eta}s',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    });
    progressBar.start(stats.totalEvents, 0);
  }

  // Process events in batches
  const batchSize = parseInt(options.batchSize, 10);
  let hasMore = true;

  while (hasMore) {
    try {
      // Get batch of events
      const events = await bufferService.getEvents(batchSize);

      if (events.length === 0) {
        hasMore = false;
        break;
      }

      results.processed += events.length;

      // Try to send batch
      try {
        const response = await serverClient.sendBatch(events);

        // Process response
        if (response.success) {
          results.sent += events.length;

          // Remove successfully sent events from buffer
          for (const event of events) {
            await bufferService.removeEvent(event.id);
          }
        } else {
          results.failed += events.length;
          if (response.error) {
            results.errors.push(response.error);
          }

          // If force flag is not set, stop on error
          if (!options.force) {
            hasMore = false;
            break;
          }
        }
      } catch (sendError) {
        results.failed += events.length;
        const errorMsg = sendError instanceof Error ? sendError.message : 'Unknown error';
        results.errors.push(errorMsg);

        // If force flag is not set, stop on error
        if (!options.force) {
          hasMore = false;
          break;
        }
      }

      // Update progress
      if (progressBar) {
        progressBar.update(results.processed);
      }

      // Add delay between batches to avoid overwhelming the server
      if (hasMore && options.delay) {
        await new Promise(resolve => setTimeout(resolve, parseInt(options.delay, 10)));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push(errorMsg);

      if (!options.force) {
        break;
      }
    }
  }

  // Stop progress bar
  if (progressBar) {
    progressBar.stop();
  }

  return {
    success: results.failed === 0,
    message: results.failed === 0 ? 'All events flushed successfully' : 'Some events failed to flush',
    processed: results.processed,
    sent: results.sent,
    failed: results.failed,
    errors: results.errors,
  };
}

/**
 * Format output based on format option
 */
function formatOutput(result: any, format: string): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  const output: string[] = [];

  // Status message
  if (result.success) {
    output.push(chalk.green(`✓ ${result.message}`));
  } else {
    output.push(chalk.yellow(`⚠ ${result.message}`));
  }

  // Statistics
  output.push('');
  output.push('Statistics:');
  output.push(`  Processed: ${result.processed}`);
  if (result.sent > 0) {
    output.push(`  ${chalk.green('✓')} Sent: ${result.sent}`);
  }
  if (result.failed > 0) {
    output.push(`  ${chalk.red('✗')} Failed: ${result.failed}`);
  }

  // Errors
  if (result.errors && result.errors.length > 0) {
    output.push('');
    output.push(chalk.red('Errors:'));
    const uniqueErrors = [...new Set(result.errors)];
    uniqueErrors.slice(0, 5).forEach((error: string) => {
      output.push(`  • ${error}`);
    });
    if (uniqueErrors.length > 5) {
      output.push(`  ... and ${uniqueErrors.length - 5} more`);
    }
  }

  return output.join('\n');
}

/**
 * Create flush-buffer command
 */
export function createFlushBufferCommand(): Command {
  const command = new Command('flush-buffer');

  command
    .description('Flush buffered events to the server')
    .option('--format <format>', 'Output format (text, json)', 'text')
    .option('--batch-size <n>', 'Number of events to send per batch', '100')
    .option('--delay <ms>', 'Delay between batches in milliseconds', '100')
    .option('-f, --force', 'Continue on errors', false)
    .option('-q, --quiet', 'Suppress progress output', false)
    .option('--dry-run', 'Simulate flush without actually sending', false)
    .action(async (options) => {
      try {
        // Check server connectivity first
        if (!options.dryRun) {
          try {
            await serverClient.healthCheck();
          } catch (error) {
            if (!options.force) {
              throw new Error(`Server is not reachable: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            logger.warn('Server is not reachable, but continuing with --force flag');
          }
        }

        // Get initial stats
        const initialStats = await bufferService.getStats();

        if (options.dryRun) {
          // Dry run - just show what would be done
          const result = {
            success: true,
            message: 'Dry run - no events were actually sent',
            wouldProcess: initialStats.totalEvents,
            bufferSize: initialStats.totalSize,
            fileCount: initialStats.fileCount,
          };

          console.log(formatOutput(result, options.format));
          process.exit(0);
        }

        // Perform actual flush
        const result = await flushBuffer(options);

        // Get final stats
        const finalStats = await bufferService.getStats();

        // Add buffer state to result
        result.bufferState = {
          before: {
            events: initialStats.totalEvents,
            size: initialStats.totalSize,
          },
          after: {
            events: finalStats.totalEvents,
            size: finalStats.totalSize,
          },
        };

        // Output results
        console.log(formatOutput(result, options.format));

        // Log summary
        if (result.sent > 0) {
          logger.info(`Flushed ${result.sent} events to server`);
        }
        if (result.failed > 0) {
          logger.warn(`Failed to flush ${result.failed} events`);
        }

        // Exit with appropriate code
        process.exit(result.success ? 0 : 1);
      } catch (error) {
        logger.error('Flush buffer command failed:', error);

        if (options.format === 'json') {
          console.error(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2));
        } else {
          console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
        }

        process.exit(1);
      }
    });

  return command;
}