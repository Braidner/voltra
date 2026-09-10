import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
if (process.platform !== 'darwin') {
  console.error('Voltra requires macOS for native Trash integration.');
  process.exit(1);
}
mkdirSync('.local', { recursive: true });
try {
  execFileSync('swiftc', ['scripts/trash.swift', '-o', '.local/trash-helper'], { stdio: 'inherit' });
  console.log('Native Trash helper ready. Next: npm run build && npm start');
} catch {
  console.error('Install Xcode Command Line Tools, then run npm run setup again.');
  process.exit(1);
}
