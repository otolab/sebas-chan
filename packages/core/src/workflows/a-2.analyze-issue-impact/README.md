# A-2: ANALYZE_ISSUE_IMPACT ワークフロー

## 概要

Issueの状態変化を分析し、以下の判定を行うワークフローです：
- クローズ可否の判定
- 優先度の提案
- 他Issueとの関連性（重複等）の検出
- 知識抽出可能性の判定
- システムState（context.state）の更新

このワークフローは他のワークフロー実装のリファレンスとして設計されています。

## 処理フロー

1. **Issue取得**: payloadまたはstorageからIssueデータを取得
2. **関連Issue検索**: 類似する既存Issueを検索
3. **AI分析**: 1回の呼び出しで分析とState更新を実行
4. **Issue更新**: 分析結果に基づいてIssueを更新
5. **イベント発行**: 後続処理のためのイベントを発行
6. **コンテキスト更新**: 更新されたStateを含むコンテキストを返却

## 実装のポイント

### 1. ファイル構成

```
a-2.analyze-issue-impact/
├── index.ts          # WorkflowDefinitionとexecutor関数
├── actions.ts        # ビジネスロジック関数群
├── prompts.ts        # PromptModule定義
└── analyze-issue-impact.test.ts
```

**設計意図**：
- `index.ts`: ワークフローの骨格のみ（薄く保つ）
- `actions.ts`: 再利用可能な関数を集約（テストしやすい）
- `prompts.ts`: AI処理の定義を分離（静的に定義）

### 2. PromptModuleの設計

```typescript
// updateStatePromptModuleをマージして一体化
export const analyzeImpactPromptModule = merge(
  updateStatePromptModule,  // State管理機能を提供
  baseAnalyzeImpactModule   // ワークフロー固有のロジック
);
```

**重要な原則**：
- **責務の分離**: 各モジュールが単一の責任を持つ
  - `updateStatePromptModule`: State管理に特化
  - `baseAnalyzeImpactModule`: Issue分析に特化
  - mergeによって組み合わせることで複雑な処理を実現
- `updateStatePromptModule`を活用してState更新を自動化
- 1回のAI呼び出しで分析とState更新を完結
- 重複する指示を書かない（mergeで解決）

**設計の利点**：
- 各モジュールが独立してテスト可能
- 再利用性が高い（他のワークフローでも`updateStatePromptModule`を使える）
- 複雑なプロンプトも段階的に構築できる

### 3. セクションの使い分け

- **inputs**: 処理対象の主要データ（現在のIssue情報）
- **materials**: 参考資料（関連Issue一覧）
- **schema**: 構造化出力の定義（必ずupdatedStateを含む）

**注意点**：
- 存在しない型（`type: 'list'`等）を使わない
- セクションの役割を理解して適切に選択

### 4. ドライバーの共有

```typescript
// 単一のドライバーインスタンスを作成して共有
const driver = await context.createDriver({
  requiredCapabilities: ['structured'],
  preferredCapabilities: ['japanese']
});

// 同じドライバーで複数の処理を行える
const analysis = await analyzeIssue(driver, issue, relatedIssues, context.state);
```

**設計意図**：
- ドライバー作成のオーバーヘッドを削減
- 1回のAI呼び出しに統合することは推奨される（分析とstate更新の統合など）
- 実行コスト削減とコンテキスト維持の2つの利点がある

### 5. エラーハンドリング

```typescript
if (!result.structuredOutput) {
  throw new Error('構造化出力の取得に失敗しました');
}
```

**重要**：
- 構造化出力は必須（ワークフローの前提）
- 明確なエラーメッセージで問題を特定しやすく

### 6. 記録の重要性

すべての重要なステップを記録：
- INPUT: 処理開始
- DB_QUERY: データベース操作
- AI_CALL: AI処理
- INFO: 重要な判定結果
- OUTPUT: 処理完了
- ERROR: エラー発生

**意図**：
- 暗黙的に実行されるワークフローの動作を追跡可能に
- 問題発生時の原因特定を容易に

### 7. テストの設計

```typescript
const setupDriverMocks = (analyzeIssueResponse: any) => {
  mockContext.createDriver = vi.fn().mockResolvedValue(
    new TestDriver({
      responses: [JSON.stringify(analyzeIssueResponse)]
    })
  );
};
```

**ポイント**：
- TestDriverで実際のAI呼び出しをモック
- setupユーティリティで重複を削減
- 各テストケースで必要な応答を明示的に定義

## チェックリスト（新規ワークフロー実装時）

- [ ] WorkflowDefinitionの3要素（name, triggers, executor）を定義
- [ ] updateStatePromptModuleをマージしてState更新を組み込む
- [ ] 単一のドライバーインスタンスを共有（コスト削減とコンテキスト維持）
- [ ] すべての重要ステップをrecorderで記録
- [ ] エラー時も適切なWorkflowResultを返却
- [ ] TestDriverを使った包括的なテストを作成

**注意**: updateStatePromptModuleをマージすると、自動的に：
- `updatedState`フィールドがスキーマに追加される
- State更新の指示がinstructionsに含まれる
- 現在のStateが表示される

## アンチパターン（避けるべき実装）

1. **不要な抽象化**: `fetchIssueData`のような単純な処理の関数化
2. **State更新の重複**: 手動でState更新指示を書く（updateStatePromptModuleを使う）
3. **複数のAI呼び出し**: 可能な限り1回にまとめる
4. **存在しない型の使用**: ドキュメントを確認せずに推測で実装
5. **記録の省略**: デバッグが困難になる

## 参考資料

- [ワークフロー開発者ガイド](../../../docs/workflows/DEVELOPER_GUIDE.md)
- [Moduler Prompt仕様](https://github.com/otolab/moduler-prompt/docs)
- [ワークフロー仕様書](../../../docs/workflows/SPECIFICATION.md)