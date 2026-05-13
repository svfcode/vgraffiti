/** Нормализует введённый URL до origin + path без хвостового /. */
export function normalizeApiBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Пустой URL");
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new Error("Некорректный URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Допустимы только http(s)");
  }
  const path = u.pathname.replace(/\/+$/, "");
  u.pathname = path;
  u.hash = "";
  u.search = "";
  return u.toString().replace(/\/$/, "");
}

export function originFromApiBase(apiBaseUrl: string): string {
  const u = new URL(apiBaseUrl);
  return u.origin;
}
