# Canvas в модуле `src/drawing`

Документ описывает, как создаётся полноэкранный canvas-слой оверлея, как на нём рисуют и как устроена перерисовка.

## Роль canvas

Canvas — единственная поверхность, на которой отображаются штрихи пользователя. Он лежит в shadow DOM расширения, занимает весь viewport и не хранит DOM-разметку рисунка: все мазки живут в памяти как массив `strokes` и каждый кадр заново отрисовываются через 2D-контекст.

---

## Цепочка создания

```
content script
  └── 1-overlay.ts → mountDrawingOverlay()
        └── 2-drawing-overlay.ts → DrawingOverlay.mount()
              ├── 2.2-create-shadow-dom.ts   — host + shadow + .root
              ├── canvas/2.5-create-canvas.ts  — <canvas> + 2D context
              ├── panel/2.6-init-panel.ts      — bindCanvasEvents + resizeCanvas
              └── document.documentElement.appendChild(host)
```

1. **Точка входа** — `mountDrawingOverlay()` в `1-overlay.ts` вызывает `DrawingOverlay.mount()`.

2. **Shadow DOM** — `createShadowDom()` в `2.2-create-shadow-dom.ts` создаёт host-элемент с `data-vgraffiti-overlay`, подключает стили из `panel/2.2.2-panel.css` и контейнер `.root`.

3. **Canvas** — `createCanvas(root, bar)` в `canvas/2.5-create-canvas.ts`:
   - создаёт `<canvas class="layer">`;
   - создаёт `sizeCursorEl` — div-кружок размера кисти/ластика (не canvas, но часть canvas-слоя);
   - вставляет в `.root` порядок: canvas → bar → sizeCursorEl;
   - получает `CanvasRenderingContext2D`; при отсутствии 2D — исключение (перехватывается в `mount()`).

4. **Инициализация** — `initPanel()` в `panel/2.6-init-panel.ts` вызывает `bindCanvasEvents(host)` и первый `resizeCanvas(host)`.

Ключевой фрагмент монтирования — `2-drawing-overlay.ts`:

```99:131:vgraffiti/src/drawing/2-drawing-overlay.ts
  private constructor() {
    const { host, root, bar } = createShadowDom();
    const { canvas, sizeCursorEl, ctx } = createCanvas(root, bar);
    const panel = queryPanelElements(bar);
    // ...
    document.documentElement.appendChild(host);
  }

  private init(): void {
    initPanel(this);
  }
```

---

## DOM и CSS

| Элемент | Класс / id | Назначение |
|---------|------------|------------|
| host | `data-vgraffiti-overlay` | Корень оверлея в `document.documentElement`, `z-index: Z_OVERLAY` |
| `.root` | — | Контейнер shadow DOM, `pointer-events: none` |
| canvas | `.layer` | Рисование, `pointer-events: auto`, на весь экран |
| div | `.size-cursor` | Круг-превью размера инструмента, `pointer-events: none` |
| `.bar` | `#vgf-bar` | Панель инструментов поверх canvas |

Стили canvas — `panel/2.2.2-panel.css`:

- **Рис** — `.layer` перехватывает указатель, `cursor: crosshair` (или скрыт при кружке размера).
- **Нав** — `.layer.mode-nav` получает `pointer-events: none`, события уходят на страницу/карту под оверлеем.
- **Кружок размера** — `.layer.vgf-hide-cursor { cursor: none }` когда активны кисть/ластик в режиме «Рис».

Переключение режима — `syncModeButtons()` в `handlers/2.6.2-handle-tools.ts` (класс `mode-nav` на canvas).

---

## Размер и devicePixelRatio

`resizeCanvas()` в `canvas/2.5-create-canvas.ts` вызывается при init и на `window.resize`:

```40:51:vgraffiti/src/drawing/canvas/2.5-create-canvas.ts
export function resizeCanvas(host: DrawingOverlayHost): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const canvas = host.canvas;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  host.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  host.scheduleRedraw();
}
```

Логика:
- **CSS-размер** canvas = размер окна (логические пиксели).
- **Буфер** canvas = окно × DPR (чёткость на Retina).
- **`setTransform(dpr, …)`** — все координаты штрихов в CSS-пикселях, контекст масштабирует их в физические.

После resize всегда планируется полная перерисовка.

---

## Модель данных

Типы в `2.1-overlay-types.ts`:

| Поле / тип | Где хранится | Смысл |
|------------|--------------|-------|
| `strokes: StoredStroke[]` | `DrawingOverlay` | Завершённые штрихи (история рисунка) |
| `current: CurrentGesture \| null` | `DrawingOverlay` | Незавершённый жест (палец/мышь ещё на canvas) |
| `past / future` | `DrawingOverlay` | Стеки undo/redo (снимки `strokes`) |

Виды штрихов (`StoredStroke`):
- `brush` — точки + цвет + размер;
- `eraser` — точки + размер (вычитание альфы);
- `arrow` / `square` — два угла + цвет + толщина линии.

Координаты точек кисти — `[x, y, pressure]` в CSS-пикселях относительно canvas (`inc/stroke.ts`, `pointFromEvent`).

---

## Обработка указателя

Привязка событий — `bindCanvasEvents()` в `canvas/2.5-create-canvas.ts`:

| Событие | Обработчик | Действие |
|---------|------------|----------|
| `pointerdown` | `onCanvasPointerDown` | Начало жеста (только `uiMode === "draw"`, ЛКМ) |
| `pointermove` | `onCanvasPointerMove` | Добавление точек / обновление preview, кружок размера |
| `pointerenter` | `onCanvasPointerEnter` | Показ кружка при входе на canvas |
| `pointerleave` | `onCanvasPointerLeave` | Скрытие кружка, если не рисуем |
| `pointerup` / `pointercancel` | `host.finishStroke` | Завершение жеста |
| `window.resize` | `resizeCanvas` | Подгонка буфера |

### Начало жеста (`pointerdown`)

Условия: режим **«Рис»**, кнопка 0. Canvas захватывает указатель (`setPointerCapture`), на `window` вешается запасной `pointerup`.

В зависимости от `activeTool`:
- **кисть / ластик** — `current = { tool, points: [первая точка] }`, точка через `pointFromEvent()` (`inc/stroke.ts`);
- **стрелка / квадрат** — `current = { x0, y0, x1, y1 }` (оба угла совпадают), координаты через `xyCanvas()`.

После каждого изменения — `scheduleRedraw()`.

### Движение (`pointermove`)

- Обновляет `lastHoverClient` и кружок размера (`handlers/2.6.2-handle-tools.ts`).
- Если идёт рисование: для кисти/ластика добавляет точки (с `getCoalescedEvents()` для плавности), для фигур — двигает `x1/y1`.
- Снова `scheduleRedraw()` — на экране виден preview текущего жеста.

### Завершение (`finishStroke`)

Реализация — `handlers/2.6.1-handle-history.ts`:

- Снимает capture и флаг `isDrawing`.
- Если жест валиден (достаточно точек / длины) — `pushHistoryBeforeMutation()` и добавление в `strokes`.
- `current = null`, `scheduleRedraw()`, обновление undo/redo.

---

## Перерисовка

Пайплайн в `2.11-rerender.ts`:

```
scheduleRedraw(host)
  └── requestAnimationFrame → redraw(host)
        ├── clearRect(весь viewport)
        ├── для каждого s in host.strokes → renderStroke / renderEraserStroke / drawArrow / drawSquareStroke
        └── если host.current → preview текущего жеста (фигуры — полупрозрачные, пунктир)
```

`scheduleRedraw` отменяет предыдущий rAF (`host.raf`) — не более одного кадра на серию событий.

Отрисовка примитивов:
- **Кисть** — `inc/stroke.ts` → `perfect-freehand`, заливка контура;
- **Ластик** — тот же контур, `globalCompositeOperation: "destination-out"`;
- **Стрелка / квадрат** — `inc/shapes.ts`;
- **Preview фигур** — `globalAlpha: 0.45`, `setLineDash([5, 5])` в `redraw()`.

`DrawingOverlay.scheduleRedraw()` делегирует в `2.11-rerender.ts` — единая точка вызова из canvas, history, tools.

---

## Режимы «Нав» / «Рис»

| Режим | Canvas | Рисование |
|-------|--------|-----------|
| **nav** | `pointer-events: none` | `onCanvasPointerDown` сразу выходит |
| **draw** | события на canvas | полный цикл pointer → stroke |

По умолчанию на картах — **nav** (`readMapContext()` в конструкторе `2-drawing-overlay.ts`), на обычных страницах — **draw**.

Кнопки переключения — `panel/2.2.1-panel.html` (`.mode-btn`), логика — `handlers/2.6.2-handle-tools.ts`.

---

## Кружок размера инструмента

Не часть canvas-буфера, а HTML-overlay `.size-cursor` поверх canvas (`z-index: 3`).

- Показывается для **кисти** и **ластика** в режиме **«Рис»** (`wantsSizeCursor()`).
- Диаметр = `getBrushSize()` / `getEraserSize()`.
- Системный курсор скрывается классом `vgf-hide-cursor` на canvas.
- Ластик — пунктирная обводка (`.size-cursor.eraser`).

---

## Undo / clear и canvas

Операции не меняют DOM canvas, только массив `strokes`:

- **Undo/redo** — `handlers/2.6.1-handle-history.ts` восстанавливает снимок в `strokes`, затем `scheduleRedraw()`.
- **Очистить** — `onClearClick()` обнуляет `strokes`, `scheduleRedraw()`.
- **Отмена активного штриха** — `cancelActiveStroke()` сбрасывает `current` без записи в `strokes`.

---

## Файлы canvas-подсистемы

| Файл | Ответственность |
|------|-----------------|
| `canvas/2.5-create-canvas.ts` | Создание canvas, resize, pointer-события |
| `2.11-rerender.ts` | `scheduleRedraw`, `redraw` |
| `2.1-overlay-types.ts` | `StoredStroke`, `CurrentGesture`, `DrawingOverlayHost`, `xyCanvas` |
| `inc/stroke.ts` | Точки из pointer, рендер кисти/ластика |
| `inc/shapes.ts` | Стрелка, прямоугольник |
| `handlers/2.6.1-handle-history.ts` | Завершение штриха, undo/redo, clear |
| `handlers/2.6.2-handle-tools.ts` | Режим nav/draw, кружок размера, инструменты |
| `panel/2.2.2-panel.css` | Стили `.layer`, `.mode-nav`, `.size-cursor` |
| `2-drawing-overlay.ts` | Состояние oверлея, делегирование в модули |

---

## Краткая схема runtime

```
pointerdown (draw mode)
  → current := жест
  → scheduleRedraw()     // preview

pointermove
  → current += точки
  → scheduleRedraw()

pointerup
  → finishStroke()
  → strokes.push(...)
  → current := null
  → scheduleRedraw()     // финальный кадр

resize
  → resizeCanvas()
  → scheduleRedraw()     // тот же strokes[], новый буфер
```
