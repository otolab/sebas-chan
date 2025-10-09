# ワークフローテスト戦略と実装状況

## 概要

作成日: 2025-10-07
更新日: 2025-10-07
作成者: Claude + @otolab

sebas-chanプロジェクトの全ワークフローに対するテスト戦略と現在の実装状況をまとめた資料です。

## ユニットテストの基準

### 基本原則

ユニットテストは**コードカバレッジとロジックの正確性**を確認することが目的です。生成AIの出力品質は統合テストで別途評価します。

### ユニットテストで重視すべき点

1. **コードカバレッジ**
   - 全ての分岐条件をカバー
   - エラーパスを含む全実行パスをテスト
   - カバレッジ目標: 80%以上（理想は90%以上）

2. **ロジックの動作確認**
   - 入力に対して適切な処理が実行されることを確認
   - 適切なメソッドが呼ばれることを検証
   - 状態の変化が期待通りであることを確認

3. **出力の構造確認**
   - 出力の型と構造が正しいことを確認
   - 具体的な値ではなく、型チェック（`expect.any(Type)`）を使用
   - 必須フィールドの存在確認

### ユニットテストで避けるべき点

1. **AI生成内容の詳細検証**
   ```typescript
   // ❌ 避けるべき: AI生成内容の詳細を検証
   expect(result.state).toContain('Issue影響分析');
   expect(result.state).toContain('Impact Score:');

   // ✅ 推奨: 状態が更新されたことのみ確認
   expect(result.state).not.toBe(initialState);
   expect(result.state).toBeDefined();
   ```

2. **複雑な出力値の検証**
   ```typescript
   // ❌ 避けるべき: 具体的な値を詳細に検証
   expect(result.impactScore).toBe(0.85);
   expect(result.description).toBe('特定の文字列');

   // ✅ 推奨: 型と範囲を検証
   expect(result.impactScore).toBeGreaterThanOrEqual(0);
   expect(result.impactScore).toBeLessThanOrEqual(1);
   expect(typeof result.description).toBe('string');
   ```

3. **過度なモックの詳細設定**
   ```typescript
   // ❌ 避けるべき: vi.fn()の二重モック
   mockContext.createDriver = vi.fn().mockResolvedValue(
     new TestDriver({ responses: [...] })
   );

   // ✅ 推奨: シンプルな関数として実装
   mockContext.createDriver = async () =>
     new TestDriver({ responses: [...] });
   ```

### TestDriverの適切な使用

```typescript
// ユニットテスト用の固定レスポンス
const mockContext = createCustomMockContext({
  driverResponses: [JSON.stringify({
    // 最小限の必須フィールドのみ
    result: 'success',
    updatedState: 'state updated'
  })]
});

// 統合テスト用のcapability-driven選択（将来実装）
const driver = await createDriver({
  requiredCapabilities: process.env.USE_REAL_AI ? ['structured'] : ['test']
});
```

## 現在のワークフロー実装状況

### 実装済みワークフロー一覧

| グループ | ID | ワークフロー名 | AIドライバー使用 | テスト実装 | TestDriverパターン |
|---------|-----|---------------|----------------|-----------|------------------|
| **A系（基本）** | A-0 | IngestInput | ✅ | ✅ | ✅ 修正済み |
| | A-1 | ProcessUserRequest | ✅ | ✅ | ✅ 修正済み |
| | A-2 | AnalyzeIssueImpact | ✅ | ✅ | ✅ 修正済み |
| | A-3 | ExtractKnowledge | ✅ | ✅ | ✅ 修正済み |
| **B系（Flow）** | B-0 | CreateFlow | ❌ | ❌ | - |
| | B-1 | ClusterIssues | ✅ | ✅ | ✅ 正しい実装 |
| | B-2 | UpdateFlowRelations | ✅ | ✅ | ✅ 実装済み |
| **C系（提案）** | C-1 | SuggestNextFlow | ✅ | ❌ | 未実装 |
| | C-2 | SuggestNextAction | ✅ | ❌ | 未実装 |
| **D系（システム）** | D-1 | - | 未実装 | - | - |
| | D-2 | CollectSystemStats | ❌ | ✅ | - |

## ワークフローごとのテスト戦略

### A系（基本ワークフロー）

#### A-0: IngestInput
**目的**: 外部データの取り込みとIssue化の判定
**テスト戦略**:
- ✅ 新規Issue作成のテスト
- ✅ 既存Issue更新のテスト
- ✅ 高優先度Issue検出のテスト
- ✅ エラーハンドリング
- ⚠️ エラーケースでvi.fn()パターンが残存（要修正）

#### A-1: ProcessUserRequest
**目的**: ユーザーリクエストの分類と処理
**テスト戦略**:
- ✅ リクエストタイプ分類（issue/schedule/other）
- ✅ イベント発行の検証
- ✅ 空リクエストのハンドリング
- ✅ エラーハンドリング
- ⚠️ エラーケースでvi.fn()パターンが残存（要修正）

#### A-2: AnalyzeIssueImpact
**目的**: Issueの影響度分析と優先度調整
**テスト戦略**:
- ✅ 影響度スコア計算
- ✅ 高優先度検出とイベント発行
- ✅ 優先度更新
- ✅ 重複Issue検出
- ✅ エラーハンドリング
- ⚠️ エラーケースでvi.fn()パターンが残存（要修正）

#### A-3: ExtractKnowledge
**目的**: Issueやパターンから知識の抽出
**テスト戦略**:
- ✅ Issue/パターンからの知識抽出
- ✅ 重複知識の検出
- ✅ 知識タイプの判定
- ✅ 短いコンテンツの除外
- ✅ エラーハンドリング
- ⚠️ エラーケースでvi.fn()パターンが残存（要修正）

### B系（Flowワークフロー）

#### B-0: CreateFlow
**目的**: 新規Flowの作成
**テスト戦略**:
- ❌ **テスト未実装**
- AIドライバー不使用のため、シンプルなユニットテストで十分
- 必要なテストケース:
  - Flow作成の成功ケース
  - 必須フィールドの検証
  - エラーハンドリング

#### B-1: ClusterIssues
**目的**: 類似Issueのクラスタリング
**テスト戦略**:
- ✅ クラスタ生成の検証
- ✅ 未クラスタIssueの処理
- ✅ 空のIssueリストのハンドリング
- ✅ エラーハンドリング
- ✅ **TestDriverパターンは正しく実装済み**

#### B-2: UpdateFlowRelations
**目的**: Flow間の関係性更新
**テスト戦略**:
- ✅ **テスト実装済み（2025-10-07）**
- 実装済みテストケース:
  - Flow関係性の正常更新
  - obsoleteなFlowのアーカイブ処理
  - 観点無効時のdescription更新
  - 複数Flow処理
  - エラーハンドリング（AIドライバー、ストレージ）
  - トリガー条件の検証

### C系（提案ワークフロー）

#### C-1: SuggestNextFlow
**目的**: 次に取り組むべきFlowの提案
**テスト戦略**:
- ❌ **テスト未実装（要作成）**
- 必要なテストケース:
  - 優先度ベースの提案
  - 依存関係を考慮した提案
  - 提案なしのケース
  - AIによる提案理由の生成
  - エラーハンドリング

#### C-2: SuggestNextAction
**目的**: Issueに対する次のアクション提案
**テスト戦略**:
- ❌ **テスト未実装（要作成）**
- 必要なテストケース:
  - 高優先度Issueへのアクション提案
  - コンテキストを考慮した提案
  - 複数アクションの優先順位付け
  - AIによる提案生成
  - エラーハンドリング

### D系（システムワークフロー）

#### D-1: 未実装
**検討事項**:
- そもそも必要かどうかの判断が必要
- システム初期化やメンテナンス系の処理が候補

#### D-2: CollectSystemStats
**目的**: システム統計情報の収集
**テスト戦略**:
- ✅ 統計情報の収集
- ✅ 空データのハンドリング
- ✅ パフォーマンスメトリクス
- ✅ **AIドライバー不使用（適切）**

## 実装の過不足分析

### ✅ 十分な実装

1. **A系ワークフロー**: 基本機能は全て実装・テスト済み
2. **B-1 ClusterIssues**: 適切なTestDriverパターンで実装済み
3. **D-2 CollectSystemStats**: AIドライバー不要で適切に実装

### 🔴 不足している実装（優先度高）

1. **B-2 UpdateFlowRelations**: AIドライバー使用だがテストなし
2. **C-1 SuggestNextFlow**: AIドライバー使用だがテストなし
3. **C-2 SuggestNextAction**: AIドライバー使用だがテストなし

### 🟡 改善が必要な実装（優先度中）

1. **エラーケースのvi.fn()パターン**: A系全体で3箇所
   - 動作はするが一貫性のため修正推奨
   - `vi.fn().mockRejectedValue` → `async () => { throw error }`

### 🟢 検討事項（優先度低）

1. **B-0 CreateFlow**: テストはないが、シンプルなロジックのため影響小
2. **D-1**: そもそも実装が必要かどうかの判断

## 推奨アクションプラン

### Phase 1: 即座に対応すべき項目
1. ✅ **完了**: A系ワークフローのTestDriverパターン統一
2. **残作業**: エラーケースのvi.fn()パターン修正（3箇所）

### Phase 2: 早期に対応すべき項目
1. **B-2 UpdateFlowRelations**のテスト作成
   - createCustomMockContextパターンの使用
   - Flow関係性更新のモック実装

2. **C-1 SuggestNextFlow**のテスト作成
   - 提案ロジックのモック実装
   - 優先度計算の検証

3. **C-2 SuggestNextAction**のテスト作成
   - アクション提案のモック実装
   - コンテキスト依存の検証

### Phase 3: 中期的な改善
1. 統合テストでのAIService活用
2. TestDriverの動的レスポンス機能の活用
3. test-utilsの機能拡充

## テストカバレッジ目標

| カテゴリ | 現在 | 目標 | 必要なアクション |
|---------|------|------|-----------------|
| AIドライバー使用ワークフロー | 6/8 (75%) | 8/8 (100%) | C-1, C-2のテスト追加 |
| 全ワークフロー | 7/9 (77.8%) | 9/9 (100%) | B-0, C-1, C-2のテスト追加 |
| TestDriverパターン統一 | 6/6 (100%) | 6/6 (100%) | ✅ 完了 |
| エラーハンドリング一貫性 | 3/6 (50%) | 6/6 (100%) | vi.fn()パターンの修正 |

## まとめ

### 成果（2025-10-08更新）
- A系ワークフローのTestDriverパターン統一完了
- B-2 UpdateFlowRelationsのテスト実装完了
- **プロンプトテスト実装開始（Issue #38）**
  - A-0, A-1のprompts.test.ts実装完了
  - プロンプトテストガイドライン文書化
- テスト総数: 106（プロンプトテスト14件追加）
- ユニットテストの基準を明文化

### 課題
- C-1, C-2のテスト未実装
- B-0のテスト未実装（低優先度）
- エラーケースの一貫性不足（vi.fn()パターン）

### 次のステップ
1. C-1, C-2のテスト実装（高優先度）
2. エラーケースのパターン統一
3. 統合テストの充実化

---
**関連資料**:
- [Issue #32: TestDriverとAIServiceの適切な使用パターン統一](https://github.com/otolab/sebas-chan/issues/32)
- [Issue #38: A系統ワークフローのAI駆動テスト実装](https://github.com/otolab/sebas-chan/issues/38)
- [ISSUE_32_TESTDRIVER_REFACTOR.md](./ISSUE_32_TESTDRIVER_REFACTOR.md)
- [プロンプトテストガイドライン](../../testing/PROMPT_TESTING_GUIDE.md)
- [ワークフロー仕様書](../../workflows/SPECIFICATION.md)