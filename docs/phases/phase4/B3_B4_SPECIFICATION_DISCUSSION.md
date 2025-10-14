# B-3, B-4 ワークフロー仕様検討書

## 概要

Issue #44のB-3（UPDATE_FLOW_PRIORITIES）とB-4（SALVAGE_FROM_POND）の実装にあたり、既存の設計資料とコードベースを分析した結果をまとめます。「作りながら考える」原則に基づき、実装可能な部分と議論が必要な部分を明確に分離しました。

## B-3: UPDATE_FLOW_PRIORITIES - Flow優先度の動的調整

### 1. 明確に実装可能な部分

#### 1.1 基本構造
- **ワークフロー定義**: 既存のB-1, B-2と同様の構造で実装
- **優先度フィールド**: `Flow.priorityScore` (0.0〜1.0) は既に型定義済み
- **トリガーイベント**:
  - `SCHEDULE_TRIGGERED`: 定期実行（日次）
  - `FLOW_STATUS_CHANGED`: Flow状態変更時
  - `ISSUE_STATUS_CHANGED`: 含まれるIssueの状態変更時

#### 1.2 基本的な優先度要因
```typescript
interface BasicPriorityFactors {
  // 既存データから計算可能
  issueCount: number;           // 含まれるIssue数
  openIssueRatio: number;        // オープンなIssueの割合
  highPriorityIssueCount: number; // 高優先度Issueの数
  lastUpdated: Date;             // 最終更新日時
  createdAt: Date;              // 作成日時
}
```

### 2. 議論が必要な仕様

#### 2.1 優先度計算アルゴリズム

**質問**: 以下の要因をどのような重みで評価すべきでしょうか？

```typescript
// 提案する優先度計算の要因と重み
interface PriorityCalculation {
  factors: {
    urgency: number;      // 緊急度（0-1）- 重み: ?
    importance: number;   // 重要度（0-1）- 重み: ?
    staleness: number;    // 停滞度（0-1）- 重み: ?
    momentum: number;     // 勢い（0-1）  - 重み: ?
  };
  // 最終スコア = Σ(factor * weight) / Σ(weights)
}
```

**現時点の実装案**:
```typescript
// シンプルな加重平均
const calculatePriority = (factors: PriorityFactors): number => {
  const weights = {
    urgency: 0.4,     // 緊急度を最重視
    importance: 0.3,  // 重要度も考慮
    staleness: 0.2,   // 停滞防止
    momentum: 0.1     // 最近の活動も少し考慮
  };

  return Object.entries(factors).reduce((score, [key, value]) =>
    score + value * weights[key], 0
  );
};
```

#### 2.2 停滞度（Staleness）の定義

**質問**: 「停滞」をどのように定義すべきでしょうか？

**提案**:
```typescript
interface StalenessMetrics {
  daysSinceLastUpdate: number;     // 最終更新からの日数
  daysSinceCreation: number;       // 作成からの日数
  updateFrequency: number;         // 更新頻度（回/日）

  // 停滞判定の閾値（Flowの寿命: 1日〜数ヶ月を考慮）
  thresholds: {
    checkIn: 1,     // 1日経過 = 生存確認
    warning: 3,     // 3日更新なし = 警告
    stale: 7,       // 7日更新なし = 停滞
    abandoned: 14   // 14日更新なし = 放置の可能性
  };
}
```

#### 2.3 ユーザー活動パターン（将来実装）

**質問**: ユーザーの活動パターンを考慮すべきでしょうか？

現在のシステムには以下の情報がありません：
- ユーザーの作業時間帯
- タイムゾーン設定
- 作業履歴の記録

**提案**: Phase 5以降の拡張として、以下を検討
```typescript
// 将来的な拡張案
interface UserActivityPattern {
  workingHours?: { start: string; end: string };
  timezone?: string;
  preferredWorkDays?: string[];
  focusHistory?: Array<{
    flowId: string;
    timestamp: Date;
    duration: number;
  }>;
}
```

## B-4: SALVAGE_FROM_POND - Pondからの価値抽出

### 1. 明確に実装可能な部分

#### 1.1 基本構造
- **PondEntry検索**: `storage.searchPond()` で実装済み
- **ベクトル検索**: LanceDBによる類似検索が利用可能
- **Knowledge/Issue作成**: 既存のAPIで対応可能

#### 1.2 基本的なサルベージ処理
```typescript
interface BasicSalvageProcess {
  // 1. 古いPondEntryを検索
  searchOldEntries(daysOld: number): Promise<PondEntry[]>;

  // 2. ベクトル検索でクラスタリング
  clusterBySemantics(entries: PondEntry[]): Promise<Cluster[]>;

  // 3. AIで価値判定
  evaluateValue(cluster: Cluster): Promise<ValueEvaluation>;

  // 4. Knowledge/Issue作成
  createArtifact(evaluation: ValueEvaluation): Promise<Knowledge | Issue>;
}
```

### 2. 議論が必要な仕様

#### 2.1 「価値ある情報」の判断基準

**質問**: どのような情報を「価値がある」と判断すべきでしょうか？

**提案する判断基準**:
```typescript
enum ValueType {
  RECURRING_PATTERN = 'recurring',   // 繰り返し現れるパターン
  FORGOTTEN_TASK = 'forgotten',      // 忘れられたタスク
  LEARNING = 'learning',             // 学習可能な知見
  ANOMALY = 'anomaly',               // 異常・例外
  TREND = 'trend'                    // トレンド・傾向
}

interface ValueCriteria {
  minOccurrences: number;    // 最小出現回数（パターン検出用）
  minAge: number;            // 最小経過日数
  minSimilarity: number;     // 最小類似度（クラスタリング用）
  confidenceThreshold: number; // AI判定の信頼度閾値
}
```

**デフォルト値の提案**:
```typescript
const DEFAULT_CRITERIA: ValueCriteria = {
  minOccurrences: 3,        // 3回以上出現
  minAge: 1,                // 1日以上経過（直近の情報も価値あり）
  minSimilarity: 0.7,       // 70%以上の類似度
  confidenceThreshold: 0.6  // 60%以上の確信度
};
```

#### 2.2 セレンディピティを重視した探査的処理

**基本方針**: 処理済みマークではなく、時間経過ベースの反復的な探査

**理由**:
- 昨日決まったことが今日も明日も別の観点で重要である可能性が高い
- セレンディピティ（偶然の発見）をもたらすことが目的
- 非効率で探査的であることが求められる

**実装方針**:
```typescript
interface ExploratoryProcessing {
  // 処理済みマークは使わない
  // 代わりに時間窓と観点を変えながら繰り返し処理

  timeWindows: Array<{
    name: string;
    ageRange: { min: number; max: number }; // 日数
    priority: number;  // 処理優先度
  }>;

  perspectives: Array<{
    name: string;
    query: string;    // 検索クエリやフィルタ
    frequency: number; // 処理頻度（日）
  }>;
}

// 例: 同じPondEntryを異なる時間窓・観点で繰り返し処理
const EXPLORATORY_CONFIG: ExploratoryProcessing = {
  timeWindows: [
    { name: '直近', ageRange: { min: 0, max: 3 }, priority: 0.8 },
    { name: '最近', ageRange: { min: 3, max: 14 }, priority: 0.5 },
    { name: '過去', ageRange: { min: 14, max: 60 }, priority: 0.2 },
  ],
  perspectives: [
    { name: '類似パターン', query: 'semantic', frequency: 1 },
    { name: '時系列', query: 'temporal', frequency: 3 },
    { name: 'ソース別', query: 'by_source', frequency: 7 },
  ]
};
```

**処理履歴の記録**（効率化のヒントとして使用、制約ではない）:
```typescript
interface ProcessingHistory {
  pondEntryId: string;
  processedAt: Date;
  perspective: string;
  foundValue: boolean;
  confidence: number;
  // 履歴は参考情報であり、再処理を妨げない
}
```

#### 2.3 サルベージレシピ

**質問**: 定期的なサルベージの「レシピ」をどう管理すべきでしょうか？

**提案**:
```typescript
interface SalvageRecipe {
  id: string;
  name: string;              // "週次振り返り"
  schedule: 'daily' | 'weekly' | 'monthly';

  // 検索条件
  query: {
    ageRange: { min: number; max: number };  // 日数
    sources?: string[];      // 特定のソースのみ
    contextPattern?: string; // コンテキストのパターン
  };

  // 処理方法
  processing: {
    clusteringMethod: 'semantic' | 'temporal' | 'source';
    outputType: 'knowledge' | 'issue' | 'summary';
    autoCreate: boolean;     // 自動作成するか確認を求めるか
  };
}
```

**初期レシピ案**:
```typescript
const DEFAULT_RECIPES: SalvageRecipe[] = [
  {
    id: 'weekly-patterns',
    name: '週次パターン検出',
    schedule: 'weekly',
    query: {
      ageRange: { min: 7, max: 30 },
    },
    processing: {
      clusteringMethod: 'semantic',
      outputType: 'knowledge',
      autoCreate: true
    }
  },
  {
    id: 'monthly-cleanup',
    name: '月次クリーンアップ',
    schedule: 'monthly',
    query: {
      ageRange: { min: 30, max: 90 },
    },
    processing: {
      clusteringMethod: 'temporal',
      outputType: 'summary',
      autoCreate: false  // 確認を求める
    }
  }
];
```

#### 2.4 実行トリガーと閾値

**質問**: どのような条件でサルベージを実行すべきでしょうか？

**提案**:
```typescript
interface SalvageTriggers {
  scheduled: {
    enabled: boolean;
    interval: 'daily' | 'weekly' | 'monthly';
    time?: string; // "02:00" など
  };

  threshold: {
    enabled: boolean;
    maxEntries: number;      // Pondエントリ数の上限
    maxAge: number;          // 最古エントリの日数
    maxSize?: number;        // DBサイズ（MB）
  };

  manual: boolean;           // 手動実行を許可
}

const DEFAULT_TRIGGERS: SalvageTriggers = {
  scheduled: {
    enabled: true,
    interval: 'weekly',
    time: '02:00'  // 深夜2時
  },
  threshold: {
    enabled: true,
    maxEntries: 10000,      // 1万件超えたら
    maxAge: 90,              // 90日以上前のデータがあったら
  },
  manual: true
};
```

## 実装の優先順位と段階的アプローチ

### Phase 1: 最小限の実装（MVP）

**B-3: 基本的な優先度調整**
- シンプルな優先度計算（Issue数とstatusベース）
- 日次実行で生存確認（1日、3日、7日の閾値）
- 固定の重み付け（urgency: 0.4, importance: 0.3, staleness: 0.2, momentum: 0.1）

**B-4: 基本的なサルベージ**
- 直近（0-3日）と最近（3-14日）のPondEntryを中心に探査
- セマンティッククラスタリングで偶然の発見を促進
- Knowledge作成のみ（Issue作成は後回し）
- 処理済みマークなし（繰り返し探査を前提）

### Phase 2: 機能拡張

**B-3: 高度な優先度調整**
- 停滞度の考慮
- 動的な重み調整
- 優先度変更の通知

**B-4: レシピベースのサルベージ**
- 複数のサルベージレシピ
- Issue作成機能
- パターン検出の強化

### Phase 3: 最適化と学習（将来）

**B-3: ユーザー適応**
- ユーザー活動パターンの学習
- 時間帯別の優先度調整
- 個人化された重み付け

**B-4: 高度な価値判定**
- 機械学習による価値予測
- 自動レシピ生成
- フィードバックループ

## 議論ポイントまとめ

### 今すぐ決定が必要な事項

1. **B-3の優先度計算の重み**
   - 提案した重み（urgency: 0.4, importance: 0.3, staleness: 0.2, momentum: 0.1）で良いか？
   - 停滞度の閾値（1日/3日/7日/14日）で良いか？
   - 他に考慮すべき要因はあるか？

2. **B-4の価値判定基準**
   - 最小出現回数: 3回で良いか？
   - 時間窓（直近0-3日、最近3-14日、過去14-60日）で良いか？
   - 類似度閾値: 0.7で良いか？
   - セレンディピティ重視の探査的処理方針で良いか？

### 後で決定できる事項

1. ユーザー活動パターンの実装（Phase 5以降）
2. サルベージレシピの詳細設計
3. 機械学習による最適化

## 次のステップ

1. 上記の議論ポイントについてユーザーと合意形成
2. 合意した仕様に基づいてB-3から実装開始
3. B-3の実装完了後、B-4の実装に着手
4. 各ステップでテストを作成し、品質を確保

---

**作成日**: 2025-10-13
**Issue**: #44