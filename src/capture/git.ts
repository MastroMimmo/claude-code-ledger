import { execFileSync } from 'node:child_process';

export interface GitInfo {
  branch: string | null;
  commit: string | null;
}

function run(args: string[], cwd: string): string | null {
  try {
    const out = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/** Best-effort git branch + short commit for `cwd`; nulls if not a repo. */
export function gitInfo(cwd: string): GitInfo {
  return {
    branch: run(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    commit: run(['rev-parse', '--short', 'HEAD'], cwd),
  };
}
