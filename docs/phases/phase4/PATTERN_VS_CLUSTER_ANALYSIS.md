# PATTERN_FOUND vs ISSUES_CLUSTER_DETECTED 分析

## 現在の定義

### PATTERN_FOUND
**定義場所**: docs/workflows/EVENT_CATALOG.md
```typescript
{
  type: 'PATTERN_FOUND';
  payload: {
    pattern: string;      // 発見されたパターン
    frequency: number;    // 出現頻度
    entities: string[];   // 関連エンティティ
  };
}
```

**説明**: Issue群から共通パターンが発見された
**発火元（想定）**:
- B-4 (SalvageFromPond) - Pondから価値あるパターンを抽出
- B-5 (InferBehaviorPatterns) - 行動パターンを推論

**受信者（想定）**:
- A-3 (ExtractKnowledge) - パターンを知識化
- B-1 (ClusterIssues) - パターンに基づいてクラスタリング？

### ISSUES_CLUSTER_DETECTED（提案中）
**定義場所**: B-1実装内（FLOW_CREATION_SUGGESTEDから変更提案）
```typescript
{
  type: 'ISSUES_CLUSTER_DETECTED';
  payload: {
    clusterId: string;
    issueIds: string[];
    similarity: number;
    suggestedPerspective?: string;
  };
}
```

**説明**: 類似するIssue群のクラスターを検出
**発火元**: B-1 (ClusterIssues)
**受信者**: Flow作成ワークフロー（新規必要）

## 概念の違い

### 1. 抽象度の違い

#### PATTERN_FOUND（より抽象的）
- **何を表すか**: 繰り返し現れる「パターン」や「傾向」
- **例**:
  - 「毎週月曜日にサーバーエラーが増える」
  - 「特定の機能に関する問い合わせが多い」
  - 「午後3時頃に処理が遅くなる」
- **知識化の対象**: 一般化可能な法則や傾向

#### ISSUES_CLUSTER_DETECTED（より具体的）
- **何を表すか**: 現在存在する具体的なIssue群のグループ
- **例**:
  - 「認証系のバグ報告3件」
  - 「新機能Xに関する要望5件」
  - 「今週のインフラ関連タスク4件」
- **Flow化の対象**: 今すぐ対処すべき具体的なIssue群

### 2. 時間軸の違い

#### PATTERN_FOUND
- **時間軸**: 過去から現在にかけての傾向
- **用途**: 将来の予測、予防措置
- **例**: 「過去3ヶ月のデータから月末に負荷が高まるパターンを発見」

#### ISSUES_CLUSTER_DETECTED
- **時間軸**: 現在のスナップショット
- **用途**: 即座の整理、現在の作業管理
- **例**: 「現在未対応のIssue20件を5つのクラスターに分類」

### 3. 処理の目的

#### PATTERN_FOUND
- **目的**: 知識の抽出と学習
- **アクション**:
  - Knowledgeとして記録
  - 将来の予測に活用
  - システムの自動調整

#### ISSUES_CLUSTER_DETECTED
- **目的**: 作業の整理と管理
- **アクション**:
  - Flowの作成
  - 優先度の設定
  - 作業の割り当て

## 使い分けの指針

### PATTERN_FOUNDを使うべき場合
1. **時系列分析の結果**
   - 定期的に発生する事象の発見
   - トレンドの検出

2. **行動パターンの発見**
   - ユーザーの利用パターン
   - システムの挙動パターン

3. **知識化すべき洞察**
   - 一般化可能な法則
   - 予測に使える傾向

### ISSUES_CLUSTER_DETECTEDを使うべき場合
1. **Issue群の整理**
   - 類似Issue のグルーピング
   - 関連性の高いIssueの発見

2. **Flow作成のトリガー**
   - まとめて対処すべきIssue群
   - 同じ観点で扱うべきタスク

3. **現在の作業管理**
   - 今すぐ対応が必要な課題群
   - チーム内での作業分担

## 実装への影響

### B-1 (ClusterIssues)の役割
- **発火**: ISSUES_CLUSTER_DETECTED（具体的なIssue群）
- **受信しない**: PATTERN_FOUND（B-1はパターン分析はしない）

### B-4 (SalvageFromPond)の役割
- **発火**: PATTERN_FOUND（過去データからのパターン抽出）
- **発火しない**: ISSUES_CLUSTER_DETECTED（現在のIssueは扱わない）

### B-5 (InferBehaviorPatterns)の役割
- **受信**: PATTERN_FOUND（パターンを受けて推論）
- **発火**: より高度なPATTERN_FOUNDまたはKNOWLEDGE_CREATED

## 結論

**PATTERN_FOUNDとISSUES_CLUSTER_DETECTEDは別概念として両方必要**

理由：
1. **抽象度が異なる**: パターン（抽象）vs クラスター（具体）
2. **時間軸が異なる**: 傾向分析 vs 現状整理
3. **目的が異なる**: 知識化 vs Flow化
4. **発火元が異なる**: Pond分析系 vs Issue整理系

### 推奨事項
1. 両方のイベントを維持
2. 明確に使い分ける
3. 受信ワークフローも異なる設計にする
   - PATTERN_FOUND → Knowledge作成系
   - ISSUES_CLUSTER_DETECTED → Flow作成系