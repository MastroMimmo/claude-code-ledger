import { isInitialized, packsDir } from '../config';
import { redact, redactDeep, compileDetectors, type Detector } from '../redaction';
import type { EventInput, EventType } from '../store/types';
import { gitInfo } from './git';
import { loadConfig } from '../settings';
import { buildPack, writePack } from '../pack/pack';
import { appendPending, openSyncedStore } from './pending';

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

function mapTool(p: HookPayload, ts: string, detectors: Detector[]): EventInput {
  const tool = String(p.tool_name ?? 'tool');
  const input = (p.tool_input ?? {}) as Record<string, unknown>;
  const redactedInput = redactDeep(p.tool_input, detectors);
  const redactedResp = redactDeep(p.tool_response, detectors);
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

function mapEvent(
  eventName: string,
  p: HookPayload,
  ts: string,
  detectors: Detector[],
): EventInput | null {
  switch (eventName) {
    case 'SessionStart':
      return { sessionId: '', ts, type: 'session_start', summary: `source=${p.source ?? 'startup'}` };
    case 'UserPromptSubmit': {
      const r = redact(String(p.prompt ?? ''), detectors);
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
      return mapTool(p, ts, detectors);
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
  const config = loadConfig(cwd);
  const detectors = compileDetectors(
    config.redaction.customPatterns,
    config.redaction.disabledKinds,
  );

  // Lifecycle events close the session; no event row is written.
  if (eventName === 'Stop' || eventName === 'SessionEnd') {
    appendPending(cwd, { op: 'end', sessionId, cwd, ts: now });
    if (eventName === 'SessionEnd' && config.autoPack) {
      try {
        const store = openSyncedStore(cwd);
        try {
          const pack = buildPack(store, [sessionId]);
          if (pack.sessions.length > 0) writePack(pack, packsDir(cwd));
        } finally {
          store.close();
        }
      } catch {
        // auto-pack must never break the session
      }
    }
    return { captured: false };
  }

  const mapped = mapEvent(eventName, payload, now, detectors);
  if (!mapped) return { captured: false };

  // git is the expensive part, so resolve it only once, at session start.
  const git = eventName === 'SessionStart' ? gitInfo(cwd) : { branch: undefined, commit: undefined };
  appendPending(cwd, {
    op: 'event',
    sessionId,
    cwd,
    ts: now,
    gitBranch: git.branch ?? undefined,
    gitCommit: git.commit ?? undefined,
    type: mapped.type,
    tool: mapped.tool ?? undefined,
    summary: mapped.summary ?? undefined,
    payload: mapped.payload,
    redactions: mapped.redactions,
  });
  return { captured: true, type: mapped.type, redactions: mapped.redactions };
}
