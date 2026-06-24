/**
 * Side-effect module: silence the one-time ExperimentalWarning emitted by
 * `node:sqlite`. Import this BEFORE requiring `node:sqlite`.
 */
const originalEmitWarning = process.emitWarning;

process.emitWarning = function patchedEmitWarning(
  warning: string | Error,
  ...args: unknown[]
): void {
  const text = typeof warning === 'string' ? warning : warning.message;
  if (typeof text === 'string' && text.includes('SQLite is an experimental feature')) {
    return;
  }
  // Forward everything else unchanged.
  return (originalEmitWarning as (...a: unknown[]) => void).call(process, warning, ...args);
} as typeof process.emitWarning;
