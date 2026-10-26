# Premium 2.0 — воспроизводимый baseline перед редизайном

**Роль:** инструкция независимой визуальной проверки текущего WrCommunity. [План](../superpowers/plans/2026-10-26-premium-v2-preparation.md), [аудит](reviews/2026-10-26-premium-v2-audit.md), [дизайн-контракт](../design/premium-v2/design-contract.md), [сравнительный HTML-макет](../design/premium-v2/premium-preview.html).

## 1. Рабочая среда и источники

- Пакеты из точного `package-lock.json`, Node.js 24.x по `package.json`, npm 11.x.
- Для полнофункционального локального приложения нужны PostgreSQL 18, Mailpit и API. Использовать **только** изолированные тестовые данные и пути; не копировать production-БД, .env production, реальные письма или токены.
- [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) содержит штатную последовательность `npm ci`, `npm run build`, PostgreSQL/Mailpit и запуск тестового API `http://localhost:13000`; для простого просмотра интерфейса допустим `http://localhost:3000` из dev-контейнера.
- Не путать настоящий head GitHub, статический HTML prototype и screenshot из старого релиза. Указывать git SHA и состояние рабочей копии.

## 2. One-shot visual baseline (manual local)

После штатного запуска локального тестового сайта:

```bash
npm ci
npx playwright install chromium
WRC_BASELINE_URL=http://127.0.0.1:13000/ node scripts/ci/premium-visual-baseline.mjs
```

Создаёт **20 read-only screenshot** (5 гостевых маршрутов × 4 viewport 360×800, 390×844, 430×932, 1440×900) и `test-results/premium-baseline/report.json`. Просматриваются feed, discovery, LFG, clubs, login. Скрипт отклоняет внешние URL, HTTPS и credentials, не создаёт пользователей и не выполняет POST/PATCH/DELETE. Запускается вручную, не добавлен в автоматический desktop E2E. Результаты из development fixture нельзя выдавать за production.

Если оригинальный запуск отсутствует или browser/security policy блокирует localhost — указать причину, не записывать `pass`. Нельзя заменять этот шаг успешной компиляцией.

## 3. Измерения

Runner сообщает: JS pageerror, document scrollWidth/viewportWidth, broken images, число интерактивных элементов, диагностические LCP и CLS, если PerformanceObserver отдаёт значения. Это lab-наблюдения без контролируемой сети/CPU, **не** p75 field Web Vitals; INP не измеряется. `null` допустимо и означает отсутствие валидного значения, не 0 мс. Всегда фиксировать версию Chromium, условия фикстур и timestamp.

Для решения о выкатке Premium отдельно выполнить Lighthouse mobile/desktop и клавиатурную/скринридерную ручную проверку:
- Навигация Tab/Shift+Tab/Escape, пропуск к содержимому, фокус после закрытия меню, 200% zoom, безопасные зоны.
- Контраст текста ≥4.5:1 и UI-границ ≥3:1 **по фактическим вычисленным цветам**; проверка кандидатов из `tokens.json` тестом не заменяет аудит интерфейса.
- 44×44 px зоны интеракции, различимые состояния login, loading/error/empty, скрытые роли/поля не становятся публичными.
- Критерии лабораторного ориентира: LCP≤2.5с, CLS≤0.1; INP≤200мс применим к интерактивному/полевому измерению. Нельзя записывать успех без замера.

## 4. Release smoke QA-01

`scripts/live-site-check.mjs` больше не принимает непустой текст Loading за успешную главную. Контракт `scripts/ci/public-home-ready.mjs` проверяет **точный заголовок «Лента»**, пост **или реальное empty-state**, скрытую route-loading и отсутствие error alert; также сохраняются strict TLS, read-only, отсутствие overflow и реальная форма входа. Полезный контент появляется **до** production screenshot.

Защита от регрессии: `node --test tests/public-home-ready.test.mjs tests/premium-baseline-guard.test.mjs tests/premium-design-tokens.test.mjs`. При штатном `npm test` выполняются также все `*.test.mjs`. Тесты показывают контракт/ограничение локального URL, но конечное доказательство production — успешный [RELEASE](https://github.com/lolokeksu09/WrCommunity/actions).

## 5. Инкрементальные условия готовности для будущих UI PR

Сначала утвердить screen comparison, затем выделять токены в реальную CSS/компонентную систему и сравнить одинаковые screen-states до/после. Каждый новый экран отдельно проходит мобильные и desktop screenshots, экранную клавиатуру, ошибки, форму/права, нет горизонтального overflow. Desktop **manual snapshot** разрешён, но отдельный automated Desktop Chromium E2E **остаётся выключенным** по прямому решению владельца.

В текущем патче никакой proposal JSON и preview HTML не импортируется в основной React UI. Никакая авторизация/ACL, API, БД и product CSS не изменены.

## 6. Ограничения первого baseline

При аудите 26 октября исходники и production dist были получены локально, но Chromium не смог открыть localhost (`ERR_BLOCKED_BY_ADMINISTRATOR`); полноценный visual runner из этой среды не выполнен. Дополнение audit при этом основано на реальных CI E2E screenshot-артефактах, отдельно помеченных как синтетические. До дальнейшего редизайна необходимо получить **20 актуальных снимков** в поддерживаемой среде и сохранить отчёт с точным SHA.
