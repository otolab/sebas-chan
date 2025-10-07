# AI駆動テストのセットアップ

## 概要

ワークフローのユニットテストには、通常のモックベースのテストに加えて、実際のAIサービスを使用した品質確認テストが含まれています。これらのテストは環境に応じて自動的にスキップされます。

## セットアップ方法

### 設定ファイルを使用

1. プロジェクトルートに`ai-test-config.json`を作成：

```bash
cp ai-test-config.json.example ai-test-config.json
```

2. 設定ファイルを編集：

```json
{
  "models": [
    {
      "model": "gpt-4o-mini",
      "provider": "openai",
      "capabilities": ["streaming", "japanese", "fast", "structured"],
      "priority": 10,
      "enabled": true
    }
  ],
  "drivers": {
    "openai": {
      "apiKey": "your-api-key-here"
    }
  }
}
```

### AIテストをスキップする

CIや高速実行が必要な場合：

```bash
# AIテストをスキップ
npm run test:without-ai

# またはフラグで制御
SKIP_AI_TESTS=true npm test
```

## テストの書き方

```typescript
describe('ワークフロー - with AI Quality Checks', () => {
  let aiService: AIService | null = null;

  beforeAll(async () => {
    // AIServiceの利用可能性を自動チェック
    const { setupAIServiceForTest } = await import('../test-ai-helper.js');
    aiService = await setupAIServiceForTest();
  });

  it.skipIf(() => !aiService)('実際のAIで品質を確認', async () => {
    // AIServiceが利用可能な場合のみ実行
    const driver = await aiService.createDriver({
      capabilities: ['structuredOutput']
    });

    // 実際のAI出力の品質を検証
    const result = await driver.execute(prompt);
    expect(result).toMatchObject({
      // 構造的な妥当性を検証
    });
  });
});
```

## 設定の優先順位

1. `SKIP_AI_TESTS=true`が設定されている → AIテストをスキップ
2. `ai-test-config.json`が存在する → その設定を使用
3. 設定ファイルがない → AIテストを自動的にスキップ

## 設定ファイルの詳細

### ModelSpec（モデル仕様）

| フィールド | 説明 | 例 |
|-----------|------|-----|
| `model` | モデル識別子 | `gpt-4o-mini`, `claude-3-5-sonnet` |
| `provider` | プロバイダー名 | `openai`, `anthropic`, `mlx` |
| `capabilities` | モデルの能力 | `["streaming", "japanese", "fast"]` |
| `priority` | 選択優先度（高いほど優先） | `10`, `20`, `30` |
| `enabled` | 有効/無効フラグ | `true`, `false` |

### DriverCapability（能力フラグ）

| カテゴリ | 能力 | 説明 |
|---------|------|------|
| 実行環境 | `local` | ローカル実行可能 |
| | `streaming` | ストリーミング応答対応 |
| 性能 | `fast` | 高速応答 |
| 言語 | `japanese` | 日本語特化 |
| 出力形式 | `structured` | 構造化出力対応 |
| | `json` | JSON出力対応 |

## セキュリティ上の注意

- `ai-test-config.json`は`.gitignore`に含まれており、リポジトリにコミットされません
- APIキーは絶対にコードにハードコードしないでください
- チーム内でAPIキーを共有する場合は、安全な方法（1Password等）を使用してください

## トラブルシューティング

### AIテストがスキップされる

以下を確認してください：
1. `ai-test-config.json`が存在するか
2. APIキーが正しく設定されているか
3. `SKIP_AI_TESTS`環境変数が設定されていないか

### APIレート制限エラー

テストの並列実行数を減らすか、テスト間にdelayを入れることを検討してください。

### タイムアウトエラー

個別のテストケースでタイムアウト時間を調整してください。