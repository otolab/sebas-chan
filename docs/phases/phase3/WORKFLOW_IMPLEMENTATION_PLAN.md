# ワークフロー実装計画

## 現状分析

### 実装済みワークフロー
現在、`packages/core/src/workflows/impl-functional/`に以下のワークフローが実装されています：

1. **process-user-request.ts** - A-0: ユーザーリクエスト処理
2. **ingest-input.ts** - A-1: Input取り込み
3. **analyze-issue-impact.ts** - A-2: Issue影響分析
4. **extract-knowledge.ts** - A-3: Knowledge抽出

### 問題点
- 現在の実装は古い仕様に基づいている可能性
- Moduler Promptの統合が不完全
- WorkflowDefinitionインターフェースに準拠していない部分がある
- テストが一部のワークフローにのみ存在（ingest-input.test.ts）

## 実装計画

### Phase 1: 既存ワークフローの書き直し

#### 1.1 インターフェース準拠への更新
各ワークフローを新しいWorkflowDefinition仕様に合わせて更新：

```typescript
interface WorkflowDefinition {
  name: string;
  description: string;
  triggers: WorkflowTrigger;
  executor: WorkflowExecutor;
}
```

#### 1.2 Moduler Prompt統合
AI処理部分をModuler Promptフレームワークを使用するように書き直し：
- プロンプトモジュールの定義
- ドライバー作成とクエリ実行
- エラーハンドリングの強化

#### 1.3 優先度とトリガー設定
各ワークフローに適切な優先度を設定：
- A-0 (process-user-request): 優先度 60（ユーザー応答）
- A-1 (ingest-input): 優先度 40（通常処理）
- A-2 (analyze-issue-impact): 優先度 30（バックグラウンド分析）
- A-3 (extract-knowledge): 優先度 20（バックグラウンド処理）

### Phase 2: 新規ワークフローの追加

#### B系: 横断的ワークフロー
1. **B-1: cluster-issues.ts** - Issue群のクラスタリング
   - 関連するIssueをグループ化
   - 優先度: 10（低優先度バックグラウンド）

2. **B-2: update-flow-relations.ts** - Flow関係更新
   - FlowとIssueの関係性を維持
   - 優先度: 15

3. **B-3: update-flow-priorities.ts** - Flow優先度更新
   - 動的な優先度調整
   - 優先度: 15

4. **B-4: salvage-from-pond.ts** - Pondからのサルベージ
   - 未整理情報から価値あるデータを発見
   - 優先度: 5（最低優先度）

#### C系: 提案系ワークフロー
1. **C-1: suggest-next-flow.ts** - 次のFlow提案
   - ユーザーの次のアクションを提案
   - 優先度: 25

2. **C-2: suggest-next-action.ts** - Issue対応提案
   - 具体的なアクションアイテムの提案
   - 優先度: 25

### Phase 3: テストの整備

#### 3.1 単体テスト
各ワークフローに対応するテストファイルを作成：
- `*.test.ts`形式で同一ディレクトリに配置
- モックコンテキストとエミッターを使用
- 成功ケースとエラーケースの両方をカバー

#### 3.2 統合テスト
ワークフローチェーンのテスト：
- イベント発行による連鎖的な実行
- 実際のWorkflowResolverとQueueを使用

### Phase 4: 動作確認環境の構築

#### 4.1 テストハーネス
開発用のテスト実行環境を構築：
```bash
npm run workflow:test -- --workflow=process-user-request
```

#### 4.2 モックデータ生成
テスト用のサンプルデータセット：
- サンプルIssue
- サンプルInput
- サンプルKnowledge

#### 4.3 実行ログの可視化
ワークフロー実行を追跡できるログシステム：
- 実行時間の測定
- イベントチェーンの可視化
- エラーの詳細追跡

## 実装順序

### 優先度1（即座に実施）
1. A-0: process-user-request.tsの書き直し
2. A-1: ingest-input.tsの書き直し
3. 基本的なテストハーネスの構築
4. **WorkflowTriggerのcondition機能実装**
   - 条件関数の評価ロジック
   - WorkflowResolverでの条件チェック統合

### 優先度2（基本機能確立後）
1. A-2: analyze-issue-impact.tsの書き直し
2. A-3: extract-knowledge.tsの書き直し
3. B-1: cluster-issues.tsの新規作成
4. 各ワークフローのテスト作成
5. **ログレベル概念の削除とログシステム改善**
   - すべてのログをDBに保存
   - 検証可能性の向上

### 優先度3（拡張機能）
1. B系の残りのワークフロー実装
2. C系のワークフロー実装
3. 統合テストの整備
4. パフォーマンス最適化
5. **WorkflowTriggerのschedule機能実装（将来）**
   - Cron式サポート
   - インターバル実行サポート

## 成功基準

1. **仕様準拠**: すべてのワークフローがWorkflowDefinitionに準拠
2. **Moduler Prompt統合**: AI処理がすべてModuler Promptを使用
3. **テストカバレッジ**: 各ワークフローに単体テストが存在
4. **動作確認**: テストハーネスですべてのワークフローが実行可能
5. **ドキュメント**: 各ワークフローの目的と使用方法が文書化

## リスクと対策

### リスク1: 既存コードの破壊
- **対策**: 段階的な書き直しとテストの充実

### リスク2: パフォーマンス劣化
- **対策**: 実行時間の測定と最適化

### リスク3: 複雑性の増大
- **対策**: シンプルな設計の維持とドキュメント化

## 次のステップ

1. この計画のレビューと承認
2. A-0ワークフローの書き直し開始
3. テストハーネスの基本実装
4. 段階的な実装とテスト