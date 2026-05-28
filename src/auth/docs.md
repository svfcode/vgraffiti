# Модуль `src/auth`

Вход по email-коду, хранение Bearer-сессии и выход.

## Файлы

| Файл | Назначение |
|------|------------|
| **`constants.ts`** | Ключи storage, cooldown отправки кода, типы сообщений background. |
| **`session.ts`** | Чтение/запись сессии в `chrome.storage`, cooldown «Отправить код». |
| **`parse-verify-response.ts`** | Разбор ответа `POST /auth/verify`. |
| **`client.ts`** | Вызовы auth-операций через service worker (`bgAuthEmail`, `bgAuthVerify`, `bgLogout`). |
| **`background-handlers.ts`** | Обработчики сообщений auth в background. |
| **`popup-login.ts`** | UI входа в popup: панели guest/authed, отправка кода, verify, logout. |

## Зависимости

```
popup-login.ts
  ├── client.ts → background-handlers.ts
  └── session.ts

background-handlers.ts
  ├── session.ts
  ├── parse-verify-response.ts
  └── ../lib/api-request.ts (Bearer для logout)

drawing-api / drawing-load-api
  └── session.ts (accessToken)
```
