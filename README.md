<div align="center">

# 🧠 cacheAI

**Persistent Memory Layer for AI Agents — Never Forget, Always Efficient**

*Local Hybrid RAG (Vector + Keyword) MCP Server that gives AI agents infinite memory across sessions with minimal token usage.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiPjwvc3ZnPg==)](https://modelcontextprotocol.io/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js)](https://nodejs.org/)

</div>

---

## The Problem

AI agents (Claude, GPT, Cursor, etc.) have a fatal flaw:

```
Session 1: "We use PostgreSQL + Prisma. Auth is JWT-based."
  ... 200 messages later ...
AI: "What database are we using?" ← FORGOT

Session 2 (next day):
AI: "I have no context about this project." ← AMNESIA
```

**Context windows are finite.** When they fill up, old information gets pushed out. When a new session starts, everything is gone. You re-brief, re-explain, re-grep — wasting tokens and time.

---

## The Solution

**cacheAI** is an MCP server that gives AI agents a persistent, searchable brain:

```
┌─────────────────────────────────────────────┐
│              AI Agent Session               │
│                                             │
│  1. AI learns something important           │
│     → remember("Stack: Next.js + Prisma")   │
│                                             │
│  2. Context window fills up / new session    │
│     → recall("what's our tech stack?")      │
│     → "Stack: Next.js + Prisma" ← INSTANT   │
│                                             │
└──────────────────┬──────────────────────────┘
                   │
          ┌────────▼────────┐
          │   cacheAI MCP   │
          │                 │
          │  SQLite + FTS5  │  ← Keyword search
          │  Vector RAG     │  ← Semantic search (local, free)
          │  Deduplication  │  ← No duplicates
          │  Auto-pruning   │  ← Stay lean
          └─────────────────┘
```

**Zero API keys. Runs 100% locally. Free forever.**

---

## Benchmark: Real Project Token Comparison

Tested on a real Solana trading bot repository (`bot_solana`) — AI asked to find and explain the database architecture.

| Setup | Session 1 (Initial Analysis) | Session 2 (Asked Again) | Total Tokens | Savings |
|---|---|---|---|---|
| 🔴 **Naked** | 292 tok *(raw grep)* | 292 tok *(forgot → grep again)* | **584 tok** | — |
| 🟡 **RTK only** | 180 tok *(compressed)* | 180 tok *(forgot → grep again)* | **360 tok** | -38% |
| 🟡 **cacheAI only** | 292 tok *(raw + remember)* | 64 tok *(recall from memory)* | **356 tok** | -39% |
| 🟢 **RTK + cacheAI** | 180 tok *(compressed + remember)* | 64 tok *(recall from memory)* | **244 tok** | **-58%** |

> On large outputs (build logs, `node_modules` scans, 1000+ line greps), savings reach **-96% to -99%**.

### What each setup does:

| | Compresses bash output? | Remembers across sessions? | Semantic search? |
|---|---|---|---|
| **Naked** | ❌ | ❌ | ❌ |
| **RTK only** | ✅ -90% compression | ❌ Amnesia every session | ❌ |
| **cacheAI only** | ❌ Raw input | ✅ Persistent memory | ✅ Vector RAG |
| **RTK + cacheAI** | ✅ -90% compression | ✅ Persistent memory | ✅ Vector RAG |

---

## Semantic Search: The Gap Killer

Traditional keyword search **fails** when you use different words:

```
Stored:  "We use PostgreSQL as our primary database"
Query:   "sql db storage backend"
         ↑ ZERO matching keywords
```

**FTS5 (keyword):** ❌ No results.
**cacheAI (Hybrid RAG):** ✅ Found — similarity score `0.45`

cacheAI uses a local embedding model (`all-MiniLM-L6-v2`, ~22MB) that understands **meaning**, not just exact words. Runs on CPU, no GPU needed, no API keys.

---

## How It Works

```
┌──────────────────────────────────────────────────────────┐
│                    cacheAI Architecture                   │
│                                                          │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │  remember()  │   │   recall()   │   │   forget()   │  │
│  │  Store fact  │   │  Search DB   │   │  Delete old  │  │
│  └──────┬──────┘   └──────┬───────┘   └──────────────┘  │
│         │                  │                              │
│         ▼                  ▼                              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Hybrid Search Engine                    │  │
│  │                                                     │  │
│  │  ┌───────────┐  ┌────────────────┐  ┌───────────┐  │  │
│  │  │   FTS5    │  │ Vector Embed   │  │  Ranker   │  │  │
│  │  │ (keyword) │  │ (semantic)     │  │ (scoring) │  │  │
│  │  └───────────┘  └────────────────┘  └───────────┘  │  │
│  │                                                     │  │
│  │  Score = Vector×50 + FTS×0.5 + AccessCount×0.5     │  │
│  │          + TypePriority (decision > bug > fact)      │  │
│  └─────────────────────────────────────────────────────┘  │
│                          │                                │
│                          ▼                                │
│              ┌───────────────────────┐                    │
│              │   SQLite (.cacheai/)  │                    │
│              │   + Deduplication     │                    │
│              │   + Auto-pruning      │                    │
│              └───────────────────────┘                    │
└──────────────────────────────────────────────────────────┘
```

### Key Features

| Feature | Description |
|---|---|
| **Hybrid RAG Search** | FTS5 keyword + Vector cosine similarity. Finds results even when words don't match. |
| **Local Embeddings** | `all-MiniLM-L6-v2` runs inside Node.js. No API keys, no data leaves your machine. |
| **Deduplication** | Jaccard similarity prevents storing the same fact 20 times. Merges tags automatically. |
| **Relevance Ranking** | Combines: vector score, keyword match, access frequency, and memory type priority. |
| **Auto-Pruning** | Old, never-accessed facts get evicted. Decisions and architecture notes are preserved forever. |
| **Session Continuity** | `context_status load` injects last session summary + top memories at session start. |
| **Per-Project + Global** | Each project gets its own `.cacheai/memory.db`. Global memories shared across all projects. |

---

## Quick Start

### 1. Install Globally & Initialize

```bash
npm install -g cacheai-mcp
cacheai-mcp init
```

The `init` command will:
1. Auto-patch your `opencode.json` and `claude_desktop_config.json` to register the MCP server.
2. Install the **cacheAI Skill** into `~/.claude/skills/cacheai/SKILL.md` so your AI agent gets the "instinct" to always load context on startup.

### 2. (Optional) Manual Config

**OpenCode** (`~/.config/opencode/opencode.json`):
```json
{
  "mcp": {
    "cacheai": {
      "type": "local",
      "command": "node",
      "args": ["/path/to/cacheAI/build/index.js", "--project", "."]
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "cacheai": {
      "command": "node",
      "args": ["/path/to/cacheAI/build/index.js", "--project", "."]
    }
  }
}
```

**Cursor / VS Code** (`.vscode/mcp.json`):
```json
{
  "servers": {
    "cacheai": {
      "command": "node",
      "args": ["/path/to/cacheAI/build/index.js", "--project", "."]
    }
  }
}
```

### 3. Use it

Your AI agent now has 6 new tools:

| Tool | When to use |
|---|---|
| `remember` | Store a fact, decision, preference, or architecture note |
| `recall` | Search memories with natural language (semantic + keyword) |
| `forget` | Delete outdated or incorrect memories |
| `list_memories` | Browse all stored memories, grouped by type |
| `session_summary` | Save what was done this session (call at end) |
| `context_status` | `load` = inject context at session start / `stats` = usage info / `prune` = cleanup |

---

## Memory Types

cacheAI categorizes memories for smarter ranking:

| Type | Priority | Example | Auto-pruned? |
|---|---|---|---|
| `decision` | ⭐⭐⭐ Highest | "Auth uses JWT, not sessions" | ❌ Never |
| `architecture` | ⭐⭐⭐ | "Monorepo: Next.js + tRPC + Prisma" | ❌ Never |
| `bug` | ⭐⭐ | "Race condition in auth middleware" | After 30 days if unused |
| `preference` | ⭐⭐ | "User prefers TypeScript" | After 30 days if unused |
| `fact` | ⭐ | "API endpoint: /api/v2/users" | After 30 days if unused |
| `session` | ⭐ | "Today: set up auth, fixed JWT bug" | After 30 days if unused |
| `general` | ⭐ | Anything else | After 30 days if unused |

Decisions and architecture notes are **never auto-pruned** — they're the most valuable long-term knowledge.

---

## Example Flow

### Session 1
```
User: "Set up the auth system with JWT"
AI:   → remember({content: "Auth uses JWT tokens with refresh rotation", type: "decision", tags: ["auth"]})
AI:   → remember({content: "Stack: Next.js + Prisma + PostgreSQL", type: "architecture", tags: ["stack"]})
      ... works for 2 hours ...
AI:   → session_summary({summary: "Set up JWT auth with refresh tokens, created user model in Prisma"})
```

### Session 2 (next day)
```
AI:   → context_status({action: "load"})
      ← "Last session: Set up JWT auth with refresh tokens..."
      ← "Key facts: [architecture] Stack: Next.js + Prisma + PostgreSQL | [decision] Auth uses JWT..."

User: "What auth approach did we pick?"
AI:   → recall({query: "authentication method"})
      ← "[decision] Auth uses JWT tokens with refresh rotation"
AI:   "We chose JWT with refresh token rotation."  ← INSTANT, no re-grep needed
```

---

## Comparison with Existing Tools

| Feature | MCP Memory (Official) | Mem0 | cacheAI |
|---|---|---|---|
| Semantic search | ❌ String match only | ✅ (needs API key) | ✅ **Local, free** |
| Auto-deduplication | ❌ | ❌ | ✅ Jaccard similarity |
| Relevance ranking | ❌ | ✅ | ✅ Multi-signal |
| Auto-pruning | ❌ | ❌ | ✅ Configurable |
| Session continuity | ❌ | ✅ | ✅ `context_status load` |
| Works offline | ✅ | ❌ Needs OpenAI | ✅ **100% local** |
| Setup complexity | Simple | Complex (API keys, LLM) | **Simple** (npm install) |
| Cost | Free | Paid (API calls) | **Free forever** |

---

## Pair with RTK for Maximum Efficiency

[RTK](https://github.com/rtk-ai/rtk) compresses bash output **before** it enters the context window. cacheAI stores the important parts **after** the AI understands them. Together:

```
Terminal Output (1000 lines)
    │
    ▼ RTK compresses (-90%)
100 lines enter context
    │
    ▼ AI reads & understands
    │
    ▼ AI calls remember() → cacheAI stores 1-line fact
    │
Next session:
    ▼ AI calls recall() → gets the 1-line fact
    ▼ No terminal command needed. Zero tokens wasted.
```

---

## Project Structure

```
cacheAI/
├── src/
│   ├── index.ts              ← MCP server entrypoint + CLI
│   ├── server.ts             ← Tool registration (6 tools)
│   ├── config.ts             ← Project/global path resolution
│   ├── types.ts              ← TypeScript types
│   ├── store/
│   │   ├── db.ts             ← SQLite + FTS5 schema + triggers
│   │   ├── memory-store.ts   ← CRUD + Hybrid RAG search + dedup + pruning
│   │   └── embedder.ts       ← Local vector embeddings (all-MiniLM-L6-v2)
│   ├── tools/
│   │   ├── remember.ts       ← Store memory (with dedup)
│   │   ├── recall.ts         ← Hybrid search (vector + keyword)
│   │   ├── forget.ts         ← Delete memory
│   │   ├── list.ts           ← Browse memories
│   │   ├── session-summary.ts← Save session context
│   │   └── context-status.ts ← Startup injection / stats / prune
│   └── __tests__/
│       └── memory-store.test.ts  ← 14 tests
├── benchmark/                ← Token comparison scripts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Tech Stack

| Component | Technology | Why |
|---|---|---|
| **MCP Server** | `@modelcontextprotocol/sdk` v1.30 | Universal protocol, works with Claude/GPT/Cursor/VS Code |
| **Database** | SQLite via `better-sqlite3` | Zero-config, single file, fast, no server |
| **Keyword Search** | FTS5 (SQLite built-in) | Full-text search with OR tokenization |
| **Vector Search** | `@xenova/transformers` + `all-MiniLM-L6-v2` | Local embeddings, 384-dim vectors, ~22MB model |
| **Validation** | `zod` | Runtime type safety for tool inputs |
| **Testing** | `vitest` | Fast, TypeScript-native |

---

## License

MIT — use it however you want.

---

<div align="center">

**Built to solve the #1 problem with AI coding agents: forgetting.**

[Report Bug](https://github.com/mhrdwan/cacheAI/issues) · [Request Feature](https://github.com/mhrdwan/cacheAI/issues)

</div>
