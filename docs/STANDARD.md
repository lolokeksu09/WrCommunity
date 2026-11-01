# Установка Project Workflow Standard 1.4-rc3

**Канонический комплект**: [16 оригинальных файлов](../standards/project-workflow-v1.4-rc3/README.md) в `standards/project-workflow-v1.4-rc3/`; файлы не изменены относительно предоставленного архива.

В корне приложения `AGENTS.md` и `TESTING-LEVELS.md` содержат полный текст оригинальных нормативных правил. Пять файлов в `templates/` доступны по относительным ссылкам из корневого `AGENTS.md`.

Корневые `README.md` и `PROJECT.md` остаются адаптированными к Android 3D Editor; исходные версии сохранены в каноническом комплекте. Рабочий план: [docs/PLAN.md](PLAN.md).

## Проверка комплектности

```bash
python3 standards/project-workflow-v1.4-rc3/tools/check_standard.py standards/project-workflow-v1.4-rc3
```

Статическая проверка стандарта не проверяет поведение ИИ-агента и не заменяет Android-сборку, UI-тесты или тесты APK.
