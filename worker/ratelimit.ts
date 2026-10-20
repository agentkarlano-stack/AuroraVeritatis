/**
 * Best-effort per-isolate token bucket. Cloudflare runs many isolates, so this only blunts
 * bursts from a single client; a Workers Rate Limiting binding is the production upgrade.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private capacity: number,
    private refillPerSecond: number,
    private maxKeys = 5000,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) this.buckets.clear();
      bucket = { tokens: this.capacity, updated: now };
      this.buckets.set(key, bucket);
    }
    const elapsed = (now - bucket.updated) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSecond);
    bucket.updated = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}
