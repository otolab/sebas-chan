# Phase 3 ワークフロー実装計画書

## 概要

Phase 3では、sebas-chanのワークフローシステムを関数ベースのアーキテクチャで実装します。
この設計により、状態を持たない純粋な関数としてワークフローを構築し、高い保守性とテスタビリティを実現します。

## アーキテクチャ設計

### 1. 関数ベースワークフロー

#### 基本構造
```typescript
// ワークフロー実行関数の型
type WorkflowExecutor = (
  event: AgentEvent,
  context: WorkflowContext,
  emitter: WorkflowEventEmitter
) => Promise<WorkflowResult>;

// ワークフロー定義
interface WorkflowDefinition {
  name: string;
  executor: WorkflowExecutor;
}
```

**重要**: クラスベースのワークフローは使用しません。すべてのワークフローは純粋な関数として実装されます。

### 2. WorkflowContext

ワークフローが実行される環境を表現する構造体：

```typescript
interface WorkflowContext {
  state: string;                           // システムの現在状態
  storage: WorkflowStorage;                // DB操作インターフェース
  logger: WorkflowLogger;                  // ログ記録
  createDriver: DriverFactory;             // AIドライバーファクトリ
  metadata?: Record<string, any>;          // 実行時メタデータ
}

// ドライバーファクトリの型
type DriverFactory = (capabilities: DriverCapabilities) => Driver;

interface DriverCapabilities {
  model: 'fast' | 'standard' | 'large';   // モデルサイズ
  temperature?: number;                     // 生成温度
  maxTokens?: number;                      // 最大トークン数
  // その他のcapability設定
}
```

**変更点**:
- `driver`フィールドを`createDriver`ファクトリ関数に変更
- ドライバーは都度、必要なcapabilitiesを指定して作成

### 3. ログ構造

シンプルで一貫性のあるログスキーマ：

```typescript
interface WorkflowLog {
  executionId: string;      // 実行ID（UUID）
  workflowName: string;     // ワークフロー名
  type: LogType;           // ログタイプ
  timestamp: Date;         // タイムスタンプ（自動生成）
  data: unknown;           // ログデータ
}

enum LogType {
  INPUT = 'input',
  OUTPUT = 'output',
  ERROR = 'error',
  DB_QUERY = 'db_query',
  AI_CALL = 'ai_call',
  INFO = 'info',
  DEBUG = 'debug',
  WARN = 'warn'
}
```

**重要**:
- サブワークフローや子ロガーの概念は存在しません
- すべてのログは単一のexecutionIdで管理されます
- ワークフロー間の連携はイベント発行により実現

### 4. イベント駆動アーキテクチャ

#### イベント発行
```typescript
interface WorkflowEventEmitter {
  emit(event: {
    type: string;
    priority?: 'high' | 'normal' | 'low';
    payload: unknown;
  }): void;
}
```

#### ワークフロー連携
- サブワークフローは使用しません
- 後続処理が必要な場合は、新しいイベントを発行
- 各ワークフローは独立して実行され、イベントを介して連携

### 5. 設定管理

```typescript
interface WorkflowConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  storage: {
    type: 'memory' | 'lancedb';
    // storage固有の設定
  };
  // modelオプションは削除（driverインスタンス = 1モデル）
}
```

**変更点**:
- `model`オプションを削除
- モデル選択はcreateDriver使用時に指定

## 実装計画

### Phase 3-1: 基盤実装

1. **ドライバーファクトリ実装**
   ```typescript
   // packages/core/src/workflows/driver-factory.ts
   export function createDriverByCapabilities(
     config: DriverConfig,
     capabilities: DriverCapabilities
   ): Driver {
     // @moduler-prompt/driverを使用した実装
     // 1インスタンス = 1モデル
   }
   ```

   注意: @moduler-prompt/utilsのDriverRegistryにはcapabilitiesからモデルを自動選択する機能があります。
   ```typescript
   import { DriverRegistry } from '@moduler-prompt/utils';

   const registry = new DriverRegistry();
   const result = registry.selectDriver({
     requiredCapabilities: ['fast', 'japanese'],
     preferredCapabilities: ['streaming']
   });
   ```

2. **ログシステム簡素化**
   - WorkflowLoggerクラスの簡素化
   - 子ロガー機能の削除
   - 統一されたログスキーマの実装

3. **WorkflowRegistry更新**
   - 関数ベースワークフローの登録
   - クラスベース参照の削除

### Phase 3-2: ワークフロー実装

1. **基本ワークフロー（関数実装）**
   - ingestInputWorkflow (A-1)
   - processUserRequestWorkflow (A-0)
   - analyzeIssueImpactWorkflow (A-2)
   - extractKnowledgeWorkflow (A-3)

2. **イベント連携の実装**
   - ワークフロー間のイベント発行
   - 優先度付きキューでの処理

### Phase 3-3: 統合とテスト

1. **統合テスト**
   - エンドツーエンドのワークフローテスト
   - イベント連携の検証

2. **ドキュメント整備**
   - WORKFLOW_ARCHITECTURE.md更新
   - 実装ガイドの作成

## 移行ガイド

### クラスベースから関数ベースへ

**Before (廃止)**:
```typescript
// 使用しません
class MyWorkflow extends BaseWorkflow {
  protected async process(event, context, emitter) {
    // 処理
  }
}
```

**After (推奨)**:
```typescript
const myWorkflow: WorkflowDefinition = {
  name: 'MyWorkflow',
  executor: async (event, context, emitter) => {
    // ドライバーの作成
    const driver = context.createDriver({
      model: 'standard',
      temperature: 0.3
    });

    // 処理
    const result = await driver.call(prompt);

    // 次のイベント発行（サブワークフローではなく）
    emitter.emit({
      type: 'NEXT_WORKFLOW',
      priority: 'normal',
      payload: result
    });

    return { success: true, context, output: result };
  }
};
```

## テスト戦略

### TestDriverの使用

```typescript
import { TestDriver } from '@moduler-prompt/driver';

// テスト用のドライバーファクトリ
function createTestDriverFactory(responses: string[]): DriverFactory {
  return (capabilities) => {
    return new TestDriver({
      responses,
      delay: 0
    });
  };
}

// テストでの使用
const mockContext: WorkflowContext = {
  state: 'test',
  storage: mockStorage,
  logger: mockLogger,
  createDriver: createTestDriverFactory(['response1', 'response2']),
  metadata: {}
};
```

## 重要な変更点まとめ

1. **クラスベースワークフローの廃止**
   - すべてのワークフローは関数として実装
   - BaseWorkflowクラスは使用しない

2. **ドライバーファクトリパターン**
   - context.driverではなくcontext.createDriver使用
   - capabilitiesを指定してドライバーインスタンス作成

3. **ログ構造の簡素化**
   - 5フィールドのシンプルな構造
   - サブワークフロー/子ロガーなし

4. **イベント駆動の徹底**
   - ワークフロー間連携はイベント発行のみ
   - サブワークフロー呼び出しは行わない

5. **設定の簡素化**
   - modelオプションの削除
   - ドライバー作成時にモデル指定

## スケジュール

- **Week 1**: ドライバーファクトリとログシステムの実装
- **Week 2**: 関数ベースワークフローの実装
- **Week 3**: 統合テストとドキュメント整備

---

作成日: 2025-09-15
バージョン: 1.0.0 (PRレビューコメント反映版)