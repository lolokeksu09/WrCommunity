import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm, cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import pg from 'pg';

if (process.env.NODE_ENV !== 'test') throw new Error('Run backup verification only against a dedicated NODE_ENV=test database');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const source = new URL(process.env.DATABASE_URL);
const restoreName = `wrc_restore_${randomBytes(8).toString('hex')}`;
const schema = `wrc_backup_${randomBytes(8).toString('hex')}`;
const token = randomUUID();
const restoreUrl = new URL(source);
restoreUrl.pathname = `/${restoreName}`;
const directory = await mkdtemp(join(tmpdir(), 'wrc-backup-'));
const client = new pg.Client({ connectionString: source.toString() });
let restored;
let mediaProbe;

async function run(tool, args, input, output) {
  const container = process.env.PG_CLIENT_CONTAINER === 'true';
  const command = container ? 'docker' : (process.env[`${tool.toUpperCase()}_BIN`] || tool);
  const commandArgs = container ? ['run', '--rm', '--network', 'host', '-i', 'postgres:18.6-bookworm', tool, ...args] : args;
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    let error = '';
    child.stderr.on('data', data => { error += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${tool} failed (${code}): ${source.password ? error.replaceAll(source.password, '[redacted]') : error}`)));
    if (input) createReadStream(input).pipe(child.stdin); else child.stdin.end();
    if (output) child.stdout.pipe(createWriteStream(output, { mode: 0o600 })); else child.stdout.resume();
  });
}
async function manifest(root, prefix = '') {
  const result = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, await manifest(root, path));
    else if (entry.isFile()) result[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
    else throw new Error('Media backup encountered unsupported symlink or special file');
  }
  return result;
}
try {
  await client.connect();
  const { rows: [version] } = await client.query('SHOW server_version_num');
  if (Number(version.server_version_num) < 180000 || Number(version.server_version_num) >= 190000) throw new Error('Backup verification requires PostgreSQL 18');
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`CREATE TABLE ${schema}.probe (value text NOT NULL)`);
  await client.query(`INSERT INTO ${schema}.probe VALUES ($1)`, [token]);
  const dump = join(directory, 'database.dump');
  await run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--dbname', source.toString()], null, dump);
  await client.query(`CREATE DATABASE ${restoreName} TEMPLATE template0`);
  await run('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', restoreUrl.toString()], dump);
  restored = new pg.Client({ connectionString: restoreUrl.toString() });
  await restored.connect();
  const { rows } = await restored.query(`SELECT value FROM ${schema}.probe`);
  if (rows.length !== 1 || rows[0].value !== token) throw new Error('Restored database content differs');
  const originalTables = await client.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");
  const restoredTables = await restored.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");
  if (originalTables.rows[0].count !== restoredTables.rows[0].count) throw new Error('Restored table count differs');
  const media = resolve(process.env.MEDIA_STORAGE_DIR || process.env.MEDIA_DIR || 'media');
  await mkdir(media, { recursive: true });
  mediaProbe = join(media, `backup-restore-probe-${randomUUID()}`);
  await writeFile(mediaProbe, randomBytes(256), { mode: 0o600 });
  const copied = join(directory, 'media');
  await cp(media, copied, { recursive: true });
  const originalManifest = await manifest(media);
  const copiedManifest = await manifest(copied);
  if (JSON.stringify(originalManifest) !== JSON.stringify(copiedManifest)) throw new Error('Restored media checksums differ');
  console.log(`PostgreSQL 18 logical restore verified (${restoredTables.rows[0].count} public tables); ${Object.keys(originalManifest).length} private media files copied and checksum verified.`);
} finally {
  if (mediaProbe) await rm(mediaProbe, { force: true });
  if (restored) await restored.end().catch(() => {});
  await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()', [restoreName]).catch(() => {});
  await client.query(`DROP DATABASE IF EXISTS ${restoreName}`).catch(() => {});
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
  await client.end().catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
