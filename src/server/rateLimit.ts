/**
 * Small in-memory limiter for public forms. It resets when the app restarts, which is acceptable here: it only has to
 * slow down floods, and the real gate is the PI's approval.
 */
const hits = new Map<string, number[]>();

/** True if this key may act now; records the attempt. At most `limit` attempts per `windowMs`. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return true;
}
