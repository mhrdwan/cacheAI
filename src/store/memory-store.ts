import { randomUUID } from 'node:crypto'
import { getDb } from './db.js'
import { embedText, cosineSimilarity } from './embedder.js'
import type { Memory, MemoryType, RecallResult } from '../types.js'

function now(): number {
  return Date.now()
}

// ─── DEDUPLICATION ────────────────────────────────────────────────────────────
function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  const intersection = new Set([...a].filter(x => b.has(x)))
  const union = new Set([...a, ...b])
  return intersection.size / union.size
}

export async function findDuplicate(params: {
  content: string
  type: MemoryType
  project: string
  scope: 'project' | 'global'
  threshold?: number
}): Promise<string | null> {
  const db = getDb()
  const { content, type, project, scope, threshold = 0.65 } = params

  const candidates = db.prepare(
    `SELECT id, content FROM memories
     WHERE type = ? AND (project = ? OR scope = 'global')
     ORDER BY created_at DESC LIMIT 50`
  ).all(type, project) as { id: string; content: string }[]

  const incoming = tokenize(content)
  for (const c of candidates) {
    if (jaccard(incoming, tokenize(c.content)) >= threshold) return c.id
  }
  return null
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export interface CreateResult {
  memory: Memory
  deduplicated: boolean
  mergedInto?: string
}

export async function createMemory(params: {
  content: string
  type: MemoryType
  tags: string[]
  project: string
  scope: 'project' | 'global'
  skipDedup?: boolean
}): Promise<CreateResult> {
  const db = getDb()

  if (!params.skipDedup) {
    const existingId = await findDuplicate({
      content: params.content,
      type: params.type,
      project: params.project,
      scope: params.scope,
    })
    if (existingId) {
      const ts = now()
      const existing = getMemoryById(existingId)!
      const mergedTags = [...new Set([...existing.tags, ...params.tags])]
      
      // Update with new content and optionally update embedding
      const vector = await embedText(params.content)
      const buffer = Buffer.from(new Float32Array(vector).buffer)

      db.prepare(
        'UPDATE memories SET content = ?, tags = ?, updated_at = ?, embedding = ? WHERE id = ?'
      ).run(params.content, JSON.stringify(mergedTags), ts, buffer, existingId)
      
      return {
        memory: getMemoryById(existingId)!,
        deduplicated: true,
        mergedInto: existingId,
      }
    }
  }

  const id = randomUUID()
  const ts = now()
  const vector = await embedText(params.content)
  const buffer = Buffer.from(new Float32Array(vector).buffer)

  db.prepare(`
    INSERT INTO memories (id, content, type, tags, project, scope, created_at, updated_at, access_count, last_accessed, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
  `).run(
    id, params.content, params.type,
    JSON.stringify(params.tags),
    params.project, params.scope, ts, ts, buffer
  )

  return { memory: getMemoryById(id)!, deduplicated: false }
}

// ─── READ ─────────────────────────────────────────────────────────────────────

export function getMemoryById(id: string): Memory | null {
  const row = getDb().prepare('SELECT * FROM memories WHERE id = ?').get(id) as RawRow | undefined
  return row ? rowToMemory(row) : null
}

export function listMemories(params: {
  project: string
  type?: MemoryType
  tag?: string
  scope?: 'project' | 'global' | 'all'
  limit?: number
}): Memory[] {
  const db = getDb()
  const { project, type, tag, scope = 'all', limit = 50 } = params

  let where = '1=1'
  const bindings: (string | number)[] = []

  if (scope === 'project') {
    where += " AND (project = ? OR scope = 'global')"
    bindings.push(project)
  } else if (scope === 'global') {
    where += " AND scope = 'global'"
  } else {
    where += " AND (project = ? OR scope = 'global')"
    bindings.push(project)
  }

  if (type) {
    where += ' AND type = ?'
    bindings.push(type)
  }

  if (tag) {
    where += ' AND tags LIKE ?'
    bindings.push(`%"${tag}"%`)
  }

  bindings.push(limit)
  const rows = db.prepare(
    `SELECT *,
      (access_count * 2.0 + (created_at / 1000000.0)) as relevance_score
     FROM memories WHERE ${where}
     ORDER BY relevance_score DESC LIMIT ?`
  ).all(...bindings) as RawRow[]

  return rows.map(rowToMemory)
}

// ─── SEARCH (Hybrid: Vector RAG + FTS5 + Relevance) ──────────────────────────

export async function searchMemories(params: {
  query: string
  project: string
  scope?: 'project' | 'global' | 'all'
  limit?: number
}): Promise<RecallResult[]> {
  const db = getDb()
  const { query, project, scope = 'all', limit = 10 } = params

  // 1. Get embedding for the query
  const queryVector = await embedText(query)

  // 2. FTS5 OR match (broad match)
  const queryTokens = query
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 1)
  
  const ftsQuery = queryTokens.length > 0 ? queryTokens.join(' OR ') : ''

  let scopeFilter = '1=1'
  const bindings: (string | number)[] = []

  if (scope === 'project') {
    scopeFilter = "(project = ? OR scope = 'global')"
    bindings.push(project)
  } else if (scope === 'global') {
    scopeFilter = "scope = 'global'"
  } else {
    scopeFilter = "(project = ? OR scope = 'global')"
    bindings.push(project)
  }

  // We pull a larger candidate pool to rerank via vectors
  // If FTS matches nothing (e.g. synonym used), we fallback to fetching recent memories
  let candidates: (RawRow & { fts_rank: number })[] = []
  
  if (ftsQuery) {
    candidates = db.prepare(`
      SELECT m.*, rank as fts_rank
      FROM memories_fts
      JOIN memories m ON memories_fts.id = m.id
      WHERE memories_fts MATCH ? AND ${scopeFilter.replace(/project/g, 'm.project').replace(/scope/g, 'm.scope')}
      LIMIT 100
    `).all(ftsQuery, ...bindings) as any[]
  }

  // Fallback / padding: grab top 50 recent memories in scope to catch semantic matches that missed keyword
  if (candidates.length < 50) {
    const recents = db.prepare(`
      SELECT *, 0 as fts_rank
      FROM memories
      WHERE ${scopeFilter}
      ORDER BY created_at DESC LIMIT 50
    `).all(...bindings) as any[]
    
    // merge avoiding duplicates
    const seen = new Set(candidates.map(c => c.id))
    for (const r of recents) {
      if (!seen.has(r.id)) {
        candidates.push(r)
        seen.add(r.id)
      }
    }
  }

  // 3. Score and Rerank
  const typeWeight: Record<string, number> = {
    decision: 7, architecture: 6, bug: 5,
    preference: 4, fact: 3, session: 2, general: 1,
  }

  const scored = candidates.map(row => {
    // calculate semantic similarity if embedding exists
    let semanticScore = 0
    if (row.embedding) {
      const dbVector = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4)
      semanticScore = cosineSimilarity(queryVector, Array.from(dbVector))
    }

    const final_score = (
      (semanticScore * 50) +               // Vector sim is strong signal (0-1 range * 50)
      (Math.abs(row.fts_rank) * -0.5) +    // FTS rank (closer to 0 is better)
      (row.access_count * 0.5) +           // Hit count
      ((typeWeight[row.type] ?? 1) * 0.3)  // Priority
    )

    return { ...row, semanticScore, final_score }
  })

  // Sort by final score
  const ranked = scored
    .sort((a, b) => b.final_score - a.final_score)
    .filter(r => r.semanticScore > 0.3 || r.fts_rank < 0) // drop if totally irrelevant
    .slice(0, limit)

  // 4. Update access stats
  if (ranked.length > 0) {
    const updateStmt = db.prepare(
      'UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?'
    )
    const ts = now()
    db.transaction((ids: string[]) => {
      for (const id of ids) updateStmt.run(ts, id)
    })(ranked.map(r => r.id))
  }

  return ranked.map(r => ({
    id: r.id,
    content: r.content,
    type: r.type as MemoryType,
    tags: JSON.parse(r.tags) as string[],
    scope: r.scope as 'project' | 'global',
    created_at: r.created_at,
    relevance_hint: `sim:${r.semanticScore.toFixed(2)}`,
  }))
}

// ─── PRUNING ──────────────────────────────────────────────────────────────────
export function pruneMemories(params: {
  project: string
  maxAge?: number
  maxTotal?: number
  keepMinAccess?: number
}): number {
  const db = getDb()
  const {
    project,
    maxAge = 30 * 24 * 60 * 60 * 1000,
    maxTotal = 500,
    keepMinAccess = 1,
  } = params

  const cutoff = now() - maxAge

  const result = db.prepare(`
    DELETE FROM memories
    WHERE project = ?
      AND access_count < ?
      AND created_at < ?
      AND type NOT IN ('decision', 'architecture')
  `).run(project, keepMinAccess, cutoff)

  const total = (db.prepare('SELECT COUNT(*) as n FROM memories WHERE project = ?').get(project) as { n: number }).n
  let evicted = result.changes

  if (total > maxTotal) {
    const victims = db.prepare(`
      SELECT id FROM memories
      WHERE project = ? AND type NOT IN ('decision', 'architecture')
      ORDER BY (access_count * 2 + created_at / 1000000.0) ASC
      LIMIT ?
    `).all(project, total - maxTotal) as { id: string }[]

    const del = db.prepare('DELETE FROM memories WHERE id = ?')
    db.transaction((ids: string[]) => { for (const id of ids) del.run(id) })(victims.map(v => v.id))
    evicted += victims.length
  }

  return evicted
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
export function deleteMemory(id: string): boolean {
  return getDb().prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0
}

// ─── SESSION ──────────────────────────────────────────────────────────────────
export function createSession(params: { project: string; summary: string; started_at: number }): string {
  const db = getDb()
  const id = randomUUID()
  db.prepare(
    'INSERT INTO sessions (id, project, summary, started_at, ended_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, params.project, params.summary, params.started_at, now())
  return id
}

export function listSessions(project: string, limit = 10) {
  return getDb().prepare('SELECT * FROM sessions WHERE project = ? ORDER BY ended_at DESC LIMIT ?').all(project, limit)
}

export function getRecentContext(project: string): string | null {
  const db = getDb()
  const session = db.prepare('SELECT summary FROM sessions WHERE project = ? ORDER BY ended_at DESC LIMIT 1').get(project) as any
  const topMemories = db.prepare(`
    SELECT content, type FROM memories
    WHERE (project = ? OR scope = 'global')
    ORDER BY (access_count * 2 + created_at / 1000000.0) DESC
    LIMIT 5
  `).all(project) as any[]

  if (!session && topMemories.length === 0) return null

  const parts: string[] = []
  if (session) parts.push(`Last session: ${session.summary}`)
  if (topMemories.length > 0) parts.push('Key facts: ' + topMemories.map(m => `[${m.type}] ${m.content}`).join(' | '))
  return parts.join('\n')
}

export function getStats(project: string) {
  const db = getDb()
  const total = (db.prepare("SELECT COUNT(*) as n FROM memories WHERE project = ? OR scope = 'global'").get(project) as any).n
  const byType = db.prepare("SELECT type, COUNT(*) as n FROM memories WHERE project = ? OR scope = 'global' GROUP BY type").all(project)
  const neverAccessed = (db.prepare("SELECT COUNT(*) as n FROM memories WHERE project = ? AND access_count = 0").get(project) as any).n
  const sessions = (db.prepare('SELECT COUNT(*) as n FROM sessions WHERE project = ?').get(project) as any).n
  return { total, byType, neverAccessed, sessions }
}

interface RawRow {
  id: string; content: string; type: string; tags: string; project: string; scope: string
  created_at: number; updated_at: number; access_count: number; last_accessed: number | null
  embedding: Buffer | null
}
function rowToMemory(row: RawRow): Memory {
  return {
    id: row.id, content: row.content, type: row.type as MemoryType,
    tags: JSON.parse(row.tags), project: row.project, scope: row.scope as 'project' | 'global',
    created_at: row.created_at, updated_at: row.updated_at,
    access_count: row.access_count, last_accessed: row.last_accessed,
  }
}
