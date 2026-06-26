import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Collector } from "./collector.js";
import { LogStorage } from "./storage.js";
import { LogParser, type LogEntry } from "./parser.js";

const storage = new LogStorage();
const collector = new Collector(storage);
const parser = new LogParser();

const server = new Server(
  { name: "log-collector", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "watch_start",
      description: "Start watching a log file or directory for new logs",
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "Path to log file or directory to watch",
          },
          type: {
            type: "string",
            enum: ["file", "dir"],
            description: "Target type: single file or directory",
          },
          pattern: {
            type: "string",
            description: "Glob pattern when watching a directory (e.g. '*.log')",
          },
        },
        required: ["target", "type"],
      },
    },
    {
      name: "watch_stop",
      description: "Stop watching a log source",
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "Path to stop watching",
          },
        },
        required: ["target"],
      },
    },
    {
      name: "get_errors",
      description: "Retrieve collected error logs with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Filter by source path/name",
          },
          level: {
            type: "string",
            enum: ["error", "warn", "info"],
            description: "Filter by log level",
          },
          limit: {
            type: "number",
            description: "Max results (default 50)",
          },
          since: {
            type: "string",
            description: "ISO timestamp: only return logs after this time",
          },
        },
      },
    },
    {
      name: "analyze",
      description: "Analyze collected logs and return a summary of errors, warnings, and patterns",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Focus analysis on a specific source",
          },
        },
      },
    },
    {
      name: "list_sources",
      description: "List all currently watched log sources",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "clear",
      description: "Clear all stored logs or logs for a specific source",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "If provided, only clear logs from this source",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "watch_start": {
      const { target, type, pattern } = args as { target: string; type: "file" | "dir"; pattern?: string };
      if (type === "dir") {
        await collector.watchDir(target, pattern);
      } else {
        await collector.watchFile(target);
      }
      return {
        content: [{ type: "text", text: `Watching: ${target} (${type})` }],
      };
    }

    case "watch_stop": {
      const { target } = args as { target: string };
      collector.stop(target);
      return {
        content: [{ type: "text", text: `Stopped watching: ${target}` }],
      };
    }

    case "get_errors": {
      const { source, level, limit, since } = args as {
        source?: string;
        level?: string;
        limit?: number;
        since?: string;
      };
      const logs = storage.query({ source, level, limit, since });
      return {
        content: [{ type: "text", text: formatLogs(logs) }],
      };
    }

    case "analyze": {
      const { source } = args as { source?: string };
      const logs = source ? storage.query({ source }) : storage.all();
      const summary = parser.analyze(logs);
      return {
        content: [{ type: "text", text: formatAnalysis(summary) }],
      };
    }

    case "list_sources": {
      const sources = collector.listSources();
      return {
        content: [{ type: "text", text: JSON.stringify(sources, null, 2) }],
      };
    }

    case "clear": {
      const { source } = args as { source?: string };
      storage.clear(source);
      return {
        content: [{ type: "text", text: source ? `Cleared logs for: ${source}` : "Cleared all logs" }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

function formatLogs(logs: LogEntry[]): string {
  if (logs.length === 0) return "No logs found.";
  return logs
    .map(
      (l) =>
        `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}${l.detail ? `\n  ${l.detail}` : ""}`,
    )
    .join("\n");
}

function formatAnalysis(summary: ReturnType<LogParser["analyze"]>): string {
  const lines: string[] = [];
  lines.push(`=== Log Analysis ===`);
  lines.push(`Total entries: ${summary.total}`);
  lines.push(`Errors: ${summary.errors}`);
  lines.push(`Warnings: ${summary.warnings}`);
  lines.push(`Info: ${summary.info}`);
  if (summary.topErrors.length > 0) {
    lines.push(`\n--- Top Errors ---`);
    for (const e of summary.topErrors) {
      lines.push(`  [${e.count}x] ${e.message}`);
    }
  }
  if (summary.sources.length > 0) {
    lines.push(`\n--- Sources ---`);
    for (const s of summary.sources) {
      lines.push(`  ${s}`);
    }
  }
  return lines.join("\n");
}

const transport = new StdioServerTransport();
await server.connect(transport);
