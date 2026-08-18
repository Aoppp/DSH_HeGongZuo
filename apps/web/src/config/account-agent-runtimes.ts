import runtimeDefinitions from '../../../../.runtime/account-agent-runtimes.json' with { type: 'json' }

export interface AccountAgentRuntimeDefinition {
  readonly accountId: string
  readonly port: number
  readonly apiBasePath: string
  readonly workspaceDirectory: string
}

export const accountAgentRuntimeDefinitions = runtimeDefinitions as readonly AccountAgentRuntimeDefinition[]
