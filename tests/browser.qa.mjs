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
    for(let i=0;i<125;i++){
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
  await cmd('Page.addScriptToEvaluateOnNewDocument', {source: 'Math.random = () => 0'})
  await cmd('Runtime.enable')
  await cmd('Emulation.setDeviceMetricsOverride',{width:375,height:780,deviceScaleFactor:1,mobile:true})
  await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await cmd('Page.navigate',{url:'http://127.0.0.1:4187/'})
  await wait(has('WELCOME TO MPKPB?'))
  assert.equal(await ev('getComputedStyle(document.querySelector("[name=walletName]")).fontSize'), '16px')
  assert.equal(await ev('getComputedStyle(document.querySelector("[name=openingBalance]")).fontSize'), '16px')
  assert.equal(await ev('getComputedStyle(document.querySelector("[name=walletType]")).fontSize'), '16px')
  assert.ok(await ev('(() => { const input = document.querySelector("[name=openingBalance]"); input.focus(); return !input.value && input.placeholder === "0.00" && getComputedStyle(input).outlineStyle === "none" && getComputedStyle(input.parentElement).outlineStyle === "solid"; })()'))
  await ev('document.querySelector("[name=walletName]").value="QA Wallet"; document.querySelector("form.wallet-form").requestSubmit()')
  await wait(has('QA Wallet'))
  await wait('getComputedStyle(document.querySelector(".mobile-brand .brand-mascot-slot")).visibility === "hidden"')
  const brandTextOffset = () => ev('document.querySelector(".mobile-brand strong").getBoundingClientRect().left - document.querySelector(".mobile-brand").getBoundingClientRect().left')
  assert.equal(await brandTextOffset(), 0)
  await wait('Boolean(navigator.serviceWorker.controller)')
  const mascot = 'document.querySelector(".greeting-mascot canvas")'
  assert.equal(await ev(mascot + '.hidden'), true)
  await cmd('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'no-preference'}]})
  await wait(mascot + '?.dataset.frame === "0" && !' + mascot + '.hidden')
  const idleStarted = Date.now()
  await wait(mascot + '?.dataset.frame === "1"')
  assert.ok(Date.now() - idleStarted >= 7900)
  await ev('Object.defineProperty(document, "hidden", {configurable: true, get: () => true}); document.dispatchEvent(new Event("visibilitychange"))')
  const pausedFrame = await ev(mascot + '.dataset.frame')
  await sleep(420)
  assert.equal(await ev(mascot + '.dataset.frame'), pausedFrame)
  await ev('delete document.hidden; document.dispatchEvent(new Event("visibilitychange"))')
  await wait(mascot + '?.dataset.frame !== ' + JSON.stringify(pausedFrame))
  await ev('window.scrollTo(0, document.documentElement.scrollHeight)')
  await sleep(100)
  const offscreenFrame = await ev(mascot + '.dataset.frame')
  await sleep(420)
  assert.equal(await ev(mascot + '.dataset.frame'), offscreenFrame)
  await ev('window.scrollTo(0, 0)')
  await wait(mascot + '?.dataset.frame === "0"')
  await cmd('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]})
  await wait(mascot + '.hidden')
  assert.equal(await ev('document.querySelectorAll(".mascot canvas").length'), 1)
  assert.equal(await ev('document.querySelector("link[rel=icon]").getAttribute("href")'), '/favicon-32.png')
  assert.ok(await ev('Promise.all(["/favicon-32.png", "/app-192.png", "/app-512.png", "/app-maskable.png"].map(url => caches.match(url))).then(items => items.every(Boolean))'))
  assert.ok(await ev('caches.keys().then(async keys => (await (await caches.open(keys[0])).keys()).some(request => request.url.includes("geng-frames")))'))
  assert.ok(await ev('Array.from(document.querySelectorAll(".mobile-nav button")).every(button => button.querySelector("svg.lucide"))'))
  await click('More')
  await wait('getComputedStyle(document.querySelector(".mobile-brand .brand-mascot-slot")).visibility === "visible"')
  assert.ok(await brandTextOffset() > 32)
  const brandCanvas = 'document.querySelector(".mobile-brand .mascot-brand canvas")'
  assert.equal(await ev(brandCanvas + '.hidden'), true)
  await cmd('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'no-preference'}]})
  await ev('window.scrollTo(0, 0)')
  await wait('Number(' + brandCanvas + '?.dataset.frame) > 0')
  assert.equal(await ev('document.querySelector(".sidebar .mascot-brand canvas").hidden'), true)
  await cmd('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]})
  await wait(brandCanvas + '.hidden')
  await wait(has('Mga naka-save'))
  await click('Gumawa ng snapshot')
  await wait(has('Na-save ang snapshot sa device na ito.'))
  assert.ok(await ev('Boolean(document.querySelector("#app-toasts .toast-success [role=status]")) && getComputedStyle(document.querySelector("#app-toasts")).position === "fixed"'))
  await wait('!document.querySelector("#app-toasts .toast-success")')
  assert.ok(await ev('document.documentElement.scrollWidth <= innerWidth'))
  const fixture={format:'mpkpb',version:1,createdAt:'2026-01-01T00:00:00Z',records:{wallets:[],transactions:[],categories:[],budgets:[],debts:[],scheduledEvents:[],preferences:[{key:'onboardingComplete',value:'true'}]}}
  await ev('(()=>{const d=new DataTransfer(); d.items.add(new File(['+JSON.stringify(JSON.stringify(fixture))+'],"qa.json",{type:"application/json"})); const e=document.querySelector("input[type=file]");e.files=d.files;e.dispatchEvent(new Event("change",{bubbles:true}));})()')
  await wait(has('Tingnan muna ang ire-restore'))
  await click('Palitan ang kasalukuyang records')
  await wait('!document.body.innerText.includes("QA Wallet") && document.body.innerText.includes("Pwedeng gastusin")')
  await click('More')
  await wait(has('Before restore'))
  await ev('Array.from(document.querySelectorAll("button")).find(e=>e.textContent.startsWith("Before restore")).click()')
  await wait(has('1 wallets'))
  await click('Palitan ang kasalukuyang records')
  await wait(has('QA Wallet'))
  await click('More')
  await wait(has('I-on ang PIN'))
  await fill('[name=pin]','123456')
  await fill('[name=confirm]','123456')
  await click('I-on ang PIN')
  await wait(has('Naka-lock ang MPKPB?'))
  await fill('[name=pin]','654321')
  await click('Buksan')
  await wait(has('Hindi tugma ang PIN'))
  await fill('[name=pin]','123456')
  await click('Buksan')
  await wait(has('QA Wallet'))
  await cmd('Emulation.setDeviceMetricsOverride', {width: 320, height: 420, deviceScaleFactor: 1, mobile: true})
  await ev('document.querySelector(".page-heading button.add-wallet-button").focus(); document.querySelector(".page-heading button.add-wallet-button").click()')
  await wait('Boolean(document.querySelector(".transaction-dialog"))')
  const dialogBounds = () => ev('(() => { const r = document.querySelector(".transaction-dialog").getBoundingClientRect(); return [r.top, r.width, r.height] })()')
  const initialDialogBounds = await dialogBounds()
  const stickyBounds = () => ev('[".dialog-heading", ".dialog-actions"].map(selector => document.querySelector(".transaction-dialog " + selector).getBoundingClientRect().top)')
  const initialStickyBounds = await stickyBounds()
  await ev('document.querySelector(".entry-options").open = true')
  assert.deepEqual(await dialogBounds(), initialDialogBounds)
  assert.ok(await ev('(() => { const d = document.querySelector(".transaction-dialog"); d.scrollTop = d.scrollHeight; return d.scrollTop > 0 && d.scrollWidth <= d.clientWidth && document.querySelector(".dialog-backdrop").scrollTop === 0 })()'))
  assert.ok((await stickyBounds()).every((value, index) => Math.abs(value - initialStickyBounds[index]) < 1))
  assert.ok(await ev('(() => { const dialog = document.querySelector(".transaction-dialog"); const bounds = dialog.getBoundingClientRect(); return [...dialog.querySelectorAll(".dialog-heading button, .dialog-actions button")].every(button => { const r = button.getBoundingClientRect(); return r.top >= bounds.top && r.bottom <= bounds.bottom; }); })()'))
  const amountField = '.transaction-dialog [name=amount]'
  await ev('document.querySelector(' + JSON.stringify(amountField) + ').focus()')
  await cmd('Input.insertText', {text: 'abc'})
  assert.equal(await ev('document.querySelector(' + JSON.stringify(amountField) + ').value'), '')
  async function pasteAmount(text) {
    await ev('(() => { const input = document.querySelector(' + JSON.stringify(amountField) + '); const data = new DataTransfer(); data.setData("text/plain",' + JSON.stringify(text) + '); input.dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true})); })()')
  }
  await pasteAmount('₱1,234.50')
  await wait('document.querySelector(' + JSON.stringify(amountField) + ').value === "1234.50"')
  await pasteAmount('bad 12')
  assert.equal(await ev('document.querySelector(' + JSON.stringify(amountField) + ').value'), '1234.50')
  await cmd('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27})
  await wait('!document.querySelector(".transaction-dialog")')
  await wait('document.activeElement === document.querySelector(".page-heading button.add-wallet-button")')
  await cmd('Emulation.setDeviceMetricsOverride', {width: 375, height: 780, deviceScaleFactor: 1, mobile: true})
  const future = await ev(`(() => {
    const date = new Date(); date.setDate(date.getDate() + 2)
    return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-')
  })()`)
  async function addRecord(label, name, amount, date, newDebt = false) {
    await ev('document.querySelector(".page-heading button.add-wallet-button").focus(); document.querySelector(".page-heading button.add-wallet-button").click()')
    await wait('Boolean(document.querySelector(".transaction-dialog"))')
    if (label === 'Utang ko' || label === 'May utang sa akin') {
      await click('Utang')
      if (label === 'May utang sa akin') await ev('(() => { const select = Array.from(document.querySelectorAll(".transaction-dialog select")).find(e => e.options[0]?.value === "payable"); select.value = "receivable"; select.dispatchEvent(new Event("change",{bubbles:true})); })()')
    } else await click(label)
    await fill('.transaction-dialog [name="description"]', name)
    await fill('.transaction-dialog [name="amount"]', amount)
    if (newDebt) await ev('(() => { const select = Array.from(document.querySelectorAll(".transaction-dialog select")).find(e => e.options[0]?.value === "existing"); select.value = "new"; select.dispatchEvent(new Event("change",{bubbles:true})); })()')
    assert.ok(await ev('parseFloat(getComputedStyle(document.querySelector(".transaction-dialog [name=amount]")).fontSize) >= 16'))
    if (date) await fill('.transaction-dialog [name="occurredOn"]', date)
    if (name === 'Aktwal na income') {
      await ev('document.querySelector(".entry-options").open = true')
      await click('Bagong category')
      await fill('.inline-category-form input', 'QA Category')
      await ev('const picker = document.querySelector(".inline-category-form select"); picker.value = "work"; picker.dispatchEvent(new Event("change", {bubbles:true}))')
      await click('I-save ang category')
      await wait('document.querySelector(".category-icon-edit select")?.value === "work"')
      await ev('(() => { const picker = document.querySelector(".category-icon-edit select"); picker.value = "gift"; picker.dispatchEvent(new Event("change", {bubbles:true})) })()')
      await wait('document.querySelector(".category-icon-edit select")?.value === "gift"')
    }
    await ev('document.querySelector(".transaction-dialog button[type=submit]").click()')
    await wait('!document.querySelector(".transaction-dialog")')
  }
  await addRecord('Income', 'Aktwal na income', '100')
  await addRecord('Income', 'Future income QA', '75', future)
  await addRecord('Gastos', 'Future expense QA', '25', future)
  await addRecord('Utang ko', 'Future debt QA', '20', future)
  await addRecord('May utang sa akin', 'Future collection QA', '10', future)
  await wait(has('Future collection QA'))
  const balance = () => ev('document.querySelector(".primary-card .balance-amount").textContent')
  assert.match(await balance(), /100\.00/)
  await ev('Array.from(document.querySelectorAll(".upcoming-list button")).find(button => button.getAttribute("aria-label") === "Edit Future expense QA").click()')
  await wait('Boolean(document.querySelector(".transaction-dialog"))')
  await fill('.transaction-dialog [name="amount"]', '30')
  await ev('document.querySelector(".transaction-dialog button[type=submit]").click()')
  await wait('!document.querySelector(".transaction-dialog")')
  const row = 'Array.from(document.querySelectorAll(".upcoming-list li")).find(row => row.textContent.includes("Future expense QA"))'
  assert.match(await ev(row + '.textContent'), /30\.00/)
  async function pay(amount) {
    await ev(row + '.querySelector(".button-outline").click()')
    await fill('.settlement-form [name="amount"]', amount)
    await click('I-save ang bayad o receipt')
    await wait('!document.querySelector(".settlement-form")')
  }
  const netMoney = () => ev('document.querySelector(".net-money-card .balance-amount").textContent')
  assert.match(await netMoney(), /50\.00/)
  await pay('10')
  assert.match(await balance(), /90\.00/)
  assert.match(await ev(row + '.textContent'), /20\.00/)
  await pay('20')
  assert.match(await netMoney(), /50\.00/)
  assert.match(await balance(), /70\.00/)
  assert.match(await ev(row + '.textContent'), /Bayad na/)
  assert.equal(await ev(row + '.querySelectorAll("button").length'), 0)
  assert.equal(await ev('getComputedStyle(document.documentElement).scrollbarWidth'), 'none')
  await ev('window.scrollTo(0, document.documentElement.scrollHeight)')
  assert.ok(await ev('scrollY > 0'))
  assert.ok(await ev('document.documentElement.scrollWidth <= innerWidth'))
  await ev('window.scrollTo(0, 0)')
  await ev('document.querySelector(".top-actions button:last-child").click()')
  await wait('document.documentElement.dataset.theme === "light"')
  await ev('document.querySelector(".top-actions button:last-child").click()')
  await wait('document.documentElement.dataset.theme === "dark"')
  await addRecord('Utang ko', 'New borrowing QA', '25', future, true)
  assert.match(await balance(), /95\.00/)
  await addRecord('Utang ko', 'Undated debt QA', '8')
  await addRecord('May utang sa akin', 'Undated collection QA', '7')
  const undatedRow = 'Array.from(document.querySelectorAll(".upcoming-list li")).find(row => row.textContent.includes("Undated debt QA"))'
  await ev('const expand = Array.from(document.querySelectorAll(".upcoming-panel button")).find(button => button.textContent.trim() === "Tingnan lahat"); if (expand) expand.click()')
  await wait(undatedRow + '?.textContent.includes("Walang due date")')
  await ev(undatedRow + '.querySelector(".button-outline").click()')
  await fill('.settlement-form [name="amount"]', '3')
  await click('I-save ang bayad o receipt')
  await wait('!document.querySelector(".settlement-form")')
  assert.match(await balance(), /92\.00/)
  await click('Aabot pa?')
  await wait(has('Pwedeng gastusin kada araw'))
  await click('Optimistic')
  await fill('.forecast-controls input[type=date]', future)
  await click('Activity')
  await click('Aabot pa?')
  await wait('document.querySelector(".forecast-scenario-tabs [aria-pressed=true]")?.textContent.trim() === "Optimistic"')
  assert.equal(await ev('document.querySelector(".forecast-controls input[type=date]").value'), future)
  await cmd('Network.enable')
  await cmd('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
  await cmd('Page.reload')
  await wait(has('Naka-lock ang MPKPB?'))
  await fill('[name=pin]','123456')
  await click('Buksan')
  await wait(has('QA Wallet'))
  await click('Wallets')
  await wait(has('QA Wallet'))
  await click('Adjust balance')
  await wait(has('Actual balance ngayon'))
  await fill('.balance-adjustment-dialog input[inputmode=decimal]', '65')
  await click('I-save ang adjustment')
  await wait(has('Na-adjust na ang wallet'))
  assert.ok(await ev('Boolean(document.querySelector(".wallet-avatar svg.lucide"))'))
  await ev('Array.from(document.querySelectorAll("button")).find(e=>e.innerText.trim().endsWith("Add wallet")).click()')
  await wait('Boolean(document.querySelector("[name=walletName]"))')
  await ev('document.querySelector("[name=walletName]").value="Offline Wallet"; document.querySelector("form.wallet-form").requestSubmit()')
  await wait(has('Offline Wallet'))
  assert.ok(await ev('(() => { const balances = [...document.querySelectorAll(".wallet-list .wallet-amount")]; return balances.length >= 2 && balances.every(node => node.getBoundingClientRect().right === balances[0].getBoundingClientRect().right) && document.documentElement.scrollWidth <= innerWidth })()'))
  await cmd('Page.reload')
  await wait(has('Naka-lock ang MPKPB?'))
  await fill('[name=pin]','123456')
  await click('Buksan')
  await wait(has('Offline Wallet'))
  await click('Aabot pa?')
  await wait(has('Pwedeng gastusin kada araw'))
  assert.ok(await ev('document.documentElement.scrollWidth <= innerWidth'))
  assert.equal(await ev('document.querySelector(".forecast-scenario-tabs [aria-pressed=true]").textContent.trim()'), 'Optimistic')
  assert.equal(await ev('document.querySelector(".forecast-controls input[type=date]").value'), future)
  await cmd('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  })
  nextRelease = true
  await ev('navigator.serviceWorker.getRegistration().then(registration => registration.update()).then(() => true)')
  await wait(has('Ready na ang update'))
  await wait('caches.keys().then(keys => keys.some(key => key.endsWith(":qa-next-release")))')
  await cmd('Page.navigate', {url: 'about:blank'})
  await sleep(500)
  await cmd('Page.navigate', {url: 'http://127.0.0.1:4187/'})
  await wait(has('Naka-lock ang MPKPB?'))
  await fill('[name=pin]', '123456')
  await click('Buksan')
  await wait(has('Offline Wallet'))
  await wait('caches.keys().then(keys => keys.length === 1 && keys[0].endsWith(":qa-next-release"))')
  await cmd('Emulation.setDeviceMetricsOverride',{width:1280,height:820,deviceScaleFactor:1,mobile:false})
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
  assert.equal(await ev('getComputedStyle(document.querySelector(".side-nav")).marginTop'), '28px')
  await ev('document.querySelector(".page-heading .add-wallet-button").click()')
  await wait('document.querySelectorAll(".quick-choices button").length === 4')
  await click('Cancel')
  assert.ok(await ev('Boolean(document.querySelector(".wallet-avatar svg.lucide-banknote"))'))
  await click('Activity')
  await wait(has('Legacy expense'))
  const sidebarCanvas = 'document.querySelector(".sidebar .mascot-brand canvas")'
  await cmd('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'no-preference'}]})
  await wait('Number(' + sidebarCanvas + '?.dataset.frame) > 0')
  assert.equal(await ev('document.querySelector(".mobile-brand .mascot-brand canvas").hidden'), true)
  await wait(has('Bayad na'))
  assert.ok(await ev('document.documentElement.scrollWidth <= innerWidth'))
  await cmd('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]})
  for (const [width, height] of [[1280, 820], [375, 780]]) {
    await cmd('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: width < 760})
    for (const [navLabel, heading] of [
      ['Home', 'Watzupp'], ['Wallets', 'Wallets'], ['Activity', 'Activity'], ['Aabot pa?', 'Aabot pa ba?'],
      ['Budget', 'Budget at schedule'], ['More', 'Iba pa'],
    ]) {
      await click(navLabel)
      await wait('document.querySelector(".page-heading h1")?.textContent.includes(' + JSON.stringify(heading) + ')')
      assert.ok(await ev('document.documentElement.scrollWidth <= innerWidth'), navLabel + ' at ' + width + 'px')
      if (navLabel === 'Home' && width === 1280) {
        assert.ok(await ev('new Set([...document.querySelectorAll(".balance-grid .balance-amount")].map(amount => amount.getBoundingClientRect().top)).size === 1'))
      }
      if (navLabel === 'Aabot pa?') {
        assert.ok(await ev('new Set([...document.querySelectorAll(".forecast-controls .field > span:first-child:not(.currency-input)")].map(label => getComputedStyle(label).fontSize)).size === 1'))
      }
    }
  }
  assert.deepEqual(runtimeErrors,[])
  console.log('PASS: mascot visibility and animation, currency focus, empty opening balance, compact quick add, new borrowing, balance adjustment, forecast preferences, themes, recovery, offline PWA, and legacy data.')
} finally {
  socket?.close()
  browser.kill()
  server.close()
}
