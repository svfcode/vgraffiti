# vgraffiti

Расширение Chromium (Manifest V3): рисование поверх Google Maps / Street View; опционально — синхронизация по REST. Техническое задание: [`docs/tz.md`](docs/tz.md). Контракт API: [`docs/api.md`](docs/api.md).

## Разработка

Требуется Node.js 20+.

```bash
npm install
npm run dev
```

В Chrome: **Расширения → Режим разработчика → Загрузить распакованное** — указать папку `.output/chrome-mv3` (путь покажет WXT в консоли после `dev`).

## Сборка

```bash
npm run build
npm run zip
```

## Использование

1. **Сразу:** откройте Google Maps (подходящий URL, см. манифест) — появится оверлей рисования. Сервер и вход **не нужны**.
2. **По желанию:** откройте popup → разверните **«Вход»** → укажите API root → **Сохранить** → **Проверить адрес** (разрешите домен) → почта → код из письма → **Подтвердить**. После входа вместо блока «Вход» отображается **«Выйти»** и краткий статус сессии.

## Стек

- [WXT](https://wxt.dev/) + TypeScript  
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand) — штрихи с `pressure` (перо / планшет)
