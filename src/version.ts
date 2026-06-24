import * as fs from 'node:fs';
import * as path from 'node:path';

/** Read the package version at runtime (works from both dist/ and src/ via tsx). */
function readVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    return (JSON.parse(raw).version as string) ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION: string = readVersion();
