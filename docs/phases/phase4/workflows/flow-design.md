# Flow 設計仕様（Phase 4）

## 概要

FlowはIssue群に「観点」を与える動的なコンテナです。Phase 4では、**自然言語による柔軟な制御**を中心に設計します。

## 設計原則

### 1. シンプルなスキーマ + 豊かな自然言語

現在のFlow DB Schema：
```typescript
interface Flow {
  id: string;
  title: string;
  description: string;    // ← 制御の中心
  status: string;
  priorityScore: number;
  issueIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

`description`フィールドに自然言語で制御情報を記述し、AIが解釈・実行します。

### 2. Issue の自律性を尊重

Flow は Issue に対して：
- ✅ **情報を付加**（コメントのように）
- ✅ **関係性を記述**（Issue間の依存関係など）
- ✅ **優先度を提案**（最終決定はユーザー）
- ❌ **本体を変更しない**（title, description, statusは不変）

### 3. 動的な進化

Flow の description は時間とともに成長：
- Issue の追加・更新を反映
- 学習内容を蓄積
- 観点の自然な進化

## Issue 変化への反応

### イベントとワークフローの連携

| Issue イベント | B-2 の処理 | description への反映 |
|---------------|-----------|-------------------|
| ISSUE_CREATED | 即座実行 | 関係性を追記、観点を調整 |
| ISSUE_UPDATED | 軽量実行 | 変更履歴を追記 |
| ISSUE_STATUS_CHANGED | 軽量実行 | 完了率を更新 |
| ISSUE_CLOSED | 重量実行 | 全体を再評価、学習内容を追加 |

### B-2 (UpdateFlowRelations) の処理方式

```typescript
// 概念的な処理フロー（実装イメージ）
async function updateFlowOnIssueChange(event: IssueEvent) {
  const flow = await getFlowByIssueId(event.issueId);

  if (event.type === 'ISSUE_UPDATED') {
    // 軽量処理：descriptionに差分を追記
    flow.description += `\n[更新] ${event.summary}`;
  }

  if (event.type === 'ISSUE_CLOSED') {
    // 重量処理：AIにdescription全体を再生成させる
    flow.description = await ai.regenerateDescription(flow, event);
  }
}
```

## 時限的なFlow

### 日次Flow

description に完了時刻を記述することで自動完了：

```typescript
{
  id: "daily-2024-01-20",
  title: "2024年1月20日（土）",
  description: `
    今日のタスクを管理する。
    このFlowは2024/01/21 04:00:00に自動完了する。

    【繰り越しルール】
    - 優先度80以上: 翌日へ自動繰り越し
    - 優先度50-79: ユーザーに確認
    - 優先度50未満: 週次Flowへ移動

    【自動追加条件】
    - "今日"タグのIssueは自動追加
    - 締切が今日のIssueも自動追加
  `,
  status: "active",
  // ...
}
```

### AIによる解釈

D-2 (CollectSystemStats) などが定期的に description を解釈：

```typescript
// AIへのプロンプト例
{
  objective: ['Flow の description から制御情報を抽出'],
  inputs: [
    `Description: ${flow.description}`,
    `現在時刻: ${new Date().toISOString()}`
  ],
  schema: {
    autoCompleteAt: 'string | null',
    carryOverRules: Array,
    triggers: Array
  }
}
```

## Flow のライフサイクル

### 1. 形成期
- Issue が集まり始める
- B-1 が観点を発見
- Flow 作成

### 2. 成長期
- Issue が活発に更新
- description に履歴が蓄積
- 観点が徐々に明確化

### 3. 成熟期
- Issue が順調に完了
- 学習内容を description に追加
- 次の Flow への知見提供

### 4. 分裂/統合期
- 大きすぎる Flow は分割提案
- 類似 Flow は統合提案
- description の観点記述を基に判断

### 5. 完了期
- 時限 Flow は自動完了
- 未完了 Issue は description のルールに従って処理
- 完了 Flow から Knowledge 抽出

## 観点の進化例

```typescript
// Week 1: 初期
{
  title: "調査タスク",
  description: "競合調査、技術調査、市場調査を進める。"
}

// Week 2: 成長
{
  title: "調査タスク",
  description: `
    競合調査、技術調査、市場調査を進める。

    【更新】技術選定とアーキテクチャ設計を追加
    【観点】情報収集から技術戦略策定へシフト
  `
}

// Week 3: 成熟
{
  title: "技術検証",
  description: `
    調査から実装フェーズへ移行。
    プロトタイプ開発と性能検証が中心。

    【学習】調査→戦略→実装のパターンが有効
  `
}
```

## Phase 4 での実装範囲

### 実装する機能
1. B-2 による description の動的更新
2. 日次 Flow の自動作成・完了
3. AI による description 解釈の基本実装

### 将来の拡張（Phase 5以降）
1. perspective フィールドの追加（構造化）
2. より複雑な制御構文のサポート
3. Flow 間の連携定義

## まとめ

Phase 4 の Flow 設計は：

1. **DB Schema はシンプルに保つ**（description 中心）
2. **自然言語で制御**（人間にも AI にも理解しやすい）
3. **Issue の自律性を尊重**（Flow は情報付加のみ）
4. **動的に進化**（description が成長する）

これにより、柔軟で拡張性の高いシステムを実現します。