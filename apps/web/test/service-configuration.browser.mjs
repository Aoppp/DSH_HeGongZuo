// 可选真实浏览器回归；先启动构建后的 preview。全部 API 被页面内测试替身拦截。
// BROWSER_BINARY 可指定 Chrome 路径，PREVIEW_URL 默认 http://127.0.0.1:4175。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(os.tmpdir(), 'hg-credential-browser-'))
const chrome = spawn(process.env.BROWSER_BINARY ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
let socket
const pending = new Map()
let sequence = 0
try {
  const url = await new Promise((resolve, reject) => {
    let value = ''
    const timeout = setTimeout(() => reject(new Error('浏览器启动超时')), 15_000)
    chrome.stderr.on('data', (chunk) => { value += String(chunk); const match = value.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timeout); resolve(match[1]) } })
    chrome.once('error', reject)
    chrome.once('exit', () => { clearTimeout(timeout); reject(new Error('浏览器已退出')) })
  })
  socket = new WebSocket(url)
  await new Promise((resolve) => socket.addEventListener('open', resolve))
  socket.addEventListener('message', (event) => { const message = JSON.parse(String(event.data)); if (message.id) { const item = pending.get(message.id); pending.delete(message.id); if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result) } })
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) })
  const targetId = (await call('Target.createTarget', { url: 'about:blank' })).targetId
  const sessionId = (await call('Target.attachToTarget', { targetId, flatten: true })).sessionId
  const command = (method, params = {}) => call(method, params, sessionId)
  await command('Page.enable'); await command('Runtime.enable')
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.fixtureCalls=[];
    const entries=[{id:'assistant',label:'助手服务',configured:true,revision:null,updatedAt:null,updatedBy:null,state:'environment',pending:0},{id:'daily-report',label:'日报分析服务',configured:true,revision:null,updatedAt:null,updatedBy:null,state:'environment',pending:0}];
    const original=window.fetch;
    window.fetch=async function(url,options={}) {
      const path=new URL(String(url),location.origin).pathname;
      if(!path.startsWith('/api/'))return original.apply(this,arguments);
      let data={},status=200;window.fixtureCalls.push(path);
      if(path==='/api/auth/me')data={user:{id:'fixture',accountId:'fixture',displayName:'界面验证',position:'开发',permissions:['platform-administration']}};
      else if(path==='/api/platform/access')data={disabledModuleIds:[]};
      else if(path==='/api/platform/status')data={database:'available',modules:[],agentRuntimes:{expected:0,running:0,idle:0,unavailable:[]}};
      else if(path==='/api/platform/meeting-upload-credentials')data={credentials:[]};
      else if(path==='/api/accounts')data={accounts:[]};
      else if(path==='/api/accounts/permission-catalog')data={permissions:[]};
      else if(path==='/api/accounts/notification-preferences')data={preferences:[]};
      else if(path==='/api/notifications')data={notifications:[],unread:0};
      else if(path==='/api/platform/service-credentials')data={services:entries};
      else if(path.startsWith('/api/platform/service-credentials/')) {
        const body=JSON.parse(options.body||'{}');
        if(body.key==='fixture-bad-credential-value'){status=400;data={error:'密钥验证失败，原配置未更改。'};}
        else {
          data={success:true};
          if(path.endsWith('/save'))Object.assign(entries[0],{revision:'11111111-1111-4111-8111-111111111111',updatedAt:new Date().toISOString(),updatedBy:'界面验证',state:'waiting',pending:2});
          if(path.endsWith('/apply')){if(body.interrupt!==true)throw new Error('缺少中断确认');entries[0].state='effective';entries[0].pending=0;}
        }
      }
      return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
    };` })
  const evaluate = async (expression) => { const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value }
  const until = async (expression) => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await new Promise((resolve) => setTimeout(resolve, 100)) }
    console.error(await evaluate('JSON.stringify({location:location.href,text:document.body.innerText.slice(0,1000),requests:window.fixtureCalls})'))
    throw new Error(`等待界面超时：${expression}`)
  }
  const click = (label) => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)})?.click()`)
  await command('Page.navigate', { url: `${process.env.PREVIEW_URL ?? 'http://127.0.0.1:4175'}/developer` })
  await until("document.body.innerText.includes('服务配置')")
  assert.equal(await evaluate("!!document.querySelector('.service-credentials')"), false)
  await evaluate("Array.from(document.querySelectorAll('h2')).find(h=>h.textContent==='服务配置').closest('section').querySelector('button').click()")
  await until("document.body.innerText.includes('日报分析服务')")
  await click('更换密钥'); await until("!!document.querySelector('dialog[open]')")
  await evaluate("document.querySelector('#service-credential-input').focus()")
  await command('Input.insertText', { text: 'fixture-bad-credential-value' })
  await click('验证连接'); await until("document.body.innerText.includes('密钥验证失败')")
  assert.equal(await evaluate("window.fixtureCalls.some(p=>p.endsWith('/save'))"), false)
  await evaluate("document.querySelector('#service-credential-input').select()")
  await command('Input.insertText', { text: 'fixture-valid-service-credential' })
  await click('验证连接'); await until("document.body.innerText.includes('连接验证通过')")
  await evaluate("document.querySelector('dialog button[aria-label=关闭]').click()")
  await until("document.body.innerText.includes('新密钥尚未保存')"); await click('继续编辑')
  await click('验证并保存'); await until("!document.querySelector('dialog[open]') && document.body.innerText.includes('部分连接待更新')")
  await click('立即生效'); await until("document.body.innerText.includes('可能中断尚未完成的回复')")
  await click('取消'); assert.equal(await evaluate("window.fixtureCalls.some(p=>p.endsWith('/apply'))"), false)
  await click('立即生效'); await click('确认重新连接')
  await until("!document.querySelector('dialog[open]') && document.body.innerText.includes('已生效')")
  assert.equal(await evaluate('localStorage.length+sessionStorage.length'), 0)
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await evaluate("document.querySelector('.service-credentials').scrollIntoView({block:'start'})")
  await new Promise((resolve) => setTimeout(resolve, 250))
  assert.equal(await evaluate('document.documentElement.scrollWidth > window.innerWidth + 1'), false)
  const screenshot = await command('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(os.tmpdir(), 'hegongzuo-service-credentials-mobile.png'), Buffer.from(screenshot.data, 'base64'))
  console.log('浏览器回归通过：折叠、验证失败/成功、未保存提醒、保存、生效确认/取消、状态更新、无本地存储、390px布局。')
} finally {
  socket?.close()
  if (chrome.exitCode === null) { chrome.kill(); await new Promise((resolve) => chrome.once('exit', resolve)) }
  await rm(profile, { recursive: true, force: true })
}
