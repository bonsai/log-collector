import fs from "node:fs";
import path from "node:path";
import { type FSWatcher } from "chokidar";
import type { LogStorage } from "./storage.js";
import { LogParser, type LogEntry } from "./parser.js";

export class Collector {
  private watchers = new Map<string, FSWatcher>();
  private storage: LogStorage;
  private parser: LogParser;

  constructor(storage: LogStorage) {
    this.storage = storage;
    this.parser = new LogParser();
  }

  async watchFile(filePath: string): Promise<void> {
    if (this.watchers.has(filePath)) return;

    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }

    const { FSWatcher } = await import("chokidar");
    const watcher = new FSWatcher({
      usePolling: true,
      interval: 500,
    });

    watcher.add(resolved);
    watcher.on("change", (p) => {
      // Read last N lines for efficiency
      this.readTail(p, 20);
    });

    this.watchers.set(filePath, watcher);
    // Initial read
    this.readTail(resolved, 50);
  }

  async watchDir(dirPath: string, pattern?: string): Promise<void> {
    if (this.watchers.has(dirPath)) return;

    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory not found: ${resolved}`);
    }

    const { FSWatcher } = await import("chokidar");
    const watcher = new FSWatcher({
      usePolling: true,
      interval: 1000,
    });

    const glob = pattern || "**/*.log";
    watcher.add(path.join(resolved, glob));
    watcher.on("change", (p) => this.readTail(p, 20));
    watcher.on("add", (p) => this.readTail(p, 50));

    this.watchers.set(dirPath, watcher);
  }

  stop(target: string): void {
    const watcher = this.watchers.get(target);
    if (watcher) {
      watcher.close();
      this.watchers.delete(target);
    }
  }

  listSources(): string[] {
    return [...this.watchers.keys()];
  }

  private readTail(filePath: string, linesCount: number): void {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      const tail = lines.slice(-linesCount);

      for (const line of tail) {
        const entry = this.parser.parseLine(line, filePath);
        if (entry) {
          this.storage.add(entry);
        }
      }
    } catch {
      // File might be temporarily locked, skip
    }
  }
}
