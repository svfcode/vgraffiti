# vgraffiti

**Запомнят все, запомнят всё!**

Расширение Chrome для тех, кому нужно **запомнить и не забыть**. Вы идёте по Google Street View — как по знакомой тропе — и оставляете **надписи и рисунки прямо на месте**. В следующую прогулку увидите их там же: не в блокноте, не в приложении, **на пути**.

Мозг человека эволюционно заточен под запоминание **маршрутов**. vgraffiti возвращает этот древний способ: поворот у валуна, трещина в скале, надпись на стене — память оживает с первого взгляда.

## Кому подходит

Ученикам и учителям, инженерам и художникам — всем, кому надо удержать в голове слова, формулы, маршруты и образы.

## Как начать

1. **Зарегистрируйтесь** на [vgraffiti.ru](https://vgraffiti.ru).
2. **Установите расширение** в Chrome — [инструкция на сайте](https://vgraffiti.ru/kak-ustanovit-rasshirenie/).
3. **Откройте Street View** в Google Maps — справа появится панель рисования.
4. **Гуляйте и рисуйте** — метки останутся на маршруте и синхронизируются с профилем на сайте.

## Что умеет

- Рисование и надписи поверх **Google Maps / Street View** и **Яндекс.Карт**
- Сохранение прогулок и рисунков в аккаунте на **vgraffiti.ru**
- Вход через сайт — расширение подхватывает сессию автоматически

## Разработка

Требуется Node.js 20+.

```bash
npm install
npm run dev
```

В Chrome: **Расширения → Режим разработчика → Загрузить распакованное** — папка `.output/chrome-mv3`.

```bash
npm run build
npm run zip:dist
```

`npm run zip:dist` создаёт `.output/vgraffiti-extension.zip` с папкой `vgraffiti-extension/` внутри (удобно для загрузки на сайт и «Загрузить распакованное» в Chrome).

`npm run zip` (wxt) — плоский архив для Chrome Web Store.

### CI (GitHub Actions)

Сборка запускается автоматически при push в `main` и вручную:

```bash
gh workflow run build
```

Либо в GitHub: **Actions → Build extension → Run workflow**.

В **Artifacts** после успешного run:

| Артефакт | Что внутри |
|----------|------------|
| `vgraffiti-extension` | папка `vgraffiti-extension/` (GitHub отдаёт как zip) |
| `vgraffiti-extension-zip` | готовый `vgraffiti-extension.zip` |

После распаковки скачанного архива файлы лежат в **`vgraffiti-extension/`**, а не в корне `Downloads`. Для Chrome: **Загрузить распакованное** → выбрать эту папку.

Для раздачи на сайте положите `vgraffiti-extension.zip` в `wp-content/uploads/vgraffiti/` или используйте [релиз на GitHub](https://github.com/svfcode/vgraffiti/releases/latest/download/vgraffiti-extension.zip).

**Важно:** не используйте «Code → Download ZIP» (это исходники без сборки).

## Стек

- [WXT](https://wxt.dev/) + TypeScript
