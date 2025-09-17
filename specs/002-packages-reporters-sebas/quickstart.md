# Reporters Package - クイックスタート

## セットアップ

### 1. 依存関係のインストール
```bash
cd packages/reporters
npm install
```

### 2. 設定ファイルの準備
```bash
# デフォルト設定をコピー
cp config/default.json config/local.json

# 設定を編集（必要に応じて）
# - serverUrl: sebas-chanサーバーのURL
# - bufferPath: バッファファイルの保存先
```

### 3. テストの実行
```bash
# ユニットテスト
npm test

# 統合テスト
npm run test:integration

# E2Eテスト（サーバー起動が必要）
npm run test:e2e
```

## 基本的な使用方法

### CLIから実行

#### イベントの手動送信
```bash
# 単一イベントを送信
npx reporters send-event \
  --type notification \
  --source-id slack \
  --payload '{"message": "テストメッセージ"}'

# ファイルからイベントを読み込んで送信
npx reporters send-event --file events.json
```

#### イベントソースの管理
```bash
# ソース一覧
npx reporters list-sources

# ソース追加
npx reporters add-source \
  --id slack \
  --name "Slack Notifications" \
  --type webhook \
  --endpoint "http://localhost:3001/webhook"

# ソース削除
npx reporters remove-source slack
```

#### システムステータス確認
```bash
# ステータス表示
npx reporters status

# ヘルスチェック
npx reporters health
```

### プログラマティックな使用

```typescript
import { ReporterClient } from '@sebas-chan/reporters';

// クライアントの初期化
const client = new ReporterClient({
  serverUrl: 'http://localhost:8080',
  bufferPath: './data/buffer'
});

// イベントの送信
await client.sendEvent({
  type: 'notification',
  sourceId: 'app',
  payload: {
    title: 'タスク完了',
    message: 'データ処理が完了しました'
  }
});

// バッチ送信
await client.sendBatch([
  { type: 'todo', sourceId: 'app', payload: { task: 'レビュー' } },
  { type: 'calendar', sourceId: 'app', payload: { event: '会議' } }
]);
```

## 動作確認シナリオ

### シナリオ1: 基本的なイベント送信

1. サーバーが起動していることを確認
```bash
curl http://localhost:8080/api/v1/health
```

2. テストイベントを送信
```bash
npx reporters send-event \
  --type notification \
  --source-id test \
  --payload '{"message": "Hello, Sebas-chan!"}'
```

3. 送信結果を確認
```bash
npx reporters status
# Expected: sent=1, failed=0, buffered=0
```

### シナリオ2: サーバー停止時のバッファリング

1. サーバーを停止

2. イベントを送信（自動的にバッファリング）
```bash
npx reporters send-event \
  --type notification \
  --source-id test \
  --payload '{"message": "Buffered event"}'
```

3. バッファ状態を確認
```bash
npx reporters status
# Expected: buffered=1
```

4. サーバーを再起動

5. バッファからの自動再送信を確認
```bash
# 60秒待機後
npx reporters status
# Expected: sent=1, buffered=0
```

### シナリオ3: 複数ソースからのイベント収集

1. 複数のイベントソースを設定
```bash
npx reporters add-source --id slack --name "Slack" --type webhook
npx reporters add-source --id calendar --name "Calendar" --type polling --interval 30000
```

2. 各ソースからイベントを送信
```bash
# Slackイベント
curl -X POST http://localhost:3000/webhook/slack \
  -H "Content-Type: application/json" \
  -d '{"text": "New message"}'

# カレンダーイベント（ポーリングで自動収集）
```

3. 収集状況を確認
```bash
npx reporters list-events --limit 10
```

## トラブルシューティング

### サーバーに接続できない
```bash
# ヘルスチェック
npx reporters health

# ログ確認
tail -f logs/reporters.log

# バッファ状態確認
ls -la data/buffer/
```

### バッファがフル
```bash
# バッファサイズ確認
npx reporters status --verbose

# 古いイベントをクリア
npx reporters clear-buffer --older-than 7d

# 強制送信
npx reporters flush-buffer --force
```

### イベントが重複している
```bash
# イベントログ確認
npx reporters list-events --source-id [SOURCE_ID]

# ソース設定確認
npx reporters show-source [SOURCE_ID]
```

## パフォーマンステスト

```bash
# 負荷テスト（1000イベント送信）
npm run perf:load

# レイテンシテスト
npm run perf:latency

# メモリ使用量確認
npm run perf:memory
```

## 設定オプション

### config/local.json
```json
{
  "server": {
    "url": "http://localhost:8080",
    "timeout": 30000,
    "retryAttempts": 5
  },
  "buffer": {
    "path": "./data/buffer",
    "maxSize": 10485760,
    "flushInterval": 10000
  },
  "logging": {
    "level": "info",
    "file": "./logs/reporters.log"
  }
}
```

## 次のステップ

1. **カスタムコレクターの作成**: [docs/custom-collector.md](docs/custom-collector.md)
2. **プラグイン開発**: [docs/plugin-development.md](docs/plugin-development.md)
3. **監視設定**: [docs/monitoring.md](docs/monitoring.md)