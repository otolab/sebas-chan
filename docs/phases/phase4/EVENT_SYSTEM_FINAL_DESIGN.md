# Phase 4 イベントシステム最終設計

## 概要
Phase 4での実装経験とフィードバックを基に、イベント体系を整理・確定する。

## イベント命名変更

### 1. PATTERN_FOUND → RECURRING_PATTERN_DETECTED
- **理由**: 時間軸を持つ「繰り返し」パターンであることを明確化
- **用途**: Pondや過去データから発見される傾向・法則

### 2. FLOW_CREATION_SUGGESTED → ISSUES_CLUSTER_DETECTED
- **理由**: クラスター検出という事実を表現（提案ではなく検出）
- **用途**: 現在のIssue群の類似性検出、Flow作成のトリガー

## 最終イベント一覧

### 📥 外部イベント
| イベント名 | 説明 | 発火元 |
|-----------|------|---------|
| USER_REQUEST_RECEIVED | ユーザーリクエスト受信 | ユーザー入力 |
| DATA_ARRIVED | 外部データ到着 | Reporter、API |
| SCHEDULE_TRIGGERED | スケジュール実行 | スケジューラー |

### 📝 Issueイベント
| イベント名 | 説明 | 発火元 | 受信者 |
|-----------|------|---------|---------|
| ISSUE_CREATED | Issue作成 | A-1, A-2 | B-2 |
| ISSUE_UPDATED | Issue更新 | 各ワークフロー | B-2 |
| ISSUE_STATUS_CHANGED | ステータス変更 | 各ワークフロー | B-2 |
| ISSUE_STALLED | Issue停滞検出 | D-2 | C-2 |

### 🌊 Flowイベント
| イベント名 | 説明 | 発火元 | 受信者 |
|-----------|------|---------|---------|
| FLOW_CREATED | Flow作成完了 | Flow管理 | （将来拡張） |
| FLOW_UPDATED | Flow更新 | B-2等 | B-3 |
| FLOW_STATUS_CHANGED | Flowステータス変更 | 各ワークフロー | B-3 |
| FLOW_COMPLETED | Flow完了 | ユーザー/自動 | C-1 |

### 🔍 分析イベント
| イベント名 | 説明 | 発火元 | 受信者 |
|-----------|------|---------|---------|
| ISSUES_CLUSTER_DETECTED | Issueクラスター検出 | B-1 | Flow作成WF（新規） |
| RECURRING_PATTERN_DETECTED | 繰り返しパターン発見 | B-4, B-5 | A-3 |
| PERSPECTIVE_TRIGGERED | 重要な観点発見 | C-1, A-0 | Flow作成WF（新規） |
| KNOWLEDGE_EXTRACTABLE | 知識抽出可能 | A-2 | A-3 |

### 📊 Knowledge イベント
| イベント名 | 説明 | 発火元 | 受信者 |
|-----------|------|---------|---------|
| KNOWLEDGE_CREATED | Knowledge作成 | A-3, B-4 | （ログ記録） |

### ⚠️ 優先度イベント
| イベント名 | 説明 | 発火元 | 受信者 |
|-----------|------|---------|---------|
| HIGH_PRIORITY_ISSUE_DETECTED | 高優先度Issue検出 | A-2 | 通知システム |
| HIGH_PRIORITY_FLOW_DETECTED | 高優先度Flow検出 | B-3 | C-1 |

### 🔧 システムイベント
| イベント名 | 説明 | 発火元 | 受信者 |
|-----------|------|---------|---------|
| SYSTEM_MAINTENANCE_DUE | メンテナンス時期 | スケジューラー | D-1, D-2 |
| IDLE_TIME_DETECTED | アイドル時間検出 | システム監視 | D-2, B-4 |

## 削除されるイベント

以下のイベントは削除または統合：

1. **UNCLUSTERED_ISSUES_EXCEEDED** - 定義が不明確、ISSUE_STALLEDで十分
2. **POND_CAPACITY_WARNING** - Pondは全保持方針のため不要
3. **MAINTENANCE_REQUIRED** - SYSTEM_MAINTENANCE_DUEと重複
4. **FLOW_RELATIONS_CHANGED** - FLOW_UPDATEDに統合
5. **FLOW_ARCHIVED** - FLOW_STATUS_CHANGEDに統合
6. **ESCALATION_REQUIRED** - HIGH_PRIORITY_*_DETECTEDで代替
7. **KNOWLEDGE_APPLIED** - ログ記録で十分
8. **全SUGGESTED系イベント** - 問題の先送りを避ける

## 新規追加が必要なワークフロー

### Flow自動作成ワークフロー
```typescript
interface CreateFlowWorkflow {
  name: 'CreateFlow';
  triggers: [
    'ISSUES_CLUSTER_DETECTED',  // B-1からのクラスター
    'PERSPECTIVE_TRIGGERED'      // C-1/A-0からの観点
  ];
  actions: [
    '受信イベントに基づいてFlow作成',
    'FLOW_CREATEDイベント発火'
  ];
  priority: 30;  // 中優先度
}
```

## ワークフロー連携パターン

### 1. Issue → Cluster → Flow パターン
```
ISSUE_CREATED/UPDATED (複数)
    ↓
B-1 (ClusterIssues) [定期実行]
    ↓
ISSUES_CLUSTER_DETECTED
    ↓
CreateFlow (新規WF)
    ↓
FLOW_CREATED
```

### 2. パターン発見 → 知識化パターン
```
IDLE_TIME_DETECTED
    ↓
B-4 (SalvageFromPond)
    ↓
RECURRING_PATTERN_DETECTED
    ↓
A-3 (ExtractKnowledge)
    ↓
KNOWLEDGE_CREATED
```

### 3. 停滞検出 → アクション提案パターン
```
IDLE_TIME_DETECTED
    ↓
D-2 (CollectSystemStats)
    ↓
ISSUE_STALLED
    ↓
C-2 (SuggestNextAction)
    ↓
ISSUE_UPDATED (提案を含む)
```

### 4. 観点発見 → Flow作成パターン
```
USER_REQUEST_RECEIVED (観点を含む)
    ↓
A-0/A-1 (ProcessRequest)
    ↓
PERSPECTIVE_TRIGGERED
    ↓
CreateFlow (新規WF)
    ↓
FLOW_CREATED
```

## 実装優先度

### Phase 4.1（即座に実装）
1. イベント名の変更
   - PATTERN_FOUND → RECURRING_PATTERN_DETECTED
   - FLOW_CREATION_SUGGESTED → ISSUES_CLUSTER_DETECTED
2. FLOW_STATUS_CHANGEDの追加
3. Flow自動作成ワークフローの実装

### Phase 4.2（次フェーズ）
1. 不要イベントの削除
2. ワークフロー実装の修正
   - SUGGESTEDイベントを削除
   - 直接実行に変更

## 設計原則

1. **問題の先送りを避ける**
   - SUGGESTEDイベントは使わない
   - ワークフロー内で処理を完結

2. **明確な送受信関係**
   - すべてのイベントに明確な受信者
   - 受信者不在のイベントは作らない

3. **概念の明確な分離**
   - 時間軸：過去の傾向 vs 現在の状態
   - 抽象度：パターン vs 具体的なエンティティ
   - 目的：知識化 vs 作業管理

4. **Issueの正しい理解**
   - Issue = ユーザーが追跡したい事項
   - バグレポートではない

## まとめ

Phase 4のイベント体系整理により：
- イベント数を適切に削減（29個の提案から必要最小限へ）
- 名前の明確化（RECURRING_PATTERN_DETECTED、ISSUES_CLUSTER_DETECTED）
- 送受信関係の明確化（Flow作成ワークフローの追加）
- 設計原則の確立（問題の先送りを避ける）

これにより、シンプルで保守性の高いイベント駆動アーキテクチャが実現される。