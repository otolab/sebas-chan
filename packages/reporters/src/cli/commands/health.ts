/**
 * Health command implementation
 * T046: Health check command
 */

import { Command } from 'commander';
import { healthMonitor, serverClient, bufferService, sourceManager, logger } from '../../services';
import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Perform component health checks
 */
async function performHealthChecks() {
  const checks = {
    server: { name: 'Server Connection', healthy: false, message: '', responseTime: 0 },
    buffer: { name: 'Buffer Service', healthy: false, message: '' },
    sources: { name: 'Source Manager', healthy: false, message: '' },
    filesystem: { name: 'File System', healthy: false, message: '' },
  };

  // Check server connection
  try {
    const startTime = Date.now();
    const health = await serverClient.healthCheck();
    const responseTime = Date.now() - startTime;

    checks.server.healthy = health.healthy;
    checks.server.responseTime = responseTime;
    checks.server.message = health.healthy
      ? `Connected (${responseTime}ms)`
      : 'Connection failed';
  } catch (error) {
    checks.server.healthy = false;
    checks.server.message = error instanceof Error ? error.message : 'Unknown error';
  }

  // Check buffer service
  try {
    const stats = await bufferService.getStats();
    const usage = stats.totalSize / (10 * 1024 * 1024); // Default max 10MB
    checks.buffer.healthy = usage < 0.9; // Healthy if under 90% capacity
    checks.buffer.message = `${stats.totalEvents} events, ${(usage * 100).toFixed(1)}% capacity`;
  } catch (error) {
    checks.buffer.healthy = false;
    checks.buffer.message = error instanceof Error ? error.message : 'Unknown error';
  }

  // Check source manager
  try {
    const sources = await sourceManager.listSources();
    const errorCount = sources.filter(s => s.status === 'error').length;
    checks.sources.healthy = errorCount === 0;
    checks.sources.message = errorCount > 0
      ? `${errorCount} source(s) in error state`
      : `${sources.length} source(s) configured`;
  } catch (error) {
    checks.sources.healthy = false;
    checks.sources.message = error instanceof Error ? error.message : 'Unknown error';
  }

  // Check filesystem (data directories)
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const dataDir = process.env.BUFFER_DATA_DIR || './data/buffer';
    await fs.access(dataDir, fs.constants.R_OK | fs.constants.W_OK);

    const stats = await fs.stat(dataDir);
    checks.filesystem.healthy = stats.isDirectory();
    checks.filesystem.message = checks.filesystem.healthy
      ? 'Data directories accessible'
      : 'Data directory issues';
  } catch (error) {
    checks.filesystem.healthy = false;
    checks.filesystem.message = 'Cannot access data directories';
  }

  return checks;
}

/**
 * Calculate overall health score
 */
function calculateHealthScore(checks: any): number {
  const weights = {
    server: 0.4,    // 40% weight
    buffer: 0.2,    // 20% weight
    sources: 0.2,   // 20% weight
    filesystem: 0.2 // 20% weight
  };

  let score = 0;
  for (const [key, check] of Object.entries(checks)) {
    if (check && typeof check === 'object' && 'healthy' in check) {
      score += (check.healthy ? 1 : 0) * (weights[key as keyof typeof weights] || 0);
    }
  }

  return Math.round(score * 100);
}

/**
 * Format output based on format option
 */
function formatOutput(health: any, format: string): string {
  if (format === 'json') {
    return JSON.stringify(health, null, 2);
  }

  const output: string[] = [];

  // Header with overall status
  const scoreColor = health.score >= 80 ? chalk.green :
                     health.score >= 60 ? chalk.yellow :
                     chalk.red;

  output.push(chalk.bold.cyan('\n═══ System Health Check ═══\n'));
  output.push(`Overall Health Score: ${scoreColor(health.score + '%')}`);
  output.push(`Status: ${health.healthy ? chalk.green('HEALTHY') : chalk.red('UNHEALTHY')}\n`);

  // Component health table
  const table = new Table({
    head: [
      chalk.cyan('Component'),
      chalk.cyan('Status'),
      chalk.cyan('Details')
    ],
    colWidths: [20, 15, 45],
    style: {
      head: [],
      border: ['grey']
    }
  });

  for (const [key, check] of Object.entries(health.checks)) {
    if (check && typeof check === 'object' && 'name' in check) {
      const c = check as any;
      const statusIcon = c.healthy ? chalk.green('✓') : chalk.red('✗');
      const statusText = c.healthy ? chalk.green('Healthy') : chalk.red('Unhealthy');

      table.push([
        c.name,
        `${statusIcon} ${statusText}`,
        c.message
      ]);
    }
  }

  output.push(table.toString());

  // System metrics
  if (health.metrics) {
    output.push(chalk.bold.cyan('\n═══ System Metrics ═══\n'));

    const metricsTable = new Table({
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    });

    metricsTable.push(
      ['Uptime', formatUptime(health.metrics.uptime)],
      ['Memory Usage', `${health.metrics.memoryMB.toFixed(1)} MB (${(health.metrics.memoryPercent * 100).toFixed(1)}%)`],
      ['CPU Load', health.metrics.cpuLoad.map((l: number) => l.toFixed(2)).join(', ')],
      ['Timestamp', new Date(health.timestamp).toLocaleString()]
    );

    output.push(metricsTable.toString());
  }

  // Recommendations if unhealthy
  if (!health.healthy) {
    output.push(chalk.bold.yellow('\n═══ Recommendations ═══\n'));

    const recommendations: string[] = [];

    if (!health.checks.server?.healthy) {
      recommendations.push('• Check server connectivity and configuration');
      recommendations.push('• Verify server URL: ' + (process.env.SERVER_BASE_URL || 'http://localhost:8080'));
    }

    if (!health.checks.buffer?.healthy) {
      recommendations.push('• Buffer is near capacity - consider flushing events');
      recommendations.push('• Run: npx reporters flush-buffer');
    }

    if (!health.checks.sources?.healthy) {
      recommendations.push('• Some event sources are in error state');
      recommendations.push('• Run: npx reporters list-sources --status error');
    }

    if (!health.checks.filesystem?.healthy) {
      recommendations.push('• Check filesystem permissions for data directories');
      recommendations.push('• Ensure write access to: ' + (process.env.BUFFER_DATA_DIR || './data'));
    }

    output.push(recommendations.join('\n'));
  }

  return output.join('\n');
}

/**
 * Format uptime duration
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${Math.floor(seconds)}s`);

  return parts.join(' ');
}

/**
 * Create health command
 */
export function createHealthCommand(): Command {
  const command = new Command('health');

  command
    .description('Perform system health check')
    .option('--format <format>', 'Output format (text, json)', 'text')
    .option('--watch', 'Continuously monitor health', false)
    .option('--interval <ms>', 'Watch interval in milliseconds', '5000')
    .action(async (options) => {
      try {
        const runHealthCheck = async () => {
          // Perform health checks
          const checks = await performHealthChecks();
          const score = calculateHealthScore(checks);
          const healthy = score >= 60; // Consider healthy if score is 60% or above

          // Get system metrics
          const memUsage = process.memoryUsage();
          const os = await import('os');

          const health = {
            timestamp: new Date().toISOString(),
            healthy,
            score,
            checks,
            metrics: {
              uptime: process.uptime(),
              memoryMB: memUsage.heapUsed / 1024 / 1024,
              memoryPercent: memUsage.heapUsed / memUsage.heapTotal,
              cpuLoad: os.loadavg(),
            },
          };

          // Clear console if watching
          if (options.watch) {
            console.clear();
          }

          // Output results
          console.log(formatOutput(health, options.format));

          return healthy;
        };

        if (options.watch) {
          // Continuous monitoring mode
          console.log('Starting health monitoring... Press Ctrl+C to stop.\n');

          // Run initial check
          await runHealthCheck();

          // Set up interval
          const interval = parseInt(options.interval, 10);
          setInterval(runHealthCheck, interval);
        } else {
          // Single check
          const healthy = await runHealthCheck();
          process.exit(healthy ? 0 : 1);
        }
      } catch (error) {
        logger.error('Health command failed:', error);

        if (options.format === 'json') {
          console.error(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            healthy: false,
            score: 0,
          }, null, 2));
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : error}`);
        }

        process.exit(1);
      }
    });

  return command;
}