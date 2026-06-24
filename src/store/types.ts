export type EventType =
  | 'session_start'
  | 'session_end'
  | 'prompt'
  | 'tool_use'
  | 'tool_result'
  | 'file_read'
  | 'file_edit'
  | 'bash'
  | 'test'
  | 'note';

export interface SessionInput {
  id: string;
  cwd: string;
  startedAt: string; // ISO-8601
  gitBranch?: string | null;
  gitCommit?: string | null;
  meta?: Record<string, unknown>;
}

export interface Session {
  id: string;
  cwd: string;
  startedAt: string;
  endedAt: string | null;
  gitBranch: string | null;
  gitCommit: string | null;
  meta?: Record<string, unknown>;
  /** Derived: number of events captured for this session. */
  eventCount: number;
}

export interface EventInput {
  sessionId: string;
  ts: string; // ISO-8601
  type: EventType;
  tool?: string | null;
  summary?: string | null;
  /** Redacted, JSON-serializable payload. */
  payload?: unknown;
  /** Map of redaction kind -> count applied to this event. */
  redactions?: Record<string, number>;
}

export interface LedgerEvent extends EventInput {
  id: number;
  seq: number;
}

export interface StoreStats {
  sessions: number;
  events: number;
  lastActivity: string | null;
}
