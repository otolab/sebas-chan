# Data Model: Reporters Package

## Core Entities

### Event
収集されたイベントデータの基本単位

```typescript
interface Event {
  id: string;              // UUID v4
  type: EventType;         // 'notification' | 'message' | 'calendar' | 'todo' | 'other'
  sourceId: string;        // イベントソースの識別子
  timestamp: Date;         // イベント発生時刻
  payload: unknown;        // イベント固有のデータ
  metadata: {
    collectedAt: Date;     // 収集時刻
    attempts: number;      // 送信試行回数
    lastAttemptAt?: Date;  // 最終試行時刻
  };
}
```

**Validation Rules:**
- `id`: 必須、UUID v4形式
- `type`: 必須、定義済みの値のみ
- `sourceId`: 必須、空文字不可
- `timestamp`: 必須、現在時刻より未来は不可
- `payload`: 必須、null不可

### EventSource
イベントを生成する外部システムの設定

```typescript
interface EventSource {
  id: string;              // 一意識別子
  name: string;            // 表示名
  type: SourceType;        // 'webhook' | 'polling' | 'stream'
  config: {
    endpoint?: string;     // 接続先URL
    interval?: number;     // ポーリング間隔（ms）
    filters?: string[];    // イベントフィルター
  };
  status: SourceStatus;    // 'active' | 'inactive' | 'error'
  lastConnectedAt?: Date;  // 最終接続時刻
}
```

**Validation Rules:**
- `id`: 必須、英数字とハイフンのみ
- `name`: 必須、1-100文字
- `config.interval`: 1000以上（1秒以上）
- `config.endpoint`: URL形式

### FileBuffer
ファイルベースのバッファ管理

```typescript
interface FileBuffer {
  filePath: string;        // バッファファイルのパス
  events: Event[];         // メモリ内のイベントキュー
  size: number;            // 現在のバッファサイズ（バイト）
  maxSize: number;         // 最大サイズ（バイト）
  createdAt: Date;         // ファイル作成時刻
  rotatedAt?: Date;        // 最終ローテーション時刻
}
```

**Validation Rules:**
- `filePath`: 必須、書き込み可能なパス
- `maxSize`: 1MB以上、1GB以下
- `events`: 最大1000件までメモリ保持

### ConnectionStatus
サーバーおよび外部システムとの接続状態

```typescript
interface ConnectionStatus {
  targetId: string;        // 接続先識別子
  targetType: 'server' | 'source';
  isConnected: boolean;    // 接続状態
  lastSuccessAt?: Date;    // 最終成功時刻
  lastErrorAt?: Date;      // 最終エラー時刻
  errorCount: number;      // 連続エラー回数
  errorMessage?: string;   // 最新のエラーメッセージ
}
```

**Validation Rules:**
- `targetId`: 必須
- `errorCount`: 0以上、リセットは成功時
- `errorMessage`: 最大500文字

## State Transitions

### Event States
```
created → queued → sending → sent
         ↓         ↓
         buffered ← failed
```

### EventSource States
```
inactive → active → error
    ↑        ↓        ↓
    ←────────←────────←
```

### Connection States
```
disconnected → connecting → connected
      ↑            ↓           ↓
      ←───── error ←───────────←
```

## Relationships

- **Event** → **EventSource**: 多対1（複数のイベントが1つのソースから）
- **Event** → **FileBuffer**: 多対1（複数のイベントが1つのバッファに）
- **EventSource** → **ConnectionStatus**: 1対1
- **Server** → **ConnectionStatus**: 1対1

## Data Persistence

### File Structure
```
data/
├── buffer/
│   ├── events-2025-09-16.jsonl  # イベントバッファ
│   └── events-2025-09-16.jsonl.lock
├── config/
│   └── sources.json              # イベントソース設定
└── state/
    └── connections.json          # 接続状態
```

### JSON Lines Format (events-*.jsonl)
```json
{"id":"uuid","type":"notification","sourceId":"slack","timestamp":"2025-09-16T10:00:00Z","payload":{...}}
{"id":"uuid","type":"calendar","sourceId":"google","timestamp":"2025-09-16T10:01:00Z","payload":{...}}
```

## Constraints

- イベントは作成後不変（Immutable）
- バッファファイルは追記のみ（Append-only）
- 設定変更は再起動が必要
- 最大同時接続数: 10ソース