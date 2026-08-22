// 开发控制台模块入口。
import type { ModuleProps } from '../../../app/types'
import { AccountManagement } from './AccountManagement'
import { PlatformManagement } from './PlatformManagement'
import './developer-console.css'

export function DeveloperConsoleModule({ user, onUserProfileUpdated, onModuleSettingsUpdated }: ModuleProps) {
  return (
    <div className="developer-console module-page">
      <section className="developer-console__heading">
        <h1>平台管理</h1>
        <p>统一管理账号权限、模块配置与服务状态。</p>
      </section>

      {onModuleSettingsUpdated && <PlatformManagement onModuleSettingsUpdated={onModuleSettingsUpdated} />}

      <AccountManagement
        user={user}
        {...(onUserProfileUpdated ? { onCurrentUserProfileUpdated: onUserProfileUpdated } : {})}
      />

    </div>
  )
}
