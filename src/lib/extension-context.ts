const INVALIDATED = "Extension context invalidated";

export function isExtensionContextValid(): boolean {
  try {
    return typeof chrome !== "undefined" && !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

export function isExtensionContextInvalidatedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(INVALIDATED);
}

/** Не логировать как ошибку после перезагрузки расширения в dev. */
export function ignoreIfContextInvalidated(error: unknown): boolean {
  return isExtensionContextInvalidatedError(error);
}
