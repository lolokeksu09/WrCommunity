import { cp, mkdir } from 'node:fs/promises';
await mkdir(new URL('../dist/server/db/migrations/', import.meta.url), { recursive: true });
await cp(new URL('../server/db/migrations/', import.meta.url), new URL('../dist/server/db/migrations/', import.meta.url), { recursive: true });
