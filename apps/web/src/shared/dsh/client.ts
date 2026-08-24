// DSH 网页协议适配的共享入口。现有实现保持兼容，业务模块仅依赖此公共边界。
export { AccountDshApiClient, DshRequestError, unwrapDshResponse } from '../../modules/employee/agent/dsh-api-client'
