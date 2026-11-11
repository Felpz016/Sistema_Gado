// Teste de ponta a ponta com os emuladores do Firebase. Veja "Testar no computador" no LEIA-ME.
// Antes de rodar, troque SEU_EMAIL@gmail.com por admin@teste.com em firestore.rules (só para o teste).
const {chromium}=require('playwright');
const U='http://localhost:8080/app/?emulador';
const ok=(c,m)=>console.log((c?'OK  ':'FALHOU ')+m);
async function abrir(b,email,vp){const c=await b.newContext({viewport:vp||{width:1200,height:800}});const p=await c.newPage();
 p.on('pageerror',e=>console.log('ERR',email,e.message));
 await p.goto(U);await p.waitForFunction(()=>window.__entrarTeste);await p.waitForSelector('#btnEntrar');
 await p.evaluate(e=>window.__entrarTeste(e),email);return p;}
const txt=p=>p.evaluate(()=>document.body.innerText);
async function token(email){const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({postBody:'id_token='+encodeURIComponent(JSON.stringify({sub:email,email,email_verified:true}))+'&providerId=google.com',requestUri:'http://localhost',returnSecureToken:true})});return r.json();}
(async()=>{const b=await chromium.launch();
 const A=await abrir(b,'cliente@teste.com');
 await A.waitForSelector('text=Falta ativar a assinatura');ok(true,'cliente sem assinatura fica bloqueado');
 
 const AD=await abrir(b,'admin@teste.com');
 await AD.click('a[href="#admin"]');
 await AD.waitForSelector('form[data-conta]',{timeout:6000}).catch(async e=>{console.log(AD.url(),await txt(AD));throw e});
 const linha=AD.locator('form[data-conta]',{hasText:'cliente@teste.com'});
 await linha.locator('button:has-text("Liberar acesso")').click();
 await AD.waitForSelector('text=Acesso liberado');
 
 await A.waitForSelector('#faz1',{timeout:10000});ok(true,'liberação aparece sozinha na tela do cliente');
 await A.fill('#faz1','Fazenda Santa Rita');await A.click('text=Começar a usar');
 await A.waitForSelector('.app');await A.waitForFunction(()=>document.querySelector('#fazNome')?.textContent==='Fazenda Santa Rita');ok(true,'primeira fazenda criada');
 await A.click('#nav a[href="#entrada"]');await A.fill('#e-qtd','50');await A.fill('#e-idade','12');await A.fill('#e-peso','280');await A.fill('#e-raca','Nelore');
 await A.click('#fEnt button[type=submit]');await A.waitForSelector('text=L-001');ok(true,'lote cadastrado');
 await A.click('#nav a[href="#pesagem"]');await A.fill('#p-peso','300');
 await A.evaluate(()=>{});
 await A.click('text=Conta e fazendas');await A.waitForSelector('#nf-nome');
 await A.fill('#nf-nome','Sítio Aurora');await A.click('#fNovaFaz button');
 await A.waitForFunction(()=>document.querySelector('#fazNome')?.textContent==='Sítio Aurora');
 ok(await A.locator('#fazSel option').count()===2,'duas fazendas no seletor');
 await A.click('#nav a[href="#lotes"]');await A.waitForSelector('text=Nenhum lote ativo');ok(true,'fazenda nova começa vazia');
 await A.selectOption('#fazSel',{label:'Fazenda Santa Rita'});await A.waitForSelector('text=L-001');ok(true,'trocar de fazenda mostra os lotes dela');
 await A.click('text=Conta e fazendas');await A.fill('#mb-email','socio@teste.com');await A.click('#fMembro button');
 await A.waitForSelector('text=agora tem acesso');ok(true,'sócio incluído');
 
 const C=await abrir(b,'socio@teste.com',{width:400,height:800});
 await C.waitForSelector('.app',{timeout:10000});await C.click('#tabbar a[href="#lotes"]');
 await C.waitForFunction(()=>document.body.innerText.includes('L-001')||document.body.innerText.includes('Nenhum lote'));
 const tc=await txt(C);ok(/Santa Rita|Aurora/i.test(tc),'sócio vê as fazendas do dono');

 // intruso tenta ler direto
 const dono=await token('cliente@teste.com'), intr=await token('intruso@teste.com');
 const base='http://127.0.0.1:8085/v1/projects/demo-lote-certo/databases/(default)/documents/';
 const g=async(path,t)=>(await fetch(base+path,{headers:{Authorization:'Bearer '+t.idToken}})).status;
 ok(await g(`contas/${dono.localId}/fazendas`,dono)===200,'dono lê as próprias fazendas (200)');
 ok(await g(`contas/${dono.localId}/fazendas`,intr)===403,'intruso não lê fazendas de outra conta (403)');
 ok(await g(`contas`,intr)===403,'intruso não lista contas (403)');
 const w=await fetch(base+`assinaturas/${intr.localId}`,{method:'PATCH',headers:{Authorization:'Bearer '+intr.idToken,'content-type':'application/json'},body:JSON.stringify({fields:{ativa:{booleanValue:true}}})});
 ok(w.status===403,'ninguém libera a própria assinatura (403)');
 const w2=await fetch(base+`contas/${intr.localId}/fazendas/x`,{method:'PATCH',headers:{Authorization:'Bearer '+intr.idToken,'content-type':'application/json'},body:JSON.stringify({fields:{nome:{stringValue:'x'}}})});
 ok(w2.status===403,'sem assinatura não cria fazenda (403)');
 // admin bloqueia
 const linha2=AD.locator('form[data-conta]',{hasText:'cliente@teste.com'});
 await linha2.locator('button:has-text("Bloquear")').click();
 await A.waitForSelector('text=Assinatura pausada',{timeout:10000});ok(true,'bloqueio derruba o acesso do cliente');
 await C.waitForSelector('text=não está ativa',{timeout:10000});ok(true,'e o do sócio');
 // vencida
 await linha2.locator('input[type=date]').fill('2026-01-01');await AD.locator('form[data-conta]',{hasText:'cliente@teste.com'}).locator('button[data-ativa="1"]').click();
 await A.waitForSelector('text=Sua assinatura venceu',{timeout:10000});ok(true,'assinatura com data passada conta como vencida');
 await b.close();})().catch(e=>{console.log('FALHA',e.message.split('\n').slice(0,4).join(' | '));process.exit(1)});
