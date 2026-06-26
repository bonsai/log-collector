import fs from "node:fs";
import path from "node:path";

export interface LogEntry {
  timestamp: string;
  level: "error" | "warn" | "info";
  message: string;
  source: string;
  detail?: string;
}

export class LogParser {
  private patterns: Array<{
    name: string;
    test: (line: string) => { level: LogEntry["level"]; message: string; detail?: string } | null;
  }>;

  constructor() {
    this.patterns = [
      // Vite / Rollup errors
      {
        name: "vite-error",
        test: (line) => {
          const m = line.match(/^(\S+:\/\/[^\s]+)\s+(\d+:\d+)\s+(\[ERROR\]|error)\s+(.+)/i);
          if (m) return { level: "error", message: `${m[1]} ${m[2]} ${m[4]}`, detail: line };
          const m2 = line.match(/\[vite\]\s+(Internal server error|Error)/i);
          if (m2) return { level: "error", message: line.trim(), detail: line };
          return null;
        },
      },
      // Generic JS/TS stack trace header
      {
        name: "stack-trace",
        test: (line) => {
          if (/^(Error|TypeError|ReferenceError|SyntaxError|RangeError)\b/.test(line.trim()))
            return { level: "error", message: line.trim() };
          return null;
        },
      },
      // x Build error (esbuild / Vite)
      {
        name: "x-error",
        test: (line) => {
          const m = line.match(/^[×✕✗✘].*\s(.+\.\w+):\s(.+)/);
          if (m) return { level: "error", message: `${m[1]}: ${m[2]}`, detail: line };
          return null;
        },
      },
      // NPM / Node error
      {
        name: "npm-error",
        test: (line) => {
          const m = line.match(/^(npm ERR!)\s(.+)/);
          if (m) return { level: "error", message: m[2], detail: line };
          return null;
        },
      },
      // Failed to compile / Build failed
      {
        name: "build-fail",
        test: (line) => {
          if (/\b(Build failed|Failed to compile|build failed|compilation failed)\b/i.test(line))
            return { level: "error", message: line.trim() };
          return null;
        },
      },
      // Warnings
      {
        name: "warning",
        test: (line) => {
          if (/^(\[warn\]|warning\b|⚠|WARN)/i.test(line.trim()))
            return { level: "warn", message: line.trim() };
          return null;
        },
      },
      // Success / ready / built
      {
        name: "success",
        test: (line) => {
          if (/\b(built in|ready in|successfully|compiled successfully)\b/i.test(line))
            return { level: "info", message: line.trim() };
          return null;
        },
      },
      // Web server errors (HTTP 5xx, 4xx)
      {
        name: "http-error",
        test: (line) => {
          const m = line.match(/"\s*(GET|POST|PUT|DELETE|PATCH)\s+\S+\s+HTTP\/\d\.\d"\s+(5\d{2}|4\d{2})/);
          if (m) return { level: m[2].startsWith("5") ? "error" : "warn", message: line.trim() };
          return null;
        },
      },
    ];
  }

  parseLine(line: string, source: string): LogEntry | null {
    if (!line.trim()) return null;
    for (const p of this.patterns) {
      const result = p.test(line);
      if (result) {
        return {
          timestamp: new Date().toISOString(),
          level: result.level,
          message: result.message,
          source,
          detail: result.detail || line,
        };
      }
    }
    return null;
  }

  analyze(logs: LogEntry[]): {
    total: number;
    errors: number;
    warnings: number;
    info: number;
    topErrors: Array<{ message: string; count: number }>;
    sources: string[];
  } {
    const total = logs.length;
    const errors = logs.filter((l) => l.level === "error").length;
    const warnings = logs.filter((l) => l.level === "warn").length;
    const info = logs.filter((l) => l.level === "info").length;

    const errorCounts = new Map<string, number>();
    for (const l of logs.filter((l) => l.level === "error")) {
      // Normalize error message for grouping
      const key = l.message.replace(/:\d+:\d+/g, ":XX:XX").replace(/\d+/g, "N");
      errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
    }
    const topErrors = [...errorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    const sources = [...new Set(logs.map((l) => l.source))];

    return { total, errors, warnings, info, topErrors, sources };
  }
}
