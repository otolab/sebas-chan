#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { watch } from 'chokidar';
import { join, basename } from 'path';
import { ReporterClient } from '../client.js';
import type { SubmitResult } from '../types.js';

const program = new Command();

program
  .name('manual-reporter')
  .description(
    'Manual input reporter for sebas-chan system - A CLI tool for submitting inputs to the sebas-chan information management system'
  )
  .version('0.0.1')
  .addHelpText(
    'after',
    `
Examples:
  $ manual-reporter submit -c "Meeting notes from today"
  $ manual-reporter submit -f ./notes.txt
  $ manual-reporter watch -f ./inbox.txt
  $ manual-reporter watch -d ./inputs -p "*.md"
  $ manual-reporter health

For more information, see: https://github.com/otolab/sebas-chan`
  );

program
  .command('submit')
  .description('Submit a single input to the sebas-chan system')
  .option(
    '-a, --api-url <url>',
    'API endpoint URL (default: http://localhost:3001)',
    'http://localhost:3001'
  )
  .option(
    '-s, --source <source>',
    'Source identifier for tracking where the input came from (default: manual)',
    'manual'
  )
  .option('-c, --content <content>', 'Input content as a string')
  .option('-f, --file <file>', 'Path to file containing the input content')
  .addHelpText(
    'after',
    `
Notes:
  - Either --content or --file must be provided
  - The source field helps track where information originated from
  - File content will be read as UTF-8 text

Examples:
  $ manual-reporter submit -c "Important task: Review PR #123"
  $ manual-reporter submit -f meeting-notes.txt -s "meeting"
  $ manual-reporter submit --file todo.md --source "planning"`
  )
  .action(async (options) => {
    try {
      let content: string;

      if (options.file) {
        content = readFileSync(options.file, 'utf-8');
      } else if (options.content) {
        content = options.content;
      } else {
        console.error('Error: Either --content or --file must be provided');
        process.exit(1);
      }

      const client = new ReporterClient({
        apiUrl: options.apiUrl,
        retryOptions: {
          maxRetries: 3,
          retryDelay: 1000,
        },
      });

      console.log('Submitting input...');
      const result: SubmitResult = await client.submitInput({
        source: options.source,
        content: content.trim(),
      });

      if (result.success) {
        console.log(`✅ Input submitted successfully`);
        console.log(`   Input ID: ${result.inputId}`);
      } else {
        console.error(`❌ Failed to submit input: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('Watch files/directories and automatically submit new or changed content as inputs')
  .option(
    '-a, --api-url <url>',
    'API endpoint URL (default: http://localhost:3001)',
    'http://localhost:3001'
  )
  .option(
    '-s, --source <source>',
    'Source identifier for tracking where the input came from (default: manual)',
    'manual'
  )
  .option('-f, --file <file>', 'Path to a specific file to watch')
  .option('-d, --dir <dir>', 'Path to a directory to watch')
  .option(
    '-p, --pattern <pattern>',
    'Glob pattern for files to watch in directory mode (default: *.txt)',
    '*.txt'
  )
  .option(
    '-i, --interval <ms>',
    'Polling interval in milliseconds for change detection (default: 1000)',
    '1000'
  )
  .addHelpText(
    'after',
    `
Notes:
  - Either --file or --dir must be provided
  - In directory mode, use --pattern to filter files (e.g., "*.md", "*.txt")
  - Files are submitted when created or modified
  - Press Ctrl+C to stop watching
  - Each file change creates a new input in the system

Examples:
  $ manual-reporter watch -f inbox.txt
  $ manual-reporter watch -d ./notes -p "*.md"
  $ manual-reporter watch --dir ./inputs --pattern "*.txt" --interval 5000
  $ manual-reporter watch -f todo.txt -s "tasks"`
  )
  .action(async (options) => {
    try {
      if (!options.file && !options.dir) {
        console.error('Error: Either --file or --dir must be provided');
        process.exit(1);
      }

      const client = new ReporterClient({
        apiUrl: options.apiUrl,
        retryOptions: {
          maxRetries: 3,
          retryDelay: 1000,
        },
      });

      const processedFiles = new Set<string>();

      const submitFile = async (filePath: string) => {
        try {
          const content = readFileSync(filePath, 'utf-8');
          if (!content.trim()) {
            return;
          }

          console.log(`📄 Processing: ${basename(filePath)}`);
          const result: SubmitResult = await client.submitInput({
            source: options.source,
            content: content.trim(),
          });

          if (result.success) {
            console.log(`  ✅ Submitted (ID: ${result.inputId})`);
            processedFiles.add(filePath);
          } else {
            console.error(`  ❌ Failed: ${result.error}`);
          }
        } catch (error) {
          console.error(
            `  ❌ Error reading file: ${error instanceof Error ? error.message : error}`
          );
        }
      };

      const watchPath = options.file || join(options.dir, options.pattern);

      console.log(`👁️  Watching: ${watchPath}`);
      console.log('   Press Ctrl+C to stop\n');

      const watcher = watch(watchPath, {
        persistent: true,
        ignoreInitial: false,
        interval: parseInt(options.interval),
      });

      watcher
        .on('add', async (path) => {
          if (!processedFiles.has(path)) {
            await submitFile(path);
          }
        })
        .on('change', async (path) => {
          console.log(`🔄 File changed: ${basename(path)}`);
          await submitFile(path);
        })
        .on('error', (error) => {
          console.error('Watch error:', error);
        });

      process.on('SIGINT', () => {
        console.log('\n👋 Stopping watch...');
        watcher.close();
        process.exit(0);
      });
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Check if the sebas-chan API server is running and healthy')
  .option(
    '-a, --api-url <url>',
    'API endpoint URL to check (default: http://localhost:3001)',
    'http://localhost:3001'
  )
  .addHelpText(
    'after',
    `
Notes:
  - Returns exit code 0 if healthy, 1 if unhealthy
  - Useful for scripts and automation

Examples:
  $ manual-reporter health
  $ manual-reporter health --api-url http://localhost:8080`
  )
  .action(async (options) => {
    try {
      const client = new ReporterClient({
        apiUrl: options.apiUrl,
      });

      const isHealthy = await client.checkHealth();

      if (isHealthy) {
        console.log('✅ API is healthy');
      } else {
        console.log('❌ API is not responding');
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
