import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const password=randomBytes(24).toString('hex');
const content=`# Generated local configuration. Keep this file private.\nNODE_ENV=development\nHOST=127.0.0.1\nPORT=3000\nAPP_ORIGIN=http://localhost:3000\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://wrcommunity:${password}@127.0.0.1:5432/wrcommunity\nCOOKIE_SECRET=${randomBytes(48).toString('base64url')}\nLFG_CONTACT_KEY=${randomBytes(32).toString('hex')}\nMEDIA_STORAGE_DIR=./media\nWEB_ROOT=dist/web\nSMTP_HOST=127.0.0.1\nSMTP_PORT=1025\nSMTP_SECURE=false\nSMTP_REQUIRE_TLS=false\nSMTP_FROM=WrCommunity Local <no-reply@example.invalid>\n`;
try{await writeFile(new URL('../.env',import.meta.url),content,{flag:'wx',mode:0o600});console.log('Local configuration created. Start: docker compose -f compose.local.yml up -d --build');}
catch(error){if(error.code!=='EEXIST')throw error;console.log('Existing .env preserved. Check POSTGRES_PASSWORD, COOKIE_SECRET and LFG_CONTACT_KEY, then start compose.local.yml.');}
