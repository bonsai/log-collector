# log-collector

**MCP server for collecting and analyzing CLI/web server error logs.**

A lightweight server that watches log files and directories, parses common error patterns from CLI tools and web servers, and provides structured querying and analysis — all through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

---

## Features

- **File & directory watching** — watch single log files or entire directories with glob patterns
- **Multi-source support** — simultaneously monitor multiple log sources
- **Smart parsing** — automatically detects and parses errors from:
  - Vite / Rollup build errors
  - JavaScript/TypeScript stack traces (Error, TypeError, ReferenceError, etc.)
  - esbuild / Vite ×-prefixed build errors
  - npm ERR! output
  - Build failures ("Build failed", "Failed to compile")
  - Warnings (WARN, ⚠, [warn])
  - HTTP server errors (4xx client errors, 5xx server errors)
  - Build success / ready messages
- **Filtered queries** — retrieve logs by source, level, time range, and limit
- **Auto-analysis** — get summary statistics and top error counts grouped by normalized message
- **In-memory ring buffer** — retains up to 10,000 entries per session

---

## Quick Start

### Prerequisites

- Node.js >= 20
- npm

### Installation

```bash
# Install globally
npm install --global @bonsai/log-collector

# Or run with npx
npx @bonsai/log-collector
```

### Build from source

```bash
git clone https://github.com/bonsai/log-collector.git
cd log-collector
npm install
npm run build
npm start
```

---

## Usage

log-collector is an MCP server that communicates over **stdio**. It is designed to be used as a tool provider for MCP-compatible clients (e.g., Claude Desktop, Claude Code).

### MCP Tools

| Tool | Description |
|------|-------------|
| `watch_start` | Start watching a log file or directory for changes |
| `watch_stop` | Stop watching a log source |
| `get_errors` | Retrieve collected error logs with optional filters |
| `analyze` | Analyze collected logs and return a summary |
| `list_sources` | List all currently watched log sources |
| `clear` | Clear all stored logs or logs for a specific source |

### Tool Parameters

#### `watch_start`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | ✅ | Path to log file or directory to watch |
| `type` | `"file" | "dir"` | ✅ | Target type |
| `pattern` | string | ❌ | Glob pattern when watching a directory (default: `**/*.log`) |

#### `get_errors`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | ❌ | Filter by source path/name |
| `level` | `"error" | "warn" | "info"` | ❌ | Filter by log level |
| `limit` | number | ❌ | Max results (default: 50) |
| `since` | string | ❌ | ISO timestamp — only return logs after this time |

#### `analyze`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | ❌ | Focus analysis on a specific source |

Returns: total entries, error/warning/info counts, top 10 most frequent errors, and list of active sources.

---

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌──────────┐
│  chokidar   │────▶│Collector │────▶│ Storage  │
│ (FS watcher)│     │(readTail)│     │(10k ring)│
└─────────────┘     └──────────┘     └──────────┘
                            │
                     ┌──────▼──────┐
                     │   Parser    │
                     │ (pattern    │
                     │  matching)  │
                     └─────────────┘

┌─────────────┐
│  MCP Server │ (stdio transport)
│  (index.ts) │
└─────────────┘
     │
     ▼
  MCP Client
(Claude Desktop,
 Claude Code, etc.)
```

### Components

- **`index.ts`** — MCP server entry point; registers tools and handles requests
- **`collector.ts`** — File watcher manager using chokidar; reads tail of changed files
- **`parser.ts`** — Pattern-based log parser; recognizes Vite, npm, HTTP, and generic error formats; also provides `analyze()` for summary aggregation
- **`storage.ts`** — In-memory ring buffer with filtered query support

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start

# Watch mode (auto-restart on changes)
npx tsx src/index.ts
```

### Adding new log patterns

Edit `src/parser.ts` and add a new entry to the `patterns` array:

```typescript
{
  name: "my-tool-error",
  test: (line) => {
    const m = line.match(/^MY_ERROR:\s+(.+)/);
    if (m) return { level: "error", message: m[1], detail: line };
    return null;
  },
},
```

---

## Use Cases

- **AI-assisted debugging** — Feed your local dev server logs to Claude via MCP and ask it to diagnose errors
- **CI log monitoring** — Watch build logs during development to catch failures early
- **Web server log analysis** — Point it at your Nginx/Apache access logs to get structured error summaries
- **Multi-project log aggregation** — Watch multiple project log directories simultaneously

---

## License

MIT
