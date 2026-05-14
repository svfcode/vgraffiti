/** Текст для блока «Проверить адрес» в popup (без сырого JSON). */

function formatExtraValue(v: unknown): string {
  if (v === null || v === undefined) {
    return "—";
  }
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function labelKey(k: string): string {
  const map: Record<string, string> = {
    ok: "Статус ok",
    version: "Версия",
    api: "Префикс API",
  };
  return map[k] ?? k;
}

/**
 * Строит многострочное описание ответа GET /meta для показа пользователю.
 */
export function formatMetaHuman(data: unknown): string {
  if (data === null || data === undefined) {
    return "Сервер вернул пустой ответ.";
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    return `Ответ в неожиданном формате: ${formatExtraValue(data)}`;
  }
  const o = data as Record<string, unknown>;
  const lines: string[] = [];

  if (o.ok === true) {
    lines.push("Сервер доступен, ответ корректный (ok: true).");
  } else if (o.ok === false) {
    lines.push("В ответе указано ok: false — уточните настройки сервера.");
  }

  if (typeof o.version === "string" && o.version.length > 0) {
    lines.push(`Версия сервера: ${o.version}`);
  }
  if (typeof o.api === "string" && o.api.length > 0) {
    lines.push(`Контракт путей: ${o.api}`);
  }

  const shown = new Set(["ok", "version", "api"]);
  const rest = Object.entries(o).filter(([k]) => !shown.has(k));
  if (rest.length > 0) {
    lines.push("");
    lines.push("Дополнительно:");
    for (const [k, v] of rest) {
      lines.push(`• ${labelKey(k)}: ${formatExtraValue(v)}`);
    }
  }

  if (lines.length === 0) {
    return "Ответ получен, но без ожидаемых полей (ok, version, api).";
  }
  return lines.join("\n");
}
