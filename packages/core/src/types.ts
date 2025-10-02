/**
 * Core パッケージの基本型定義
 *
 * イベント型定義は @sebas-chan/shared-types に移行済み
 */

import type { SystemEvent } from '@sebas-chan/shared-types';

/**
 * エージェントイベント
 * ワークフローで使用するイベント型
 * SystemEventの型エイリアスとして定義
 */
export type AgentEvent = SystemEvent;