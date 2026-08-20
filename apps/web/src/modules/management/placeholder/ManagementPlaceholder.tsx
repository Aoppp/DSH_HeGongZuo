// 管理模块占位页面。
import type { LucideIcon } from 'lucide-react'

import type { ModuleProps } from '../../../app/types'
import './management-placeholder.css'

interface ManagementPlaceholderProps extends ModuleProps {
  readonly title: string
  readonly icon: LucideIcon
}

export function ManagementPlaceholder({ title, icon: Icon }: ManagementPlaceholderProps) {
  return (
    <section className="management-placeholder module-page">
      <div className="management-placeholder__card panel-card">
        <span><Icon size={25} /></span>
        <h1>{title}</h1>
        <p>待开发</p>
      </div>
    </section>
  )
}
