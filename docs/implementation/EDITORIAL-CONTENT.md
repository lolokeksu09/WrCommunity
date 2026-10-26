# Редакционное наполнение пилота WrCommunity

## Что публикуется

5 профилей с обозначением «Редакция» (не являются настоящими участниками), 3 тематических клуба и 24 содержательные публикации. Все данные хранятся в реальных таблицах PostgreSQL. Лайки, подписчики, комментарии, рейтинги и онлайн-показатели не фабрикуются. У аккаунтов `@example.invalid`, нет действующих паролей, нет SMTP и нет подтверждённого внешнего email. Пользователи могут читать материалы и присоединяться к открытым клубам при соблюдении общих требований приложения.

## Безопасная эксплуатация

Скрипт не является миграцией, не запускается автоматически при деплое и не имеет публичного HTTP endpoint. Его нужно запускать **однократно вручную** после успешного RELEASE и подтверждения `active_revision`, из доверенного root SSH-доступа к VDS.

Команда на самом VDS:
```sh
sh /opt/wrcommunity-releases/<ACTIVE_SHA_FROM_VDS_STATUS>/scripts/apply-editorial-content.sh --apply
```

Она сама сверит активную ревизию и вызовет `node scripts/editorial-seed.mjs --apply` внутри уже запущенного worker, используя существующий Docker Compose и непубличное `DATABASE_URL`. Ничего секретного в CLI вводить не нужно.

Для проверки без записи:
```sh
docker compose --project-directory /opt/wrcommunity-releases/<ACTIVE_SHA_FROM_VDS_STATUS> -p wrcommunity-local -f /opt/wrcommunity-releases/<ACTIVE_SHA_FROM_VDS_STATUS>/compose.local.yml -f /opt/wrcommunity-releases/<ACTIVE_SHA_FROM_VDS_STATUS>/compose.vds.yml -f /opt/wrcommunity-releases/<ACTIVE_SHA_FROM_VDS_STATUS>/compose.ip.yml -f /opt/wrcommunity-releases/<ACTIVE_SHA_FROM_VDS_STATUS>/compose.release.yml exec -T worker node scripts/editorial-seed.mjs
```

После запуска проверить `https://139.100.205.135/`, `/clubs` и публичные API `/api/v1/feed`, `/api/v1/clubs`: записи должны читаться гостем и соответствовать фактическим счётчикам 24/3. При повторном запуске `created` должен быть нулевым. Скрипт использует одну SQL-транзакцию с блокировкой, не переписывает чужие записи и не создаёт фиктивных взаимодействий. Если в БД есть коллизия с уже зарегистрированным именем/почтой, транзакция отменяется целиком.

Отдельного удаления не предусмотрено. Любой откат данных выполняется только по одобренному плану и после резервного копирования.
