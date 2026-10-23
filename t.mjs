import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
const p = await b.newPage({viewport:{width:1366,height:850}});
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(800);
await p.screenshot({path:'resumen.png',fullPage:true});
for (const id of ['clinica','nati','profesionales','reservar','panel','insumos']) {
  await p.click(`.filtros button[data-p="${id}"]`); await p.waitForTimeout(1500);
  const f = p.frame({url:/sitio/}); console.log(id, f ? (await f.title()) : 'noframe');
}
const f = p.frame({url:/panel/}); console.log((await f.content()).match(/WhatsApp/g)?.length, 'WhatsApp mentions in panel');
await p.screenshot({path:'panel.png'});
console.log('errors', errs.filter(e=>!/fonts|ERR_/.test(e)));
await b.close();
