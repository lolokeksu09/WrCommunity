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

1. Проверить последний HEAD PR #37 и дождаться FULL именно на нём: `api-tests`, **включённый mobile** `browser-project`, `browser-tests`, `integration`, `docker-smoke`, `quality-gate` — все success. Desktop временно выключен по решению владельца.
2. Проверить новый mobile delayed-chunk E2E и browser artifacts.
3. При зелёном FULL сверить protection rules и объединить PR с expected head SHA.
4. После merge проверить RELEASE, deploy, строгий HTTPS и vds-status на точном merge SHA.

## Диагностика FULL для PR #37 (26.10.2026)

- FULL [40350273616](https://github.com/lolokeksu09/WrCommunity/actions/runs/40350273616) на `500b1f6850780a62cac6db75c5c66daedb801246`: API и docker-smoke успешно; оба browser-project упали на одном сценарии `tests/e2e/community-reliability.spec.ts` («уведомления и жалобы догружают историю...»). Desktop: 29 passed, 1 failed, 5 skipped; Mobile: 34 passed, 1 failed.
- Симптом: в проверке ожидается 63 уведомления, но остаётся 30; в момент начала ожидания DOM ещё пустой. Тест до изменения проверял `more.count()` без ожидания готовности lazy route — цикл мог не выполниться вообще. Это подтверждённый дефект синхронизации теста по исходному коду и логам, **не доказательство дефекта API**.
- Исправление в этом этапе: `await expect(more).toBeVisible()` до цикла догрузки. Оно должно дать корректную диагностику реального поведения. Проверить новым FULL на актуальном SHA; пока не заявлять успешное исправление.
- `main` остаётся на доставленном `3bcf29661f3f5ac4c93580ee31c485cefd3cda5e` до зелёного FULL и отдельного RELEASE.
- Полный FULL обязателен перед merge; для промежуточных правок предпочитать целевые тесты и Draft FAST. Не сокращать покрытие путём отключения упавшего сценария.

## Новое указание владельца — временно без Desktop (26.10.2026)

- Владелец потребовал не запускать отдельный Desktop Chromium E2E до следующего явного указания. Это переопределяет прежнюю политику обязательной desktop job для будущих CI-запусков; **не удалять** Playwright desktop project и тесты.
- Изменения в PR #37: CI matrix только `mobile-chromium`, browser-tests подтверждает активный mobile runner; AGENTS/TESTING-STRATEGY синхронизированы, добавлен L1 guard. Обязательные `api-tests`, `docker-smoke`, `integration`, `quality-gate` не отключаются.
- Предыдущий FULL [40353885484](https://github.com/lolokeksu09/WrCommunity/actions/runs/40353885484) для `20856ae61d66ec73d813d45bed59743dd5027606` был в процессе: API, mobile, Docker = success; desktop установка Chromium затянулась. После коммита с новым режимом требуется новый FULL на точном SHA; старые результаты не дают права merge.
- Публичный read-only RELEASE smoke по HTTPS (390/1440px) остаётся включённым; это не отдельный desktop E2E suite. Desktop-регрессионное покрытие временно снижается.
- Следующее действие: проверить CI для нового коммита, затем после обязательного FULL принять решение о merge PR #37; до зелёного FULL `main` не изменять.
