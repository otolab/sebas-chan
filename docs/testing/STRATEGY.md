# テスト戦略と構成計画

## 現状の問題点

1. **初期化の遅さ**: 実DBとPythonワーカー（Ruriモデル）の初期化に時間がかかる
2. **テストの混在**: モック使用の単体テストと実DB使用の統合テストが混在
3. **リソースの無駄**: 各テストファイルでDBプロセスを起動・終了

## テストの分類と定義

### 1. ユニットテスト (Unit Tests)

**定義**: 単一のモジュール、クラス、関数の振る舞いを検証するテスト

**特徴**:

- 外部依存はすべてモック化
- 高速実行（ミリ秒単位）
- 内部実装の詳細をテスト
- ホワイトボックステスト

**配置**: `packages/*/src/**/*.test.ts`

**例**:

- WorkflowDefinitionの個別実行ロジック
- StateManagerの状態管理ロジック
- 純粋関数の入出力検証

**重点項目**:

- **コードカバレッジ（目標: 80%以上）** - ロジックの網羅性を確保
- **ロジックの正確性** - 処理フローが意図通りであることを確認
- **エラーハンドリング** - 異常系の処理が適切であることを検証
- **境界値テスト** - エッジケースでの動作を確認

**注意点**:

- **AI生成内容の詳細は検証しない** - プロンプトの結果より処理フローを重視
- **出力の正確性より処理の流れを確認** - ワークフローが正しく実行されることが重要

### 2. インターフェーステスト (Interface Tests)

**定義**: モジュールの公開インターフェース仕様を検証するテスト

**特徴**:

- モジュールの公開API（exports）のみをテスト
- 内部実装には依存しない
- インターフェース契約の遵守を保証
- ブラックボックステスト

**配置**: `packages/*/test/interface/**/*.test.ts`

**例**:

- CoreAgentの公開メソッド（executeWorkflow等）の仕様確認
- DBClientの公開API仕様の検証
- パッケージのexportsが期待通りの型と動作を提供することの確認

### 3. 統合テスト (Integration Tests)

**定義**: 複数のモジュール間の相互作用を検証するテスト

**特徴**:

- 実際のモジュール間連携を確認
- 一部の外部システム（DB等）はモック可
- システムの部分的な結合をテスト

**配置**: `test/integration/**/*.test.ts`

**例**:

- CoreEngineとCoreAgentの連携動作
- WorkflowからDBClientへのデータフロー
- イベント駆動型処理の連鎖

### 4. システムテスト (System Tests)

**定義**: 実際の外部システムと接続して動作を検証するテスト

**特徴**:

- 実際のDB、外部API等を使用
- 環境依存（Docker等が必要）
- 実際の子プロセス起動を含む
- 中速実行（1-5s/test）

**配置**:

- `packages/db/test/system/**/*.test.ts` (DBシステムテスト)
- `test/system/**/*.test.ts` (全体システムテスト)

**例**:

- Python子プロセスとの実際の通信
- LanceDBへの実際のデータ保存・検索
- 実際のベクトル化処理

### 5. E2Eテスト (End-to-End Tests)

**定義**: ユーザー視点でシステム全体の動作を検証するテスト

**特徴**:

- システム全体を起動
- 実際のユーザーシナリオを再現
- APIエンドポイントから結果確認まで
- 最も現実に近い環境

**配置**: `test/e2e/**/*.test.ts`

**例**:

- APIサーバー起動 → Input投稿 → Pond検索 → 結果確認
- Web UI操作シナリオ
- Reporter → Server → DB → 検索の一連フロー

## 共通セットアップ

### 統合・システムテスト用セットアップ

`test/integration/setup.ts`:

```typescript
// グローバルなDB接続を管理
let globalDbClient: DBClient;
let globalPythonWorker: ChildProcess;

export async function setupTestEnvironment() {
  // 一度だけ初期化
  if (!globalDbClient) {
    globalDbClient = new DBClient();
    await globalDbClient.connect();
    await globalDbClient.initModel();
  }
  return globalDbClient;
}

export async function teardownTestEnvironment() {
  // テスト終了時にクリーンアップ
  if (globalDbClient) {
    await globalDbClient.disconnect();
  }
}
```

## テスト実行コマンド

```bash
# ユニットテスト（各パッケージ内）
npm test                              # 全パッケージのユニットテスト（高速）
npm test -w @sebas-chan/core        # 特定パッケージのユニットテスト
npm run test:unit                    # 明示的にユニットテストのみ

# インターフェーステスト
npm run test:interface               # 全インターフェーステスト

# 統合テスト
npm run test:integration             # 統合テスト実行（実DB使用）

# システムテスト（要Docker）
npm run test:system                  # システムテスト実行

# E2Eテスト（要全環境）
npm run test:e2e                     # E2Eテスト実行（完全な環境）

# 組み合わせ実行
npm run test:ci                      # CI用（ユニット＋統合）
npm run test:all                     # 全テスト段階実行
```

## テストの実装指針

1. **新機能開発時**:
   - まずインターフェーステストで仕様を定義
   - ユニットテストで内部実装を保証
   - 統合テストで他モジュールとの連携確認

2. **バグ修正時**:
   - バグを再現するテストを先に書く
   - 該当レベルのテストで修正を確認

3. **リファクタリング時**:
   - インターフェーステストが通ることを確認
   - 内部実装（ユニットテスト）は必要に応じて更新

## ユニットテストのベストプラクティス

### モックの適切な使用

**推奨パターン: createCustomMockContext**
```typescript
const mockContext = createCustomMockContext({
  driverResponses: [JSON.stringify({
    result: 'success',
    updatedState: 'updated'
  })],
  storageOverrides: {
    getItem: vi.fn().mockResolvedValue(mockItem)
  }
});
```

**避けるべきパターン: 二重モック**
```typescript
// ❌ 不要な複雑性
mockContext.createDriver = vi.fn().mockResolvedValue(
  new TestDriver({ responses: [...] })
);
```

### 型チェックを活用した検証

**推奨: 構造の検証**
```typescript
expect(result.output).toMatchObject({
  id: expect.any(String),
  score: expect.any(Number),
  items: expect.arrayContaining([
    expect.objectContaining({
      type: expect.any(String)
    })
  ])
});
```

**避ける: AI生成内容の詳細検証**
```typescript
// ❌ ユニットテストでは不適切
expect(result.output.description).toBe('特定の文字列');
```

### エラーケースの網羅

```typescript
describe('エラーハンドリング', () => {
  it('ストレージエラーを適切に処理', async () => {
    const error = new Error('Database connection failed');
    mockContext.storage.getItem = vi.fn().mockRejectedValue(error);

    const result = await workflow.execute(input);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
  });
});
```

### テストの焦点を絞る

- **単一の振る舞いをテスト** - 1つのテストで1つの事項を検証
- **Arrange-Act-Assert パターン** - テストを3段階で構成
- **説明的なテスト名** - 何をテストしているか明確に

## CI/CDでの実行順序

1. ユニットテスト（最速、常に実行）
2. インターフェーステスト（高速、常に実行）
3. 統合テスト（中速、PR時実行）
4. システムテスト（低速、マージ前実行）
5. E2Eテスト（最遅、リリース前実行）

## 期待される効果

1. **開発速度の向上**
   - 通常の開発: `npm test` (単体テストのみ、高速)
   - PR前: `npm run test:ci` (単体+統合)
   - リリース前: `npm run test:all` (全テスト)

2. **CI/CD時間の短縮**
   - 並列実行可能
   - リソースの効率的な利用

3. **テストの信頼性向上**
   - 明確な責任分離
   - 適切なモック/実環境の使い分け

## Pythonワーカーの最適化

### 現状の問題

- 各テストでRuriモデルを初期化（~5秒/回）

### 解決策

1. **モデルのキャッシュ**: 一度ロードしたモデルをメモリに保持
2. **軽量モデルオプション**: テスト用に`ruri-v3-30m`を使用（既に実施済み）
3. **モックモード**: 単体テストではベクトル化をスキップ
