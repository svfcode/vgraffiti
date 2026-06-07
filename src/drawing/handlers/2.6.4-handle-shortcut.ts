import { isEditableKeyTarget, type DrawingOverlayHost } from "../2.1-overlay-types";

type ShortcutEntry = {
  keys: string[];
  description: string;
};

type ShortcutLetter = "z" | "x" | "q" | "m";

const SHORTCUT_KEY: Record<
  ShortcutLetter,
  { code: string; keyCode: number; en: string; ru: string }
> = {
  z: { code: "KeyZ", keyCode: 90, en: "z", ru: "я" },
  x: { code: "KeyX", keyCode: 88, en: "x", ru: "ч" },
  q: { code: "KeyQ", keyCode: 81, en: "q", ru: "й" },
  m: { code: "KeyM", keyCode: 77, en: "m", ru: "ь" },
};

function modKeyLabel(): string {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘" : "Ctrl";
}

/** Распознаёт клавишу шортката в EN/RU раскладке и при Ctrl+буква. */
function matchesShortcutLetter(e: KeyboardEvent, letter: ShortcutLetter): boolean {
  const spec = SHORTCUT_KEY[letter];
  if (e.code === spec.code) {
    return true;
  }
  const legacyCode = e.keyCode || e.which;
  if (legacyCode === spec.keyCode) {
    return true;
  }
  if (e.key.length !== 1) {
    return false;
  }
  const lower = e.key.toLowerCase();
  if (lower === spec.en || lower === spec.ru) {
    return true;
  }
  // Ctrl+буква → управляющий символ (Ctrl+Z = \x1a, Ctrl+M = \r …).
  if (lower.charCodeAt(0) === spec.keyCode - 64) {
    return true;
  }
  return false;
}

function getShortcutEntries(): ShortcutEntry[] {
  const mod = modKeyLabel();
  return [
    { keys: [mod, "Z"], description: "Отменить" },
    { keys: [mod, "Shift", "Z"], description: "Повторить" },
    { keys: [mod, "X"], description: "Поменять цвета" },
    { keys: [mod, "Q"], description: "Следующий инструмент" },
    { keys: [mod, "M"], description: "Нав ↔ Рис" },
  ];
}

export function bindShortcutEvents(host: DrawingOverlayHost): void {
  window.addEventListener("keydown", (e) => onWindowKeyDown(host, e), { capture: true });
  bindShortcutsHelpEvents(host);
}

function bindShortcutsHelpEvents(host: DrawingOverlayHost): void {
  const showBtn = host.bar.querySelector<HTMLButtonElement>("#vgf-shortcuts-show");
  const backdrop = host.bar.querySelector<HTMLDivElement>("#vgf-shortcuts-backdrop");
  const closeBtn = host.bar.querySelector<HTMLButtonElement>("#vgf-shortcuts-close");
  const listEl = host.bar.querySelector<HTMLDListElement>("#vgf-shortcuts-list");
  const noteEl = host.bar.querySelector<HTMLParagraphElement>("#vgf-shortcuts-note");
  if (!showBtn || !backdrop || !closeBtn || !listEl || !noteEl) {
    return;
  }

  listEl.replaceChildren(
    ...getShortcutEntries().flatMap(({ keys, description }) => {
      const dt = document.createElement("dt");
      dt.textContent = description;
      const dd = document.createElement("dd");
      for (const key of keys) {
        const kbd = document.createElement("kbd");
        kbd.textContent = key;
        dd.appendChild(kbd);
      }
      return [dt, dd];
    }),
  );

  const mod = modKeyLabel();
  noteEl.textContent =
    mod === "⌘"
      ? "На macOS — ⌘ (Command). Те же клавиши, что Z/X/Q/M на QWERTY; раскладка не важна."
      : "Те же клавиши, что Z/X/Q/M на QWERTY (в RU это Я/Ч/Й/Ь). Переключать язык не нужно.";

  const open = (): void => {
    host.moreDetails.open = false;
    backdrop.hidden = false;
  };
  const close = (): void => {
    backdrop.hidden = true;
  };

  showBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    open();
  });
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      close();
    }
  });
  backdrop.querySelector(".shortcuts-dialog")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && !backdrop.hidden) {
      close();
    }
  });
}

function onWindowKeyDown(host: DrawingOverlayHost, e: KeyboardEvent): void {
  if (e.defaultPrevented) {
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) {
    return;
  }
  if (isEditableKeyTarget(e.target)) {
    return;
  }
  if (matchesShortcutLetter(e, "z") && e.shiftKey) {
    host.performRedo();
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (matchesShortcutLetter(e, "z")) {
    host.performUndo();
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (matchesShortcutLetter(e, "x") && !e.shiftKey) {
    host.swapFgBgColors();
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (matchesShortcutLetter(e, "q") && !e.shiftKey) {
    host.cycleToolForward();
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (matchesShortcutLetter(e, "m") && !e.shiftKey) {
    host.toggleNavDrawMode();
    e.preventDefault();
    e.stopPropagation();
  }
}
