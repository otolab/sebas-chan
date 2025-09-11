#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { watch } from 'chokidar';
import { join, basename } from 'path';
import { ReporterClient } from '../client';
import type { SubmitResult } from '../types';

const program = new Command();

program
  .name('manual-reporter')
  .description('Manual input reporter for sebas-chan system')
  .version('0.0.1');

program
  .command('submit')
  .description('Submit an input to the system')
  .option('-u, --url <url>', 'API URL', 'http://localhost:3001')
  .option('-s, --source <source>', 'Source name', 'manual')
  .option('-c, --content <content>', 'Input content')
  .option('-f, --file <file>', 'Read content from file')
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
        apiUrl: options.url,
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
  .description('Watch files and submit changes as inputs')
  .option('-u, --url <url>', 'API URL', 'http://localhost:3001')
  .option('-s, --source <source>', 'Source name', 'manual')
  .option('-f, --file <file>', 'Watch a specific file')
  .option('-d, --dir <dir>', 'Watch a directory')
  .option('-p, --pattern <pattern>', 'File pattern to watch (e.g., "*.txt")', '*.txt')
  .option('-i, --interval <ms>', 'Polling interval in milliseconds', '1000')
  .action(async (options) => {
    try {
      if (!options.file && !options.dir) {
        console.error('Error: Either --file or --dir must be provided');
        process.exit(1);
      }

      const client = new ReporterClient({
        apiUrl: options.url,
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
          console.error(`  ❌ Error reading file: ${error instanceof Error ? error.message : error}`);
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
  .description('Check API health status')
  .option('-u, --url <url>', 'API URL', 'http://localhost:3001')
  .action(async (options) => {
    try {
      const client = new ReporterClient({
        apiUrl: options.url,
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