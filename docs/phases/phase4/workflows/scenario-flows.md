# シナリオベースのイベントフロー

## 1. ユーザーリクエスト処理シナリオ

### 1.1 単純な質問への応答
```
ユーザー: 「今日の予定は？」
    ↓
USER_REQUEST_RECEIVED
    ↓
A-0 (ProcessUserRequest) [優先度: 60]
    ├─ リクエスト分類: question
    ├─ 既存データ検索
    └─ 応答生成・返信
```

### 1.2 新規タスクの登録
```
ユーザー: 「明日の会議の準備をリマインドして」
    ↓
USER_REQUEST_RECEIVED
    ↓
A-0 (ProcessUserRequest) [優先度: 60]
    ├─ リクエスト分類: action
    ├─ Issue作成判定: true
    ↓
ISSUE_CREATED
    ↓
A-2 (AnalyzeIssueImpact) [優先度: 30]
    ├─ 影響度分析
    ├─ 関連Issue検索
    └─ 優先度設定
```

## 2. 外部データ取り込みシナリオ

### 2.1 メールからのIssue作成
```
メール受信: 「プロジェクトXの要件について...」
    ↓
DATA_ARRIVED (source: email)
    ↓
A-1 (IngestInput) [優先度: 40]
    ├─ 内容解析
    ├─ 重要度判定: high
    ↓
ISSUE_CREATED
    ↓
A-2 (AnalyzeIssueImpact) [優先度: 30]
    ├─ 既存プロジェクトとの関連付け
    ├─ 影響分析
    ↓
(Issue数が5件以上の場合)
UNCLUSTERED_ISSUES_EXCEEDED
    ↓
B-1 (ClusterIssues) [優先度: 10]
    ├─ 関連Issue群の発見
    ├─ 観点の抽出: "プロジェクトX"
    ↓
FLOW_CREATION_SUGGESTED
    ↓
(ユーザー承認後) Flow作成
```

### 2.2 Slackからの緊急対応
```
Slack通知: 「@sebas 緊急: サーバーダウン」
    ↓
DATA_ARRIVED (source: slack, priority: critical)
    ↓
A-1 (IngestInput) [優先度: 40]
    ├─ 緊急度判定: critical
    ↓
ISSUE_CREATED (priority: 90)
    ↓
A-2 (AnalyzeIssueImpact) [優先度: 30]
    ├─ 影響範囲: システム全体
    ├─ 関連Issue検索
    ↓
HIGH_PRIORITY_FLOW_DETECTED
    ↓
C-1 (SuggestNextFlow) [優先度: 25]
    └─ 緊急対応Flow提案
```

## 3. 朝のルーチンシナリオ

```
時刻: 9:00 AM
    ↓
SCHEDULED_TIME_REACHED (type: morning_routine)
    ↓
並列実行:
├─ B-3 (UpdateFlowPriorities) [優先度: 15]
│   ├─ 今日の締切確認
│   ├─ 優先度再計算
│   ↓
│   HIGH_PRIORITY_FLOW_DETECTED
│
└─ C-1 (SuggestNextFlow) [優先度: 25]
    ├─ ユーザーパターン分析
    ├─ エネルギーレベル: high
    ├─ 利用可能時間: 480分
    ↓
    Flow提案生成:
    1. 高優先度の創造的タスク
    2. 締切の近いタスク
    3. 継続中のプロジェクト
```

## 4. Issue停滞検出と対応シナリオ

```
バックグラウンド処理（アイドル時）
    ↓
IDLE_TIME_DETECTED
    ↓
D-2 (CollectSystemStats) [優先度: 5]
    ├─ Issue統計収集
    ├─ 停滞期間計算
    ├─ 3日以上更新なしIssue発見
    ↓
ISSUE_STALLED (issueId: "ISS-123", stalledDays: 3)
    ↓
C-2 (SuggestNextActionForIssue) [優先度: 25]
    ├─ 停滞原因分析
    ├─ 類似解決済みIssue検索
    ├─ Knowledge検索
    ↓
    アクション提案:
    ├─ Option 1: ブロッカー解消手順
    ├─ Option 2: Issue分割提案
    │   ↓
    │   ISSUE_SPLIT_SUGGESTED
    └─ Option 3: 代替アプローチ
```

## 5. Flow完了と次のFlow提案シナリオ

```
ユーザー: Flow「プロジェクトX仕様書作成」完了
    ↓
FLOW_COMPLETED
    ↓
並列実行:
├─ A-3 (ExtractKnowledge) [優先度: 20]
│   ├─ 完了Flowから学習
│   ├─ パターン抽出
│   ↓
│   KNOWLEDGE_CREATED (type: best_practice)
│
├─ B-2 (UpdateFlowRelations) [優先度: 15]
│   ├─ 関連Flow更新
│   ├─ 依存関係解消
│   ↓
│   FLOW_RELATIONS_CHANGED
│
└─ C-1 (SuggestNextFlow) [優先度: 25]
    ├─ コンテキスト継続性評価
    ├─ 関連Flow検索
    ↓
    次のFlow提案:
    1. 「プロジェクトX実装」（継続性: high）
    2. 「レビュー依頼作成」（依存関係）
```

## 6. Pond容量管理シナリオ

```
システム監視（定期実行）
    ↓
SYSTEM_MAINTENANCE_DUE
    ↓
D-2 (CollectSystemStats) [優先度: 5]
    ├─ Pond使用率チェック: 85%
    ↓
POND_CAPACITY_WARNING
    ↓
B-4 (SalvageFromPond) [優先度: 5]
    ├─ 古いエントリー分析
    ├─ パターン検出
    ├─ 価値評価
    ↓
    並列処理:
    ├─ PATTERN_FOUND
    │   ↓
    │   B-5 (InferBehaviorPatterns) [優先度: 10]
    │   └─ ユーザー行動パターン分析
    │
    └─ KNOWLEDGE_EXTRACTABLE
        ↓
        A-3 (ExtractKnowledge) [優先度: 20]
        └─ 知識の一般化・保存
```

## 7. 大量Issue自動整理シナリオ

```
バックグラウンド監視
    ↓
D-2 (CollectSystemStats) [優先度: 5]
    ├─ 未整理Issue数カウント: 23件
    ↓
UNCLUSTERED_ISSUES_EXCEEDED (count: 23, threshold: 20)
    ↓
B-1 (ClusterIssues) [優先度: 10]
    ├─ ベクトル類似度計算
    ├─ クラスタリング実行
    ├─ 観点抽出
    │
    ├─ Cluster 1: "バグ修正" (8 issues)
    │   ├─ 共通パターン: エラーハンドリング
    │   ↓
    │   FLOW_CREATION_SUGGESTED
    │
    ├─ Cluster 2: "ドキュメント更新" (6 issues)
    │   ├─ 共通パターン: README関連
    │   ↓
    │   FLOW_CREATION_SUGGESTED
    │
    └─ Cluster 3: "パフォーマンス改善" (5 issues)
        ├─ 共通パターン: 最適化要求
        ↓
        FLOW_CREATION_SUGGESTED
            ↓
        (自動作成条件満たす)
        FLOW_CREATED
            ↓
        B-2 (UpdateFlowRelations) [優先度: 15]
        └─ Issue関連付け更新
```

## 8. パフォーマンス低下対応シナリオ

```
システム監視
    ↓
D-2 (CollectSystemStats) [優先度: 5]
    ├─ レスポンスタイム測定
    ├─ 前回比150%増を検出
    ↓
PERFORMANCE_DEGRADED (metric: response_time, degradation: 50%)
    ↓
D-1 (TuneSystemParameters) [優先度: 10]
    ├─ ボトルネック分析
    ├─ パラメータ調整案生成
    ├─ 自動調整実行
    │   ├─ キャッシュサイズ増加
    │   ├─ 並列度調整
    │   └─ タイムアウト値最適化
    ↓
    (改善確認後)
    システムパフォーマンス正常化
```

## 9. ユーザーフィードバックからの学習シナリオ

```
ユーザー: 「この提案は役に立った」
    ↓
USER_RESPONSE_RECEIVED (type: feedback, helpful: true)
    ↓
A-0 (ProcessUserRequest) [優先度: 60]
    ├─ フィードバック分類
    ↓
KNOWLEDGE_EXTRACTABLE
    ↓
A-3 (ExtractKnowledge) [優先度: 20]
    ├─ 成功パターン抽出
    ├─ ユーザー選好学習
    ↓
KNOWLEDGE_CREATED (type: user_preference)
    ↓
(次回の提案時に活用)
```

## 10. 複合的な午後のワークフローシナリオ

```
時刻: 14:00 (午後のエネルギー低下時間)
    ↓
複数のトリガー:
├─ ユーザー: 「次何をすればいい？」
│   ↓
│   USER_REQUEST_RECEIVED
│
├─ 前のFlowが完了
│   ↓
│   FLOW_COMPLETED
│
└─ 定期実行
    ↓
    SCHEDULED_TIME_REACHED

    ↓ (統合処理)

C-1 (SuggestNextFlow) [優先度: 25]
    ├─ コンテキスト分析
    │   ├─ 時間帯: afternoon
    │   ├─ エネルギー: medium→low
    │   ├─ 完了したFlow: 創造的タスク
    │   └─ 残り時間: 240分
    │
    ├─ 提案生成
    │   ├─ ルーティンタスクを優先
    │   ├─ 短時間で完了可能
    │   └─ 低認知負荷
    │
    └─ 最終提案:
        1. メール返信 (30分, energy: low)
        2. ドキュメント整理 (45分, energy: low)
        3. 明日の準備 (15分, energy: low)

        フォールバック提案:
        └─ 15分の休憩を推奨
```

## まとめ

これらのシナリオから見える重要なパターン：

1. **優先度による自然な実行順序**
   - 緊急度の高いものから順に処理
   - バックグラウンド処理は低優先度で実行

2. **イベントの連鎖反応**
   - 1つのイベントが複数のワークフローをトリガー
   - ワークフローが新たなイベントを生成

3. **並列処理の活用**
   - 独立したワークフローは並列実行
   - 効率的なリソース利用

4. **コンテキストの継続性**
   - Flow完了後の関連タスク提案
   - ユーザーパターンの学習と適用

5. **自己最適化**
   - アイドル時のバックグラウンド処理
   - 統計収集と閾値検出の自動化