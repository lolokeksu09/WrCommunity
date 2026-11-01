# Android 3D Editor — старт проекта

Минималистичное Android-приложение для работы с собственными 3D-моделями. Репозиторий `WrCommunity` используется повторно по решению владельца. Старое приложение Wild Rift Community в этой ветке не восстанавливается.

## Первый этап (v0.1, кандидат)

- Выбрать локальный файл `.glb` через системный файловый менеджер.
- Проверить заголовок glTF 2.0 до передачи в 3D-движок.
- Показать модель с материалами и вращением/масштабированием камеры.
- Работать без аккаунта, сервера, аналитики и разрешения на полный доступ к памяти.

**Важно:** v0.1 — только просмотрщик и безопасная точка для последующего редактирования геометрии. Кисти, экспорт изменённой модели и ретопология ещё не реализованы. Не выдавать просмотр за редактирование.

## Запуск

Android Studio с JDK 21 и SDK 36. Для CLI требуется Gradle 9.6.0:

```bash
gradle :app:assembleDebug :app:testDebugUnitTest
```

APK будет в `app/build/outputs/apk/debug/app-debug.apk`. CI также сохраняет APK как артефакт после успешной сборки.

## Рабочий стандарт

Полная редакция **Project Workflow Standard 1.4-rc3** установлена без изменений в [standards/project-workflow-v1.4-rc3/](standards/project-workflow-v1.4-rc3/README.md). Корневые [AGENTS.md](AGENTS.md) и [TESTING-LEVELS.md](TESTING-LEVELS.md) содержат полные правила. [PROJECT.md](PROJECT.md) адаптирован к Android 3D Editor; [подробности интеграции](docs/STANDARD.md). Актуальный [план](docs/PLAN.md).

## Стек

Kotlin, Jetpack Compose, [SceneView](https://github.com/sceneview/sceneview) / Filament для GLB. Никакого AR, Unity, WebView, VPN, Firebase или сервера.
