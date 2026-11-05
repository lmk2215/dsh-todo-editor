/**
 * Install / uninstall dsh-todo-editor into a local DeepSeek Harness profile.
 *
 *   node scripts/install.mjs                     install into ~/.dsh/profiles/desktop
 *   node scripts/install.mjs --profile <dir>     target another profile directory
 *   node scripts/install.mjs --dsh <app/dsh>     point at the Harness package root
 *   node scripts/install.mjs --revert            undo everything it did
 *
 * Why a script: profiles are plain folders, so a local package can be linked by
 * hand. That path needs no pnpm, which matters on machines where the CLI package
 * manager is unavailable. Junction creation on Windows needs no administrator
 * rights (fs.symlinkSync with type "junction").
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..')
const PKG_NAME = 'dsh-todo-editor'
const TODO_PKG = path.join('@deepseek-ai', 'dsh-tool-todo', 'lib', 'index.js')
const OLD_LINE = 'if (event.type === "turn/start") return null;'
const NEW_LINE =
  'if (event.type === "turn/start") return Array.isArray(state) && state.some((item) => item.status !== "completed") ? state : null;'

function parseArgs(argv) {
  const out = { revert: false, profile: null, dsh: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--revert') out.revert = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--profile') out.profile = argv[++i]
    else if (arg === '--dsh') out.dsh = argv[++i]
    else {
      console.error(`unknown argument: ${arg}`)
      process.exit(2)
    }
  }
  return out
}

function log(step, message) {
  console.log(`[${step}] ${message}`)
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

/** Default profile directory used by the desktop build. */
function defaultProfile() {
  return path.join(os.homedir(), '.dsh', 'profiles', 'desktop')
}

/**
 * Locate the Harness package root that owns the built-in plugins.
 * @param explicit - value of --dsh, when supplied.
 * @returns absolute path, or undefined when nothing plausible exists.
 */
function findDshRoot(explicit) {
  const candidates = []
  if (explicit) candidates.push(explicit)
  if (process.env.DSH_ROOT) candidates.push(process.env.DSH_ROOT)
  if (process.platform === 'win32') {
    candidates.push(
      'D:\\DeepSeek Harness\\resources\\app\\dsh',
      'C:\\Program Files\\DeepSeek Harness\\resources\\app\\dsh',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DeepSeek Harness', 'resources', 'app', 'dsh')
    )
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/DeepSeek Harness.app/Contents/Resources/app/dsh')
  } else {
    candidates.push('/opt/DeepSeek Harness/resources/app/dsh', '/usr/lib/deepseek-harness/resources/app/dsh')
  }
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(path.join(candidate, 'node_modules', TODO_PKG))) return candidate
  }
  return undefined
}

function linkPlugin(profileDir) {
  const target = path.join(profileDir, 'node_modules', PKG_NAME)
  fs.mkdirSync(path.join(profileDir, 'node_modules'), { recursive: true })
  const stat = fs.lstatSync(target, { throwIfNoEntry: false })
  if (stat) {
    if (stat.isSymbolicLink()) {
      const actual = safeRealpath(target)
      if (actual && path.resolve(actual) === path.resolve(REPO_ROOT)) {
        log('link', 'already linked')
        return
      }
      log('link', `replacing link pointing at ${actual || '(broken)'}`)
      fs.rmSync(target, { force: true })
    } else {
      log('link', `${target} exists and is not a link; leaving it alone`)
      return
    }
  }
  fs.symlinkSync(REPO_ROOT, target, process.platform === 'win32' ? 'junction' : 'dir')
  log('link', `${target} -> ${REPO_ROOT}`)
}

function safeRealpath(target) {
  try {
    return fs.realpathSync(target)
  } catch {
    return undefined
  }
}

function unlinkPlugin(profileDir) {
  const target = path.join(profileDir, 'node_modules', PKG_NAME)
  const stat = fs.lstatSync(target, { throwIfNoEntry: false })
  if (!stat) {
    log('link', 'no link to remove')
    return
  }
  fs.rmSync(target, { recursive: false, force: true })
  log('link', 'removed')
}

function registerInProfile(profileDir) {
  const file = path.join(profileDir, 'package.json')
  if (!fs.existsSync(file)) {
    log('profile', `${file} not found; skipping registration`)
    return
  }
  const pkg = readJson(file)
  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  const bundles = (pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || [])
  const deps = (pkg.dependencies = pkg.dependencies || {})
  let changed = false
  if (!bundles.includes(PKG_NAME)) {
    bundles.push(PKG_NAME)
    changed = true
    log('profile', 'bundles += ' + PKG_NAME)
  }
  const wanted = `link:${REPO_ROOT.replace(/\\/g, '/')}`
  if (deps[PKG_NAME] !== wanted) {
    deps[PKG_NAME] = wanted
    changed = true
    log('profile', `dependencies["${PKG_NAME}"] = ${wanted}`)
  }
  if (changed) {
    fs.copyFileSync(file, `${file}.bak-todoeditor-${Date.now()}`)
    writeJson(file, pkg)
    log('profile', 'written (backup kept beside it)')
  } else {
    log('profile', 'already registered')
  }
}

function unregisterFromProfile(profileDir) {
  const file = path.join(profileDir, 'package.json')
  if (!fs.existsSync(file)) return
  const pkg = readJson(file)
  const bundles = pkg.dsh?.profile?.bundles
  let changed = false
  if (Array.isArray(bundles) && bundles.includes(PKG_NAME)) {
    pkg.dsh.profile.bundles = bundles.filter((name) => name !== PKG_NAME)
    changed = true
    log('profile', 'bundles -= ' + PKG_NAME)
  }
  if (pkg.dependencies && PKG_NAME in pkg.dependencies) {
    delete pkg.dependencies[PKG_NAME]
    changed = true
    log('profile', 'dependencies entry removed')
  }
  if (changed) writeJson(file, pkg)
  else log('profile', 'nothing to unregister')
}

function patchHost(dshRoot) {
  if (!dshRoot) {
    log('patch', 'Harness root not found; pass --dsh <app/dsh dir> to apply the projection patch')
    return
  }
  const file = path.join(dshRoot, 'node_modules', TODO_PKG)
  if (!fs.existsSync(file)) {
    log('patch', `missing ${file}; skipped`)
    return
  }
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes(NEW_LINE)) {
    log('patch', 'already applied')
    return
  }
  if (!source.includes(OLD_LINE)) {
    log('patch', 'anchor line not found (Harness version changed?); skipped — see patches/ for manual steps')
    return
  }
  const backup = `${file}.bak-todoeditor-${Date.now()}`
  fs.copyFileSync(file, backup)
  fs.writeFileSync(file, source.replace(OLD_LINE, NEW_LINE), 'utf8')
  log('patch', `applied; backup at ${path.basename(backup)}`)
}

function revertHost(dshRoot) {
  if (!dshRoot) {
    log('patch', 'Harness root not found; pass --dsh <app/dsh dir> to revert the projection patch')
    return
  }
  const file = path.join(dshRoot, 'node_modules', TODO_PKG)
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) return
  const backups = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(`${path.basename(file)}.bak-todoeditor-`))
    .sort()
    .reverse()
  if (backups.length === 0) {
    log('patch', 'no backup found; nothing to revert')
    return
  }
  fs.copyFileSync(path.join(dir, backups[0]), file)
  log('patch', `restored from ${backups[0]}`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('node scripts/install.mjs [--profile <dir>] [--dsh <app/dsh dir>] [--revert]')
    return
  }
  const profileDir = path.resolve(args.profile || defaultProfile())
  if (!fs.existsSync(profileDir)) {
    console.error(`profile directory not found: ${profileDir}`)
    process.exit(1)
  }
  const dshRoot = findDshRoot(args.dsh)

  log('info', `repository: ${REPO_ROOT}`)
  log('info', `profile:    ${profileDir}`)
  log('info', `harness:    ${dshRoot || '(not found)'}`)

  if (args.revert) {
    unlinkPlugin(profileDir)
    unregisterFromProfile(profileDir)
    revertHost(dshRoot)
    log('done', 'reverted — restart the Harness app')
    return
  }

  linkPlugin(profileDir)
  registerInProfile(profileDir)
  patchHost(dshRoot)
  log('done', 'installed — restart the Harness app (a page refresh is not enough)')
}

main()
