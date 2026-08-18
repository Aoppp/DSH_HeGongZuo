import { accountAgentRuntimeDefinitions } from './account-agent-runtimes.ts'

export interface AccountAgentRuntime {
  readonly accountId: string
  readonly apiBasePath: string
}

const accountAgentRuntimes: Readonly<Record<string, AccountAgentRuntime>> = Object.fromEntries(
  accountAgentRuntimeDefinitions.map((definition) => [
    definition.accountId,
    {
      accountId: definition.accountId,
      apiBasePath: definition.apiBasePath,
    },
  ]),
)

// 故意不设共享 fallback。未配置的账号必须显式分配独立运行时，避免会话串号。
export function getAccountAgentRuntime(accountId: string): AccountAgentRuntime | undefined {
  return accountAgentRuntimes[accountId]
}
