// End-to-end integration test for mcp-manager (host half).
//
// Runs inside the profile plugin tree so bare imports (@deepseek-ai/*)
// resolve through the profile's node_modules (e.g. ~/.dsh/profiles/node_modules).
// Uses a REAL Cordis
// context, the REAL settings-file provider (file-backed, so the schemastery
// schema contract is exercised), mocked tools/webServer, the REAL
// dsh-mcp-client, and a local mock Streamable HTTP MCP server. Exercises both
// management surfaces: the mcp_manage model tool and the HTTP API consumed by
// the web settings UI.
import http from 'node:http'
import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import plugin from './lib/index.js'

// ---------- mock Streamable HTTP MCP server ----------
function startMockMcp() {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(405, { 'content-type': 'text/plain' })
      res.end('no sse stream')
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let msg
      try { msg = JSON.parse(body) } catch {
        res.writeHead(400)
        res.end()
        return
      }
      res.setHeader('mcp-session-id', req.headers['mcp-session-id'] ?? `mock-${Math.random().toString(36).slice(2)}`)
      const isRequest = msg && msg.id !== undefined && typeof msg.method === 'string'
      if (!isRequest) {
        res.writeHead(202)
        res.end()
        return
      }
      let result
      switch (msg.method) {
        case 'initialize':
          result = {
            protocolVersion: msg.params?.protocolVersion ?? '2025-03-26',
            capabilities: { tools: {} },
            serverInfo: { name: 'mock-mcp', version: '1.0.0' },
          }
          break
        case 'tools/list':
          result = {
            tools: [{
              name: 'ping',
              description: 'A ping tool',
              inputSchema: { type: 'object', properties: {} },
            }],
          }
          break
        case 'tools/call':
          result = { content: [{ type: 'text', text: 'pong' }] }
          break
        default:
          result = undefined
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(result === undefined
        ? { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } }
        : { jsonrpc: '2.0', id: msg.id, result }))
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}/mcp`, close: () => server.close() })
    })
  })
}

// ---------- mocks (tools + webServer only; settings is the REAL provider) ----------
function mockServices() {
  const registrations = new Map()
  const routes = []
  const tools = {
    register(def) {
      registrations.set(def.name, def)
      return () => registrations.delete(def.name)
    },
    schemas() {
      return [...registrations.values()].map(({ name, description, parameters }) => ({ name, description, parameters }))
    },
  }
  const webServer = {
    register(route) {
      routes.push(route)
      return () => {
        const i = routes.indexOf(route)
        if (i >= 0) routes.splice(i, 1)
      }
    },
  }
  return { tools, webServer, registrations, routes }
}

const has = (r, name) => r.has(name)
async function waitFor(fn, timeoutMs = 10000, label = 'condition') {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (fn()) return
    await sleep(100)
  }
  throw new Error(`timeout waiting for ${label}`)
}

/** Invoke the mcp-manager HTTP route with a fake request/response. */
async function httpCall(routes, method, url, body) {
  const route = routes.find((r) => r.kind === 'prefix' && r.path === '/api/mcp-manager')
  if (!route) throw new Error('mcp-manager HTTP route not registered')
  const res = {
    status: null,
    headers: null,
    raw: '',
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(body) { this.raw = String(body) },
  }
  if (body !== undefined) {
    const req = new EventEmitter()
    req.method = method
    req.url = url
    const pending = route.handler(req, res)
    req.emit('data', JSON.stringify(body))
    req.emit('end')
    await pending
  } else {
    const req = { method, url }
    await route.handler(req, res)
  }
  return { status: res.status, body: JSON.parse(res.raw) }
}

// ---------- run ----------
const mock = await startMockMcp()
const tempDir = mkdtempSync(join(tmpdir(), 'mcp-manager-test-'))
const settingsPath = join(tempDir, 'settings.yaml')
let passed = 0
const ok = (label) => { passed += 1; console.log(`ok ${passed}: ${label}`) }

try {
  // Seed the settings document exactly like a user would.
  writeFileSync(settingsPath, [
    'mcp:',
    '  servers:',
    '    - serverName: demo',
    '      transport: streamable-http',
    `      url: ${mock.url}`,
    '      headers:',
    '        Authorization: Bearer topsecret',
    '',
  ].join('\n'))

  const { tools, webServer, registrations, routes } = mockServices()

  const root = new Context()
  root.provide('tools', tools)
  root.provide('webServer', webServer)
  await root.plugin(FileSettingsProvider, { path: settingsPath, dshHome: tempDir, watch: false })
  const fiber = root.plugin(plugin, {})

  // 1) seeded server connects; its tool appears
  await waitFor(() => has(registrations, 'mcp__demo__ping'), 15000, 'mcp__demo__ping registration')
  ok('seeded streamable-http server connected; mcp__demo__ping registered')

  // 2) tool round-trip works
  const ping = registrations.get('mcp__demo__ping')
  const pingResult = await ping.execute({}, {})
  if (pingResult.content?.[0]?.text !== 'pong') throw new Error(`unexpected ping result: ${JSON.stringify(pingResult)}`)
  ok('mcp__demo__ping callTool round-trip works')

  // 3) HTTP GET lists servers with status and header KEYS but no header values
  const get = await httpCall(routes, 'GET', '/api/mcp-manager/servers')
  if (get.status !== 200 || !get.body.ok) throw new Error(`GET failed: ${JSON.stringify(get)}`)
  const demoEntry = get.body.servers.find((s) => s.serverName === 'demo')
  if (!demoEntry.mounted || demoEntry.toolCount !== 1) throw new Error(`bad GET entry: ${JSON.stringify(demoEntry)}`)
  if (!Array.isArray(demoEntry.headerKeys) || !demoEntry.headerKeys.includes('Authorization')) throw new Error(`headerKeys missing: ${JSON.stringify(demoEntry)}`)
  if (JSON.stringify(get.body).includes('topsecret')) throw new Error('header VALUES leaked through HTTP API')
  ok('HTTP GET: status + headerKeys present, header values never echoed')

  // 4) mcp_manage tool list works (no headerKeys there)
  const manage = registrations.get('mcp_manage')
  const list = await manage.execute({ action: 'list' }, {})
  const demoViaTool = list.servers.find((s) => s.serverName === 'demo')
  if (!demoViaTool?.mounted || demoViaTool.toolCount !== 1) throw new Error(`bad tool list: ${JSON.stringify(list)}`)
  if (demoViaTool.headerKeys !== undefined) throw new Error('tool list must not include headerKeys')
  ok('mcp_manage list works; no header keys in model-facing output')

  // 5) HTTP POST adds a server (persists through the real settings provider), then connects
  const add = await httpCall(routes, 'POST', '/api/mcp-manager/servers', { server: { serverName: 'demo2', transport: 'streamable-http', url: mock.url } })
  if (!add.body.ok) throw new Error(`POST add failed: ${JSON.stringify(add.body)}`)
  await waitFor(() => has(registrations, 'mcp__demo2__ping'), 15000, 'mcp__demo2__ping registration')
  const addEntry = add.body.servers.find((s) => s.serverName === 'demo2')
  if (!addEntry?.mounted) throw new Error(`demo2 not mounted after POST: ${JSON.stringify(add.body)}`)
  const persisted = readFileSync(settingsPath, 'utf8')
  if (!persisted.includes('demo2')) throw new Error('added server not persisted to settings file')
  ok('HTTP POST add persists via the settings provider and mounts; mcp__demo2__ping registered')

  // 6) HTTP POST rejects duplicates
  const dup = await httpCall(routes, 'POST', '/api/mcp-manager/servers', { server: { serverName: 'demo', transport: 'streamable-http', url: mock.url } })
  if (dup.body.ok !== false || !dup.body.error.includes('already configured')) throw new Error(`dup not rejected: ${JSON.stringify(dup.body)}`)
  ok('HTTP POST rejects duplicate serverName')

  // 7) HTTP DELETE removes the server; its tools disappear
  const del = await httpCall(routes, 'DELETE', '/api/mcp-manager/servers/demo2')
  if (!del.body.ok) throw new Error(`DELETE failed: ${JSON.stringify(del.body)}`)
  await waitFor(() => !has(registrations, 'mcp__demo2__ping'), 10000, 'mcp__demo2__ping removal')
  ok('HTTP DELETE unmounts server; mcp__demo2__ping unregistered')

  // 8) HTTP DELETE unknown name and unknown path
  const delUnknown = await httpCall(routes, 'DELETE', '/api/mcp-manager/servers/nope')
  if (delUnknown.body.ok !== false) throw new Error(`DELETE unknown not rejected: ${JSON.stringify(delUnknown.body)}`)
  const notFound = await httpCall(routes, 'GET', '/api/mcp-manager/other')
  if (notFound.status !== 404 || notFound.body.ok !== false) throw new Error(`404 not returned: ${JSON.stringify(notFound)}`)
  ok('HTTP API rejects unknown servers and paths')

  // 9) HTTP PUT edits a server: url replaced, headers kept, persisted, remounted
  const put = await httpCall(routes, 'PUT', '/api/mcp-manager/servers/demo', { server: { url: `${mock.url}?edited=1` } })
  if (!put.body.ok) throw new Error(`PUT edit failed: ${JSON.stringify(put.body)}`)
  const editedEntry = put.body.servers.find((s) => s.serverName === 'demo')
  if (editedEntry.url !== `${mock.url}?edited=1`) throw new Error(`url not edited: ${JSON.stringify(editedEntry)}`)
  if (!editedEntry.mounted) throw new Error('server not mounted after edit')
  if (!editedEntry.headerKeys.includes('Authorization')) throw new Error('headers must survive an edit that omits them')
  const persistedAfterEdit = readFileSync(settingsPath, 'utf8')
  if (!persistedAfterEdit.includes('edited=1')) throw new Error('edited url not persisted to settings file')
  await waitFor(() => has(registrations, 'mcp__demo__ping'), 10000, 'mcp__demo__ping re-registration after edit')
  ok('HTTP PUT edit: url replaced, headers kept, persisted, reconnected')

  // 10) HTTP PUT with headers {} clears all headers
  const clearHeaders = await httpCall(routes, 'PUT', '/api/mcp-manager/servers/demo', { server: { headers: {} } })
  if (!clearHeaders.body.ok) throw new Error(`PUT clear headers failed: ${JSON.stringify(clearHeaders.body)}`)
  const clearedEntry = clearHeaders.body.servers.find((s) => s.serverName === 'demo')
  if (clearedEntry.headerKeys.length !== 0) throw new Error(`headers not cleared: ${JSON.stringify(clearedEntry)}`)
  ok('HTTP PUT headers {} clears all headers')

  // 11) HTTP PUT rejects unknown name, serverName mismatch, and invalid transport switch
  const putUnknown = await httpCall(routes, 'PUT', '/api/mcp-manager/servers/nope', { server: { url: 'http://x' } })
  if (putUnknown.body.ok !== false) throw new Error(`PUT unknown not rejected: ${JSON.stringify(putUnknown.body)}`)
  const putMismatch = await httpCall(routes, 'PUT', '/api/mcp-manager/servers/demo', { server: { serverName: 'other', url: 'http://x' } })
  if (putMismatch.body.ok !== false) throw new Error(`PUT rename not rejected: ${JSON.stringify(putMismatch.body)}`)
  const putBadSwitch = await httpCall(routes, 'PUT', '/api/mcp-manager/servers/demo', { server: { transport: 'stdio' } })
  if (putBadSwitch.body.ok !== false) throw new Error(`PUT stdio-without-command not rejected: ${JSON.stringify(putBadSwitch.body)}`)
  ok('HTTP PUT rejects unknown name, rename, and invalid transport switch')

  // 12) tool edit merges: patch url only, headers preserved
  // (test 10 cleared headers — restore them first)
  const restoreHeaders = await httpCall(routes, 'PUT', '/api/mcp-manager/servers/demo', { server: { headers: { Authorization: 'Bearer topsecret' } } })
  if (!restoreHeaders.body.ok) throw new Error(`restore headers failed: ${JSON.stringify(restoreHeaders.body)}`)
  const toolEdit = await manage.execute({ action: 'edit', serverName: 'demo', server: { url: `${mock.url}?tooledited=1` } }, {})
  if (!toolEdit.ok) throw new Error(`tool edit failed: ${JSON.stringify(toolEdit)}`)
  const toolEdited = toolEdit.servers.find((s) => s.serverName === 'demo')
  if (toolEdited.url !== `${mock.url}?tooledited=1`) throw new Error(`tool edit url wrong: ${JSON.stringify(toolEdited)}`)
  const getAfterToolEdit = await httpCall(routes, 'GET', '/api/mcp-manager/servers')
  const toolEditedEntry = getAfterToolEdit.body.servers.find((s) => s.serverName === 'demo')
  if (!toolEditedEntry.headerKeys.includes('Authorization')) throw new Error('tool edit must keep headers when omitted')
  ok('mcp_manage edit merges patch fields and keeps headers')

  // 13) tool edit rejects bad patches; empty patch is a no-op success
  const toolBadPatch = await manage.execute({ action: 'edit', serverName: 'demo', server: { toolCallTimeoutMs: -5 } }, {})
  if (toolBadPatch.ok !== false) throw new Error(`tool bad patch not rejected: ${JSON.stringify(toolBadPatch)}`)
  const toolEditMissing = await manage.execute({ action: 'edit', serverName: 'demo', server: {} }, {})
  if (!toolEditMissing.ok) throw new Error(`tool empty patch should be a no-op success: ${JSON.stringify(toolEditMissing)}`)
  ok('mcp_manage edit rejects invalid patches and accepts empty no-op')

  // 9) HTTP POST with malformed JSON -> error response, no crash
  const badRoute = routes.find((r) => r.kind === 'prefix' && r.path === '/api/mcp-manager')
  const badRes = { status: null, raw: '', writeHead(s) { this.status = s }, end(b) { this.raw = String(b) } }
  const badReq = new EventEmitter()
  badReq.method = 'POST'
  badReq.url = '/api/mcp-manager/servers'
  const badPending = badRoute.handler(badReq, badRes)
  badReq.emit('data', '{not json')
  badReq.emit('end')
  await badPending
  const badBody = JSON.parse(badRes.raw)
  if (badBody.ok !== false) throw new Error(`malformed JSON not rejected: ${JSON.stringify(badBody)}`)
  ok('HTTP API rejects malformed JSON body')

  // 10) disposing the manager plugin unmounts everything and drops the route
  fiber.dispose()
  await waitFor(() => !has(registrations, 'mcp__demo__ping') && !has(registrations, 'mcp_manage'), 10000, 'full cleanup')
  if (routes.some((r) => r.path === '/api/mcp-manager')) throw new Error('HTTP route not disposed')
  ok('plugin disposal unregisters tools and the HTTP route')

  console.log(`ALL TESTS PASSED (${passed})`)
} finally {
  mock.close()
  rmSync(tempDir, { recursive: true, force: true })
}
