# Локальный запуск и проверка новой сборки

Руководство для разработчика и AI-агента: запустить текущие исходники, подготовить отдельные API/E2E и сохранить доказательства просмотра. Команды рассчитаны на Bash из корня репозитория. Требуются Node.js/npm из [package.json](../../package.json), Docker Engine и Compose v2 с поддержкой `up --wait`, Python 3 для L1. Docker должен быть запущен; `npm ci` устанавливает зависимости, но не Chromium.

## Запуск приложения

Полностью контейнерный вариант: [README](../../README.md#локальный-запуск-целиком-в-docker). Для API/worker на хосте запустите PostgreSQL и Mailpit, дождитесь готовности и соберите текущий код:

```bash
node scripts/setup-local.mjs
npm ci
docker compose -f compose.dev.yml --profile mail up -d --wait
npm run migrate
npm run build
npm start
```

В другом терминале из того же каталога: `npm run start:worker`. Сайт: http://localhost:3000, почта: http://localhost:8025, готовность API: http://localhost:3000/health/ready. Оба процесса читают `.env`; генератор сохраняет существующий файл. Если учётные данные `.env` не совпадают с уже созданным volume PostgreSQL, исправьте конфигурацию по [OPERATIONS](OPERATIONS.md), не удаляйте нужные данные ради перезапуска.

### Разработка интерфейса с Vite

После миграций запустите в отдельных терминалах:

```bash
APP_ORIGIN=http://localhost:5173 npm run dev
npm run dev:web
APP_ORIGIN=http://localhost:5173 npm run dev:worker
```

Откройте http://localhost:5173. Vite проксирует `/api` на порт 3000. Здесь `APP_ORIGIN` совпадает с адресом браузера; для просмотра production-сборки остановите dev-процессы, выполните `npm run build` и вернитесь к `npm start`/`start:worker` с origin из `.env`. Пересборка нужна после изменений перед проверкой готового артефакта. Разные режимы не запускаются одновременно на порту 3000.

## Изолированное тестовое окружение

Тесты создают фикстуры и могут очищать БД. Рецепт использует отдельную БД `wrcommunity_test`, PostgreSQL 15432, SMTP 11025, Mailpit 18025 и API 13000; media и heartbeat находятся в `var/`. Эти порты должны быть свободны. `.env.test` и `.env.test-compose.yml` игнорируются Git. Значения не берутся из production или `.env` разработки. Используйте отдельную оболочку без экспортированных переменных приложения: Node и Compose предпочитают унаследованные значения значениям файла.

### 1. Подготовить зависимости и переменные

```bash
npm ci
npm run build
mkdir -p var/test-media
npx playwright install --with-deps chromium
node --input-type=module <<'NODE'
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const password=randomBytes(24).toString('hex');
const env={NODE_ENV:'test',HOST:'127.0.0.1',PORT:'13000',
  APP_ORIGIN:'http://localhost:13000',E2E_BASE_URL:'http://localhost:13000',
  POSTGRES_USER:'wrcommunity',POSTGRES_DB:'wrcommunity_test',POSTGRES_PASSWORD:password,
  DATABASE_URL:`postgresql://wrcommunity:${password}@127.0.0.1:15432/wrcommunity_test`,
  COOKIE_SECRET:randomBytes(48).toString('base64url'),LFG_CONTACT_KEY:randomBytes(32).toString('hex'),
  SMTP_HOST:'127.0.0.1',SMTP_PORT:'11025',SMTP_SECURE:'false',SMTP_REQUIRE_TLS:'false',
  SMTP_FROM:'WrCommunity Test <no-reply@example.invalid>',E2E_MAILPIT_URL:'http://localhost:18025',
  MEDIA_STORAGE_DIR:'./var/test-media',MEDIA_DIR:'./var/test-media',WEB_ROOT:'dist/web',
  WORKER_HEARTBEAT_FILE:'./var/test-worker-heartbeat'};
writeFileSync('.env.test',Object.entries(env).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',
  {flag:'wx',mode:0o600});
NODE
```

Генератор откажется перезаписывать существующий `.env.test`: при повторном запуске используйте проверенный тестовый файл. Установка системных библиотек Chromium может потребовать прав администратора; учитывайте ограничения среды. Секреты не выводятся в лог.

### 2. Запустить отдельные PostgreSQL и Mailpit

Сохраните следующий YAML в `.env.test-compose.yml` в корне репозитория:

```yaml
services:
  postgres:
    image: postgres:18.6-bookworm
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?Use .env.test}
      POSTGRES_DB: ${POSTGRES_DB:?Use .env.test}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Use .env.test}
    ports: ['127.0.0.1:15432:5432']
    tmpfs: [/var/lib/postgresql]
    healthcheck:
      test: [CMD-SHELL, 'pg_isready -U wrcommunity -d wrcommunity_test']
      interval: 3s
      timeout: 3s
      retries: 20
  mailpit:
    image: axllent/mailpit:v1.31.5
    ports: ['127.0.0.1:11025:1025', '127.0.0.1:18025:8025']
```

```bash
docker compose --env-file .env.test -p wrcommunity-test -f .env.test-compose.yml up -d --wait
node --env-file=.env.test dist/server/db/migrate.js
```

PostgreSQL здесь хранится в tmpfs: данные этого тестового контейнера исчезнут при его остановке. Рецепт не подключает volumes разработки. Следите, чтобы командная оболочка не содержала посторонних `POSTGRES_*`: shell-переменные имеют приоритет при интерполяции Compose; согласуйте их с `.env.test` до старта.

### 3. Выполнить целевые API или E2E

Для одного API-теста достаточно готовой БД и миграций; HTTP-сервер отдельно не требуется:

```bash
npm run test:l1
node --env-file=.env.test --import tsx --test --test-concurrency=1 tests/social.test.ts
```

Для E2E запустите API и worker в двух отдельных терминалах, сохраняя рабочий каталог:

```bash
node --env-file=.env.test dist/server/index.js
```

```bash
node --env-file=.env.test dist/server/worker.js
```

В терминале тестов дождитесь готовности API и выберите нужный сценарий:

```bash
curl --fail --silent --show-error --retry 30 --retry-connrefused --retry-delay 1 http://localhost:13000/health/ready
node --env-file=.env.test scripts/ci/select-e2e.mjs L2 feed --project=mobile-chromium
```

`E2E_BASE_URL` задан в `.env.test`, поэтому Playwright использует этот API и не поднимает второй сервер на 3000. Почтовые сценарии читают http://localhost:18025; worker должен работать. API-прогоны с очисткой БД и E2E не выполняются одновременно. Команды L2/L3/affected из [TESTING-STRATEGY](TESTING-STRATEGY.md) запускайте с тем же окружением, например `node --env-file=.env.test scripts/ci/plan-affected.mjs --execute --files web/src/notifications.tsx`.

Если риск требует полного локального набора: `node --env-file=.env.test --import tsx --test --test-concurrency=1 tests/*.test.ts` и затем `node --env-file=.env.test node_modules/@playwright/test/cli.js test --config scripts/playwright.config.ts`. Это не заменяет обязательный FULL/RELEASE в CI. При недоступном Docker перечислите реально выполненную статическую проверку и ограничение; успешный CI не доказывает исполнение именно этого локального рецепта.

### 4. Завершить проверку

Остановите тестовые API/worker через Ctrl+C. Удалить только одноразовые контейнеры этого рецепта:

```bash
docker compose --env-file .env.test -p wrcommunity-test -f .env.test-compose.yml down
```

## Отчёт о локальном просмотре

Проверяйте новую сборку на изолированных данных. Зафиксируйте мобильный и десктопный viewport; при риске адаптивности используйте размеры из матрицы TESTING-STRATEGY. Сделайте и просмотрите снимки затронутых экранов после действий, включая ошибки/пустые состояния по области изменения.

В PR или точке продолжения укажите:

| Поле | Что записать |
|---|---|
| Исходники | Полный SHA; при dirty tree — изменённые файлы/патч, чтобы снимок можно было сопоставить со сборкой |
| Запуск | Команда сборки/старта, локальный URL, изолированная БД |
| Экран | Маршрут, ширина × высота viewport, роль тестового аккаунта |
| Действия и результат | Что выполнено, ожидаемое/фактическое поведение, pass/fail/not run |
| Свидетельства | Пути действительно просмотренных снимков и доступный артефакт CI/PR; приватные данные исключаются |
| Ограничения | Что не удалось запустить или просмотреть и почему |

Например, храните локальные снимки в игнорируемом `test-results/local-review/`. Для передачи другому чату приложите очищенные от приватных данных снимки как доступный артефакт: временный локальный путь сам по себе не гарантирует сохранность. Для правок только документации пишите «локальный UI не запускался» и перечисляйте документальные проверки.
