import { normalizeHeading } from "../../lib/streetview-context";

const links = new Map<string, number>();

export function recordPanoWalkLink(fromKey: string, toKey: string, bearingDeg: number): void {
  if (!fromKey || !toKey || fromKey === toKey) {
    return;
  }
  links.set(`${fromKey}|${toKey}`, normalizeHeading(bearingDeg));
}

export function clearPanoWalkLinks(): void {
  links.clear();
}

/** Азимут от `from` к `to`, ° по часовой от севера. */
export function walkBearingBetween(fromKey: string, toKey: string): number | null {
  const direct = links.get(`${fromKey}|${toKey}`);
  if (direct != null) {
    return direct;
  }
  const reverse = links.get(`${toKey}|${fromKey}`);
  if (reverse != null) {
    return normalizeHeading(reverse + 180);
  }
  return null;
}

function walkNeighbors(key: string): string[] {
  const out: string[] = [];
  for (const linkKey of links.keys()) {
    const sep = linkKey.indexOf("|");
    if (sep < 0) {
      continue;
    }
    const from = linkKey.slice(0, sep);
    const to = linkKey.slice(sep + 1);
    if (from === key) {
      out.push(to);
    } else if (to === key) {
      out.push(from);
    }
  }
  return out;
}

/** Число шагов по записанным переходам между панорамами. */
export function walkGraphHops(fromKey: string, toKey: string): number | null {
  if (fromKey === toKey) {
    return 0;
  }
  const queue: { key: string; hops: number }[] = [{ key: fromKey, hops: 0 }];
  const visited = new Set<string>([fromKey]);
  while (queue.length > 0) {
    const { key, hops } = queue.shift()!;
    for (const next of walkNeighbors(key)) {
      if (next === toKey) {
        return hops + 1;
      }
      if (!visited.has(next)) {
        visited.add(next);
        queue.push({ key: next, hops: hops + 1 });
      }
    }
  }
  return null;
}
