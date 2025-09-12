# テスト構成再編成計画

## 現状の問題点
1. **初期化の遅さ**: 実DBとPythonワーカー（Ruriモデル）の初期化に時間がかかる
2. **テストの混在**: モック使用の単体テストと実DB使用の統合テストが混在
3. **リソースの無駄**: 各テストファイルでDBプロセスを起動・終了

## 提案する新しいテスト構成

### 1. テストの分類と配置

```
sebas-chan/
├── packages/
│   ├── core/
│   │   └── src/
│   │       └── *.test.ts        # 単体テスト（モック使用）
│   ├── db/
│   │   └── src/
│   │       └── *.test.ts        # 単体テスト（モック使用）
│   └── server/
│       └── src/
│           └── *.test.ts        # 単体テスト（モック使用）
├── test/                         # 統合テスト（実DB使用）
│   ├── integration/
│   │   ├── input-pond-flow.test.ts
│   │   ├── db-operations.test.ts
│   │   └── setup.ts            # 共通セットアップ
│   └── e2e/                     # E2Eテスト
│       ├── api.test.ts
│       └── scenarios/
│           └── *.test.ts
└── vitest.config.ts             # ルート設定

```

### 2. テスト分類の基準

#### 単体テスト（Unit Tests）
- **場所**: 各パッケージの`src/*.test.ts`
- **特徴**: 
  - モック使用
  - 高速実行（< 100ms/test）
  - 頻繁に実行
- **対象**: 
  - ビジネスロジック
  - ユーティリティ関数
  - エラーハンドリング

#### 統合テスト（Integration Tests）
- **場所**: `/test/integration/`
- **特徴**:
  - 実DB使用
  - 中速実行（1-5s/test）
  - CI/CD時に実行
- **対象**:
  - DB操作
  - ベクトル検索
  - データフロー

#### E2Eテスト（End-to-End Tests）
- **場所**: `/test/e2e/`
- **特徴**:
  - 完全な環境
  - 低速実行（5-30s/test）
  - リリース前に実行
- **対象**:
  - APIエンドポイント
  - ユーザーシナリオ
  - システム全体の動作

### 3. 実装手順

#### Step 1: テストディレクトリ構造の作成
```bash
mkdir -p test/integration test/e2e/scenarios
```

#### Step 2: 統合テストの移動
移動対象：
- `packages/db/test/pond-integration.test.ts` → `test/integration/pond-operations.test.ts`
- `packages/server/test/api.test.ts` → `test/e2e/api.test.ts`
- `packages/server/src/core/input-pond-flow.test.ts` の実DB部分 → `test/integration/input-pond-flow.test.ts`

#### Step 3: 共通セットアップの作成
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

#### Step 4: NPMスクリプトの更新
```json
{
  "scripts": {
    "test": "vitest run --exclude '**/integration/**' --exclude '**/e2e/**'",
    "test:unit": "vitest run --exclude '**/integration/**' --exclude '**/e2e/**'",
    "test:integration": "vitest run test/integration",
    "test:e2e": "vitest run test/e2e",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:ci": "npm run test:unit && npm run test:integration"
  }
}
```

### 4. 期待される効果

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

### 5. 移行タイムライン

- Phase 1: ディレクトリ構造の作成とセットアップ
- Phase 2: 既存テストの分類と移動
- Phase 3: NPMスクリプトとCIの更新
- Phase 4: ドキュメント更新

## 補足: Pythonワーカーの最適化案

### 現状の問題
- 各テストでRuriモデルを初期化（~5秒/回）

### 解決策
1. **モデルのキャッシュ**: 一度ロードしたモデルをメモリに保持
2. **軽量モデルオプション**: テスト用に`ruri-v3-30m`を使用（既に実施済み）
3. **モックモード**: 単体テストではベクトル化をスキップ