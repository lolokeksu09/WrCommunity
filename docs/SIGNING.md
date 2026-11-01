# Постоянная подпись APK

Android 3D Editor использует постоянный закрытый ключ разработчика. **Не добавляйте .jks, пароли или base64 ключ в GitHub-код.**

- Alias: `android-3d-editor`
- Fingerprint SHA-256: `E6:53:56:97:AB:4F:96:0F:89:AC:FC:5B:EE:3C:80:FF:E5:3E:62:EC:C7:C1:39:25:02:5B:91:E1:CC:98:D0:C5`
- Требование Android 11+ для targetSdk ≥30: подпись APK Scheme v2 или выше.
- Первоначальная debug-сборка подписывается **другим ключом**. При переходе на постоянную подпись Android потребует однократное удаление старой debug-версии. Сохраните все данные перед удалением.
- Используйте отдельные безопасные бэкапы ключа и пароля. Потеря ключа не позволит устанавливать новые версии поверх уже подписанных этим ключом.

## GitHub Actions: конфигурация подписи релизов

В GitHub → Settings → Secrets and variables → Actions → New repository secret добавьте:

1. `EDITOR_KEYSTORE_B64`: base64 содержимого `android-3d-editor-upload.jks` (одна строка, без перевода).
2. `EDITOR_STORE_PASSWORD`: пароль хранилища.
3. `EDITOR_KEY_PASSWORD`: пароль ключа.

После настройки secrets push в рабочую ветку автоматически создаёт `app-release.apk`, подписанный тем же ключом; `debug` остаётся тестовой сборкой. Pull request без secrets никогда не должен требовать ключа. Следите, чтобы PR с непроверенным кодом не попадали в разрешённые для подписанного build ветки.

## Локальная сборка

Настройте переменные `ANDROID_SIGNING_KEYSTORE_PATH`, `ANDROID_SIGNING_STORE_PASSWORD`, `ANDROID_SIGNING_KEY_PASSWORD`, затем `gradle :app:assembleRelease`. Проверка подписи: `apksigner verify --verbose --print-certs app-release.apk`. Результат должен содержать `Verified using v2 scheme: true`.

Не считать приложение установленным или протестированным по успешной подписи: проверка запуска и GLB — отдельная стадия.
