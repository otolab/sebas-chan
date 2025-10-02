# Phase 4 ワークフロー修正手順書

## 背景
Phase 4でイベントシステムが大幅に変更されました：
- PATTERN_FOUND → RECURRING_PATTERN_DETECTED
- FLOW_CREATION_SUGGESTED → ISSUES_CLUSTER_DETECTED
- 多数のSUGGESTEDイベントを廃止
- 新規イベント追加（FLOW_CREATED, ISSUE_STALLED等）

## 修正パターン分析

### パターン1: イベント名の単純置換
```typescript
// 旧
type: 'PATTERN_FOUND'
// 新
type: 'RECURRING_PATTERN_DETECTED'
```

### パターン2: イベント型インポートの変更
```typescript
// 旧
import type { PatternFoundEvent } from '@sebas-chan/shared-types';
// 新
import type { RecurringPatternDetectedEvent } from '@sebas-chan/shared-types';
```

### パターン3: SUGGESTEDイベントの処理変更
```typescript
// 旧: イベント発火のみ
emitter.emit({ type: 'FLOW_ISSUE_REMOVAL_SUGGESTED', ... });

// 新: 直接実行 + 完了イベント
await storage.updateFlow(flowId, { ... });
emitter.emit({ type: 'FLOW_UPDATED', ... });
```

### パターン4: テスト用モックイベントの修正
```typescript
// 旧: ワークフロータイプをイベントタイプとして使用
const event = {
  type: 'PROCESS_USER_REQUEST',
  payload: { ... }
};

// 新: 正しいイベントタイプを使用
const event: SystemEvent = {
  type: 'USER_REQUEST_RECEIVED',
  payload: {
    userId: 'test-user',
    content: 'test',
    timestamp: new Date().toISOString()
  }
};
```

## 効率的な修正手順

### Step 1: 依存関係の把握
1. shared-typesの変更内容を確認
2. 各ワークフローのトリガーイベントを確認
3. 各ワークフローが発火するイベントを確認

### Step 2: ワークフロー本体の修正（最優先）
1. import文の修正
2. イベントタイプの置換
3. SUGGESTEDイベントの処理ロジック変更
4. **型チェックとLintを最優先で解消**

### Step 3: 品質確認（テストより重要）
```bash
# 型チェック - 最重要
npm run typecheck -w @sebas-chan/core

# Lint - 次に重要
npm run lint -w @sebas-chan/core

# ビルド確認
npm run build -w @sebas-chan/core
```

**注意**: テストよりもTypeCheckとLintのエラー解消を優先する。型安全性とコード品質が保証されて初めてテストが意味を持つ。

### Step 4: テストの最小限修正（最後）
1. モックイベントを正しい型に修正
2. expect文のイベント名を修正
3. 削除されたイベントのテストをスキップ

## ワークフローのドキュメンテーション基準

A系ワークフローと同等レベルのコメントドキュメンテーションを維持する：

```typescript
/**
 * B-2: UPDATE_FLOW_RELATIONS ワークフロー
 *
 * Issue作成・更新・ステータス変更時にFlow関係性を動的に更新する。
 * AIがFlowの健全性を評価し、必要に応じて再構成を提案・実行する。
 *
 * このワークフローの役割：
 * - Issue変更に基づくFlow構成の最適化
 * - Flowの観点（perspective）の妥当性評価
 * - 自動的なFlow再編成の実行
 * - Flow間の依存関係管理
 */
```

各関数にも意図を明確にするコメントを追加。

## 修正対象ワークフロー一覧

### 完了済み
- [x] B-1 (ClusterIssues): FLOW_CREATION_SUGGESTED → ISSUES_CLUSTER_DETECTED
- [x] B-0 (CreateFlow): 新規作成完了（ドキュメント済み）
- [x] D-2 (CollectSystemStats): 不要イベント削除
- [x] A-3 (ExtractKnowledge): PATTERN_FOUND → RECURRING_PATTERN_DETECTED
- [x] B-2 (UpdateFlowRelations): SUGGESTEDイベントを直接実行に変更（Issue作成パターン適用）
- [x] C-1 (SuggestNextFlow): 型エラー修正、未定義のFLOW_SUGGESTION_READYイベントを削除
- [x] C-2 (SuggestNextAction): ACTION_REQUESTED/USER_STUCKを適切なイベントに置換

### 要修正（ドキュメント追加含む）
- [ ] A-1 (ProcessUserRequest): ISSUE_REPORTED → ISSUE_CREATED
- [ ] A-2 (AnalyzeIssueImpact): 必要に応じて調整

## SUGGESTEDイベント処理の改善指針

### 原則
「問題の先送り」を避け、ワークフロー内で処理を完結させる

### 実装パターン

#### 1. 直接実行パターン（推奨）
```typescript
// Flow関係の更新を直接実行
await storage.updateFlow(flowId, {
  issueIds: flow.issueIds.filter(id => id !== issueId)
});

// 完了通知イベントを発火
emitter.emit({
  type: 'FLOW_UPDATED',
  payload: { flowId, updates: { ... } }
});
```

#### 2. Issue作成パターン（ユーザー判断が必要な場合）
```typescript
// 複雑な提案はIssueとして作成
const suggestionIssue = await storage.createIssue({
  title: `Flow ${flowId} の分割を検討`,
  description: rationale,
  labels: ['suggestion', 'flow-management'],
  ...
});

emitter.emit({
  type: 'ISSUE_CREATED',
  payload: { issue: suggestionIssue }
});
```

#### 3. Issue更新パターン（既存Issueへの追記）
```typescript
// 提案内容を既存Issueのupdatesに追加
await storage.updateIssue(issueId, {
  updates: [
    ...issue.updates,
    {
      type: 'suggestion',
      content: suggestion,
      timestamp: new Date()
    }
  ]
});

emitter.emit({
  type: 'ISSUE_UPDATED',
  payload: { issueId, updates: { ... } }
});
```

## テスト修正の最小アプローチ

### 1. 個別テスト実行
```bash
# .onlyを使って1つずつ確認
npm test -w @sebas-chan/core -- --run b-2.update-flow-relations.test.ts -t "should update flow relations"
```

### 2. モックイベントのテンプレート
```typescript
// USER_REQUEST_RECEIVED
const userRequestEvent: SystemEvent = {
  type: 'USER_REQUEST_RECEIVED',
  payload: {
    userId: 'test-user',
    content: 'テストリクエスト',
    timestamp: new Date().toISOString()
  }
};

// DATA_ARRIVED
const dataArrivedEvent: SystemEvent = {
  type: 'DATA_ARRIVED',
  payload: {
    source: 'test-source',
    content: 'テストデータ',
    pondEntryId: 'pond-123',
    timestamp: new Date().toISOString()
  }
};

// ISSUE_CREATED
const issueCreatedEvent: SystemEvent = {
  type: 'ISSUE_CREATED',
  payload: {
    issueId: 'issue-123',
    issue: mockIssue,
    createdBy: 'workflow' as const,
    sourceWorkflow: 'TestWorkflow'
  }
};
```

## 次のアクション

1. B-2 (UpdateFlowRelations)の修正から開始
2. 各ワークフローごとに:
   - 本体の修正
   - 最小限のテスト修正（.onlyで1つ）
   - 動作確認
3. 全体テストは最後にまとめて実施