#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { resolveConfig } from './config.js'
import { openDb } from './store/db.js'
import { createServer } from './server.js'

// parse --project flag
function parseArgs(): { project?: string } {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--project')
  return { project: idx !== -1 ? args[idx + 1] : undefined }
}

async function main() {
  const { project: projectArg } = parseArgs()
  const config = resolveConfig(projectArg)

  // open project DB (global DB shares the same store, different path)
  openDb(config.projectDbPath)

  const server = createServer(config.projectName)
  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error(`cacheai-mcp running — project: ${config.projectName}`)
  console.error(`  DB: ${config.projectDbPath}`)
  console.error(`  Global DB: ${config.globalDbPath}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
