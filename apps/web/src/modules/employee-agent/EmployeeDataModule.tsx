import type { ModuleProps } from '../../app/types'
import { EmployeeDataManagement } from './EmployeeDataManagement'

export function EmployeeDataModule({ onNavigate }: ModuleProps) {
  return <EmployeeDataManagement backLabel="返回概览" onBack={() => onNavigate('overview')} />
}

