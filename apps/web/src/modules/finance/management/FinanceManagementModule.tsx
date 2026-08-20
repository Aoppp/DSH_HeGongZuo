// 财务管理模块入口。
import { Landmark } from 'lucide-react'

import type { ModuleProps } from '../../../app/types'
import { ManagementPlaceholder } from '../../management/placeholder/ManagementPlaceholder'

export function FinanceManagementModule(props: ModuleProps) {
  return <ManagementPlaceholder {...props} title="财务管理" icon={Landmark} />
}
