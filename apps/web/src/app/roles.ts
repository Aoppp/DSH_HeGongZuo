import type { RoleDefinition, RoleId } from './types'

export const roles: Readonly<Record<RoleId, RoleDefinition>> = {
  owner: {
    id: 'owner',
    label: 'CEO',
    title: '首席执行官',
    description: '查看企业概况并使用全部已开放的工作功能',
    initials: '和',
  },
  developer: {
    id: 'developer',
    label: '开发者',
    title: '平台开发与运维',
    description: '验证查询服务、检查集成状态并维护平台模块',
    initials: '开',
  },
}

export const roleList = Object.values(roles)
