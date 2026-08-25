import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { agentPackageRevision, waitForProvisionedPackage } from '../../../scripts/agent-package-revision.mjs'

test('运行时等待能力包安装版本与当前源码完全一致', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hegongzuo-agent-revision-'))
  await mkdir(path.join(root, 'dist'))
  await writeFile(path.join(root, 'package.json'), '{}')
  await writeFile(path.join(root, 'cordis.patch.yml'), '[]')
  await writeFile(path.join(root, 'dist', 'index.js'), 'export {}')
  const revision = await agentPackageRevision(root)
  const revisionPath = path.join(root, '.package-revision')
  await writeFile(revisionPath, `${revision}\n`)
  await waitForProvisionedPackage(revisionPath, revision, { attempts: 1 })
  await assert.rejects(waitForProvisionedPackage(revisionPath, 'outdated', { attempts: 1 }), /未在规定时间内完成安装/)
})
