import { describe, it, expect } from 'vitest';
import type { 
  Issue, 
  Flow, 
  Input, 
  Knowledge, 
  PondEntry,
  IssueUpdate,
  IssueRelation,
  KnowledgeSource
} from './index';

describe('shared-types', () => {
  describe('Issue type', () => {
    it('should export Issue type with all required fields', () => {
      const issue: Issue = {
        id: 'test-1',
        title: 'Test Issue',
        description: 'Test Description',
        status: 'open',
        labels: ['bug', 'urgent'],
        updates: [],
        relations: [],
        sourceInputIds: ['input-1', 'input-2'],
      };

      expect(issue.id).toBe('test-1');
      expect(issue.status).toBe('open');
      expect(issue.labels).toContain('bug');
    });

    it('should handle IssueUpdate type', () => {
      const update: IssueUpdate = {
        timestamp: new Date(),
        content: 'Updated the issue',
        author: 'user'
      };

      expect(update.author).toBe('user');
    });

    it('should handle IssueRelation type', () => {
      const relation: IssueRelation = {
        type: 'blocks',
        targetIssueId: 'issue-2'
      };

      expect(relation.type).toBe('blocks');
    });
  });

  describe('Flow type', () => {
    it('should handle Flow type with all statuses', () => {
      const flow: Flow = {
        id: 'flow-1',
        title: 'Test Flow',
        description: 'Test Flow Description',
        status: 'active',
        priorityScore: 0.5,
        issueIds: ['issue-1', 'issue-2'],
      };

      expect(flow.status).toBe('active');
      expect(flow.priorityScore).toBeGreaterThanOrEqual(0);
      expect(flow.priorityScore).toBeLessThanOrEqual(1);
    });

    it('should accept all valid Flow statuses', () => {
      const validStatuses = [
        'focused', 'active', 'monitoring', 'blocked',
        'pending_user_decision', 'pending_review', 'backlog',
        'paused', 'someday', 'completed', 'cancelled', 'archived'
      ] as const;

      validStatuses.forEach(status => {
        const flow: Flow = {
          id: 'flow-test',
          title: 'Test',
          description: 'Test',
          status,
          priorityScore: 0.5,
          issueIds: []
        };
        expect(flow.status).toBe(status);
      });
    });
  });

  describe('Input type', () => {
    it('should handle Input type', () => {
      const input: Input = {
        id: 'input-1',
        source: 'slack',
        content: 'Message from Slack',
        timestamp: new Date()
      };

      expect(input.source).toBe('slack');
      expect(input.content).toBe('Message from Slack');
    });
  });

  describe('Knowledge type', () => {
    it('should handle Knowledge type with all types', () => {
      const knowledge: Knowledge = {
        id: 'knowledge-1',
        type: 'factoid',
        content: 'A piece of knowledge',
        reputation: {
          upvotes: 10,
          downvotes: 2
        },
        sources: []
      };

      expect(knowledge.type).toBe('factoid');
      expect(knowledge.reputation.upvotes).toBe(10);
    });

    it('should handle KnowledgeSource union type', () => {
      const sources: KnowledgeSource[] = [
        { type: 'issue', issueId: 'issue-1' },
        { type: 'pond', pondEntryId: 'pond-1' },
        { type: 'user_direct' },
        { type: 'knowledge', knowledgeId: 'knowledge-2' }
      ];

      sources.forEach(source => {
        expect(source.type).toBeDefined();
      });
    });
  });

  describe('PondEntry type', () => {
    it('should handle PondEntry type', () => {
      const pondEntry: PondEntry = {
        id: 'pond-1',
        content: 'Unstructured content',
        vector: [0.1, 0.2, 0.3],
        timestamp: new Date(),
        source: 'crawler'
      };

      expect(pondEntry.content).toBe('Unstructured content');
      expect(pondEntry.vector).toHaveLength(3);
    });
  });
});
