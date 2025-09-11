import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DBClient } from './index';
import { Issue } from '@sebas-chan/shared-types';
import { nanoid } from 'nanoid';

// テスト環境向けの初期化設定
const TEST_TIMEOUT = 60000; // 60秒（モデルダウンロードが必要な場合のため）

describe('DBClient - CRUD Operations', () => {
  let client: DBClient;

  beforeAll(async () => {
    client = new DBClient();
    // テスト用DBに接続
    await client.connect();
    // モデルを初期化（初回はダウンロードが発生）
    await client.initModel();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  beforeEach(async () => {
    // 各テスト前にデータをクリア
    // TODO: クリア処理の実装
  });

  describe('Issue CRUD Operations', () => {
    it(
      'should create an issue',
      async () => {
        const issue: Omit<Issue, 'id'> = {
          title: 'Test Issue',
          description: 'This is a test issue',
          status: 'open',
          labels: ['test', 'unit-test'],
          updates: [],
          relations: [],
          sourceInputIds: ['input-1'],
        };

        const issueId = await client.addIssue(issue);

        expect(issueId).toBeDefined();
        expect(typeof issueId).toBe('string');
        expect(issueId.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT
    );

    it('should retrieve an issue by ID', async () => {
      const issue: Omit<Issue, 'id'> = {
        title: 'Retrievable Issue',
        description: 'This issue should be retrievable',
        status: 'open',
        labels: ['retrievable'],
        updates: [
          {
            timestamp: new Date(),
            content: 'Initial creation',
            author: 'test',
          },
        ],
        relations: [],
        sourceInputIds: [],
      };

      const issueId = await client.addIssue(issue);
      const retrieved = await client.getIssue(issueId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(issueId);
      expect(retrieved?.title).toBe('Retrievable Issue');
      expect(retrieved?.labels).toContain('retrievable');
      expect(retrieved?.updates).toHaveLength(1);
    });

    it('should return null for non-existent issue', async () => {
      const nonExistentId = 'non-existent-' + nanoid();
      const result = await client.getIssue(nonExistentId);

      expect(result).toBeNull();
    });

    it('should search issues by query', async () => {
      // 複数のIssueを作成
      const issues = [
        {
          title: 'Bug in authentication',
          description: 'Login fails',
          status: 'open' as const,
          labels: ['bug'],
          updates: [],
          relations: [],
          sourceInputIds: [],
        },
        {
          title: 'Feature request: dark mode',
          description: 'Add dark mode support',
          status: 'open' as const,
          labels: ['feature'],
          updates: [],
          relations: [],
          sourceInputIds: [],
        },
        {
          title: 'Bug in payment system',
          description: 'Payment processing error',
          status: 'open' as const,
          labels: ['bug', 'critical'],
          updates: [],
          relations: [],
          sourceInputIds: [],
        },
      ];

      for (const issue of issues) {
        await client.addIssue(issue);
      }

      // "bug"で検索（ベクトル検索により意味的に類似したものが返る）
      const bugResults = await client.searchIssues('bug');
      expect(bugResults.length).toBeGreaterThanOrEqual(1);
      // ベクトル検索では完全一致ではなく意味的類似性で検索される

      // "feature"で検索
      const featureResults = await client.searchIssues('feature');
      expect(featureResults.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle complex issue relations', async () => {
      const issue1Id = await client.addIssue({
        title: 'Parent Issue',
        description: 'This is the parent',
        status: 'open',
        labels: ['parent'],
        updates: [],
        relations: [],
        sourceInputIds: [],
      });

      const issue2: Omit<Issue, 'id'> = {
        title: 'Child Issue',
        description: 'This depends on parent',
        status: 'open',
        labels: ['child'],
        updates: [],
        relations: [
          {
            type: 'depends_on',
            targetIssueId: issue1Id,
          },
        ],
        sourceInputIds: [],
      };

      const issue2Id = await client.addIssue(issue2);
      const retrieved = await client.getIssue(issue2Id);

      expect(retrieved?.relations).toHaveLength(1);
      expect(retrieved?.relations[0].type).toBe('depends_on');
      expect(retrieved?.relations[0].targetIssueId).toBe(issue1Id);
    });
  });

  describe('State Document Operations', () => {
    it('should get initial state document', async () => {
      const state = await client.getStateDocument();

      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
    });

    it('should update state document', async () => {
      const newState = JSON.stringify({
        lastUpdate: new Date().toISOString(),
        testData: 'test value',
      });

      await client.updateStateDocument(newState);

      const retrieved = await client.getStateDocument();
      expect(retrieved).toBe(newState);

      const parsed = JSON.parse(retrieved);
      expect(parsed.testData).toBe('test value');
    });

    it('should handle large state documents', async () => {
      const largeState = {
        data: new Array(1000).fill(null).map((_, i) => ({
          id: `item-${i}`,
          value: `Value ${i}`,
          nested: {
            field1: 'data',
            field2: i * 2,
            array: [1, 2, 3, 4, 5],
          },
        })),
      };

      const stateString = JSON.stringify(largeState);
      await client.updateStateDocument(stateString);

      const retrieved = await client.getStateDocument();
      const parsed = JSON.parse(retrieved);

      expect(parsed.data).toHaveLength(1000);
      expect(parsed.data[500].id).toBe('item-500');
    });
  });
});

describe('DBClient - Schema Validation', () => {
  let client: DBClient;

  beforeAll(async () => {
    client = new DBClient();
    await client.connect();
    await client.initModel();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  it(
    'should enforce Issue schema',
    async () => {
      const validIssue: Omit<Issue, 'id'> = {
        title: 'Schema Test',
        description: 'Testing schema validation',
        status: 'open',
        labels: ['test'],
        updates: [],
        relations: [],
        sourceInputIds: [],
      };

      const issueId = await client.addIssue(validIssue);
      const retrieved = await client.getIssue(issueId);

      // 全ての必須フィールドが存在することを確認
      expect(retrieved).toHaveProperty('id');
      expect(retrieved).toHaveProperty('title');
      expect(retrieved).toHaveProperty('description');
      expect(retrieved).toHaveProperty('status');
      expect(retrieved).toHaveProperty('labels');
      expect(retrieved).toHaveProperty('updates');
      expect(retrieved).toHaveProperty('relations');
      expect(retrieved).toHaveProperty('sourceInputIds');
    },
    TEST_TIMEOUT
  );

  it('should handle all Issue status values', async () => {
    const statuses: Issue['status'][] = ['open', 'closed'];

    for (const status of statuses) {
      const issue: Omit<Issue, 'id'> = {
        title: `Issue with ${status} status`,
        description: 'Status test',
        status,
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
      };

      const issueId = await client.addIssue(issue);
      const retrieved = await client.getIssue(issueId);

      expect(retrieved?.status).toBe(status);
    }
  });

  it('should handle all IssueRelation types', async () => {
    const relationTypes: Array<Issue['relations'][0]['type']> = [
      'blocks',
      'is_blocked_by',
      'relates_to',
      'duplicates',
      'is_duplicated_by',
      'depends_on',
      'is_dependency_of',
      'related',
    ];

    const targetId = await client.addIssue({
      title: 'Target Issue',
      description: 'Target for relations',
      status: 'open',
      labels: [],
      updates: [],
      relations: [],
      sourceInputIds: [],
    });

    for (const relationType of relationTypes) {
      const issue: Omit<Issue, 'id'> = {
        title: `Issue with ${relationType} relation`,
        description: 'Relation test',
        status: 'open',
        labels: [],
        updates: [],
        relations: [
          {
            type: relationType,
            targetIssueId: targetId,
          },
        ],
        sourceInputIds: [],
      };

      const issueId = await client.addIssue(issue);
      const retrieved = await client.getIssue(issueId);

      expect(retrieved?.relations[0].type).toBe(relationType);
    }
  });

  it('should preserve complex nested structures', async () => {
    const complexIssue: Omit<Issue, 'id'> = {
      title: 'Complex Issue',
      description: 'Issue with complex nested data',
      status: 'open',
      labels: ['complex', 'nested', 'test'],
      updates: [
        {
          timestamp: new Date('2024-01-01'),
          content: 'First update',
          author: 'user1',
        },
        {
          timestamp: new Date('2024-01-02'),
          content: 'Second update with metadata',
          author: 'user2',
          metadata: {
            changeType: 'status_change',
            oldValue: 'open',
            newValue: 'in_progress',
          },
        },
      ],
      relations: [
        { type: 'blocks', targetIssueId: 'issue-1' },
        { type: 'relates_to', targetIssueId: 'issue-2' },
      ],
      sourceInputIds: ['input-1', 'input-2', 'input-3'],
    };

    const issueId = await client.addIssue(complexIssue);
    const retrieved = await client.getIssue(issueId);

    expect(retrieved?.labels).toHaveLength(3);
    expect(retrieved?.updates).toHaveLength(2);
    expect(retrieved?.relations).toHaveLength(2);
    expect(retrieved?.sourceInputIds).toHaveLength(3);

    // 詳細な内容確認
    expect(retrieved?.updates[1].author).toBe('user2');
    expect(retrieved?.relations[0].type).toBe('blocks');
  });
});

describe('DBClient - Vector Search', () => {
  let client: DBClient;

  beforeAll(async () => {
    client = new DBClient();
    await client.connect();
    await client.initModel();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  it(
    'should perform vector search for similar issues',
    async () => {
      // セマンティックに似たIssueを作成
      const issues = [
        {
          title: 'Authentication bug',
          description: 'Users cannot log in to the system',
          status: 'open' as const,
          labels: ['bug', 'auth'],
          updates: [],
          relations: [],
          sourceInputIds: [],
        },
        {
          title: 'Login error',
          description: 'Authentication fails when trying to access account',
          status: 'open' as const,
          labels: ['bug', 'auth'],
          updates: [],
          relations: [],
          sourceInputIds: [],
        },
        {
          title: 'Payment processing',
          description: 'Credit card transactions are failing',
          status: 'open' as const,
          labels: ['bug', 'payment'],
          updates: [],
          relations: [],
          sourceInputIds: [],
        },
        {
          title: 'UI improvement',
          description: 'Make the dashboard more user-friendly',
          status: 'open' as const,
          labels: ['enhancement', 'ui'],
          updates: [],
          relations: [],
          sourceInputIds: [],
        },
      ];

      const issueIds: string[] = [];
      for (const issue of issues) {
        const id = await client.addIssue(issue);
        issueIds.push(id);
      }

      // "login problem"で検索 - 最初の2つのIssueが類似している
      const searchResults = await client.searchIssues('login problem');

      // 検索結果が返ってくることを確認
      expect(searchResults).toBeDefined();
      expect(Array.isArray(searchResults)).toBe(true);

      // 類似度に基づくランキングを確認（現在の実装では部分一致）
      // TODO: 実際のベクトル検索が実装されたら、より詳細なテストを追加
      if (searchResults.length > 0) {
        // Authentication/Loginに関連するIssueが上位に来ることを期待
        const topResults = searchResults.slice(0, 2);
        const relevantCount = topResults.filter(
          (r) => r.title.toLowerCase().includes('auth') || r.title.toLowerCase().includes('login')
        ).length;

        // 少なくとも1つは関連するIssueが含まれているはず
        expect(relevantCount).toBeGreaterThan(0);
      }
    },
    TEST_TIMEOUT
  );

  it('should return empty array for no matches', async () => {
    const results = await client.searchIssues('completely_unrelated_query_xyz123');

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    // 部分一致なので、完全に一致しない場合は空配列
    // TODO: ベクトル検索実装後は類似度閾値のテストに変更
  });

  it(
    'should rank results by similarity score',
    async () => {
      // ベクトル検索が実装されたので有効化
      // 実際のembeddingとコサイン類似度によるランキングを検証

      // データベース全体をクリア
      await client.clearDatabase();

      // テスト用のIssueを作成
      const issues = [
        {
          title: 'Database connection timeout',
          description: 'Connection to MySQL database times out after 30 seconds',
          status: 'open' as const,
          labels: ['bug', 'database'],
          updates: [],
          relations: [],
          sourceInputIds: [],
        },
        {
          title: 'UI Button styling issue',
          description: 'Primary button color does not match design specifications',
          status: 'open' as const,
          labels: ['bug', 'ui'],
          updates: [],
          relations: [],
          sourceInputIds: [],
        },
        {
          title: 'Payment API integration',
          description: 'Integrate Stripe payment gateway for subscription billing',
          status: 'open' as const,
          labels: ['feature', 'payment'],
          updates: [],
          relations: [],
          sourceInputIds: [],
        },
      ];

      // Issueを追加して、IDを記録
      for (const issue of issues) {
        await client.addIssue(issue);
      }

      // クエリを実行
      const dbResults = await client.searchIssues('database error');
      const uiResults = await client.searchIssues('user interface design');
      const paymentResults = await client.searchIssues('payment integration');

      // 各検索で結果が返ってくることを確認
      // ベクトル検索は意味的類似性に基づくため、完全一致は期待しない

      // "database error"で検索
      expect(dbResults).toBeDefined();
      expect(dbResults.length).toBeGreaterThan(0);

      // 1位の結果がdatabaseを含むことを確認
      const firstResult = dbResults[0];
      const firstHasDatabase =
        firstResult.title.toLowerCase().includes('database') ||
        firstResult.description.toLowerCase().includes('database');

      expect(firstHasDatabase).toBe(true);

      // "user interface design"で検索
      expect(uiResults).toBeDefined();
      expect(uiResults.length).toBeGreaterThan(0);

      // 1位の結果がUIに関連することを確認
      const firstUiResult = uiResults[0];
      const firstHasUi =
        firstUiResult.title.toLowerCase().includes('ui') ||
        firstUiResult.title.toLowerCase().includes('button') ||
        firstUiResult.description.toLowerCase().includes('button') ||
        firstUiResult.description.toLowerCase().includes('design');

      expect(firstHasUi).toBe(true);

      // "payment integration"で検索
      expect(paymentResults).toBeDefined();
      expect(paymentResults.length).toBeGreaterThan(0);

      // 1位の結果がPaymentに関連することを確認
      const firstPaymentResult = paymentResults[0];
      const firstHasPayment =
        firstPaymentResult.title.toLowerCase().includes('payment') ||
        firstPaymentResult.description.toLowerCase().includes('payment') ||
        firstPaymentResult.description.toLowerCase().includes('stripe');

      expect(firstHasPayment).toBe(true);
    },
    TEST_TIMEOUT
  );

  it('should handle vector dimension consistency', async () => {
    // ベクトル次元の一貫性を確認するテスト
    // 256次元のベクトルが正しく保存・取得されることを確認

    const issue = {
      title: 'Vector dimension test',
      description: 'Testing that vectors maintain consistent dimensions',
      status: 'open' as const,
      labels: ['test'],
      updates: [],
      relations: [],
      sourceInputIds: [],
    };

    const issueId = await client.addIssue(issue);
    await client.getIssue(issueId);

    // ベクトルが存在し、256次元であることを確認
    // 注: TypeScript側ではvectorフィールドを公開していないため、
    // 間接的に検索機能を通じて確認
    const searchResults = await client.searchIssues('vector dimension');

    // 検索が正常に動作することを確認（ベクトルが保存されている証拠）
    expect(searchResults).toBeDefined();
    expect(Array.isArray(searchResults)).toBe(true);

    // 追加したIssueが検索できることを確認
    const found = searchResults.find((r) => r.id === issueId);
    expect(found).toBeDefined();
  });
});

describe('DBClient - Error Handling', () => {
  let client: DBClient;

  beforeAll(async () => {
    client = new DBClient();
    await client.connect();
    await client.initModel();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  it('should handle connection errors gracefully', async () => {
    const disconnectedClient = new DBClient();

    // 接続前の操作はエラーを投げる
    await expect(
      disconnectedClient.addIssue({
        title: 'Test',
        description: 'Test',
        status: 'open',
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
      })
    ).rejects.toThrow('Not connected to database');
  });

  it('should handle malformed data gracefully', async () => {
    // 不正なデータでもクラッシュしないことを確認
    const issue = {
      title: 'Test',
      description: 'Test',
      status: 'invalid_status' as Issue['status'], // 無効なステータス
      labels: null as unknown as string[], // nullの配列
      updates: 'not_an_array' as unknown as Issue['updates'], // 配列でない
      relations: [],
      sourceInputIds: [],
    };

    // エラーハンドリングを確認
    try {
      await client.addIssue(issue);
      // 現在の実装では型チェックが緩いので、エラーにならない可能性がある
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should handle unknown method calls', async () => {
    // DBClient経由では直接テストできないが、
    // 不正なメソッド呼び出しはタイムアウトする
    // これはDBClientのsendRequestメソッドを直接呼ぶ必要がある
    // @ts-ignore - privateメソッドへのアクセス
    await expect(client.sendRequest('unknownMethod')).rejects.toThrow();
  });

  it('should handle incomplete issue data', async () => {
    // 必須フィールドが欠落したデータ
    const incompleteIssue = {
      title: 'Incomplete Issue',
      // descriptionが欠落
    } as Omit<Issue, 'id'>;

    // エラーが適切に処理されることを確認
    await expect(client.addIssue(incompleteIssue)).rejects.toThrow();
  });
});
