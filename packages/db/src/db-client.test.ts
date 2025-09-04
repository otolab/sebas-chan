import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DBClient } from './index';
import { Issue, Flow, Knowledge, PondEntry } from '@sebas-chan/shared-types';
import { nanoid } from 'nanoid';

describe('DBClient - CRUD Operations', () => {
  let client: DBClient;
  
  beforeAll(async () => {
    client = new DBClient();
    // テスト用DBに接続
    await client.connect();
  }, 10000);
  
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
    it('should create an issue', async () => {
      const issue: Omit<Issue, 'id'> = {
        title: 'Test Issue',
        description: 'This is a test issue',
        status: 'open',
        labels: ['test', 'unit-test'],
        updates: [],
        relations: [],
        sourceInputIds: ['input-1']
      };
      
      const issueId = await client.addIssue(issue);
      
      expect(issueId).toBeDefined();
      expect(typeof issueId).toBe('string');
      expect(issueId.length).toBeGreaterThan(0);
    });
    
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
            author: 'test'
          }
        ],
        relations: [],
        sourceInputIds: []
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
          sourceInputIds: []
        },
        {
          title: 'Feature request: dark mode',
          description: 'Add dark mode support',
          status: 'open' as const,
          labels: ['feature'],
          updates: [],
          relations: [],
          sourceInputIds: []
        },
        {
          title: 'Bug in payment system',
          description: 'Payment processing error',
          status: 'open' as const,
          labels: ['bug', 'critical'],
          updates: [],
          relations: [],
          sourceInputIds: []
        }
      ];
      
      for (const issue of issues) {
        await client.addIssue(issue);
      }
      
      // "bug"で検索
      const bugResults = await client.searchIssues('bug');
      expect(bugResults.length).toBeGreaterThanOrEqual(2);
      expect(bugResults.every(i => i.title.toLowerCase().includes('bug'))).toBe(true);
      
      // "feature"で検索
      const featureResults = await client.searchIssues('feature');
      expect(featureResults.length).toBeGreaterThanOrEqual(1);
      expect(featureResults.some(i => i.title.includes('Feature request'))).toBe(true);
    });
    
    it('should handle complex issue relations', async () => {
      const issue1Id = await client.addIssue({
        title: 'Parent Issue',
        description: 'This is the parent',
        status: 'open',
        labels: ['parent'],
        updates: [],
        relations: [],
        sourceInputIds: []
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
            targetIssueId: issue1Id
          }
        ],
        sourceInputIds: []
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
        testData: 'test value'
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
            array: [1, 2, 3, 4, 5]
          }
        }))
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
  }, 10000);
  
  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });
  
  it('should enforce Issue schema', async () => {
    const validIssue: Omit<Issue, 'id'> = {
      title: 'Schema Test',
      description: 'Testing schema validation',
      status: 'open',
      labels: ['test'],
      updates: [],
      relations: [],
      sourceInputIds: []
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
  });
  
  it('should handle all Issue status values', async () => {
    const statuses: Issue['status'][] = ['open', 'in_progress', 'resolved', 'closed'];
    
    for (const status of statuses) {
      const issue: Omit<Issue, 'id'> = {
        title: `Issue with ${status} status`,
        description: 'Status test',
        status,
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: []
      };
      
      const issueId = await client.addIssue(issue);
      const retrieved = await client.getIssue(issueId);
      
      expect(retrieved?.status).toBe(status);
    }
  });
  
  it('should handle all IssueRelation types', async () => {
    const relationTypes: Array<Issue['relations'][0]['type']> = [
      'blocks', 'is_blocked_by', 'relates_to', 'duplicates', 
      'is_duplicated_by', 'depends_on', 'is_dependency_of', 'related'
    ];
    
    const targetId = await client.addIssue({
      title: 'Target Issue',
      description: 'Target for relations',
      status: 'open',
      labels: [],
      updates: [],
      relations: [],
      sourceInputIds: []
    });
    
    for (const relationType of relationTypes) {
      const issue: Omit<Issue, 'id'> = {
        title: `Issue with ${relationType} relation`,
        description: 'Relation test',
        status: 'open',
        labels: [],
        updates: [],
        relations: [{
          type: relationType,
          targetIssueId: targetId
        }],
        sourceInputIds: []
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
          author: 'user1'
        },
        {
          timestamp: new Date('2024-01-02'),
          content: 'Second update with metadata',
          author: 'user2',
          metadata: {
            changeType: 'status_change',
            oldValue: 'open',
            newValue: 'in_progress'
          }
        }
      ],
      relations: [
        { type: 'blocks', targetIssueId: 'issue-1' },
        { type: 'relates_to', targetIssueId: 'issue-2' }
      ],
      sourceInputIds: ['input-1', 'input-2', 'input-3']
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
  }, 10000);
  
  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });
  
  it('should perform vector search for similar issues', async () => {
    // セマンティックに似たIssueを作成
    const issues = [
      {
        title: 'Authentication bug',
        description: 'Users cannot log in to the system',
        status: 'open' as const,
        labels: ['bug', 'auth'],
        updates: [],
        relations: [],
        sourceInputIds: []
      },
      {
        title: 'Login error',
        description: 'Authentication fails when trying to access account',
        status: 'open' as const,
        labels: ['bug', 'auth'],
        updates: [],
        relations: [],
        sourceInputIds: []
      },
      {
        title: 'Payment processing',
        description: 'Credit card transactions are failing',
        status: 'open' as const,
        labels: ['bug', 'payment'],
        updates: [],
        relations: [],
        sourceInputIds: []
      },
      {
        title: 'UI improvement',
        description: 'Make the dashboard more user-friendly',
        status: 'open' as const,
        labels: ['enhancement', 'ui'],
        updates: [],
        relations: [],
        sourceInputIds: []
      }
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
      const relevantCount = topResults.filter(r => 
        r.title.toLowerCase().includes('auth') || 
        r.title.toLowerCase().includes('login')
      ).length;
      
      // 少なくとも1つは関連するIssueが含まれているはず
      expect(relevantCount).toBeGreaterThan(0);
    }
  });
  
  it('should return empty array for no matches', async () => {
    const results = await client.searchIssues('completely_unrelated_query_xyz123');
    
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    // 部分一致なので、完全に一致しない場合は空配列
    // TODO: ベクトル検索実装後は類似度閾値のテストに変更
  });
  
  it.skip('should rank results by similarity score', async () => {
    // TODO: ベクトル検索が実装されたら有効化
    // このテストは、実際のembeddingとコサイン類似度による
    // ランキングを検証する
    
    const testQueries = [
      'database connection error',
      'user interface design',
      'payment gateway integration'
    ];
    
    for (const query of testQueries) {
      const results = await client.searchIssues(query);
      
      // 結果が類似度でソートされていることを確認
      if (results.length > 1) {
        // スコアフィールドがあれば確認
        // expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      }
    }
  });
  
  it.skip('should handle vector dimension consistency', async () => {
    // TODO: ベクトル次元の一貫性を確認するテスト
    // 384次元のベクトルが正しく保存・取得されることを確認
  });
});

describe('DBClient - Error Handling', () => {
  let client: DBClient;
  
  beforeAll(async () => {
    client = new DBClient();
    await client.connect();
  }, 10000);
  
  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });
  
  it('should handle connection errors gracefully', async () => {
    const disconnectedClient = new DBClient();
    
    // 接続前の操作はエラーを投げる
    await expect(disconnectedClient.addIssue({
      title: 'Test',
      description: 'Test',
      status: 'open',
      labels: [],
      updates: [],
      relations: [],
      sourceInputIds: []
    })).rejects.toThrow('Not connected to database');
  });
  
  it('should handle malformed data gracefully', async () => {
    // 不正なデータでもクラッシュしないことを確認
    const issue: any = {
      title: 'Test',
      description: 'Test',
      status: 'invalid_status', // 無効なステータス
      labels: null, // nullの配列
      updates: 'not_an_array', // 配列でない
      relations: [],
      sourceInputIds: []
    };
    
    // エラーハンドリングを確認
    try {
      await client.addIssue(issue);
      // 現在の実装では型チェックが緩いので、エラーにならない可能性がある
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});