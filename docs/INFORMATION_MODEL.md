# 情報管理モデル

## 情報の階層構造

sebas-changでは、情報を以下の階層で管理します：

### 1. Input（入力）

Reporterから送られてくる情報の最小単位。

```typescript
interface Input {
  id: string;
  source: string; // "slack", "gmail", "manual"
  content: string;
  timestamp: Date;
}
```

### 2. Issue（課題）

Inputが統合された、行動可能な管理単位。GitHubのIssueモデルを採用。

```typescript
interface Issue {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'closed';
  labels: string[];
  updates: IssueUpdate[];
  relations: IssueRelation[];
  sourceInputIds: string[];
}
```

**特徴**：
- シンプルな状態管理（open/closed）
- 詳細はラベルで管理
- 更新履歴と他Issueとの関係性を保持

### 3. Knowledge（知識）

多様な情報源から抽出・蒸留された永続的な知識。生成元は以下のような多様なソースとタイミング：
- ClosedになったIssueからの抽出
- Pondからの発見・サルベージ
- State Documentからの一般化・構造化
- ユーザーからの直接入力

```typescript
interface Knowledge {
  id: string;
  type: 'system_rule' | 'process_manual' | 'entity_profile' | 
        'curated_summary' | 'factoid';
  content: string;
  reputation: {
    upvotes: number;
    downvotes: number;
  };
  sources: KnowledgeSource[];
}
```

**評価システム**：
- +1: 有用
- 0: 不明/中立
- -1: 不正確/陳腐化

## Flow（作業の流れ）

複数のIssueをまとめた、より大きな作業単位。

```typescript
interface Flow {
  id: string;
  title: string;
  description: string;
  status: 'focused' | 'active' | 'monitoring' | 'blocked' | 
          'pending_user_decision' | 'pending_review' | 'backlog' | 
          'paused' | 'someday' | 'completed' | 'cancelled' | 'archived';
  priorityScore: number; // 0.0 ~ 1.0
  issueIds: string[];
}
```

## Pond（未整理情報のストア）

どのFlowにも属さないが、将来価値を持つ可能性のある情報を蓄積するベクトル化ストア。

**特徴**：
- セレンディピティ（偶発的な発見）の源泉
- AIによる定期的なクラスタリング
- サルベージプランに基づく価値ある情報の発見

## State Document（状態文書）

システム全体で共有される単一の自然言語ワーキングメモリ。

**役割**：
- 共有された意識
- 思考の出発点
- 流動的な情報の置き場

**特性**：
- 構造化されていない自然言語
- AIによる自律的な更新と整理
- 重要な情報は自動的にIssue/Knowledgeへ構造化