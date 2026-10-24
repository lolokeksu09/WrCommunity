import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = files.filter((name) => /(^|\/)\.env(?:\..+)?$/.test(name) && name !== '.env.example');
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}\b/, /\bAKIA[0-9A-Z]{16}\b/];
for (const file of files) {
  if (file.startsWith('prototypes/') || file.startsWith('assets/') || /\.(png|jpg|jpeg|webp|gif|ico|woff2|lock)$/.test(file)) continue;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (patterns.some((pattern) => pattern.test(text))) forbidden.push(file);
}
if (forbidden.length) {
  console.error(`Potential secret material in: ${[...new Set(forbidden)].join(', ')}`);
  process.exitCode = 1;
} else console.log('No committed environment files or recognized credential patterns found.');
