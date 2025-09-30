# A系列ワークフロー改善提案書

## 1. 現状分析

### 1.1 現在の実装の問題点

#### A-0: ProcessUserRequest

- **AI処理が単純**: 単純なプロンプト文字列でAIを呼び出し、構造化されていない
- **分類ロジックが粗い**: `classifyRequest`が単純な文字列マッチングのみ
- **エラーハンドリング不足**: AI失敗時の代替処理がない

#### A-1: IngestInput

- **AI未使用**: `shouldTriggerAnalysis`が単純なキーワードマッチのみ
- **構造化不足**: Inputの内容理解が浅い
- **メタデータ活用不足**: sourceやmetadataが活用されていない

#### A-2: AnalyzeIssueImpact

- **影響度計算が機械的**: `calculateImpactScore`が単純すぎる
- **AI出力が非構造化**: 自然言語のみで後続処理が困難
- **関連性判定が粗い**: 単純な文字列検索のみ

#### A-3: ExtractKnowledge

- **重複判定が単純**: 文字列完全一致のみ
- **分類が粗い**: `determineKnowledgeType`が単純
- **構造化不足**: 知識の構造化が不十分

### 1.2 ModulerPrompt活用の不足

現在の実装では：

- 単純な文字列プロンプトを使用
- 構造化出力（Schema）を活用していない
- モジュール化による再利用性がない
- コンテキスト管理が不十分

## 2. 改善提案

### 2.1 処理の分離原則

#### AI処理すべき部分

1. **理解・解釈**
   - 自然言語の意図理解
   - コンテキスト依存の判断
   - パターン認識と分類

2. **生成・創造**
   - 要約・説明文生成
   - 提案・推奨事項の作成
   - 知識の構造化

3. **判断・評価**
   - 重要度・優先度判定
   - 影響範囲の推定
   - 類似性・関連性判定

#### 機械的処理すべき部分

1. **データ操作**
   - DB検索・保存
   - ID生成・管理
   - タイムスタンプ処理

2. **ルールベース処理**
   - 閾値判定
   - 条件分岐
   - イベント発行

3. **集計・計算**
   - スコア計算
   - 統計処理
   - カウント処理

### 2.2 ModulerPromptの構造化出力活用

#### Schema定義による型安全な出力

```typescript
// A-0: ProcessUserRequest用のJSONSchema
const UserRequestAnalysisSchema: JSONSchema = {
  type: 'object',
  properties: {
    requestType: {
      type: 'string',
      enum: ['issue', 'question', 'feedback', 'action'],
      description: 'リクエストの種類',
    },
    intent: {
      type: 'string',
      description: 'ユーザーの意図',
    },
    entities: {
      type: 'object',
      properties: {
        topics: {
          type: 'array',
          items: { type: 'string' },
          description: '関連トピック',
        },
        references: {
          type: 'array',
          items: { type: 'string' },
          description: '参照情報',
        },
        urgency: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: '緊急度',
        },
      },
      required: ['topics', 'references', 'urgency'],
    },
    suggestedWorkflows: {
      type: 'array',
      items: { type: 'string' },
      description: '推奨されるワークフロー',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: '分析の確信度',
    },
  },
  required: ['requestType', 'intent', 'entities', 'suggestedWorkflows', 'confidence'],
};

// ModulerPromptモジュール例
const analyzeRequestModule: PromptModule<RequestContext> = {
  objective: ['ユーザーリクエストを分析し構造化する'],
  instructions: ['リクエストタイプを特定', '関連エンティティを抽出', '適切なワークフローを提案'],
  schema: UserRequestAnalysisSchema, // JSONSchemaオブジェクト
  outputFormat: 'json',
};
```

### 2.3 ワークフロー分割提案（1workflow 1dir構成）

#### 提案するディレクトリ構造

```
packages/core/src/workflows/
├── a0-process-user-request/
│   ├── index.ts              # メインエクスポート
│   ├── workflow.ts           # WorkflowDefinition
│   ├── executor.ts           # 実行ロジック
│   ├── ai-modules/           # AI処理モジュール
│   │   ├── analyze-request.ts
│   │   └── classify-intent.ts
│   ├── processors/           # 機械的処理
│   │   ├── route-request.ts
│   │   └── validate-input.ts
│   ├── schemas/              # 型定義とスキーマ
│   │   └── types.ts
│   └── __tests__/           # テスト
│       ├── workflow.test.ts
│       └── ai-modules.test.ts
│
├── a1-ingest-input/
│   ├── index.ts
│   ├── workflow.ts
│   ├── executor.ts
│   ├── ai-modules/
│   │   ├── analyze-content.ts    # NEW: AI分析追加
│   │   └── extract-metadata.ts   # NEW: メタデータ抽出
│   ├── processors/
│   │   ├── pond-storage.ts
│   │   └── error-detection.ts
│   └── schemas/
│
├── a2-analyze-issue-impact/
│   ├── index.ts
│   ├── workflow.ts
│   ├── executor.ts
│   ├── ai-modules/
│   │   ├── impact-analysis.ts
│   │   ├── relation-finder.ts    # NEW: 関連性判定AI
│   │   └── priority-scorer.ts    # NEW: 優先度判定AI
│   ├── processors/
│   │   ├── issue-manager.ts
│   │   └── score-calculator.ts
│   └── schemas/
│
└── a3-extract-knowledge/
    ├── index.ts
    ├── workflow.ts
    ├── executor.ts
    ├── ai-modules/
    │   ├── knowledge-extractor.ts
    │   ├── categorizer.ts        # NEW: 分類AI
    │   └── deduplicator.ts       # NEW: 重複判定AI
    ├── processors/
    │   ├── knowledge-storage.ts
    │   └── validation.ts
    └── schemas/
```

### 2.4 各ワークフローの改善詳細

#### A-0: ProcessUserRequest 改善案

```typescript
// ai-modules/analyze-request.ts
const AnalyzeRequestSchema: JSONSchema = {
  type: 'object',
  properties: {
    requestType: {
      type: 'string',
      enum: ['issue', 'question', 'feedback', 'action'],
    },
    intent: { type: 'string' },
    entities: {
      type: 'object',
      properties: {
        topics: { type: 'array', items: { type: 'string' } },
        references: { type: 'array', items: { type: 'string' } },
        urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['topics', 'references', 'urgency'],
    },
    suggestedWorkflows: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['requestType', 'intent', 'entities', 'suggestedWorkflows', 'confidence'],
};

export const analyzeRequestModule: PromptModule<RequestContext> = {
  objective: ['ユーザーリクエストを深く理解し構造化する'],

  instructions: [
    'リクエストの意図を特定',
    '関連するトピックとエンティティを抽出',
    '緊急度を判定',
    '適切な後続ワークフローを提案',
  ],

  schema: AnalyzeRequestSchema,

  examples: [
    // 少数ショット学習用の例
  ],
};

// executor.ts - AI処理と機械的処理の分離
export async function executeProcessUserRequest(
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  // 1. 入力検証（機械的）
  const validated = validateInput(event.payload);

  // 2. AI分析（AI処理）
  const analysis = await analyzeWithAI(validated, context);

  // 3. ルーティング決定（機械的）
  const routes = determineRoutes(analysis);

  // 4. イベント発行（機械的）
  await emitEvents(routes, emitter);

  // 5. 結果記録（機械的）
  return recordResult(context, analysis, routes);
}
```

#### A-1: IngestInput 改善案

```typescript
// ai-modules/analyze-content.ts
const AnalyzeContentSchema: JSONSchema = {
  type: 'object',
  properties: {
    contentType: {
      type: 'string',
      enum: ['log', 'report', 'alert', 'data'],
    },
    hasError: { type: 'boolean' },
    errorSeverity: {
      type: 'string',
      enum: ['none', 'low', 'medium', 'high', 'critical'],
    },
    keywords: { type: 'array', items: { type: 'string' } },
    entities: {
      type: 'object',
      properties: {
        systems: { type: 'array', items: { type: 'string' } },
        timestamps: { type: 'array', items: { type: 'string' } },
        metrics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'number' },
              unit: { type: 'string' },
            },
            required: ['name', 'value', 'unit'],
          },
        },
      },
      required: ['systems', 'timestamps', 'metrics'],
    },
    shouldAnalyze: { type: 'boolean' },
    suggestedActions: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'contentType',
    'hasError',
    'keywords',
    'entities',
    'shouldAnalyze',
    'suggestedActions',
  ],
};

export const analyzeContentModule: PromptModule<ContentContext> = {
  objective: ['入力内容を理解し、重要な情報を抽出する'],

  instructions: [
    'コンテンツのタイプを特定',
    'エラーやアノマリーを検出',
    'キーワードとエンティティを抽出',
    '処理優先度を判定',
  ],

  schema: AnalyzeContentSchema,
};
```

#### A-2: AnalyzeIssueImpact 改善案

```typescript
// ai-modules/impact-analysis.ts
const AnalyzeImpactSchema: JSONSchema = {
  type: 'object',
  properties: {
    impactAnalysis: {
      type: 'object',
      properties: {
        affectedSystems: { type: 'array', items: { type: 'string' } },
        affectedUsers: { type: 'number' },
        businessImpact: {
          type: 'string',
          enum: ['none', 'low', 'medium', 'high', 'critical'],
        },
        technicalComplexity: {
          type: 'string',
          enum: ['trivial', 'simple', 'moderate', 'complex', 'very_complex'],
        },
        estimatedResolutionTime: { type: 'number' }, // hours
        dependencies: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'affectedSystems',
        'affectedUsers',
        'businessImpact',
        'technicalComplexity',
        'estimatedResolutionTime',
        'dependencies',
      ],
    },
    relatedIssues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          issueId: { type: 'string' },
          relation: {
            type: 'string',
            enum: ['duplicate', 'blocks', 'blocked_by', 'relates_to', 'causes'],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['issueId', 'relation', 'confidence'],
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          priority: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['action', 'priority', 'reason'],
      },
    },
    impactScore: { type: 'number', minimum: 0, maximum: 100 },
  },
  required: ['impactAnalysis', 'relatedIssues', 'recommendations', 'impactScore'],
};

export const analyzeImpactModule: PromptModule<ImpactContext> = {
  objective: ['Issueの影響範囲と重要度を詳細に分析する'],

  instructions: [
    '影響を受けるコンポーネントを特定',
    'ビジネスへの影響を評価',
    '技術的な影響範囲を分析',
    '解決の緊急度を判定',
  ],

  schema: AnalyzeImpactSchema,
};
```

#### A-3: ExtractKnowledge 改善案

```typescript
// ai-modules/knowledge-extractor.ts
const ExtractKnowledgeSchema: JSONSchema = {
  type: 'object',
  properties: {
    knowledge: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        category: {
          type: 'string',
          enum: ['solution', 'pattern', 'issue', 'best_practice', 'reference'],
        },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        applicability: {
          type: 'object',
          properties: {
            contexts: { type: 'array', items: { type: 'string' } },
            systems: { type: 'array', items: { type: 'string' } },
            conditions: { type: 'array', items: { type: 'string' } },
          },
          required: ['contexts', 'systems', 'conditions'],
        },
        relations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['supersedes', 'extends', 'contradicts', 'supports'],
              },
              targetId: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['type', 'targetId', 'description'],
          },
        },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        extractionMetadata: {
          type: 'object',
          properties: {
            sourceType: { type: 'string' },
            extractionMethod: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
          required: ['sourceType', 'extractionMethod', 'timestamp'],
        },
      },
      required: [
        'title',
        'summary',
        'category',
        'content',
        'tags',
        'applicability',
        'relations',
        'confidence',
        'extractionMetadata',
      ],
    },
    isDuplicate: { type: 'boolean' },
    similarKnowledge: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          similarity: { type: 'number', minimum: 0, maximum: 1 },
          mergeRecommended: { type: 'boolean' },
        },
        required: ['id', 'similarity', 'mergeRecommended'],
      },
    },
  },
  required: ['knowledge', 'isDuplicate', 'similarKnowledge'],
};

export const extractKnowledgeModule: PromptModule<KnowledgeContext> = {
  objective: ['価値ある知識を抽出し構造化する'],

  instructions: [
    '再利用可能な知識を特定',
    '知識をカテゴリー分類',
    '関連する既存知識とリンク',
    'メタデータを生成',
  ],

  schema: ExtractKnowledgeSchema,
};
```

## 3. 実装戦略

### 3.1 段階的移行計画

#### Phase 1: 基盤整備（1週間）

1. ディレクトリ構造の作成
2. 共通スキーマとインターフェースの定義
3. ModulerPromptモジュールのテンプレート作成

#### Phase 2: A-0の書き直し（3日）

1. 新構造でA-0を完全に書き直し
2. テストの作成と実行
3. 既存システムとの統合テスト

#### Phase 3: 残りのワークフロー移行（1週間）

1. A-1, A-2, A-3を順次移行
2. 各ワークフローのテスト作成
3. ワークフローチェーンの統合テスト

#### Phase 4: 最適化と改善（3日）

1. パフォーマンス測定と最適化
2. エラーハンドリングの強化
3. ドキュメント整備

### 3.2 テスト戦略

```typescript
// 各ワークフローのテスト構造
describe('A-0: ProcessUserRequest', () => {
  describe('AI Modules', () => {
    it('should analyze request correctly', async () => {
      // ModulerPromptモジュールのテスト
    });
  });

  describe('Processors', () => {
    it('should route requests correctly', () => {
      // 機械的処理のテスト
    });
  });

  describe('Integration', () => {
    it('should execute workflow end-to-end', async () => {
      // 統合テスト
    });
  });
});
```

## 4. 期待される効果

### 4.1 品質向上

- **型安全性**: Schema定義により出力が予測可能
- **保守性**: モジュール化により変更が容易
- **テスタビリティ**: AI処理と機械的処理の分離によりテストが簡単

### 4.2 機能向上

- **理解度向上**: AIによる深い内容理解
- **精度向上**: 構造化出力による正確な処理
- **拡張性**: 新機能追加が容易

### 4.3 パフォーマンス

- **効率化**: 不要なAI呼び出しの削減
- **並列化**: 独立した処理の並列実行
- **キャッシュ**: 構造化データのキャッシュ可能性

## 5. リスクと対策

| リスク             | 影響 | 対策                         |
| ------------------ | ---- | ---------------------------- |
| AI処理コストの増加 | 高   | 適切なキャッシュとバッチ処理 |
| 移行期間中の不整合 | 中   | 段階的移行と十分なテスト     |
| 複雑性の増大       | 中   | 明確なドキュメントとサンプル |
| スキーマ変更の影響 | 低   | バージョニングと後方互換性   |

## 6. まとめ

A系列ワークフローの改善により：

1. **AI処理の最適化**: 必要な箇所でのみAIを使用し、構造化出力で品質向上
2. **保守性の向上**: 1workflow 1dir構成により管理が容易
3. **拡張性の確保**: ModulerPromptモジュールにより新機能追加が簡単
4. **品質の向上**: 明確な責任分離とテスト可能性の向上

これらの改善により、より堅牢で拡張可能なワークフローシステムが実現できます。
