/**
 * მარტივი rate limit (token bucket) მეხსიერებაში: capacity მოქმედება windowMs-ში, თანაბრად ივსება.
 * აპლიკაცია ერთ პროცესად მუშაობს (server.ts); რამდენიმე instance-ზე საჭირო იქნება საერთო საცავი (Redis).
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  private lastSweep = 0;

  private readonly capacity: number;
  private readonly windowMs: number;

  constructor(capacity: number, windowMs: number) {
    this.capacity = capacity;
    this.windowMs = windowMs;
  }

  /** true — მოქმედება დაშვებულია (და ჩაითვალა), false — ლიმიტი ამოწურულია. */
  take(key: string, now = Date.now()): boolean {
    this.sweep(now);
    const refillPerMs = this.capacity / this.windowMs;
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + (now - b.at) * refillPerMs);
    b.at = now;
    const allowed = b.tokens >= 1;
    if (allowed) b.tokens -= 1;
    this.buckets.set(key, b);
    return allowed;
  }

  /** სრულად შევსებული (დიდი ხნის უმოქმედო) გასაღებები იშლება — მეხსიერება არ იზრდება. */
  private sweep(now: number) {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, b] of this.buckets) if (now - b.at >= this.windowMs) this.buckets.delete(key);
  }
}
