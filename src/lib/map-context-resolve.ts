import { readMapContext } from "./map-context";
import { probePageMapContext } from "./map-context-probe";
import { pickViewportMapContext } from "./map-live-probe";

/**
 * Актуальный центр карты для overlay / API.
 * Не отдаём «только URL», если в странице уже есть live-центр (ymaps) — иначе после pan
 * запросы nearby идут со старым ll= и слои затираются пустым ответом.
 */
export async function resolveMapContext(): Promise<ReturnType<typeof readMapContext>> {
  const urlMap = readMapContext();
  const viewport = pickViewportMapContext(urlMap);
  if (viewport) {
    return viewport;
  }
  return probePageMapContext();
}
