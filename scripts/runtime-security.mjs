import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** 只允许运行时必需配置，禁止继承数据库、企业微信、日报等业务凭证。 @param {NodeJS.ProcessEnv} environment */
export function runtimeEnvironment(environment) {
  const allowed = ['PATH', 'LANG', 'LC_ALL', 'TZ', 'NODE_ENV', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'HEGONGZUO_SERVICE_CREDENTIAL_REVISION', 'HEGONGZUO_RUNTIME_TOKEN', 'HEGONGZUO_EMPLOYEE_GATEWAY_URL', 'HEGONGZUO_RUNTIME_ID', 'HEGONGZUO_RUNTIME_PORT']
  return Object.fromEntries(allowed.flatMap((key) => environment[key] === undefined ? [] : [[key, environment[key]]]))
}

/** @param {string} root @param {{runtimeId: string, accountKey: string}} definition @param {NodeJS.ProcessEnv} environment */
export async function provisionRuntimeCredentials(root, definition, environment) {
  const directory = path.join(root, '.runtime', 'agent-credentials')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const target = path.join(directory, `${definition.runtimeId}.json`)
  let credential
  try { credential = JSON.parse(await readFile(target, 'utf8')) } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error
  }
  if (!credential) {
    credential = { accountKey: definition.accountKey, token: randomBytes(32).toString('hex') }
    await writeFile(target, JSON.stringify(credential), { mode: 0o600, flag: 'wx' })
  }
  if (credential.accountKey !== definition.accountKey || !/^[a-f0-9]{64}$/.test(credential.token)) throw new Error('运行时凭证归属无效。')
  const variables = {
    ...runtimeEnvironment(environment),
    HEGONGZUO_RUNTIME_TOKEN: credential.token,
    HEGONGZUO_EMPLOYEE_GATEWAY_URL: `http://127.0.0.1:${environment.HEGONGZUO_API_PORT ?? '4174'}/api/internal/agent-employees`,
  }
  const envPath = path.join(directory, `${definition.runtimeId}.env`)
  const content = Object.entries(variables).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n'
  await writeFile(`${envPath}.${process.pid}.tmp`, content, { mode: 0o600 })
  await rename(`${envPath}.${process.pid}.tmp`, envPath)
  await chmod(envPath, 0o600)
}
