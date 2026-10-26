# Продолжение работы WrCommunity — 26.10.2026

Сначала сверять `main`, открытые PR, CI, `AGENTS.md` и этот файл.

## Последняя подтверждённая публикация

- [PR #37](https://github.com/lolokeksu09/WrCommunity/pull/37) объединён с `main`: `9e19957c0e145e457eb157f89e851f284cd3ad63`.
- [RELEASE 40360153788](https://github.com/lolokeksu09/WrCommunity/actions/runs/40360153788) на этом SHA: `api-tests`, `browser-project (mobile-chromium)`, `browser-tests`, `integration`, `docker-smoke`, `deploy`, `vds-status` — success.
- `deploy` подтвердил публичный HTTPS, главную и login на 390/1440 px; `vds-status` сообщил `active_revision=9e19957c...`, `ready=true`, `recovery_required=false`. Это снимок проверки, не гарантия непрерывной доступности.
- Desktop Chromium E2E по прямому решению владельца **временно выключен до отдельного распоряжения**. `scripts/playwright.config.ts` сохраняет сам проект. Публичная read-only проверка 1440px при deploy — не весь Desktop E2E.
- Прежний [PR #38](https://github.com/lolokeksu09/WrCommunity/pull/38) закрыт без merge как устаревший дубликат CONTINUATION.

## Текущая задача — первый проход по дизайну

- Ветка `design/editorial-polish-2026-10-26`, база `9e19957c0e145e457eb157f89e851f284cd3ad63`.
- План: [2026-10-26-editorial-ui-polish.md](../superpowers/plans/2026-10-26-editorial-ui-polish.md).
- Изучены исходники `web/src/styles.css`, `main.tsx`, `social.tsx` и исторические скриншоты главной, LFG, клубов, профиля, логина и пустых состояний. Прямой текущий осмотр VDS в отдельном браузере недоступен; скриншоты 25.10 не выдавать за сегодняшние.
- Направление: сохранить v6 Editorial Social, повысить читаемость, контраст активных элементов и сенсорные размеры, уменьшить декоративный шум баннера, улучшить мобильную ленту и форму; без изменений API, DB, маршрутов или структуры навигации.
- Изменения ограничены стилями в `web/src/styles.css` и документацией; не заявлять о завершённых тестах без результатов CI на точном SHA.
- Дизайн-патч не объединять с `main` до успешной проверки и явного решения по направлению; не запускать отдельный Desktop E2E без разрешения владельца.

## Следующее действие

1. Сверить SHA design PR, проверить FAST `test:l1`, `check:ui`, `typecheck`, `build`.
2. Просмотреть CI mobile Chromium и приложенные визуальные свидетельства для 360/390/430; проверить клавиатуру, фокус и отсутствие overflow.
3. После подтверждения дизайна владельцем провести FULL Mobile+API+Docker и merge отдельным действием, затем RELEASE и VDS на точном SHA.
