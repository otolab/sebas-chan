/**
 * Core パッケージの基本型定義
 * 循環参照を避けるため、独立したファイルに定義
 */

// AgentEventのペイロード型定義
export type AgentEventPayload = Record<string, unknown>;

// エージェントイベントの型定義
export interface AgentEvent {
  type: string;
  payload: AgentEventPayload;
  timestamp: Date;
}