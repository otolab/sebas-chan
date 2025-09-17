/**
 * Remove source command implementation
 * T044: Remove event source
 */

import { Command } from 'commander';
import { sourceManager, logger } from '../../services';
import { prompt } from 'inquirer';

/**
 * Format output based on format option
 */
function formatOutput(result: any, format: string): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  // Default human-readable format
  if (result.success) {
    return `✓ Event source removed successfully
  ID: ${result.sourceId}
  Name: ${result.sourceName}`;
  } else {
    return `✗ Failed to remove source
  Error: ${result.error}`;
  }
}

/**
 * Create remove-source command
 */
export function createRemoveSourceCommand(): Command {
  const command = new Command('remove-source');

  command
    .description('Remove an event source')
    .argument('<sourceId>', 'Source ID to remove')
    .option('--format <format>', 'Output format (text, json)', 'text')
    .option('-f, --force', 'Skip confirmation prompt', false)
    .action(async (sourceId: string, options) => {
      try {
        // Check if source exists
        const source = await sourceManager.getSource(sourceId);
        if (!source) {
          throw new Error(`Source '${sourceId}' not found`);
        }

        // Confirmation prompt unless force flag is used
        if (!options.force) {
          const answers = await prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to remove source '${source.name}' (${sourceId})?`,
              default: false,
            },
          ]);

          if (!answers.confirm) {
            console.log('Cancelled');
            process.exit(0);
          }
        }

        // Remove the source
        await sourceManager.removeSource(sourceId);
        logger.info(`Removed event source: ${sourceId}`);

        // Output result
        const result = {
          success: true,
          sourceId: source.id,
          sourceName: source.name,
        };

        console.log(formatOutput(result, options.format));

        process.exit(0);
      } catch (error) {
        logger.error('Remove source command failed:', error);

        const result = {
          success: false,
          sourceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        };

        if (options.format === 'json') {
          console.error(JSON.stringify(result, null, 2));
        } else {
          console.error(formatOutput(result, options.format));
        }

        process.exit(1);
      }
    });

  return command;
}