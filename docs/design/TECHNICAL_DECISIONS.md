# 技術的決定事項

## 技術スタック

### 言語選定

#### TypeScript（メイン言語）

**選定理由**:

- 型安全性によるバグの早期発見
- VSCodeとの優れた統合
- Node.js エコシステムの活用
- フロントエンド/バックエンドの言語統一

#### Python（データ処理層）

**選定理由**:

- LanceDBの公式サポート
- AIモデル（ruri-v3）のサポート
- データサイエンスライブラリの充実

### フレームワーク

#### Express（REST API）

**選定理由**:

- 軽量で柔軟
- 豊富なミドルウェア
- 学習コストが低い

#### SvelteKit（Web UI）

**選定理由**:

- コンパイル時最適化
- リアクティブな状態管理
- TypeScriptの完全サポート
- SSR/SSGの柔軟な選択

### データベース

#### LanceDB（ベクトルDB）

**選定理由**:

- 日本語ベクトル検索のネイティブサポート
- SQLクエリ（DataFusion）サポート
- 組み込み可能（サーバーレス）
- スケーラビリティ

### AI基盤

#### moduler-prompt/AIService

**選定理由**:

- capability駆動のドライバー選択
- 統一的なドライバー管理
- 構造化出力のネイティブサポート
- プロバイダーに依存しない抽象化

**実装方針**:

```typescript
// CoreEngineでAIServiceを初期化
const aiService = new AIService({
  models: [
    {
      model: 'test-driver',
      provider: 'test',
      capabilities: ['structured', 'fast', 'local'],
    },
  ],
});

// ワークフローでcapabilityベースで選択
const driver = await aiService.createDriverFromCapabilities(['structured', 'japanese'], {
  preferLocal: true,
  lenient: true,
});
```

## 設計原則

### 1. シンプルさ優先

- 過度な抽象化を避ける
- 明確な責任分離
- 読みやすいコード

### 2. 段階的な拡張性

- 最小構成から開始
- 機能を段階的に追加
- 後方互換性の維持

### 3. 型安全性

- TypeScriptの厳格モード
- 明示的な型定義
- 共有型定義パッケージ

### 4. イベント駆動

- 疎結合な設計
- 非同期処理の活用
- リトライ可能な処理

## アーキテクチャ決定

### 単一プロセス構成（初期実装）

**理由**:

- デプロイメントの簡素化
- デバッグの容易さ
- リソース効率

**将来の拡張**:

- マイクロサービス化の選択肢を残す
- メッセージキューの導入準備

### REST API中心設計

**理由**:

- 標準的なプロトコル
- 言語非依存
- デバッグツールの充実

### インメモリイベントキュー

**理由**:

- 実装の簡素化
- 低レイテンシ
- 初期段階では十分

**将来の拡張**:

- Redis等の永続化キューへの移行パス

## パッケージ構成

### モノレポ構成（npm workspaces）

```
packages/
├── server/         # メインサーバープロセス
├── core/           # Core Agent
├── db/             # DB Bridge
├── shared-types/   # 共通型定義
├── reporter-sdk/   # Reporter開発用SDK
├── mcp-server/     # MCP Server（Phase 4）
└── web-ui/         # SvelteKit UI
```

**メリット**:

- 依存関係の明確化
- 共通コードの共有
- 統一されたビルドプロセス

### 共有型定義（@sebas-chan/shared-types）

```typescript
// 全パッケージで共有される型定義
export interface Issue {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'closed';
  priority: number;
  // ...
}
```

## 開発ガイドライン

### コーディング規約

```typescript
// 1. 明示的な型定義
function processIssue(issue: Issue): Promise<ProcessedIssue>;

// 2. エラーハンドリング
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', { error, context });
  throw new AppError('OPERATION_FAILED', error);
}

// 3. 関数型プログラミングの活用
const activeIssues = issues
  .filter((issue) => issue.status === 'open')
  .sort((a, b) => b.priority - a.priority);
```

### テスト戦略

- **単体テスト**: 各関数/クラスレベル
- **統合テスト**: API/DB連携
- **E2Eテスト**: 主要ユーザーフロー

詳細は[テスト戦略](../testing/STRATEGY.md)を参照。

### ロギング

```typescript
// 構造化ログの使用
logger.info('Workflow executed', {
  workflow: 'PROCESS_USER_REQUEST',
  duration: executionTime,
  input: event.payload,
  output: result,
});
```

## セキュリティ考慮事項

### 認証・認可（将来実装）

- JWT トークンベース
- Role-Based Access Control (RBAC)
- API キー管理

### データ保護

- 環境変数による機密情報管理
- HTTPSの強制
- SQLインジェクション対策

### 監査ログ

- 全APIアクセスの記録
- データ変更の追跡
- 異常検知

## パフォーマンス最適化

### キャッシング戦略

- インメモリキャッシュ（頻繁にアクセスされるデータ）
- ベクトル検索結果のキャッシュ
- State文書のキャッシュ

### 非同期処理

- Promise.all()による並列処理
- ワークフローの非ブロッキング実行
- バックグラウンドタスク

### リソース管理

- コネクションプーリング
- メモリリーク対策
- 定期的なクリーンアップ

## 今後の技術検討事項

### Phase 4以降

- **メッセージキュー**: Redis/RabbitMQ
- **分散トレーシング**: OpenTelemetry
- **コンテナ化**: Docker/Kubernetes
- **CI/CD**: GitHub Actions
- **モニタリング**: Prometheus/Grafana

## 関連ドキュメント

- [システム概要](OVERVIEW.md) - アーキテクチャ全体像
- [コンポーネント詳細](COMPONENTS.md) - 各コンポーネントの設計
- [ロードマップ](../ROADMAP.md) - 実装計画
