import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {join,extname,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import assert from 'node:assert/strict'
const root = resolve(process.env.MPKPB_BUILD_DIR ?? 'dist')
const edgeExecutable = process.env.MPKPB_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const testProfile = join(tmpdir(), 'mpkpb-qa-' + Date.now())
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}
let nextRelease = false
const server=createServer(async (req,res)=>{
  try {
    if (req.url === '/seed') {
      res.setHeader('Content-Type', 'text/html')
      res.end('<!doctype html><title>Legacy fixture</title>')
      return
    }
    const file=join(root,new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'))
    res.setHeader('Content-Type',mime[extname(file)]??'text/plain')
    if (req.url === '/sw.js' && nextRelease) {
      const worker = await readFile(file, 'utf8')
      res.end(worker.replace(/cachePrefix \+ '[0-9a-f]+'/, "cachePrefix + 'qa-next-release'"))
    } else {
      res.end(await readFile(file))
    }
  } catch {res.statusCode=404; res.end()}
})
await new Promise(r=>server.listen(4187,'127.0.0.1',r))
const browser=spawn(edgeExecutable,[
  '--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9587',
  '--user-data-dir=' + testProfile,'about:blank',
],{stdio:'ignore',windowsHide:true})
let socket
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
try {
  let targets
  for(let i=0;i<50;i++){
    try {targets=await (await fetch('http://127.0.0.1:9587/json/list')).json();break} catch {await sleep(100)}
  }
  assert.ok(targets,'Edge CDP started')
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
  await new Promise(r=>socket.addEventListener('open',r,{once:true}))
  let id=0
  const pending=new Map()
  const runtimeErrors=[]
  socket.addEventListener('message',({data})=>{
    const m=JSON.parse(data)
    if(m.method==='Runtime.exceptionThrown')runtimeErrors.push(m.params.exceptionDetails)
    if(m.id && pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}
  })
  async function cmd(method,params={}){
    const m=await new Promise(r=>{pending.set(++id,r);socket.send(JSON.stringify({id,method,params}))})
    if(m.error)throw Error(JSON.stringify(m.error))
    return m.result
  }
  async function ev(expression){
    const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
    if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text)
    return r.result.value
  }
  async function wait(expression){
    for(let i=0;i<80;i++){
      if(await ev(expression))return
      await sleep(100)
    }
    throw Error('Timed out: '+expression+'\n'+await ev('document.body.innerText'))
  }
  const has=text=>'document.body.innerText.includes('+JSON.stringify(text)+')'
  async function click(text){
    await ev('Array.from(document.querySelectorAll("button")).find(e => (e.textContent.trim() === '+JSON.stringify(text)+' || e.querySelector("small")?.textContent === '+JSON.stringify(text)+') && e.getBoundingClientRect().width).click()')
  }
  async function fill(selector,value) {
    await ev('(()=>{const e=document.querySelector('+JSON.stringify(selector)+'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,'+JSON.stringify(value)+');e.dispatchEvent(new Event("input",{bubbles:true}));})()')
  }
  await cmd('Page.enable')
  await cmd('Runtime.enable')
  await cmd('Emulation.setDeviceMetricsOverride',{width:375,height:780,deviceScaleFactor:1,mobile:true})
  await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await cmd('Page.navigate',{url:'http://127.0.0.1:4187/'})
  await wait(has('WELCOME TO MPKPB?'))
  await ev('document.querySelector("[name=walletName]").value="QA Wallet"; document.querySelector("form.wallet-form").requestSubmit()')
  await wait(has('QA Wallet'))
  await wait('Boolean(navigator.serviceWorker.controller)')
  await click('More')
  await wait(has('Save history'))
  await click('Create snapshot')
  await wait(has('Snapshot saved on this device.'))
  assert.ok(await ev('document.documentElement.scrollWidth <= innerWidth'))
  const fixture={format:'mpkpb',version:1,createdAt:'2026-01-01T00:00:00Z',records:{wallets:[],transactions:[],categories:[],budgets:[],debts:[],scheduledEvents:[],preferences:[{key:'onboardingComplete',value:'true'}]}}
  await ev('(()=>{const d=new DataTransfer(); d.items.add(new File(['+JSON.stringify(JSON.stringify(fixture))+'],"qa.json",{type:"application/json"})); const e=document.querySelector("input[type=file]");e.files=d.files;e.dispatchEvent(new Event("change",{bubbles:true}));})()')
  await wait(has('Restore preview'))
  await click('Replace current records')
  await wait('!document.body.innerText.includes("QA Wallet") && document.body.innerText.includes("SPENDABLE")')
  await click('More')
  await wait(has('Before restore'))
  await ev('Array.from(document.querySelectorAll("button")).find(e=>e.textContent.startsWith("Before restore")).click()')
  await wait(has('1 wallets'))
  await click('Replace current records')
  await wait(has('QA Wallet'))
  await click('More')
  await wait(has('Enable PIN'))
  await fill('[name=pin]','123456')
  await fill('[name=confirm]','123456')
  await click('Enable PIN')
  await wait(has('MPKPB? is locked'))
  await fill('[name=pin]','654321')
  await click('Unlock')
  await wait(has('That PIN did not match'))
  await fill('[name=pin]','123456')
  await click('Unlock')
  await wait(has('QA Wallet'))
  await cmd('Network.enable')
  await cmd('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
  await cmd('Page.reload')
  await wait(has('MPKPB? is locked'))
  await fill('[name=pin]','123456')
  await click('Unlock')
  await wait(has('QA Wallet'))
  await click('Wallets')
  await wait(has('QA Wallet'))
  await ev('Array.from(document.querySelectorAll("button")).find(e=>e.innerText.trim().endsWith("Add wallet")).click()')
  await wait('Boolean(document.querySelector("[name=walletName]"))')
  await ev('document.querySelector("[name=walletName]").value="Offline Wallet"; document.querySelector("form.wallet-form").requestSubmit()')
  await wait(has('Offline Wallet'))
  await cmd('Page.reload')
  await wait(has('MPKPB? is locked'))
  await fill('[name=pin]','123456')
  await click('Unlock')
  await wait(has('Offline Wallet'))
  await click('Forecast')
  await wait(has('SAFE TO SPEND'))
  assert.ok(await ev('document.documentElement.scrollWidth <= innerWidth'))
  await cmd('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  })
  nextRelease = true
  await ev('navigator.serviceWorker.getRegistration().then(registration => registration.update()).then(() => true)')
  await wait(has('An app update is ready'))
  await wait('caches.keys().then(keys => keys.some(key => key.endsWith(":qa-next-release")))')
  await cmd('Page.navigate', {url: 'about:blank'})
  await sleep(500)
  await cmd('Page.navigate', {url: 'http://127.0.0.1:4187/'})
  await wait(has('MPKPB? is locked'))
  await fill('[name=pin]', '123456')
  await click('Unlock')
  await wait(has('Offline Wallet'))
  await wait('caches.keys().then(keys => keys.length === 1 && keys[0].endsWith(":qa-next-release"))')
  await cmd('Emulation.clearDeviceMetricsOverride')
  await cmd('Page.navigate', {url: 'http://localhost:4187/seed'})
  await wait('document.title === "Legacy fixture"')
  await ev(`new Promise((resolve, reject) => {
    const open = indexedDB.open('mpkpb', 4)
    open.onupgradeneeded = () => {
      const time = '2026-01-01T00:00:00Z'
      open.result.createObjectStore('wallets', {keyPath: 'id'}).add({
        id: 'legacy-wallet', name: 'Legacy Wallet', type: 'Cash', icon: 'cash', color: 'green',
        openingBalanceCentavos: 5000, protected: false, archived: false, createdAt: time, updatedAt: time,
      })
      open.result.createObjectStore('transactions', {keyPath: 'id'}).add({
        id: 'legacy-expense', kind: 'expense', walletId: 'legacy-wallet', amountCentavos: 1234,
        occurredOn: '2026-01-01', description: 'Legacy expense', createdAt: time, updatedAt: time,
      })
    }
    open.onerror = () => reject(open.error)
    open.onsuccess = () => { open.result.close(); resolve(true) }
  })`)
  await cmd('Page.navigate', {url: 'http://localhost:4187/'})
  await wait(has('Legacy Wallet'))
  await wait(has('37.66'))
  assert.deepEqual(runtimeErrors,[])
  console.log('PASS: mobile onboarding, autosave, snapshots, import/restore, PIN, offline writes and reloads, forecast, safe update activation, and v4 migration.')
} finally {
  socket?.close()
  browser.kill()
  server.close()
}
