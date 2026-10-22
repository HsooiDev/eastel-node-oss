// Execute the actual component/effect with controlled React hooks and timer/router adapters.
// These are local lifecycle/SSR checks; real browser scheduling is separate acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'
const require=createRequire(import.meta.url)
const file='app/[locale]/account/(protected)/orders/PaymentReturnNotice.tsx'
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
function fixture() {
  const timers=new Map(),states=[]; let stateIndex=0,nextId=0,effect=null,cleanup=null,lastDeps=null,refreshes=0
  const router={refresh(){refreshes++}}
  const module={exports:{}}
  vm.runInNewContext(code,{module,exports:module.exports,require(id){
    if(id==='react')return {useState(initial){const i=stateIndex++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}]},useEffect(fn,deps){if(!lastDeps||deps.some((x,i)=>x!==lastDeps[i])){effect=fn;lastDeps=deps}}}
    if(id==='next/navigation')return {useRouter:()=>router}
    if(id.startsWith('@/'))throw Error('Unexpected dependency '+id)
    return require(id)
  },window:{setInterval(fn,delay){assert.equal(delay,2000);timers.set(++nextId,fn);return nextId},clearInterval(id){timers.delete(id)}}},{filename:file})
  return {render(status='processing',locale='en',orderRef='SYNTHETIC <ORDER>'){
    stateIndex=0; const element=module.exports.default({locale,status,orderRef})
    if(effect){cleanup?.();cleanup=effect();effect=null}
    return {element,html:renderToStaticMarkup(element)}
  },tick(){for(const fn of [...timers.values()])fn()},unmount(){cleanup?.()},get timers(){return timers.size},get refreshes(){return refreshes}}
}
test('processing refreshes server state exactly 20 times then stops with safe timeout copy',()=>{
  const f=fixture();assert.ok(f.render().html.includes('0/20'));assert.equal(f.timers,1)
  for(let i=1;i<=20;i++){f.tick();const {html}=f.render();assert.equal(f.refreshes,i);assert.ok(html.includes(i===20?'Payment still awaiting confirmation':i+'/20'))}
  assert.equal(f.timers,0);f.tick();assert.equal(f.refreshes,20)
  const html=f.render().html;assert.ok(html.includes('contact us before paying again'));assert.ok(!html.includes('Payment confirmed'))
})
test('settled results and unmount clean up scheduled refreshes',()=>{
  for(const result of ['paid','failed','unconfirmed']){
    const f=fixture();f.render();f.tick();assert.equal(f.refreshes,1);f.render(result);assert.equal(f.timers,0);f.tick();assert.equal(f.refreshes,1)
    const settled=fixture();settled.render(result);assert.equal(settled.timers,0)
  }
  const f=fixture();f.render();f.unmount();assert.equal(f.timers,0);f.tick();assert.equal(f.refreshes,0)
})
test('manual refresh only reloads server state and references are safely escaped in every locale',()=>{
  for(const locale of ['en','ms','zh']){
    const f=fixture();const {element,html}=f.render('unconfirmed',locale,'<script>alert(1)</script>')
    assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'))
    const nodes=[];function walk(e){if(!e||typeof e!=='object')return;nodes.push(e);for(const child of [e.props?.children].flat(Infinity))walk(child)}walk(element)
    const button=nodes.find(e=>e.type==='button');assert.ok(button);button.props.onClick();assert.equal(f.refreshes,1);assert.equal(f.timers,0)
    assert.ok(button.props.className.includes('min-h-11'));assert.equal(nodes.find(e=>e.type==='a').props.href,'https://wa.me/601175999733')
  }
})
