# Продолжение работы WrCommunity

Перед изменениями прочитать [AGENTS](../../AGENTS.md), сверить фактический `main`, открытые PR и CI.

## Последняя завершённая поставка

- [PR #36](https://github.com/lolokeksu09/WrCommunity/pull/36) объединён 26.10.2026. `main`: `3bcf29661f3f5ac4c93580ee31c485cefd3cda5e`.
- [RELEASE 40344941160](https://github.com/lolokeksu09/WrCommunity/actions/runs/40344941160): API, desktop/mobile Chromium, browser-tests, integration, Docker smoke, deploy и vds-status — success. Публичная браузерная проверка со строгим TLS прошла в deploy job. Quality-gate на push в main skipped ожидаемо, поскольку это PR-only job.
- PR #36 добавил явные размеры изображений, перенос длинного текста и CI-проверку UI. Повторять его не нужно.

## Текущая задача: route code splitting + mobile loading UX

- План: [2026-10-26-route-code-splitting-mobile-ux.md](../superpowers/plans/2026-10-26-route-code-splitting-mobile-ux.md).
- PR: [#37](https://github.com/lolokeksu09/WrCommunity/pull/37), draft.
- Ветка: `perf/route-splitting-mobile-ux-2026-10-26`.
- База: `3bcf29661f3f5ac4c93580ee31c485cefd3cda5e`.
- Изменено: 47 page component exports используют typed `React.lazy`; `Gate`/`useSession` вынесены в `auth-session.tsx`; reset state профиля вынесен в `profile-editor-state.ts`; мобильная оболочка и навигация сохраняются во время загрузки route chunk, статус доступен скринридеру.
- Добавлен manifest guard `npm run check:bundle`: на CI он подтвердил 9 отдельных dynamic imports. Vite build now emits manifest.
- Baseline до split: [CI 40339802596](https://github.com/lolokeksu09/WrCommunity/actions/runs/40339802596), SHA `43b953e17bada1f4eafcad2a2cdc5b425b0fa5ef`: entry JS `811.76 kB` raw / `224.00 kB` gzip.
- После split: [CI 40349035716](https://github.com/lolokeksu09/WrCommunity/actions/runs/40349035716), SHA `1b591118dcd9f8db315dfb698d8b6e6e52a66935`: Vite entry JS `357.77 kB` raw / `112.52 kB` gzip, снижение около 55.9% raw и 49.8% gzip. Bundle guard: `357774` raw / `111411` gzip bytes (Node gzip default).
- FAST [40349035716](https://github.com/lolokeksu09/WrCommunity/actions/runs/40349035716) passed: secret scan, UI guideline check, typecheck, production web/server build, bundle guard. Из-за draft PR FULL (API, desktop/mobile Chromium, browser-tests, integration, Docker, quality-gate) ещё не запускался.
- Локальный build и ручной визуальный просмотр в этой среде не выполнялись; это не следует представлять как проверенный результат. После перевода PR в Ready проверить CI browser evidence для mobile/desktop.
- API, БД, серверные маршруты, auth policy и production-конфигурация не менялись.

## Следующее действие

1. Проверить, что последний commit этого документационного обновления имеет успешный FAST; документационные коммиты также запускают проверку нового SHA.
2. Перевести PR #37 в Ready и дождаться FULL на его актуальном head: `api-tests`, desktop/mobile `browser-project`, `browser-tests`, `integration`, `docker-smoke`, `quality-gate` — все success.
3. Проверить browser evidence и доступность маршрутов/redirects. Если визуальная ручная проверка недоступна, зафиксировать это ограничение.
4. После merge проверить RELEASE, deploy, строгий HTTPS и vds-status на точном merge SHA.
