# Продолжение работы WrCommunity

Перед изменениями прочитать [AGENTS](../../AGENTS.md), сверить фактический `main`, открытые PR и CI.

## Последняя завершённая поставка

- [PR #36](https://github.com/lolokeksu09/WrCommunity/pull/36) объединён 26.10.2026. `main`: `3bcf29661f3f5ac4c93580ee31c485cefd3cda5e`.
- [RELEASE 40344941160](https://github.com/lolokeksu09/WrCommunity/actions/runs/40344941160): API, desktop/mobile Chromium, browser-tests, integration, Docker smoke, deploy и vds-status — success. Публичная браузерная проверка со строгим TLS прошла в deploy job.

## Текущая задача: route code splitting + mobile loading UX

- План: [2026-10-26-route-code-splitting-mobile-ux.md](../superpowers/plans/2026-10-26-route-code-splitting-mobile-ux.md).
- PR: [#37](https://github.com/lolokeksu09/WrCommunity/pull/37), Ready for review.
- Ветка: `perf/route-splitting-mobile-ux-2026-10-26`; база `3bcf29661f3f5ac4c93580ee31c485cefd3cda5e`.
- 47 route component exports lazy-loaded; `Gate`/`useSession` вынесены в `auth-session.tsx`; reset state профиля — в `profile-editor-state.ts`; добавлен accessible Suspense fallback.
- Bundle guard `npm run check:bundle` подтверждает девять dynamic feature modules. Baseline `811.76 kB / 224.00 kB gzip`; after split `357.77 kB / 112.52 kB gzip` (примерно −55.9% raw, −49.8% gzip). Это размер entry, не процент ускорения реальной загрузки.
- Добавлен L2 mobile E2E: задерживает clubs JS chunk, проверяет loading status, сохранение навигации и отсутствие overflow.
- FAST [40349693137](https://github.com/lolokeksu09/WrCommunity/actions/runs/40349693137) passed на SHA `1e558727a6e3a12aed8369681442b2b852389008`.
- FULL [40349858840](https://github.com/lolokeksu09/WrCommunity/actions/runs/40349858840) на предыдущем SHA выявил подтверждённую ошибку Docker build context: `Dockerfile` не копировал `scripts/ci/check-route-splitting.mjs`, который вызывается из `npm run build`. Лог: `Cannot find module '/app/scripts/ci/check-route-splitting.mjs'`. Dockerfile теперь копирует этот скрипт в build stage; новый FULL должен подтвердить исправление на актуальном SHA.
- Локальный build и ручной визуальный просмотр не выполнялись в этой среде; CI browser evidence не выдавать за ручной просмотр.

## Следующее действие

1. Проверить последний HEAD PR #37 и дождаться FULL именно на нём: `api-tests`, desktop/mobile `browser-project`, `browser-tests`, `integration`, `docker-smoke`, `quality-gate` — все success.
2. Проверить новый mobile delayed-chunk E2E и browser artifacts.
3. При зелёном FULL сверить protection rules и объединить PR с expected head SHA.
4. После merge проверить RELEASE, deploy, строгий HTTPS и vds-status на точном merge SHA.
