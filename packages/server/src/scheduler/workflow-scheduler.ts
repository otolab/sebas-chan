import {
  WorkflowSchedulerInterface,
  Schedule,
  ScheduleResult,
  ScheduleOptions,
  ScheduleFilter,
  ScheduleInterpretation,
  ScheduleAction,
} from '@sebas-chan/shared-types';
import { compile } from '@moduler-prompt/core';
import { EventEmitter } from 'events';
import { DBClient } from '@sebas-chan/db';
import type { DriverFactory } from '@sebas-chan/core';
import { nanoid } from 'nanoid';

export class WorkflowScheduler implements WorkflowSchedulerInterface {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private dbClient: DBClient;

  constructor(
    private driverFactory: DriverFactory,
    private eventEmitter: EventEmitter,
    dbClient?: DBClient
  ) {
    // DBClientの初期化（既存のインスタンスを使うか新規作成）
    this.dbClient = dbClient || new DBClient();
  }

  async initialize(): Promise<void> {
    // DBを初期化
    await this.dbClient.connect();

    // schedulesテーブルを確認（自動作成される）
    const status = await this.dbClient.getStatus();
    console.log('Scheduler DB Status:', status);

    // 起動時に既存スケジュールを復元
    await this.restoreSchedules();

    // 定期的にスケジュールをチェック（1分ごと）
    this.checkInterval = setInterval(() => {
      this.checkSchedules().catch(console.error);
    }, 60000);
  }

  async shutdown(): Promise<void> {
    // 全タイマーをクリア
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    // 定期チェックを停止
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async schedule(
    issueId: string,
    request: string,
    action: ScheduleAction,
    options?: ScheduleOptions
  ): Promise<ScheduleResult> {
    // 重複チェック（dedupeKeyを使用）
    if (options?.dedupeKey) {
      const existing = await this.findByDedupeKey(issueId, options.dedupeKey);
      if (existing) {
        await this.cancel(existing.id);
      }
    }

    // 自然言語を解釈
    const interpretation = await this.interpretScheduleRequest(
      request,
      options?.timezone || 'Asia/Tokyo'
    );

    if (!interpretation.next) {
      throw new Error(`スケジュールを決定できませんでした: ${request}`);
    }

    // DBに保存
    const schedule = await this.createSchedule({
      issueId,
      request,
      action,
      nextRun: new Date(interpretation.next),
      lastRun: null,
      pattern: interpretation.pattern || undefined,
      status: 'active',
      dedupeKey: options?.dedupeKey,
      maxOccurrences: options?.maxOccurrences,
      occurrences: 0,
    });

    // タイマーをセット
    await this.setTimer(schedule);

    return {
      scheduleId: schedule.id,
      interpretation: interpretation.interpretation,
      nextRun: new Date(interpretation.next),
      pattern: interpretation.pattern || undefined,
    };
  }

  private async interpretScheduleRequest(
    request: string,
    timezone: string
  ): Promise<ScheduleInterpretation> {
    // driverFactoryが適切なドライバーを選択
    const driver = await this.driverFactory({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'local_execution'],
    });

    const schema = {
      type: 'object',
      properties: {
        next: {
          type: 'string',
          description: '次回実行時刻（ISO8601形式）',
        },
        pattern: {
          type: ['string', 'null'],
          description: '繰り返しパターン（例：毎日、毎週月曜）',
        },
        interpretation: {
          type: 'string',
          description: '解釈の日本語説明',
        },
      },
      required: ['next', 'interpretation'],
    } as const;

    const promptModule = {
      instructions: [
        `
現在時刻: ${new Date().toISOString()}
タイムゾーン: ${timezone}

スケジュール要求: "${request}"

次回実行時刻を決定してください。
繰り返しの場合はパターンも識別してください。

例：
- "5分後" → 現在時刻の5分後
- "明日の10時" → 翌日の10:00
- "毎朝9時" → 次の9:00、パターン: "毎朝9時"
- "来週の月曜日" → 次の月曜日
`,
      ],
      output: {
        schema,
      },
    };

    const compiled = compile(promptModule);
    const result = await driver.query(compiled, { temperature: 0.2 });

    if (result.structuredOutput) {
      return result.structuredOutput as ScheduleInterpretation;
    }
    return JSON.parse(result.content) as ScheduleInterpretation;
  }

  private async createSchedule(
    schedule: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Schedule> {
    const id = nanoid();
    const now = new Date();

    const scheduleData = {
      id,
      issue_id: schedule.issueId,
      request: schedule.request,
      action: schedule.action,
      next_run: schedule.nextRun?.toISOString() || null,
      last_run: schedule.lastRun?.toISOString() || null,
      pattern: schedule.pattern || null,
      occurrences: schedule.occurrences,
      max_occurrences: schedule.maxOccurrences || null,
      dedupe_key: schedule.dedupeKey || null,
      status: schedule.status,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    // LanceDBに保存
    await this.dbClient.addSchedule(scheduleData);

    return {
      ...schedule,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  private async updateSchedule(schedule: Schedule): Promise<void> {
    const updateData = {
      next_run: schedule.nextRun?.toISOString() || null,
      last_run: schedule.lastRun?.toISOString() || null,
      occurrences: schedule.occurrences,
      status: schedule.status,
      updated_at: new Date().toISOString(),
    };

    // LanceDBで更新
    await this.dbClient.updateSchedule(schedule.id, updateData);
    schedule.updatedAt = new Date();
  }

  private async findByDedupeKey(issueId: string, dedupeKey: string): Promise<Schedule | null> {
    const results = await this.dbClient.searchSchedules({
      issue_id: issueId,
      dedupe_key: dedupeKey,
      status: 'active',
      limit: 1,
    });

    if (results && results.length > 0) {
      return this.rowToSchedule(results[0]);
    }
    return null;
  }

  private async findById(id: string): Promise<Schedule | null> {
    const result = await this.dbClient.getSchedule(id);
    if (result) {
      return this.rowToSchedule(result);
    }
    return null;
  }

  private async findActive(): Promise<Schedule[]> {
    const results = await this.dbClient.searchSchedules({
      status: 'active',
      limit: 1000,
    });

    return results.map((row: any) => this.rowToSchedule(row));
  }

  private async findDue(): Promise<Schedule[]> {
    const now = new Date();
    const activeSchedules = await this.findActive();

    // next_runが現在時刻を過ぎているものをフィルタ
    return activeSchedules.filter((schedule) => schedule.nextRun && schedule.nextRun <= now);
  }

  private rowToSchedule(row: any): Schedule {
    return {
      id: row.id,
      issueId: row.issue_id,
      request: row.request,
      action: row.action,
      nextRun: row.next_run ? new Date(row.next_run) : null,
      lastRun: row.last_run ? new Date(row.last_run) : null,
      pattern: row.pattern || undefined,
      occurrences: row.occurrences,
      maxOccurrences: row.max_occurrences || undefined,
      dedupeKey: row.dedupe_key || undefined,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private async setTimer(schedule: Schedule): Promise<void> {
    if (!schedule.nextRun || schedule.status !== 'active') return;

    const delayMs = schedule.nextRun.getTime() - Date.now();

    // 過去の時刻はスキップ
    if (delayMs < 0) {
      console.warn(`Schedule ${schedule.id} is in the past, executing immediately`);
      await this.executeSchedule(schedule);
      return;
    }

    // Node.jsタイマーの最大値（約24.8日）以内なら直接セット
    if (delayMs < 2147483647) {
      const timer = setTimeout(async () => {
        await this.executeSchedule(schedule);
      }, delayMs);

      this.timers.set(schedule.id, timer);
    }
    // それ以上の場合は定期チェックで処理
  }

  private async executeSchedule(schedule: Schedule): Promise<void> {
    try {
      // イベントを発行
      this.eventEmitter.emit('workflow:trigger', {
        type: 'SCHEDULE_TRIGGERED',
        payload: {
          issueId: schedule.issueId,
          scheduleId: schedule.id,
          action: schedule.action,
          originalRequest: schedule.request,
        },
      });

      // 実行回数を更新
      schedule.occurrences++;
      schedule.lastRun = new Date();

      // 次回実行を計算
      if (
        schedule.pattern &&
        (!schedule.maxOccurrences || schedule.occurrences < schedule.maxOccurrences)
      ) {
        const nextInterpretation = await this.interpretScheduleRequest(
          schedule.pattern,
          'Asia/Tokyo'
        );

        schedule.nextRun = new Date(nextInterpretation.next);
        await this.updateSchedule(schedule);
        await this.setTimer(schedule);
      } else {
        // 完了
        schedule.status = 'completed';
        schedule.nextRun = null;
        await this.updateSchedule(schedule);
        this.timers.delete(schedule.id);
      }
    } catch (error) {
      console.error(`Failed to execute schedule ${schedule.id}:`, error);
      // エラーでも継続（リトライロジックは別途検討）
    }
  }

  private async checkSchedules(): Promise<void> {
    // 実行時刻を過ぎたスケジュールを取得
    const dueSchedules = await this.findDue();

    for (const schedule of dueSchedules) {
      if (!this.timers.has(schedule.id)) {
        await this.executeSchedule(schedule);
      }
    }
  }

  private async restoreSchedules(): Promise<void> {
    // アクティブなスケジュールを復元
    const activeSchedules = await this.findActive();

    for (const schedule of activeSchedules) {
      await this.setTimer(schedule);
    }
  }

  async cancel(scheduleId: string): Promise<boolean> {
    const timer = this.timers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduleId);
    }

    const schedule = await this.findById(scheduleId);
    if (schedule && schedule.status === 'active') {
      schedule.status = 'cancelled';
      await this.updateSchedule(schedule);
      return true;
    }

    return false;
  }

  async listByIssue(issueId: string): Promise<Schedule[]> {
    return this.list({ issueId });
  }

  async cancelByIssue(issueId: string): Promise<void> {
    const schedules = await this.listByIssue(issueId);
    for (const schedule of schedules) {
      if (schedule.status === 'active') {
        await this.cancel(schedule.id);
      }
    }
  }

  async list(filter?: ScheduleFilter): Promise<Schedule[]> {
    // フィルタに基づいて検索
    const searchFilter: any = {};
    if (filter?.status) {
      searchFilter.status = filter.status;
    }
    if (filter?.issueId) {
      searchFilter.issue_id = filter.issueId;
    }
    if (filter?.action) {
      searchFilter.action = filter.action;
    }

    const results = await this.dbClient.searchSchedules({
      ...searchFilter,
      limit: 1000,
    });

    let schedules = results.map((row: any) => this.rowToSchedule(row));

    // 日付フィルタを適用
    if (filter?.createdAfter) {
      schedules = schedules.filter((s) => s.createdAt >= filter.createdAfter!);
    }
    if (filter?.createdBefore) {
      schedules = schedules.filter((s) => s.createdAt <= filter.createdBefore!);
    }

    return schedules;
  }
}
