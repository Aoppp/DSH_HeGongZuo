// 项目管理模块入口。
import { BriefcaseBusiness } from 'lucide-react'

import type { ModuleProps } from '../../../app/types'
import { ManagementPlaceholder } from '../../management/placeholder/ManagementPlaceholder'

export function ProjectManagementModule(props: ModuleProps) {
  return <ManagementPlaceholder {...props} title="项目管理" icon={BriefcaseBusiness} />
}
