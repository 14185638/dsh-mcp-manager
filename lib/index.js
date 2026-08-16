// mcp-manager — dynamic MCP server management for the DeepSeek Harness.
// Dual-face package: `lib/index.js` is the Host plugin, `lib/client.js` is
// the browser "MCP管理" settings section (same package, one composition row).
//
// MCP servers are declared in the `mcp` settings namespace
// ($DSH_HOME/settings.yaml, section `mcp:`) and are hot-synced: adding or
// removing a server mounts/unmounts an @deepseek-ai/dsh-mcp-client instance
// whose tools become available to the model as
// `mcp__<serverName>__<toolName>` (Streamable HTTP or stdio transport).
//
// Three management surfaces share one set of operations:
//   - the `mcp_manage` model tool (list / add / edit / remove);
//   - an HTTP API for the web settings UI, served on the same origin as the
//     web app via the webServer service:
//       GET    /api/mcp-manager/servers
//       POST   /api/mcp-manager/servers   { server: {...} }
//       PUT    /api/mcp-manager/servers/<serverName>   { server: {...patch} }
//       DELETE /api/mcp-manager/servers/<serverName>
//   - direct editing of the settings.yaml `mcp:` section.
//
// NOTE: the settings service requires schemastery schemas (callable), not
// zod — `ctx.settings.register()` resolves the stored section through the
// schema, so a non-function schema fails activation.

import z from '@deepseek-ai/schemastery'
import * as mcpClient from '@deepseek-ai/dsh-mcp-client'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

const NS = settingsNamespace('mcp')

const ServerConfigSchema = z.object({
  serverName: z.string().required().pattern(/^[A-Za-z0-9_-]{1,32}$/),
  transport: z.union([z.const('streamable-http'), z.const('stdio')]),
  url: z.string(),
  headers: z.dict(String),
  command: z.string(),
  args: z.array(String),
  env: z.dict(String),
  cwd: z.string(),
  toolCallTimeoutMs: z.number().min(1),
  failOnStartupError: z.boolean(),
})

// Partial patch for editing: every field optional. `headers` omitted keeps
// the current value; `headers: {}` clears all headers.
const ServerPatchSchema = z.object({
  serverName: z.string().pattern(/^[A-Za-z0-9_-]{1,32}$/),
  transport: z.union([z.const('streamable-http'), z.const('stdio')]),
  url: z.string(),
  headers: z.dict(String),
  command: z.string(),
  args: z.array(String),
  env: z.dict(String),
  cwd: z.string(),
  toolCallTimeoutMs: z.number().min(1),
  failOnStartupError: z.boolean(),
})

// The settings user layer is kept lenient so one hand-edited typo does not
// poison the whole section; every entry is validated per-server in sync().
const McpSettingsSchema = z.object({
  servers: z.array(z.any()).default([]),
})

/** Safe-parse one server entry through the schemastery standard-schema face.
 * Schemastery normalizes IN PLACE, but settings values and tool arguments
 * arrive deep-frozen — clone first so resolution never touches the input. */
function parseServer(raw) {
  const result = ServerConfigSchema['~standard'].validate(JSON.parse(JSON.stringify(raw)))
  if (result.issues) {
    return { ok: false, error: result.issues.map((issue) => issue.message).join('; ') }
  }
  return { ok: true, value: result.value }
}

/** Read a JSON request body. */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += String(chunk) })
    req.on('end', () => {
      try {
        resolve(body.length === 0 ? {} : JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

export default {
  name: 'mcp-manager',
  inject: ['tools', 'settings', 'webServer'],
  apply(ctx) {
    const scope = ctx.settings.register(NS, McpSettingsSchema)
    const mounted = new Map() // serverName -> { dispose, config }

    // Build the exact config accepted by the mcp-client plugin (only keys
    // that are defined; schemastery defaults fill the rest).
    const buildClientConfig = (server) => {
      const config = {
        serverName: server.serverName,
        transport: server.transport,
      }
      if (server.transport === 'streamable-http') {
        config.url = server.url
        if (server.headers !== undefined) config.headers = server.headers
      } else {
        config.command = server.command
        if (server.args !== undefined) config.args = server.args
        if (server.env !== undefined) config.env = server.env
        if (server.cwd !== undefined) config.cwd = server.cwd
      }
      if (server.toolCallTimeoutMs !== undefined) config.toolCallTimeoutMs = server.toolCallTimeoutMs
      if (server.failOnStartupError !== undefined) config.failOnStartupError = server.failOnStartupError
      return config
    }

    const mount = (server) => {
      if (mounted.has(server.serverName)) return
      const config = buildClientConfig(server)
      const fiber = ctx.plugin({ ...mcpClient }, config)
      mounted.set(server.serverName, { dispose: () => fiber.dispose(), config })
      fiber.then(undefined, (error) => {
        ctx.logger.warn(`mcp-manager: server "${server.serverName}" failed to activate: ${String(error)}`)
      })
      ctx.logger.info(`mcp-manager: server "${server.serverName}" (${server.transport}) mounting`)
    }

    const unmount = (name) => {
      const entry = mounted.get(name)
      if (!entry) return
      entry.dispose()
      mounted.delete(name)
      ctx.logger.info(`mcp-manager: server "${name}" unmounted`)
    }

    // Diff the desired server list against what is mounted. Configs are
    // plain JSON, so string equality is a faithful change detector.
    const sync = (servers) => {
      const desired = new Map()
      for (const raw of servers ?? []) {
        const parsed = parseServer(raw)
        if (!parsed.ok) {
          ctx.logger.warn(`mcp-manager: skipping invalid server entry: ${parsed.error}`)
          continue
        }
        const server = parsed.value
        if (server.transport === 'streamable-http' && !server.url) {
          ctx.logger.warn(`mcp-manager: skipping "${server.serverName}": streamable-http requires a url`)
          continue
        }
        if (server.transport === 'stdio' && !server.command) {
          ctx.logger.warn(`mcp-manager: skipping "${server.serverName}": stdio requires a command`)
          continue
        }
        desired.set(server.serverName, server)
      }
      for (const name of [...mounted.keys()]) {
        if (!desired.has(name)) unmount(name)
      }
      for (const [name, server] of desired) {
        const current = mounted.get(name)
        if (current && JSON.stringify(current.config) === JSON.stringify(buildClientConfig(server))) continue
        if (current) unmount(name)
        mount(server)
      }
    }

    sync(scope.get()?.servers ?? [])
    ctx.effect(() => scope.watch((next) => sync(next?.servers ?? [])))

    // ---- shared operations (mcp_manage tool + HTTP API) ----
    const toolCount = (serverName) => {
      try {
        return ctx.tools.schemas().filter((s) => s.name.startsWith(`mcp__${serverName}__`)).length
      } catch {
        return 0
      }
    }

    const listServers = (options = {}) => {
      const servers = (scope.get()?.servers ?? [])
        .map((server) => parseServer(server))
        .filter((r) => r.ok)
        .map((r) => r.value)
        .map((server) => ({
          serverName: server.serverName,
          transport: server.transport,
          url: server.url,
          command: server.command,
          mounted: mounted.has(server.serverName),
          toolCount: toolCount(server.serverName),
          // Header KEYS only: values (auth tokens) are never echoed back.
          ...(options.includeHeaderKeys ? { headerKeys: Object.keys(server.headers ?? {}) } : {}),
        }))
      return { ok: true, servers }
    }

    const addServer = async (server, includeHeaderKeys = false) => {
      const parsed = parseServer(server)
      if (!parsed.ok) {
        return { ok: false, error: `invalid server config: ${parsed.error}` }
      }
      const config = parsed.value
      if (config.transport === 'streamable-http' && !config.url) {
        return { ok: false, error: 'streamable-http server requires a url' }
      }
      if (config.transport === 'stdio' && !config.command) {
        return { ok: false, error: 'stdio server requires a command' }
      }
      const current = scope.get()?.servers ?? []
      if (current.some((s) => parseServer(s).ok && s.serverName === config.serverName)) {
        return { ok: false, error: `serverName "${config.serverName}" is already configured` }
      }
      await scope.update({ servers: [...current, config] })
      await new Promise((resolve) => setTimeout(resolve, 150)) // let the settings watch commit
      return listServers({ includeHeaderKeys })
    }

    const removeServer = async (serverName, includeHeaderKeys = false) => {
      const current = scope.get()?.servers ?? []
      const next = current.filter((s) => !(parseServer(s).ok && s.serverName === serverName))
      if (next.length === current.length) {
        return { ok: false, error: `no server named "${serverName}" is configured` }
      }
      await scope.update({ servers: next })
      await new Promise((resolve) => setTimeout(resolve, 150))
      return listServers({ includeHeaderKeys })
    }

    // Merge a partial patch into the named server's config. serverName is
    // the identity and cannot be changed; `headers: {}` clears all headers.
    const editServer = async (serverName, patch, includeHeaderKeys = false) => {
      if (typeof serverName !== 'string' || serverName.length === 0) {
        return { ok: false, error: 'serverName is required' }
      }
      const current = scope.get()?.servers ?? []
      const index = current.findIndex((s) => parseServer(s).ok && parseServer(s).value.serverName === serverName)
      if (index < 0) {
        return { ok: false, error: `no server named "${serverName}" is configured` }
      }
      if (patch === undefined || patch === null || typeof patch !== 'object') {
        return { ok: false, error: 'edit requires a server patch object' }
      }
      const patchResult = ServerPatchSchema['~standard'].validate(JSON.parse(JSON.stringify(patch)))
      if (patchResult.issues) {
        return { ok: false, error: `invalid server patch: ${patchResult.issues.map((issue) => issue.message).join('; ')}` }
      }
      const partial = patchResult.value
      if (partial.serverName !== undefined && partial.serverName !== serverName) {
        return { ok: false, error: 'serverName cannot be changed by edit' }
      }
      // Schemastery normalizes dict fields to {} when absent, which would
      // erase existing headers/env on an unrelated edit — only apply dict
      // fields when the caller actually provided the key.
      const rawPatch = JSON.parse(JSON.stringify(patch))
      const hasKey = (key) => Object.prototype.hasOwnProperty.call(rawPatch, key)
      const merged = { ...parseServer(current[index]).value }
      for (const key of ['transport', 'url', 'command', 'args', 'cwd', 'toolCallTimeoutMs', 'failOnStartupError']) {
        if (partial[key] !== undefined) merged[key] = partial[key]
      }
      for (const key of ['headers', 'env']) {
        if (hasKey(key)) merged[key] = partial[key]
      }
      const parsed = parseServer(merged)
      if (!parsed.ok) {
        return { ok: false, error: `invalid merged server config: ${parsed.error}` }
      }
      const finalServer = parsed.value
      if (finalServer.transport === 'streamable-http' && !finalServer.url) {
        return { ok: false, error: 'streamable-http server requires a url' }
      }
      if (finalServer.transport === 'stdio' && !finalServer.command) {
        return { ok: false, error: 'stdio server requires a command' }
      }
      const next = [...current]
      next[index] = finalServer
      await scope.update({ servers: next })
      await new Promise((resolve) => setTimeout(resolve, 150))
      return listServers({ includeHeaderKeys })
    }

    // ---- mcp_manage model tool ----
    ctx.effect(() => ctx.tools.register({
      name: 'mcp_manage',
      description:
        'Manage MCP servers: list configured servers and their mounted tool counts, add a server ' +
        '(Streamable HTTP or stdio), edit one (fields not provided keep their current values; ' +
        'headers: {} clears all headers), or remove one. Tools of a connected server are callable ' +
        'as mcp__<serverName>__<toolName>. Headers may carry auth tokens; they are never echoed back.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'add', 'edit', 'remove'],
            description: 'list: show configured servers; add: register a new server; edit: update an existing server; remove: delete a server',
          },
          server: {
            type: 'object',
            description: 'server definition; required for add, a partial patch for edit',
            properties: {
              serverName: { type: 'string', description: 'unique namespace prefix for this server (A-Za-z0-9_-); for edit, identifies the server and cannot be changed' },
              transport: { type: 'string', enum: ['streamable-http', 'stdio'], description: 'MCP transport' },
              url: { type: 'string', description: 'Streamable HTTP endpoint URL (required for streamable-http)' },
              headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'extra HTTP headers, e.g. Authorization; an empty object clears all headers' },
              command: { type: 'string', description: 'executable to spawn (required for stdio)' },
              args: { type: 'array', items: { type: 'string' }, description: 'arguments for the stdio command' },
              env: { type: 'object', additionalProperties: { type: 'string' }, description: 'extra env for the stdio command' },
              cwd: { type: 'string', description: 'working directory for the stdio command' },
              toolCallTimeoutMs: { type: 'number', description: 'per tool-call timeout in ms (default 60000)' },
            },
            required: ['serverName', 'transport'],
          },
          serverName: {
            type: 'string',
            description: 'name of the server to edit or remove; required for edit and remove',
          },
        },
        required: ['action'],
      },
      output: {
        schema: { type: 'object' },
        render(args, value) {
          return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
        },
      },
      async execute(args, exec) {
        const action = args?.action
        try {
          if (action === 'list') return listServers()
          if (action === 'add') return await addServer(args?.server)
          if (action === 'edit') return await editServer(args?.serverName, args?.server)
          if (action === 'remove') return await removeServer(args?.serverName)
          return { ok: false, error: `unknown action "${action}"` }
        } catch (error) {
          return { ok: false, error: String(error?.message ?? error) }
        }
      },
    }))

    // ---- HTTP API for the web settings UI (same origin) ----
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/api/mcp-manager',
      async handler(req, res) {
        const send = (status, body) => {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(body))
        }
        try {
          const url = new URL(req.url ?? '/', 'http://internal')
          const parts = url.pathname.split('/').filter(Boolean)
          const joined = parts.join('/')
          if (joined === 'api/mcp-manager/servers' && req.method === 'GET') {
            return send(200, listServers({ includeHeaderKeys: true }))
          }
          if (joined === 'api/mcp-manager/servers' && req.method === 'POST') {
            const payload = await readJson(req)
            return send(200, await addServer(payload?.server, true))
          }
          if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'mcp-manager' && parts[2] === 'servers' && req.method === 'PUT') {
            const payload = await readJson(req)
            return send(200, await editServer(decodeURIComponent(parts[3]), payload?.server, true))
          }
          if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'mcp-manager' && parts[2] === 'servers' && req.method === 'DELETE') {
            return send(200, await removeServer(decodeURIComponent(parts[3]), true))
          }
          send(404, { ok: false, error: 'not found' })
        } catch (error) {
          send(500, { ok: false, error: String(error?.message ?? error) })
        }
      },
    }))
  },
}
