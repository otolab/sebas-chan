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
- **AI呼び出し**: プロンプトモジュール名、主要パラメータ、レスポンス
- **出力データ**: 結果、次のイベント
- **メタデータ**: タイムスタンプ、実行時間、エラー情報

### 3. ログレベル
```typescript
enum LogLevel {
  ERROR = 'error',     // エラー情報
  INFO = 'info',       // 重要な処理ステップ
  DEBUG = 'debug',     // 詳細なデバッグ情報
  TRACE = 'trace'      // 最も詳細な追跡情報
}
```

## インターフェース設計

### WorkflowLogger
```typescript
interface WorkflowLogger {
  // 実行ID（自動生成）
  readonly executionId: string;

  // ワークフロー名
  readonly workflowName: string;

  // 親ワークフローID（ネストした実行用）
  readonly parentExecutionId?: string;

  // 基本ログメソッド
  log(level: LogLevel, message: string, data?: any): Promise<void>;

  // 特化メソッド
  logInput(data: any): Promise<void>;
  logOutput(data: any): Promise<void>;
  logDbQuery(operation: string, query: any, resultIds: string[]): Promise<void>;
  logAiCall(module: string, params: any, response: any): Promise<void>;
  logError(error: Error, context?: any): Promise<void>;

  // サブワークフロー用
  createChildLogger(workflowName: string): WorkflowLogger;
}
```

### WorkflowContext（更新版）
```typescript
interface WorkflowContext {
  // トリガーイベント
  event: AgentEvent;

  // Agent環境（DB、State、イベント発行）
  agentContext: AgentContext;

  // ワークフロー専用ロガー
  logger: WorkflowLogger;

  // AIドライバー
  driver?: any; // @moduler-prompt/driver

  // 実行時設定
  config?: {
    model?: string;
    temperature?: number;
    maxRetries?: number;
  };

  // 実行時メタデータ
  metadata?: Record<string, any>;
}
```

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
  parent_execution_id VARCHAR(255),
  timestamp TIMESTAMP NOT NULL,
  level VARCHAR(10) NOT NULL,
  message TEXT,
  data JSONB,
  INDEX idx_execution_id (execution_id),
  INDEX idx_timestamp (timestamp)
);
```

## 使用例

### ワークフロー内でのログ記録
```typescript
class IngestInputWorkflow extends BaseWorkflow {
  async process(context: WorkflowContext): Promise<WorkflowResult> {
    const { logger, agentContext } = context;

    // 入力をログ
    await logger.logInput({
      event: context.event,
      metadata: context.metadata
    });

    // DB検索をログ
    const results = await agentContext.searchPond(query);
    await logger.logDbQuery('searchPond', query, results.map(r => r.id));

    // AI呼び出しをログ
    const prompt = this.buildPrompt(results);
    const response = await this.callAI(prompt, context.driver);
    await logger.logAiCall('analyzeInput', { prompt: prompt.name }, response);

    // 出力をログ
    const output = { processedData: response };
    await logger.logOutput(output);

    return { success: true, output };
  }
}
```

### ログの検索と分析
```typescript
// 特定ワークフローの実行履歴
const logs = await logStore.query({
  workflowName: 'IngestInput',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});

// エラーログの抽出
const errors = await logStore.query({
  level: LogLevel.ERROR,
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
- プロンプトの全文ではなく、モジュール名とパラメータのみ記録

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