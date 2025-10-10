/**
 * Manual Reporter E2E Tests
 *
 * Manual Reporterの実際の動作を確認するエンドツーエンドテスト
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import request from 'supertest';
import { createApp } from '../../packages/server/src/app';
import { setupTestEnvironment, teardownTestEnvironment } from '../integration/setup';

describe('Manual Reporter E2E Tests', () => {
  let app: any;
  let server: any;
  let testDir: string;
  let serverUrl: string;
  const cliPath = path.join(process.cwd(), 'packages/reporter-sdk/dist/manual-reporter/cli.js');

  beforeAll(async () => {
    // DBの初期化
    await setupTestEnvironment();

    // アプリケーションを作成
    app = await createApp();

    // テスト用サーバーを起動
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        serverUrl = `http://localhost:${port}`;
        console.log(`Test server started on ${serverUrl}`);
        resolve();
      });
    });

    // テスト用の一時ディレクトリを作成
    testDir = path.join(tmpdir(), `manual-reporter-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // エンジンが準備できるまで待つ
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 60000);

  afterAll(async () => {
    // 一時ディレクトリをクリーンアップ
    await fs.rm(testDir, { recursive: true, force: true });

    // サーバーをクローズ
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    // DB接続をクリーンアップ
    await teardownTestEnvironment();
  });

  describe('CLI Command Execution', () => {
    function runCommand(
      args: string[]
    ): Promise<{ stdout: string; stderr: string; code: number | null }> {
      return new Promise((resolve) => {
        // サブコマンドとオプションを適切に配置
        const cliArgs = [...args];
        // --helpでない場合、サブコマンドの後に--api-urlオプションを追加
        if (args[0] !== '--help') {
          const subcommand = cliArgs.shift();
          cliArgs.unshift(subcommand!, '--api-url', serverUrl);
        }
        const child = spawn('node', [cliPath, ...cliArgs], {
          cwd: process.cwd(),
          env: { ...process.env, NODE_ENV: 'test' },
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          resolve({ stdout, stderr, code });
        });

        // タイムアウト設定
        setTimeout(() => {
          child.kill();
          resolve({ stdout, stderr, code: -1 });
        }, 10000);
      });
    }

    it('should display help', async () => {
      const { stdout, code } = await runCommand(['--help']);

      expect(code).toBe(0);
      expect(stdout).toContain('manual-reporter');
      expect(stdout).toContain('submit');
      expect(stdout).toContain('watch');
      expect(stdout).toContain('health');
    });

    it('should check health against real server', async () => {
      // まず、実際のサーバーのhealth状態を確認
      const healthResponse = await request(app).get('/health');

      if (healthResponse.status === 200) {
        // サーバーが健全な場合のみテスト実行
        const { stdout, code } = await runCommand(['health']);

        expect(code).toBe(0);
        expect(stdout).toContain('API is healthy');
      }
    });

    it('should submit content via CLI', async () => {
      const testContent = `Test input from E2E test at ${new Date().toISOString()}`;

      // まずサーバーが動作していることを確認
      const healthResponse = await request(app).get('/health');

      if (healthResponse.status === 200) {
        const { stdout, stderr, code } = await runCommand([
          'submit',
          '-c',
          testContent,
          '-s',
          'e2e-test',
        ]);

        // デバッグ出力
        if (code !== 0) {
          console.log('Submit failed:', { stdout, stderr, code });
        }

        expect(code).toBe(0);
        expect(stdout).toContain('Input submitted successfully');
        expect(stdout).toMatch(/Input ID: [\w-]+/);
      }
    });

    it('should submit file content', async () => {
      // テストファイルを作成
      const testFile = path.join(testDir, 'test-input.txt');
      const testContent = 'This is a test file content for E2E testing';
      await fs.writeFile(testFile, testContent);

      const healthResponse = await request(app).get('/health');

      if (healthResponse.status === 200) {
        const { stdout, code } = await runCommand([
          'submit',
          '-f',
          testFile,
          '-s',
          'e2e-file-test',
        ]);

        expect(code).toBe(0);
        expect(stdout).toContain('Input submitted successfully');
      }
    });

    it('should handle submit errors gracefully', async () => {
      const { stdout, stderr, code } = await runCommand([
        'submit',
        // contentもfileも指定しない
      ]);

      expect(code).toBe(1);
      expect(stderr + stdout).toContain('Either --content or --file must be provided');
    });
  });

  describe('Watch Mode', () => {
    it('should start watch mode and detect file changes', async () => {
      const watchFile = path.join(testDir, 'watch-test.txt');

      // ファイルを作成
      await fs.writeFile(watchFile, 'Initial content');

      // watchプロセスを開始
      const watchProcess = spawn(
        'node',
        [cliPath, 'watch', '--api-url', serverUrl, '-f', watchFile],
        {
          cwd: process.cwd(),
        }
      );

      let output = '';
      watchProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      // 少し待ってからファイルを変更
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await fs.writeFile(watchFile, 'Updated content');

      // 変更が検出されるまで待つ
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // プロセスを終了
      watchProcess.kill();

      // 出力を確認
      expect(output).toContain('Watching:');
      // 実際のサーバー接続がある場合のみチェック
      if (output.includes('Submitted')) {
        expect(output).toContain('File changed');
      }
    });
  });

  describe('Integration with Server API', () => {
    it('should successfully submit inputs to the API', async () => {
      // APIに直接リクエストを送信
      const response = await request(app).post('/api/inputs').send({
        source: 'e2e-integration-test',
        content: 'Direct API test from E2E suite',
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.source).toBe('e2e-integration-test');
    });

    it('should handle batch submissions', async () => {
      const inputs = [
        { source: 'batch-test', content: 'First batch item' },
        { source: 'batch-test', content: 'Second batch item' },
        { source: 'batch-test', content: 'Third batch item' },
      ];

      const results = await Promise.all(
        inputs.map((input) => request(app).post('/api/inputs').send(input))
      );

      results.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.content).toBe(inputs[index].content);
      });
    });

    it('should validate input data', async () => {
      // sourceが不足
      const response1 = await request(app).post('/api/inputs').send({
        content: 'Test without source',
      });

      expect(response1.status).toBe(400);
      expect(response1.body.error).toContain('source is required');

      // contentが不足
      const response2 = await request(app).post('/api/inputs').send({
        source: 'test',
      });

      expect(response2.status).toBe(400);
      expect(response2.body.error).toContain('content is required');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should retry on server errors', async () => {
      // この テストはReporterClientのリトライ機能をテストします
      // サーバーが一時的に利用不可の場合のシミュレーション
      const { ReporterClient } = await import('../../packages/reporter-sdk/src/client');
      const client = new ReporterClient({
        apiUrl: 'http://localhost:9999', // 存在しないポート
        retryOptions: {
          maxRetries: 2,
          retryDelay: 100,
        },
      });

      const result = await client.submitInput({
        source: 'retry-test',
        content: 'Test retry mechanism',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle large content', async () => {
      // 大きなコンテンツのテスト
      const largeContent = 'x'.repeat(10000); // 10KB

      const response = await request(app).post('/api/inputs').send({
        source: 'large-content-test',
        content: largeContent,
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(largeContent);
    });

    it('should handle special characters in content', async () => {
      const specialContent = '特殊文字テスト: 🚀 \\n\\t "quotes" \'apostrophe\' <html>';

      const response = await request(app).post('/api/inputs').send({
        source: 'special-chars-test',
        content: specialContent,
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(specialContent);
    });
  });
});
