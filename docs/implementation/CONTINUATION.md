# Продолжение работы WrCommunity

Перед изменениями прочитать [AGENTS](../../AGENTS.md), сверить фактический `main`, открытые PR и CI.

## Последняя завершённая поставка

- [PR #36](https://github.com/lolokeksu09/WrCommunity/pull/36) объединён 26.10.2026. `main`: `3bcf29661f3f5ac4c93580ee31c485cefd3cda5e`.
- [RELEASE 40344941160](https://github.com/lolokeksu09/WrCommunity/actions/runs/40344941160): API, desktop/mobile Chromium, browser-tests, integration, Docker smoke, deploy и vds-status — success. Публичная браузерная проверка со строгим TLS прошла в deploy job. Quality-gate на push в main skipped ожидаемо, поскольку это PR-only job.

## Текущая задача: route code splitting + mobile loading UX

- План: [2026-10-26-route-code-splitting-mobile-ux.md](../superpowers/plans/2026-10-26-route-code-splitting-mobile-ux.md).
- PR: [#37](https://github.com/lolokeksu09/WrCommunity/pull/37), Ready for review.
- Ветка: `perf/route-splitting-mobile-ux-2026-10-26`.
- База: `3bcf29661f3f5ac4c93580ee31c485cefd3cda5e`.
- Реализация: 47 page component exports используют typed `React.lazy`; `Gate`/`useSession` вынесены в `auth-session.tsx`; reset state профиля — в `profile-editor-state.ts`; доступный Suspense fallback сохраняет оболочку и навигацию во время загрузки route chunk.
- `npm run check:bundle` проверяет 9 динамических feature modules и печатает размеры entry.
- Baseline: [CI 40339802596](https://github.com/lolokeksu09/WrCommunity/actions/runs/40339802596), SHA `43b953e17bada1f4eafcad2a2cdc5b425b0fa5ef`: `811.76 kB` raw / `224.00 kB` gzip.
- После split: [CI 40349035716](https://github.com/lolokeksu09/WrCommunity/actions/runs/40349035716), SHA `1b591118dcd9f8db315dfb698d8b6e6e52a66935`: `357.77 kB` raw / `112.52 kB` gzip (примерно −55.9% raw, −49.8% gzip). Это размер entry, не процент ускорения реальной загрузки.
- Добавлен L2 mobile E2E в `tests/e2e/mobile-create-navigation.spec.ts`: задерживает clubs JS chunk и проверяет loading status, сохранение мобильной навигации и отсутствие overflow.
- FAST [40349693137](https://github.com/lolokeksu09/WrCommunity/actions/runs/40349693137) passed на SHA `1e558727a6e3a12aed8369681442b2b852389008`.
- FULL [40349858840](https://github.com/lolokeksu09/WrCommunity/actions/runs/40349858840) выполнялся на SHA `1e558727a6e3a12aed8369681442b2b852389008`. Этот documentation commit изменит head, поэтому перед merge нужно дождаться FULL на новом SHA.
- Локальный build и ручной визуальный просмотр не выполнялись в этой среде; не представлять CI browser checks как ручной просмотр.

## Следующее действие

1. Проверить последний HEAD PR #37 и дождаться FULL для него: `api-tests`, desktop/mobile `browser-project`, `browser-tests`, `integration`, `docker-smoke`, `quality-gate` — все success.
2. Проверить E2E browser evidence, включая новый delayed-chunk mobile scenario.
3. При успешном FULL сверить protection rules и объединить PR с expected head SHA.
4. Проверить RELEASE точного merge SHA, deploy, строгий HTTPS и vds-status. Если deploy/status skipped или failure, сообщить фактический статус.
