import { database } from '../../../database.js'
import { WeComCheckinClient } from './wecom-checkin-client.js'
import { WeComDirectoryRepository } from './wecom-directory-repository.js'
import { synchronizeWeComDirectory } from './wecom-directory-sync.js'

async function main(): Promise<void> {
  const result = await synchronizeWeComDirectory(new WeComDirectoryRepository(database), new WeComCheckinClient())
  console.log(`企业微信通讯录关联完成：通讯录成员=${result.directoryMembers}，待关联员工=${result.candidates}，成功关联=${result.linked}，未匹配=${result.unmatched}，待人工确认=${result.ambiguous}`)
}

void main().finally(() => database.end())
