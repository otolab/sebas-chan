# イベント・ワークフローカタログ

## イベント一覧

### 外部イベント（ユーザー・システム起因）
| イベント名 | 説明 | 主な発生源 | ペイロード例 |
|------------|------|------------|--------------|
| USER_REQUEST_RECEIVED | ユーザーからのリクエスト受信 | ユーザー入力 | リクエスト内容、セッションID |
| DATA_ARRIVED | 外部データ到着（メール、Slack等） | Reporter、API | データ内容、ソース、タイムスタンプ |
| SCHEDULED_TIME_REACHED | ユーザースケジュール到達 | スケジューラー | スケジュールタイプ（朝のルーチン、日次レビュー等） |
| USER_RESPONSE_RECEIVED | ユーザー応答受信 | ユーザー入力 | 応答内容、関連IssueID |

### Issueイベント
| イベント名 | 説明 | 主な発生源 | ペイロード例 |
|------------|------|------------|--------------|
| ISSUE_CREATED | 新規Issue作成 | A-1, A-2 | Issue詳細、優先度 |
| ISSUE_UPDATED | Issue更新 | A-2, ユーザー操作 | 変更内容、IssueID |
| ISSUE_STATUS_CHANGED | Issueステータス変更 | ワークフロー処理 | 新旧ステータス、IssueID |
| ISSUE_STALLED | Issue停滞検出 | D-2 | 停滞期間、IssueID、最終更新日 |
| ISSUE_CLOSED | Issue完了 | ユーザー操作、自動解決 | 解決内容、IssueID |
| ISSUE_SPLIT_SUGGESTED | Issue分割提案 | C-2 | 分割案、元IssueID |
| UNCLUSTERED_ISSUES_EXCEEDED | 未整理Issue数超過 | D-2 | Issue数、閾値 |

### Flowイベント
| イベント名 | 説明 | 主な発生源 | ペイロード例 |
|------------|------|------------|--------------|
| FLOW_CREATION_SUGGESTED | Flow作成提案 | B-1 | 観点、Issue群、優先度 |
| FLOW_CREATED | Flow作成完了 | Flow管理システム | Flow詳細、観点情報 |
| FLOW_UPDATED | Flow更新 | B-2 | 変更内容、FlowID |
| FLOW_RELATIONS_CHANGED | Flow関係性変更 | B-2 | 新旧関係性、影響Flow |
| FLOW_PRIORITY_CHANGED | Flow優先度変更 | B-3 | 新旧優先度、要因 |
| FLOW_COMPLETED | Flow完了 | ユーザー操作 | 完了時情報、FlowID |
| HIGH_PRIORITY_FLOW_DETECTED | 高優先度Flow検出 | B-3 | FlowID、緊急度 |
| PERSPECTIVE_TRIGGERED | Flow観点発動 | C-1 | 観点詳細、FlowID |

### Knowledgeイベント
| イベント名 | 説明 | 主な発生源 | ペイロード例 |
|------------|------|------------|--------------|
| KNOWLEDGE_EXTRACTABLE | 知識抽出可能 | A-2分析 | 抽出候補、信頼度 |
| KNOWLEDGE_CREATED | Knowledge作成 | A-3, B-4, B-5 | Knowledge内容、タイプ |
| KNOWLEDGE_UPDATED | Knowledge更新 | ユーザー編集 | 更新内容、KnowledgeID |
| PATTERN_FOUND | パターン発見 | B-4, B-5 | パターン詳細、頻度 |

### システムイベント
| イベント名 | 説明 | 主な発生源 | ペイロード例 |
|------------|------|------------|--------------|
| CONTRADICTION_DETECTED | 矛盾検出 | A-1, A-2 | 矛盾項目、信頼度 |
| SYSTEM_MAINTENANCE_DUE | システムメンテナンス時期 | 内部タイマー | メンテナンスタイプ、最終実行時刻 |
| POND_CAPACITY_WARNING | Pond容量警告 | D-2 | 使用率、エントリ数 |
| IDLE_TIME_DETECTED | アイドル時間検出 | アクティビティ監視 | アイドル期間、最終活動 |
| PERFORMANCE_DEGRADED | パフォーマンス低下検出 | D-2 | 指標名、低下率 |

## ワークフロー一覧

### A系：基本ワークフロー（個別処理）
| ID | 名前 | 目的 | トリガーイベント | 優先度 |
|----|------|------|------------------|---------|
| A-0 | ProcessUserRequest | ユーザーリクエスト処理 | USER_REQUEST_RECEIVED | 60 |
| A-1 | IngestInput | 外部データ取り込み | DATA_ARRIVED | 40 |
| A-2 | AnalyzeIssueImpact | Issue影響分析 | ISSUE_CREATED/UPDATED | 30 |
| A-3 | ExtractKnowledge | 知識抽出・一般化 | ISSUE_CLOSED, KNOWLEDGE_EXTRACTABLE | 20 |

### B系：横断的ワークフロー（俯瞰的分析）
| ID | 名前 | 目的 | トリガーイベント | 優先度 |
|----|------|------|------------------|---------|
| B-1 | ClusterIssues | Issue群のグルーピング | UNCLUSTERED_ISSUES_EXCEEDED, USER_REQUEST_RECEIVED | 10 |
| B-2 | UpdateFlowRelations | Flow関係性の更新 | ISSUE_CREATED, ISSUE_UPDATED, ISSUE_STATUS_CHANGED, ISSUE_CLOSED | 15-40 |
| B-3 | UpdateFlowPriorities | 優先度の動的調整 | SCHEDULED_TIME_REACHED, DEADLINE_APPROACHING | 15 |
| B-4 | SalvageFromPond | Pondからの価値抽出 | POND_CAPACITY_WARNING, IDLE_TIME_DETECTED | 5 |
| B-5 | InferBehaviorPatterns | 行動パターン推論 | PATTERN_FOUND, USER_REQUEST_RECEIVED | 10 |

### C系：提案ワークフロー（次のアクション支援）
| ID | 名前 | 目的 | トリガーイベント | 優先度 |
|----|------|------|------------------|---------|
| C-1 | SuggestNextFlow | 次のFlow提案 | FLOW_COMPLETED, SCHEDULED_TIME_REACHED | 25 |
| C-2 | SuggestNextActionForIssue | Issue対応アクション提案 | ISSUE_STALLED, ACTION_REQUESTED | 25 |

### D系：自己調整ワークフロー（システム最適化）
| ID | 名前 | 目的 | トリガーイベント | 優先度 |
|----|------|------|------------------|---------|
| D-1 | TuneSystemParameters | パラメータ自律調整 | PERFORMANCE_DEGRADED | 10 |
| D-2 | CollectSystemStats | 統計情報収集・監視 | SYSTEM_MAINTENANCE_DUE, IDLE_TIME_DETECTED | 5 |

## ワークフロー連携マップ

### 主要な連携パターン

#### データ駆動パターン
```
[外部入力] → A-1(IngestInput) → A-2(AnalyzeIssueImpact) → B-1(ClusterIssues)
                                        ↓                          ↓
                                   ISSUE_CREATED          FLOW_CREATION_SUGGESTED
                                        ↓                          ↓
                                    B-2(UpdateFlowRelations) ← [Flow作成]
                                        ↓
                                 FLOW_RELATIONS_CHANGED
                                        ↓
                                    B-3(UpdateFlowPriorities)
                                        ↓
                                 HIGH_PRIORITY_FLOW_DETECTED
                                        ↓
                                    C-1(SuggestNextFlow)
```

#### ユーザースケジュール駆動パターン

**朝の優先度調整**
```
[毎朝 9:00] → SCHEDULED_TIME_REACHED → B-3(UpdateFlowPriorities)
                                           ↓
                                    今日の締切・スケジュールを考慮
                                           ↓
                                    HIGH_PRIORITY_FLOW_DETECTED
                                           ↓
                                    C-1(SuggestNextFlow) → 今日の作業提案
```

#### システム内部駆動パターン

**Pond容量管理**
```
[Pond使用率80%超] → POND_CAPACITY_WARNING → B-4(SalvageFromPond)
                                                  ↓
                                           価値ある情報を抽出
                                                  ↓
                                           PATTERN_FOUND
                                                  ↓
                                           B-5(InferBehaviorPatterns)
                                                  ↓
                                           KNOWLEDGE_CREATED
```

**アイドル時の最適化**
```
[2時間非アクティブ] → IDLE_TIME_DETECTED → B-4(SalvageFromPond)
                                                  ↓
                                           バックグラウンド処理実行

[システム負荷低下] → IDLE_TIME_DETECTED → D-2(CollectSystemStats)
                                                ↓
                                         SYSTEM_MAINTENANCE_DUE
                                                ↓
                                         D-1(TuneSystemParameters)
```

**統計監視による閾値検出**
```
[アイドル時] → IDLE_TIME_DETECTED → D-2(CollectSystemStats)
                                          ↓
                                    統計情報収集・分析
                                          ↓
                                    未整理Issue 20件超を検出
                                          ↓
                                    UNCLUSTERED_ISSUES_EXCEEDED
                                          ↓
                                    B-1(ClusterIssues)
                                          ↓
                                    自動グルーピング実行
                                          ↓
                                    FLOW_CREATION_SUGGESTED
                                          ↓
                                    [Flow候補の提示]
```

#### 朝のルーチンパターン
```
[朝 9:00] → SCHEDULED_TIME_REACHED → C-1(SuggestNextFlow)
              (type: "morning_routine")      ↓
                                      今日の最初のFlow提案
                                            ↓
                                      [ユーザー選択]
                                            ↓
                                      作業開始
```

#### Issue停滞検出パターン
```
[3日経過] → ISSUE_STALLED → C-2(SuggestNextActionForIssue)
                                    ↓
                              アクション提案生成
                                    ↓
                              ISSUE_SPLIT_SUGGESTED（必要時）
                                    ↓
                              A-2(AnalyzeIssueImpact) → 分割Issue処理
```

### 優先度による実行順序

1. **Critical (80-100)**: 緊急対応
   - ユーザー問い合わせ
   - システムエラー対応

2. **High (60-79)**: 即時処理
   - A-0: ユーザーリクエスト処理

3. **Medium (40-59)**: 通常処理
   - A-1: データ取り込み

4. **Normal (20-39)**: 定常処理
   - A-2: 影響分析
   - C系: 提案生成

5. **Low (0-19)**: バックグラウンド処理
   - B系: 横断的分析
   - A-3: 知識抽出
   - D系: システム最適化

## クイックリファレンス

### 「このイベントを受信するワークフローは？」

| イベント | 受信ワークフロー |
|----------|------------------|
| DATA_ARRIVED | A-1 → A-2 |
| ISSUE_CREATED | B-1, B-2 |
| ISSUE_STALLED | C-2 |
| FLOW_COMPLETED | C-1 |
| PATTERN_FOUND | B-5, A-3 |
| HIGH_PRIORITY_FLOW_DETECTED | C-1 |

### 「このワークフローが発行するイベントは？」

| ワークフロー | 発行イベント |
|--------------|--------------|
| A-1 | DATA_ARRIVED, CONTRADICTION_DETECTED |
| A-2 | ISSUE_CREATED/UPDATED, KNOWLEDGE_EXTRACTABLE |
| B-1 | FLOW_CREATION_SUGGESTED, ISSUES_CLUSTER_DETECTED |
| B-2 | FLOW_RELATIONS_CHANGED, PERSPECTIVE_UPDATE_REQUIRED |
| B-3 | HIGH_PRIORITY_FLOW_DETECTED, FLOW_PRIORITY_CHANGED |
| B-4 | PATTERN_FOUND, KNOWLEDGE_CREATED |
| C-1 | PERSPECTIVE_TRIGGERED |
| C-2 | ISSUE_SPLIT_SUGGESTED |
| D-2 | UNCLUSTERED_ISSUES_EXCEEDED, POND_CAPACITY_WARNING, ISSUE_STALLED |