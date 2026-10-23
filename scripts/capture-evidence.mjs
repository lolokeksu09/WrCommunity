import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, request } from '@playwright/test';
import pg from 'pg';

// Uses only synthetic accounts created by the browser acceptance suite.
if (process.env.NODE_ENV !== 'test') throw new Error('Screenshot evidence requires NODE_ENV=test and the dedicated test database');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
const output = resolve('docs/evidence/screens');
await mkdir(output, { recursive: true });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let fixture;
let announcement;
try {
  ({ rows: [fixture] } = await pool.query(`SELECT u.id,u.email,c.id AS club_id FROM clubs c JOIN users u ON u.id=c.owner_id
    WHERE c.state='active' AND u.status='active' AND u.email LIKE 'e2e-%@example.com' ORDER BY c.created_at DESC LIMIT 1`));
  ({ rows: [announcement] } = await pool.query(`SELECT id FROM lfg_announcements WHERE state='open' ORDER BY created_at DESC LIMIT 1`));
} finally { await pool.end(); }
if (!fixture || !announcement) throw new Error('Run the browser acceptance suite first to create its club and LFG fixtures');

const client = await request.newContext({ baseURL: origin });
const session = await (await client.get('/api/v1/auth/session')).json();
const login = await client.post('/api/v1/auth/login', {
  headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken },
  data: { email: fixture.email, password: 'WrCommunity-e2e-93!' },
});
if (!login.ok()) throw new Error(`Synthetic fixture login failed (${login.status()})`);
const storageState = await client.storageState();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const evidence = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const guest = await browser.newContext({ viewport });
    const member = await browser.newContext({ viewport, storageState });
    for (const screen of [
      { name: 'home', path: '/', context: guest },
      { name: 'empty', path: '/discover?q=evidence_no_match_' + randomUUID(), context: guest },
      { name: 'login', path: '/login', context: guest },
      { name: 'profile', path: '/users/' + fixture.id, context: member },
      { name: 'club', path: '/clubs/' + fixture.club_id, context: member },
      { name: 'lfg', path: '/lfg/' + announcement.id, context: member },
    ]) {
      const page = await screen.context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + screen.path, { waitUntil: 'networkidle' });
      await page.locator('main').waitFor({ state: 'visible', timeout: 15_000 });
      const state = await page.evaluate(() => ({
        heading: document.querySelector('main h1')?.textContent?.trim() || '',
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      if (!state.heading || state.heading.includes('недоступна')) throw new Error(`Unexpected ${screen.name} page: ${state.heading}`);
      if (state.scrollWidth > state.viewportWidth) throw new Error(`Horizontal overflow on ${screen.name} at ${viewport.width}px`);
      if (errors.length) throw new Error(`JavaScript errors on ${screen.name}: ${errors.join('; ')}`);
      const file = `${screen.name}-${viewport.width}.png`;
      await page.screenshot({ path: resolve(output, file), fullPage: false });
      evidence.push({ file, ...viewport, ...state, pageErrors: errors });
      console.log(`${file}: ${state.heading}; no horizontal overflow or JavaScript errors`);
      await page.close();
    }
    await guest.close();
    await member.close();
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ capturedAt: new Date().toISOString(), browserVersion: browser.version(), screens: evidence }, null, 2) + '\n');
} finally { await browser.close(); await client.dispose(); }
