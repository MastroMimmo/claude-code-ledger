import { isInitialized } from '../config';
import { openStore } from '../store/store';
import { redact, redactDeep } from '../redaction';
import type { EventInput, EventType } from '../store/types';
import { gitInfo } from './git';

/** Subset of the JSON payload Claude Code sends to hooks on stdin. */
export interface HookPayload {
  session_id?: string;
  hook_event_name?: string;
  cwd?: string;
  source?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  reason?: string;
  [key: string]: unknown;
}

export interface CaptureResult {
  captured: boolean;
  skipped?: boolean;
  type?: EventType;
  redactions?: Record<string, number>;
}

const SUMMARY_MAX = 280;
const RESPONSE_MAX = 2000;

function clip(s: string, n = SUMMARY_MAX): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function clipResponse(v: unknown): unknown {
  if (typeof v === 'string' && v.length > RESPONSE_MAX) {
    return v.slice(0, RESPONSE_MAX) + '…[truncated]';
  }
  return v;
}

function isTestCommand(cmd: string): boolean {
  return /\b(vitest|jest|pytest|mocha|go test|cargo test|npm (run )?test|pnpm (run )?test|yarn test|rspec|phpunit|gradle test|mvn test|dotnet test)\b/.test(
    cmd,
  );
}

function mergeCounts(into: Record<string, number>, from: Record<string, number>): void {
  for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n;
}

function mapTool(p: HookPayload, ts: string): EventInput {
  const tool = String(p.tool_name ?? 'tool');
  const input = (p.tool_input ?? {}) as Record<string, unknown>;
  const redactedInput = redactDeep(p.tool_input);
  const redactedResp = redactDeep(p.tool_response);
  const counts: Record<string, number> = {};
  mergeCounts(counts, redactedInput.redactions);
  mergeCounts(counts, redactedResp.redactions);

  let type: EventType = 'tool_use';
  let summary = tool;
  const redInputVal = redactedInput.value as Record<string, unknown> | undefined;

  if (tool === 'Bash') {
    summary = clip(String(redInputVal?.command ?? ''), 200);
    type = isTestCommand(String(input.command ?? '')) ? 'test' : 'bash';
  } else if (tool === 'Read') {
    type = 'file_read';
    summary = String(input.file_path ?? '');
  } else if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    type = 'file_edit';
    summary = String(input.file_path ?? input.notebook_path ?? '');
  }

  return {
    sessionId: '',
    ts,
    type,
    tool,
    summary,
    payload: { input: redactedInput.value, response: clipResponse(redactedResp.value) },
    redactions: counts,
  };
}

function mapEvent(eventName: string, p: HookPayload, ts: string): EventInput | null {
  switch (eventName) {
    case 'SessionStart':
      return { sessionId: '', ts, type: 'session_start', summary: `source=${p.source ?? 'startup'}` };
    case 'UserPromptSubmit': {
      const r = redact(String(p.prompt ?? ''));
      return {
        sessionId: '',
        ts,
        type: 'prompt',
        summary: clip(r.text),
        payload: { prompt: r.text },
        redactions: r.redactions,
      };
    }
    case 'PostToolUse':
      return mapTool(p, ts);
    default:
      // PreToolUse / Notification / SubagentStop / PreCompact / Stop / SessionEnd
      return null;
  }
}

/**
 * Ingest one Claude Code hook event: ensure the session exists, map+redact the
 * event, and persist it. Lifecycle events (Stop/SessionEnd) close the session.
 * Capture is skipped silently when the repo has no `.ledger/` store unless
 * `LEDGER_CAPTURE_AUTOINIT=1`.
 */
export function handleHook(event: string, payload: HookPayload): CaptureResult {
  const cwd = payload.cwd ?? process.cwd();
  if (!isInitialized(cwd) && process.env.LEDGER_CAPTURE_AUTOINIT !== '1') {
    return { captured: false, skipped: true };
  }

  const sessionId = payload.session_id ?? 'unknown';
  const eventName = payload.hook_event_name ?? event;
  const now = new Date().toISOString();
  const store = openStore(cwd);
  try {
    const git = gitInfo(cwd);
    store.upsertSession({
      id: sessionId,
      cwd,
      startedAt: now,
      gitBranch: git.branch,
      gitCommit: git.commit,
    });

    const mapped = mapEvent(eventName, payload, now);
    if (!mapped) {
      if (eventName === 'Stop' || eventName === 'SessionEnd') {
        store.endSession(sessionId, now);
      }
      return { captured: false };
    }

    mapped.sessionId = sessionId;
    const ev = store.addEvent(mapped);
    if (eventName === 'SessionEnd') store.endSession(sessionId, now);
    return { captured: true, type: ev.type, redactions: ev.redactions };
  } finally {
    store.close();
  }
}
