// Smoke test for the mcp-manager browser bundle (client face).
//
// Evaluates lib/client.js in a Node VM with a stub window/require, then
// drives the plugin registration path (apply -> slots.inject -> register)
// and inspects the section registration. React internals are never rendered
// here, so plain stubs are enough.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const code = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8')

let handoff = null
const windowStub = {
  __ModuleLoader__: { load: (h) => { handoff = h } },
}

const reactStub = {
  createElement: () => ({}),
  useState: () => [undefined, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
}
const jsxStub = { jsx: () => ({}), jsxs: () => ({}), Fragment: Symbol('fragment') }

const requireStub = (spec) => {
  if (spec === 'react') return reactStub
  if (spec === 'react/jsx-runtime') return jsxStub
  throw new Error(`unexpected require: ${spec}`)
}

const context = vm.createContext({ window: windowStub, console, document: undefined })
vm.runInContext(code, context)

if (!handoff) throw new Error('bundle did not register with __ModuleLoader__')
if (handoff.id !== 'mcp-manager') throw new Error(`unexpected bundle id: ${handoff.id}`)

const mod = handoff.factory(requireStub)
console.log('exports:', Object.keys(mod), '| inject:', JSON.stringify(mod.inject))
if (typeof mod.apply !== 'function') throw new Error('apply not exported')
if (!Array.isArray(mod.inject) || !mod.inject.includes('slots')) throw new Error('inject must include slots')

// Drive the registration path.
let injectedName = null
let registered = null
const fakeCtx = {
  slots: {
    inject(name, cb) {
      injectedName = name
      registered = cb()
    },
    register(opts, component) {
      return { ...opts, render: component }
    },
  },
}
mod.apply(fakeCtx)

if (injectedName !== 'settings.section') throw new Error(`slots.inject target wrong: ${injectedName}`)
if (!registered) throw new Error('slots.register was not called')
if (registered.name !== 'settings.section') throw new Error(`register name wrong: ${registered.name}`)
if (registered.id !== 'mcp') throw new Error(`register id wrong: ${registered.id}`)
if (registered.order !== 25) throw new Error(`register order wrong: ${registered.order}`)
if (typeof registered.label !== 'string' || registered.label !== 'MCP管理') throw new Error(`register label wrong: ${registered.label}`)
if (typeof registered.render !== 'function') throw new Error('expected a component render function')

console.log('CLIENT BUNDLE SMOKE TEST PASSED')
