import type { LogEntry } from "./parser.js";

export class LogStorage {
  private logs: LogEntry[] = [];
  private maxSize = 10_000;

  add(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize);
    }
  }

  all(): LogEntry[] {
    return [...this.logs];
  }

  query(opts: {
    source?: string;
    level?: string;
    limit?: number;
    since?: string;
  }): LogEntry[] {
    let result = this.logs;

    if (opts.source) {
      result = result.filter((l) => l.source.includes(opts.source!));
    }
    if (opts.level) {
      result = result.filter((l) => l.level === opts.level);
    }
    if (opts.since) {
      const since = new Date(opts.since).getTime();
      result = result.filter((l) => new Date(l.timestamp).getTime() >= since);
    }

    const limit = opts.limit ?? 50;
    return result.slice(-limit);
  }

  clear(source?: string): void {
    if (source) {
      this.logs = this.logs.filter((l) => !l.source.includes(source));
    } else {
      this.logs = [];
    }
  }

  size(): number {
    return this.logs.length;
  }
}
