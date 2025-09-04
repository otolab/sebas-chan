# MCP Server 開発ドキュメント

## MCP (Model Context Protocol) 実装ガイド

このドキュメントは、coeiro-operatorのMCP実装を参考にした実装方法をまとめています。

## 必要なパッケージ

### メインパッケージ
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.17.0",
    "zod": "^3.22.0"
  }
}
```

### 重要な設定
- `package.json`に`"type": "module"`を設定（ESモジュール使用）

## 基本的な実装パターン

### 1. 必要なインポート
```typescript
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
```

### 2. サーバーの初期化
```typescript
const server = new McpServer(
  {
    name: 'sebas-chang',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);
```

### 3. ツールの登録パターン
```typescript
interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  [key: string]: unknown;
}

server.registerTool(
  'tool_name',
  {
    description: 'ツールの説明文',
    inputSchema: {
      // zodスキーマで入力パラメータを定義
      param1: z.string().describe('パラメータ1の説明'),
      param2: z.number().optional().describe('オプションパラメータ'),
      param3: z.enum(['option1', 'option2']).describe('選択型パラメータ'),
    },
  },
  async (args): Promise<ToolResponse> => {
    const { param1, param2, param3 } = args || {};
    
    try {
      // ツールのロジック実装
      const result = await doSomething(param1, param2);
      
      // 必ず以下の形式でレスポンスを返す
      return {
        content: [
          {
            type: 'text',
            text: `処理結果: ${result}`,
          },
        ],
      };
    } catch (error) {
      // エラーはthrowで投げる
      throw new Error(`エラーメッセージ: ${(error as Error).message}`);
    }
  }
);
```

### 4. サーバーの起動
```typescript
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  
  console.log('MCP Server starting...');
  await server.connect(transport);
  console.log('MCP Server started');
}

main().catch(error => {
  console.error('Server error:', error);
  process.exit(1);
});
```

## Zodスキーマの使い方

### 基本的な型
```typescript
// 文字列
z.string().describe('説明')

// 数値
z.number().describe('説明')

// ブール値
z.boolean().describe('説明')

// オプション（省略可能）
z.string().optional().describe('説明')

// 列挙型
z.enum(['value1', 'value2', 'value3']).describe('説明')

// 配列
z.array(z.string()).describe('説明')

// オブジェクト
z.object({
  field1: z.string(),
  field2: z.number(),
}).describe('説明')

// 数値の制約
z.number().min(1).max(100).describe('1-100の数値')
```

## 実装上の注意点

### 1. レスポンス形式
- 必ず`content`配列に`type: 'text'`のオブジェクトを含める
- 複数の結果を返す場合も、単一のtext内で改行で区切る

### 2. エラーハンドリング
- エラーは`throw new Error()`で投げる
- エラーメッセージは日本語でユーザーフレンドリーに

### 3. 非同期処理
- 長時間かかる処理は非同期で実行
- ただし、即座にレスポンスを返す（完了を待たない）

### 4. ログ出力
- デバッグ用のログはconsole.logではなく、専用のloggerを使用
- ユーザーへの情報はレスポンスのtextに含める

## package.jsonの設定

```json
{
  "name": "@sebas-chang/mcp-server",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "sebas-chang-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  }
}
```

## tsconfig.jsonの推奨設定

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ES2022",
    "target": "ES2022",
    "moduleResolution": "node"
  }
}
```

## 実装例: シンプルなツール

```typescript
server.registerTool(
  'get_time',
  {
    description: '現在時刻を取得します',
    inputSchema: {
      format: z.enum(['iso', 'unix', 'japanese']).optional()
        .describe('時刻フォーマット'),
    },
  },
  async (args) => {
    const { format = 'iso' } = args || {};
    const now = new Date();
    
    let timeString: string;
    switch (format) {
      case 'unix':
        timeString = Math.floor(now.getTime() / 1000).toString();
        break;
      case 'japanese':
        timeString = now.toLocaleString('ja-JP');
        break;
      default:
        timeString = now.toISOString();
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `現在時刻: ${timeString}`,
        },
      ],
    };
  }
);
```

## 参考資料

- coeiro-operator実装: `/Users/naoto.kato/Develop/otolab/coeiro-operator/src/mcp/server.ts`
- MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk