# Продолжение работы WrCommunity

Перед изменениями прочитать [AGENTS](../../AGENTS.md), сверить фактический `main`, открытые PR и CI.

## Последняя завершённая поставка

- [PR #36](https://github.com/lolokeksu09/WrCommunity/pull/36) объединён 26.10.2026. Текущий `main` на момент продолжения: `3bcf29661f3f5ac4c93580ee31c485cefd3cda5e`.
- [RELEASE 40344941160](https://github.com/lolokeksu09/WrCommunity/actions/runs/40344941160): API, desktop/mobile Chromium, browser-tests, integration и Docker smoke — success; deploy и vds-status — success. В deploy job также прошла браузерная проверка публичного сайта со строгим TLS. Quality-gate на push в main skipped ожидаемо, поскольку это PR-only job.
- PR #36 добавил явные размеры изображений, перенос длинного текста, `npm run check:ui` и обновил документацию. Повторять его не нужно.

## Текущая задача: route code splitting + mobile loading UX

- План: [2026-10-26-route-code-splitting-mobile-ux.md](../superpowers/plans/2026-10-26-route-code-splitting-mobile-ux.md).
- PR: [#37](https://github.com/lolokeksu09/WrCommunity/pull/37), draft.
- Ветка: `perf/route-splitting-mobile-ux-2026-10-26`.
- База: `3bcf29661f3f5ac4c93580ee31c485cefd3cda5e`.
- Последний кодовый коммит: `26331930246e7b88df0254ff2258cef1fb388e6b` — typed lazy imports для 47 page component exports; `Gate`/`useSession` вынесены в `auth-session.tsx`; сброс профиля — в `profile-editor-state.ts`.
- Коммит bundle guard/UI fallback: `1763e09e93ff3f0a2fa2a60bed97ac106d89294a` — Vite manifest, `npm run check:bundle`, проверка 9 динамических route modules и доступный Suspense fallback, сохраняющий оболочку/навигацию.
- FAST [40348065024](https://github.com/lolokeksu09/WrCommunity/actions/runs/40348065024) на SHA `1763e09e93ff3f0a2fa2a60bed97ac106d89294a` завершился failure на `npm run build`; локальные логи не были доступны. Причина, обнаруженная при разборе кода: guard ожидал `isEntry` у `main.tsx`, хотя HTML entry — `web/index.html`. Поиск в guard исправлен: сначала ищется `index.html` с `isEntry`, затем `main.tsx` как fallback. Повторно проверить CI на новом HEAD; не считать фикс подтверждённым до зелёной сборки.
- Локальный build и ручной визуальный просмотр в этой среде не выполнялись. Не заявлять снижение размера в процентах до получения baseline; bundle check должен вывести фактические raw/gzip размеры на новом build.
- API, БД, серверные маршруты, политика авторизации и production-конфигурация не меняются.

## Следующее действие

1. Убедиться, что все внутренние импорты `Gate`/`useSession` используют лёгкий модуль и нет неиспользуемых импортов.
2. Проверить FAST на точном последнем SHA: typecheck, UI check, build и bundle guard; исправить все ошибки.
3. После FAST отметить PR #37 ready и дождаться полного FULL: API, desktop/mobile Chromium, browser-tests, integration, docker-smoke, quality-gate — все success на одном head.
4. Просмотреть CI browser evidence и проверить навигацию/loader/redirect на мобильном и desktop. Если ручной локальный просмотр недоступен, описать фактическую альтернативу.
5. После merge проверить RELEASE, deploy, строгий HTTPS и vds-status на точном merge SHA. Не смешивать зелёный PR CI с фактом публикации.
