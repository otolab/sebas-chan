import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager } from './state-manager';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(async () => {
    stateManager = new StateManager();
    await stateManager.initialize();
  });

  describe('initialize', () => {
    it('should set initial state on initialization', () => {
      const state = stateManager.getState();
      expect(state).toContain('# sebas-chan State Document');
      expect(state).toContain('## 現在の状態');
      expect(state).toContain('システム: 起動中');
    });
  });

  describe('getState/updateState', () => {
    it('should get and update state', () => {
      const newState = '# Updated State\nTest content';
      stateManager.updateState(newState);

      expect(stateManager.getState()).toBe(newState);
    });

    it('should emit state:updated event on update', () => {
      const listener = vi.fn();
      stateManager.on('state:updated', listener);

      const previousState = stateManager.getState();
      const newState = '# New State';

      stateManager.updateState(newState);

      expect(listener).toHaveBeenCalledWith({
        previous: previousState,
        current: newState,
        timestamp: expect.any(Date),
      });
    });

    it('should update lastUpdate timestamp', () => {
      const beforeUpdate = stateManager.getLastUpdate();

      // 少し時間を置く
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);

      stateManager.updateState('New state');
      const afterUpdate = stateManager.getLastUpdate();

      expect(afterUpdate.getTime()).toBeGreaterThan(beforeUpdate.getTime());

      vi.useRealTimers();
    });
  });

  describe('appendToState', () => {
    it('should append content to existing section', () => {
      const initialState = `# State
## Section1
Initial content

## Section2
Other content`;

      stateManager.updateState(initialState);
      stateManager.appendToState('Section1', 'Additional content');

      const state = stateManager.getState();
      expect(state).toContain('Initial content');
      expect(state).toContain('Additional content');

      const lines = state.split('\n');
      const section1Index = lines.findIndex((l) => l === '## Section1');
      const section2Index = lines.findIndex((l) => l === '## Section2');
      const additionalIndex = lines.findIndex((l) => l === 'Additional content');

      expect(additionalIndex).toBeGreaterThan(section1Index);
      expect(additionalIndex).toBeLessThan(section2Index);
    });

    it('should create new section if not exists', () => {
      const initialState = '# State\n## Existing Section\nContent';
      stateManager.updateState(initialState);

      stateManager.appendToState('New Section', 'New content');

      const state = stateManager.getState();
      expect(state).toContain('## New Section');
      expect(state).toContain('New content');
    });

    it('should emit state:appended event', () => {
      const listener = vi.fn();
      stateManager.on('state:appended', listener);

      stateManager.appendToState('Test Section', 'Test content');

      expect(listener).toHaveBeenCalledWith({
        section: 'Test Section',
        content: 'Test content',
      });
    });

    it('should handle appending to last section', () => {
      const initialState = `# State
## First Section
Content1

## Last Section
Content2`;

      stateManager.updateState(initialState);
      stateManager.appendToState('Last Section', 'Additional');

      const state = stateManager.getState();
      const lines = state.split('\n');
      const lastSectionIndex = lines.findIndex((l) => l === '## Last Section');
      const additionalIndex = lines.findIndex((l) => l === 'Additional');

      expect(additionalIndex).toBeGreaterThan(lastSectionIndex);
      expect(additionalIndex).toBe(lines.length - 1); // 最後の行
    });
  });

  describe('getLastUpdate', () => {
    it('should return the timestamp of last update', () => {
      const before = new Date();
      stateManager.updateState('Test');
      const lastUpdate = stateManager.getLastUpdate();
      const after = new Date();

      expect(lastUpdate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lastUpdate.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
