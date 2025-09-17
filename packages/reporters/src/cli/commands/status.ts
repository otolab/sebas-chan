/**
 * Status command implementation
 * T045: Show system status
 */

import { Command } from 'commander';
import { bufferService, sourceManager, healthMonitor, serverClient, logger } from '../../services';
import { SourceStatus } from '../../types';
import Table from 'cli-table3';
import chalk from 'chalk';

/**
 * Get buffer statistics
 */
async function getBufferStats() {
  const stats = await bufferService.getStats();
  return {
    totalEvents: stats.totalEvents,
    totalSize: stats.totalSize,
    fileCount: stats.fileCount,
    oldestEvent: stats.oldestEventTime,
    newestEvent: stats.newestEventTime,
  };
}

/**
 * Get source statistics
 */
async function getSourceStats() {
  const sources = await sourceManager.listSources();
  return {
    total: sources.length,
    active: sources.filter(s => s.status === SourceStatus.ACTIVE).length,
    inactive: sources.filter(s => s.status === SourceStatus.INACTIVE).length,
    error: sources.filter(s => s.status === SourceStatus.ERROR).length,
  };
}

/**
 * Get server connection status
 */
async function getServerStatus() {
  try {
    const health = await serverClient.healthCheck();
    return {
      connected: health.healthy,
      url: serverClient['config'].baseUrl,
      lastCheck: new Date().toISOString(),
      responseTime: health.responseTime || 0,
    };
  } catch (error) {
    return {
      connected: false,
      url: serverClient['config'].baseUrl,
      lastCheck: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration to human readable
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format output based on format option
 */
function formatOutput(status: any, format: string, verbose: boolean): string {
  if (format === 'json') {
    return JSON.stringify(status, null, 2);
  }

  // Create tables for text output
  const output: string[] = [];

  // System Overview
  output.push(chalk.bold.cyan('\n═══ System Status ═══\n'));

  const overviewTable = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
  });

  // Server status
  const serverIcon = status.server.connected ? chalk.green('✓') : chalk.red('✗');
  overviewTable.push(
    [chalk.bold('Server'), `${serverIcon} ${status.server.connected ? 'Connected' : 'Disconnected'}`],
    ['  URL', status.server.url]
  );

  if (status.server.responseTime) {
    overviewTable.push(['  Response Time', `${status.server.responseTime}ms`]);
  }
  if (status.server.error) {
    overviewTable.push(['  Error', chalk.red(status.server.error)]);
  }

  output.push(overviewTable.toString());

  // Buffer Statistics
  output.push(chalk.bold.cyan('\n═══ Buffer ═══\n'));

  const bufferTable = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
  });

  bufferTable.push(
    ['Events', status.buffer.totalEvents.toString()],
    ['Size', formatBytes(status.buffer.totalSize)],
    ['Files', status.buffer.fileCount.toString()]
  );

  if (status.buffer.oldestEvent) {
    bufferTable.push(['Oldest Event', new Date(status.buffer.oldestEvent).toLocaleString()]);
  }

  output.push(bufferTable.toString());

  // Source Statistics
  output.push(chalk.bold.cyan('\n═══ Event Sources ═══\n'));

  const sourceTable = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
  });

  sourceTable.push(
    ['Total', status.sources.total.toString()],
    ['Active', chalk.green(status.sources.active.toString())],
    ['Inactive', chalk.yellow(status.sources.inactive.toString())],
    ['Error', chalk.red(status.sources.error.toString())]
  );

  output.push(sourceTable.toString());

  // Health Status (if verbose)
  if (verbose && status.health) {
    output.push(chalk.bold.cyan('\n═══ Health Metrics ═══\n'));

    const healthTable = new Table({
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    });

    healthTable.push(
      ['Overall', status.health.overall === 'healthy' ? chalk.green('Healthy') : chalk.red('Unhealthy')],
      ['Uptime', formatDuration(status.health.uptime)],
      ['Memory Usage', `${(status.health.memoryUsage * 100).toFixed(1)}%`],
      ['CPU Usage', `${(status.health.cpuUsage * 100).toFixed(1)}%`]
    );

    if (status.health.components) {
      output.push('\nComponents:');
      const componentTable = new Table({
        head: ['Component', 'Status', 'Last Check'],
        colWidths: [20, 15, 25],
      });

      Object.entries(status.health.components).forEach(([name, component]: [string, any]) => {
        const statusIcon = component.healthy ? chalk.green('✓') : chalk.red('✗');
        componentTable.push([
          name,
          `${statusIcon} ${component.healthy ? 'Healthy' : 'Unhealthy'}`,
          component.lastCheck ? new Date(component.lastCheck).toLocaleString() : '-',
        ]);
      });

      output.push(componentTable.toString());
    }
  }

  return output.join('\n');
}

/**
 * Create status command
 */
export function createStatusCommand(): Command {
  const command = new Command('status');

  command
    .description('Show system status and statistics')
    .option('--format <format>', 'Output format (text, json)', 'text')
    .option('-v, --verbose', 'Show detailed status information', false)
    .action(async (options) => {
      try {
        // Gather all status information
        const [bufferStats, sourceStats, serverStatus] = await Promise.all([
          getBufferStats(),
          getSourceStats(),
          getServerStatus(),
        ]);

        const status: any = {
          timestamp: new Date().toISOString(),
          server: serverStatus,
          buffer: bufferStats,
          sources: sourceStats,
        };

        // Add health metrics if verbose
        if (options.verbose) {
          const healthStatus = await healthMonitor.getStatus();
          const metrics = await healthMonitor.getMetrics();

          status.health = {
            overall: healthStatus,
            uptime: process.uptime() * 1000,
            memoryUsage: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal,
            cpuUsage: metrics.cpuUsage || 0,
            components: await healthMonitor.getComponentStatus(),
          };
        }

        // Output results
        console.log(formatOutput(status, options.format, options.verbose));

        // Exit with appropriate code based on health
        const isHealthy = serverStatus.connected && sourceStats.error === 0;
        process.exit(isHealthy ? 0 : 1);
      } catch (error) {
        logger.error('Status command failed:', error);

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