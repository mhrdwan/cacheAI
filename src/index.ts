#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { resolveConfig } from './config.js'
import { openDb } from './store/db.js'
import { createServer } from './server.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function parseArgs(): { project?: string; isInit: boolean } {
  const args = process.argv.slice(2)
  const isInit = args[0] === 'init'
  const idx = args.indexOf('--project')
  return { project: idx !== -1 ? args[idx + 1] : undefined, isInit }
}

async function runInit() {
  console.log('🧠 Initializing cacheAI globally...')
  
  const binPath = 'cacheai-mcp' // Assuming it's installed globally via npm install -g

  // 1. Install Skill for Claude/Opencode
  const skillDir = path.join(os.homedir(), '.claude', 'skills', 'cacheai')
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true })
  }
  const skillPath = path.join(skillDir, 'SKILL.md')
  const skillContent = `<skill_content name="cacheai">
# Skill: cacheAI Persistent Memory

You are equipped with cacheAI, a persistent memory system (via MCP).

## Core Rules:
1. **Always load context first**: If this is a new session or you are asked to continue work, call \`context_status\` with \`{ "action": "load" }\` to get the latest project context.
2. **Remember decisions & bugs**: Whenever you make a technical decision, choose a framework, fix a complex bug, or learn a user preference, call \`remember\`.
3. **Session Summary**: At the end of a long task, call \`session_summary\` to leave a trail for your future self.
4. **Recall when stuck**: If you forget how something was configured, use \`recall\` to search your memory.

Do not re-analyze the whole project if cacheAI already knows the stack. Use your memory!
</skill_content>`
  fs.writeFileSync(skillPath, skillContent, 'utf8')
  console.log('✅ Skill installed at:', skillPath)

  // 2. Patch opencode.json
  const opencodePath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
  if (fs.existsSync(opencodePath)) {
    try {
      const config = JSON.parse(fs.readFileSync(opencodePath, 'utf8'))
      config.mcp = config.mcp || {}
      config.mcp.cacheai = {
        type: "local",
        command: "npx",
        args: ["-y", "cacheai-mcp", "--project", "."]
      }
      fs.writeFileSync(opencodePath, JSON.stringify(config, null, 2), 'utf8')
      console.log('✅ Registered MCP server in opencode.json')
    } catch (e) {
      console.error('❌ Failed to patch opencode.json:', e)
    }
  }

  // 3. Patch Claude Desktop config
  const claudePath = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  if (fs.existsSync(claudePath)) {
    try {
      const config = JSON.parse(fs.readFileSync(claudePath, 'utf8'))
      config.mcpServers = config.mcpServers || {}
      config.mcpServers.cacheai = {
        command: "npx",
        args: ["-y", "cacheai-mcp", "--project", "."]
      }
      fs.writeFileSync(claudePath, JSON.stringify(config, null, 2), 'utf8')
      console.log('✅ Registered MCP server in claude_desktop_config.json')
    } catch (e) {
      console.error('❌ Failed to patch claude_desktop_config.json:', e)
    }
  }

  // 4. Patch Claude CLI config (~/.claude.json)
  const claudeCliPath = path.join(os.homedir(), '.claude.json')
  if (fs.existsSync(claudeCliPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(claudeCliPath, 'utf8'))
      config.mcpServers = config.mcpServers || {}
      config.mcpServers.cacheai = {
        command: "npx",
        args: ["-y", "cacheai-mcp", "--project", "."]
      }
      fs.writeFileSync(claudeCliPath, JSON.stringify(config, null, 2), 'utf8')
      console.log('✅ Registered MCP server in ~/.claude.json (Claude CLI)')
    } catch (e) {
      console.error('❌ Failed to patch ~/.claude.json:', e)
    }
  }

  console.log('\n🎉 cacheAI global initialization complete!')
  console.log('Make sure you have installed it globally: npm install -g .')
  process.exit(0)
}

async function main() {
  const { project: projectArg, isInit } = parseArgs()
  
  if (isInit) {
    await runInit()
    return
  }

  const config = resolveConfig(projectArg)
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
