# Документация WrCommunity

WrCommunity 1.0 работает как технический пилот: приложение, API/PostgreSQL/worker, CI и автоматическое развёртывание существуют. Эта страница разделяет действующие инструкции, утверждённые требования и историю. Открытый запуск зависит от условий STATUS.

## Работа с текущей версией

| Документ | Когда читать |
|---|---|
| [AGENTS](../AGENTS.md) | До работы: источник требований, план, локальная проверка, коммиты и доставка |
| [CONTINUATION](implementation/CONTINUATION.md) | При смене чата: снимок задачи и окончательный результат в связанном PR |
| [STATUS](implementation/STATUS.md) | Проверенная поставка, возможности и условия публичного запуска |
| [LOCAL-DEVELOPMENT](implementation/LOCAL-DEVELOPMENT.md) | Запуск актуальной сборки, отдельные API/E2E и снимки |
| [TESTING-STRATEGY](implementation/TESTING-STRATEGY.md) | Выбор целевых проверок, FAST/FULL/RELEASE и ограничения CI |
| [WEB](implementation/WEB.md) | Актуальное поведение UI, черновики и известные ограничения |
| [ROADMAP](ROADMAP.md) | Завершённые этапы и следующие решения владельца |
| [OPERATIONS](implementation/OPERATIONS.md) / [VDS-DEPLOYMENT](implementation/VDS-DEPLOYMENT.md) | Конфигурация, миграции, резервные копии и установленный механизм поставки |

## Требования, проектирование и прототип

- [Social Core v1](specs/social-core-v1.md): утверждённое социальное ядро, права и приватность
- [WrCommunity v1](specs/wrcommunity-v1/README.md): спецификации и архитектура; предложения внутри не становятся требованиями без принятия
- [Design Direction](design/design-direction-v1.md) и [BRAND](BRAND.md): выбранное направление и материалы; статус конкретного решения читать в самом документе
- [Главная v6](../prototypes/home/v6/README.md): исходный прототип, сохранённый как материал проектирования
- [Планы патчей](superpowers/plans/): согласованный объём и этапы; завершённый план не является активной задачей

## История

- [Реализация до PR #32](implementation/history/implementation-through-pr32.md)
- [Веб-интерфейс до PR #32](implementation/history/web-through-pr32.md)
- [Тестирование и замеры до PR #32](implementation/history/testing-through-pr32.md)
- [Исходная дорожная карта](implementation/history/original-roadmap.md)
- [Visual Directions](design/visual-directions-v1.md): архив альтернатив дизайна

Исторические статусы, размеры наборов и команды описывают соответствующий момент. Для действий используются текущие документы и конфигурация репозитория. Приватные данные/секреты остаются вне Git и публичных свидетельств; старый wild-rift-community является другим проектом.
