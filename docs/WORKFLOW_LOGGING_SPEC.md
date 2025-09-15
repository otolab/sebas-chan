# ワークフローログシステム仕様

## 概要

ワークフローの実行履歴を記録し、デバッグ・分析・再現を可能にするログシステム。

## 設計方針

### 1. コンテキストベースのログ管理
- WorkflowContextにloggerインスタンスを含める
- 各ワークフロー実行ごとに専用のloggerインスタンスを生成
- loggerインスタンス自体が実行IDを保持

### 2. 記録する情報
ワークフローの入力と出力を再現できる最小限の情報：
- **入力データ**: イベント、パラメータ
- **DB操作**: クエリ、取得したID一覧（データ本体は不要）
- **AI呼び出し**: プロンプト、パラメータ、レスポンス
- **出力データ**: 結果、次のイベント
- **メタデータ**: タイムスタンプ、実行時間、エラー情報

### 3. ログスキーマ
```typescript
interface WorkflowLog {
  executionId: string;      // 実行ID（UUID）
  workflowName: string;     // ワークフロー名
  type: LogType;           // ログタイプ
  timestamp: Date;         // タイムスタンプ（自動生成）
  data: unknown;           // ログデータ（type毎に型が決まる）
}

enum LogType {
  INPUT = 'input',         // 入力データ
  OUTPUT = 'output',       // 出力データ
  ERROR = 'error',         // エラー情報
  DB_QUERY = 'db_query',   // DB操作
  AI_CALL = 'ai_call',     // AI呼び出し
  INFO = 'info',           // 一般情報
  DEBUG = 'debug',         // デバッグ情報
  WARN = 'warn'            // 警告
}
```

注意: 実行の記録が目的のため、すべてのログを保存します。レベルによるフィルタリングは行いません。

## インターフェース設計

### WorkflowLogger
```typescript
interface WorkflowLogger {
  // 実行ID（自動生成）
  readonly executionId: string;

  // ワークフロー名
  readonly workflowName: string;

  // 統一ログメソッド（特化メソッドは廃止）
  log(type: LogType, data: unknown): Promise<void>;

  // 便利メソッド（内部でlog()を呼ぶ）
  logInput(input: unknown): Promise<void>;
  logOutput(output: unknown): Promise<void>;
  logError(error: Error, context?: unknown): Promise<void>;
}
```

注意:
- サブワークフロー/子ロガーは作成しません（複雑になるため）
- ワークフロー間の連携は、次のワークフローをイベント発行で予約する形にします
- ネストした実行は行いません

### WorkflowContext（更新版）
```typescript
interface WorkflowContext {
  // システムの現在状態
  state: string;

  // データストレージアクセス
  storage: WorkflowStorage;

  // ワークフロー専用ロガー
  logger: WorkflowLogger;

  // AIドライバーファクトリ
  createDriver: DriverFactory;

  // 実行時設定（modelは含まない）
  config?: {
    temperature?: number;
    maxRetries?: number;
    timeout?: number;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
  };

  // 実行時メタデータ
  metadata?: Record<string, unknown>;
}

// ドライバーファクトリの型
type DriverFactory = (capabilities: DriverCapabilities) => AIDriver;

interface DriverCapabilities {
  model: 'fast' | 'standard' | 'large';
  temperature?: number;
  maxTokens?: number;
}
```

注意:
- `agentContext`は削除（storageに変更済み）
- `event`は削除（ワークフロー実行関数の引数として渡される）
- `driver`を`createDriver`ファクトリに変更（複数の異なるドライバーが必要な場合に対応）
- configからmodelオプションを削除（driverは1インスタンス=1モデル）

## ログストレージ

### 1. ファイルベース（開発環境）
- JSON Lines形式（.jsonl）
- 日別ローテーション
- logs/workflows/YYYY-MM-DD/executionId.jsonl

### 2. データベース（本番環境）
```sql
CREATE TABLE workflow_logs (
  id SERIAL PRIMARY KEY,
  execution_id VARCHAR(255) NOT NULL,
  workflow_name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data JSONB,
  INDEX idx_execution_id (execution_id),
  INDEX idx_timestamp (timestamp),
  INDEX idx_type (type)
);
```

## 使用例

### ワークフロー内でのログ記録（関数ベース）
```typescript
const myWorkflow: WorkflowDefinition = {
  name: 'IngestInput',
  executor: async (event, context, emitter) => {
    const { logger, storage, createDriver } = context;

    // 入力をログ
    await logger.logInput({ event });

    // DB検索をログ
    const results = await storage.searchPond(query);
    await logger.log(LogType.DB_QUERY, {
      operation: 'searchPond',
      query,
      resultIds: results.map(r => r.id)
    });

    // ドライバーを作成してAI呼び出し
    const driver = createDriver({
      model: 'standard',
      temperature: 0.3
    });
    const response = await callDriver(driver, prompt);
    await logger.log(LogType.AI_CALL, {
      prompt,
      response,
      model: 'standard'
    });

    // 出力をログ
    const output = { processedData: response };
    await logger.logOutput(output);

    return { success: true, context, output };
  }
};
```

### ログの検索と分析
```typescript
// 特定ワークフローの実行履歴
const logs = await logStore.query({
  workflowName: 'IngestInput',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});

// 特定タイプのログ抽出
const errors = await logStore.query({
  type: LogType.ERROR,
  limit: 100
});

// 実行統計
const stats = await logStore.getStatistics('IngestInput');
// { totalRuns: 1000, successRate: 0.95, avgDuration: 1200 }
```

## セキュリティとプライバシー

### 1. センシティブデータの除外
- パスワード、APIキー、トークンは記録しない
- 個人情報はハッシュ化または除外
- プロンプトは必要最小限の情報のみ記録

### 2. アクセス制御
- ログへのアクセスは認証が必要
- ロールベースのアクセス制御（RBAC）
- 監査ログの記録

## パフォーマンス考慮

### 1. 非同期ログ
- ログ書き込みは非同期で実行
- バッファリングによる効率化
- ワークフロー実行をブロックしない

### 2. ログサイズ管理
- 古いログの自動アーカイブ
- 圧縮による容量削減
- 保持期間の設定（デフォルト: 30日）

## 今後の拡張

### 1. ログビューアー
- Web UIでのログ閲覧
- フィルタリングと検索
- 実行フローの可視化

### 2. アラート機能
- エラー率の監視
- パフォーマンス劣化の検知
- 異常パターンの通知

### 3. 再実行機能
- ログからの入力データ復元
- ワークフローの再実行
- デバッグモード実行

---

作成日: 2025-09-13
更新日: 2025-09-15
バージョン: 2.0.0 (PRレビュー反映版)