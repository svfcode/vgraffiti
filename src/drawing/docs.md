# Модуль `src/drawing`

Слой рисования расширения: полноэкранный оверлей поверх страницы, панель инструментов и отрисовка штрихов на canvas.

Префикс в имени файла соответствует порядку обхода дерева зависимостей: `1-*` → `2-*` → `2.N-*` → `2.N.M-*`.

## Файлы

| Файл | Назначение |
|------|------------|
| **`0-ambient.d.ts`** | TypeScript-декларации для импортов `*.css?raw` и `*.html?raw` (Vite). |
| **`1-overlay.ts`** | Точка входа модуля. Экспортирует `mountDrawingOverlay()` — вызывается из content script (`entrypoints/content.ts`) для монтирования оверлея на страницу. |
| **`2-drawing-overlay.ts`** | Класс `DrawingOverlay`: состояние оверлея и делегирование в подмодули. |
| **`2.1-overlay-types.ts`** | Общие типы, константы и интерфейс `DrawingOverlayHost`. |
| **`2.2-create-shadow-dom.ts`** | Создание host-элемента, shadow root и подключение CSS. |
| **`2.2.1-panel.html`** | Разметка панели инструментов. |
| **`2.2.2-panel.css`** | Стили оверлея и панели. |
| **`2.5-create-canvas.ts`** | Canvas-слой, 2D-контекст, resize и pointer-события рисования. |
| **`2.6-init-panel.ts`** | Инициализация панели: refs, swatches, привязка обработчиков. |
| **`2.6.1-handle-history.ts`** | Undo/redo, очистка, завершение штриха и история изменений. |
| **`2.6.2-handle-tools.ts`** | Инструменты, цвета, размер кисти, режим nav/draw, курсор размера. |
| **`2.6.3-handle-panel-move.ts`** | Перетаскивание панели и прозрачность toolbar. |
| **`2.6.4-handle-shortcut.ts`** | Горячие клавиши (Ctrl+Z, Ctrl+Shift+Z, Ctrl+X, Ctrl+Q). |
| **`2.11-rerender.ts`** | Перерисовка canvas (`redraw`, `scheduleRedraw`). |
| **`lib/stroke.ts`** | Штрихи кисти и ластика (`perfect-freehand`). |
| **`lib/shapes.ts`** | Примитивы: стрелка и прямоугольник. |

## Зависимости между файлами

```
1-overlay.ts
  └── 2-drawing-overlay.ts
        ├── 2.1-overlay-types.ts
        ├── 2.2-create-shadow-dom.ts
        │     ├── 2.2.1-panel.html (?raw)
        │     └── 2.2.2-panel.css (?raw)
        ├── 2.5-create-canvas.ts
        ├── 2.6-init-panel.ts
        │     ├── 2.6.1-handle-history.ts
        │     ├── 2.6.2-handle-tools.ts
        │     ├── 2.6.3-handle-panel-move.ts
        │     ├── 2.6.4-handle-shortcut.ts
        │     └── 2.5-create-canvas.ts (bind)
        ├── 2.11-rerender.ts
        ├── lib/shapes.ts
        ├── lib/stroke.ts
        └── ../lib/map-context (режим nav на картах)
```
