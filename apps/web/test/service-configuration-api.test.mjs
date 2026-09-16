import assert from 'node:assert/strict'
import test from 'node:test'
import { credentialRequest, serviceStateLabels } from '../src/modules/developer/service-configuration/service-configuration-api.ts'

test('服务凭证仅由同源后端提交、不缓存且保留错误，不放入URL', async () => {
  const previous=globalThis.fetch
  const fixture='fixture-key-not-for-real-use'
  try {
    globalThis.fetch=async (url,init)=>{
      assert.equal(url,'/api/platform/service-credentials/daily-report/save')
      assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store')
      assert.equal(JSON.parse(init.body).key,fixture)
      return Response.json({success:true})
    }
    assert.deepEqual(await credentialRequest('/daily-report/save',{key:fixture,revision:null}),{success:true})
    globalThis.fetch=async()=>Response.json({error:'无权访问'},{status:403})
    await assert.rejects(credentialRequest(),/无权访问/)
    assert.equal(serviceStateLabels.waiting,'部分连接待更新')
  } finally {globalThis.fetch=previous}
})
