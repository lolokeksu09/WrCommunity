# План — минимальный Android 3D Editor

Режим **Full**: многосоставной новый проект. Исходная ветка `main` — закрытое состояние старого WrCommunity.

| ID | Требование | Наблюдаемый критерий | Проверка | Статус |
|---|---|---|---|---|
| REQ-001 | Новый проект в отдельной ветке без WR-кода | Независимый Android-модуль и документация | Git diff | В работе |
| REQ-002 | Импорт локальной GLB | Системный выбор файла, валидный GLB 2.0 принимается | Unit + Android | В работе |
| REQ-003 | Безопасный отказ на неверном файле | Чёткое сообщение, старое состояние не меняется | Unit + Android | Частично |
| REQ-004 | Просмотр со всех сторон | Модель видна, камера вращается/масштабируется | Физический Android | Не проверено |
| REQ-005 | Минимальный интерфейс, офлайн | Экран, кнопка импорта, подсказка без лишних функций | UI на устройстве | Не проверено |
| REQ-006 | Редактирование геометрии и экспорт | Исправление вершин и сохранение нового GLB | Будущие тесты | Не начато |

Этап A: правила/скелет/CI. Этап B: импорт и просмотр с проверкой на реальном GLB. Этап C: минимальные инструменты скульптинга с undo и корректным экспортом.

Текущая область PR — A и кодовая основа B; C не объявлять выполненным. Данные и сервер прежнего проекта не трогать. Никакого автоматического деплоя.


## v0.2 — рабочий экран и инструменты (PR #62)

| ID | Требование | Проверка | Статус |
|---|---|---|---|
| REQ-007 | UI редактора с контролами, 48 dp цели | Android CI + телефон | Код создан, устройство не проверено |
| REQ-008 | Трансформация глобального GLB | Unit-тест quaternion, undo и GLB export | Код создан, CI ожидается |
| REQ-009 | Export как новый GLB без порчи BIN | Round-trip и тест несущих бинарных данных | Код создан, CI ожидается |
| REQ-010 | Локальное эталонное изображение | Выбор Android + показать/скрыть | Код создан, устройство не проверено |
| REQ-011 | Undo/redo/reset и возврат камеры | Unit-тест истории, UI test | В работе |

Новая v0.2 меняет только трансформации сцены, не геометрию меша. Результат не является скульптингом. Не объявлять мобильные проверки пройденными по одной компиляции.

## v0.2.2 — решение конфликта сертификатов установки

Наблюдение владельца на Android: «Приложение не установлено, так как оно конфликтует с другим пакетом» при установке ранее подписанной v0.2.1. Проверка APK v0.1.0 debug и v0.2.1 выявила разные сертификаты. Сертификат установленной версии на телефоне не получен, поэтому диагноз вероятный.

REQ-012: новую установку выполнить без удаления пользовательских данных предыдущего приложения. Изменён **только** Android applicationId с `com.wrcommunity.editor` на `com.wrcommunity.editor.stable`; Kotlin namespace остался прежним. Название лаунчера — `3D Editor Stable`, версия 0.2.2 (code 6). Приложения будут существовать независимо. Внутреннее состояние старой версии автоматически не мигрирует, внешние файлы GLB не удаляются. Будущие релизы должны сохранять стабильный applicationId и сертификат.

Проверки: CI compile/unit; проверка фактического applicationId и подписи APK; установка рядом со старой версией на реальном Android остаётся неподтверждённой до устройства.

## v0.3.0 — material layer workbench (PR: separate feature branch)

| ID | Requirement | Acceptance | Status |
|---|---|---|---|
| REQ-013 | Material-group layer list on user GLBs | Read labels and primitive counts from GLB JSON | Code + unit tests |
| REQ-014 | Hide / solo / show all with undo | At least one layer remains visible, history correct | Code + unit tests |
| REQ-015 | Export GLB reflecting material visibility | Preserve BIN/geometry, only renderable primitive groups filtered | Code + unit tests |
| REQ-016 | 3D camera view presets | Front/right/back/left/top; SceneView manipulator reused | Code; device test pending |
| REQ-017 | Stable update | applicationId com.wrcommunity.editor.stable and same signing certificate | CI + apksigner; device pending |

Not geometry sculpting: groups map to glTF material assignments (some material groups may include unrelated surfaces).
Original user GLB is never overwritten. No VDS changes. Android screenshots/gestures and export round-trip still require hardware.

## v0.4.0 — material-group transformations

REQ-018: select one material group and edit x/y/z (step 0.02), rotate about Y (5°), scale (5%). Changes use new glTF child scene nodes and do not modify original vertex buffer or material textures.
REQ-019: PartHistory maintains independent undo, redo, per-part reset for up to 50 states.
REQ-020: non-destructive preview of visibility + part transforms, with cancellation/debouncing and bounded private cache.
REQ-021: exporting preserves visible material groups, part transforms and global transforms in a newly created GLB document.
REQ-022: keep `com.wrcommunity.editor.stable` and original certificate; require CI unit tests and an exact APK cert check before user delivery.

Limitations: groups follow material assignments. Unsupported animation, skin and morph targets rejected rather than silently broken. Device rendering and touch controls remain unverified until installed on real Android.
