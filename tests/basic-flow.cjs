// npm install playwright; BROWSER_EXECUTABLE=/path/to/chromium node tests/basic-flow.cjs
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert');
(async()=>{
 const b=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu']}:{})});
 const p=await b.newPage({viewport:{width:1280,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('file://'+path.resolve(__dirname,'../index.html'));await p.addStyleTag({content:'*{transition:none!important}'});
 const counts={optical:0,realModes:0,captures:0,mobile:0};
 await p.evaluate(()=>{window.testPick=(t,i)=>{document.querySelector(`[data-picker="${t}"]`).click();const option=document.querySelector(`#sheetBody [data-idx="${i}"]`);if(!option)throw Error('Missing option '+t+':'+i);option.click()};window.checkGeometry=()=>{
 const {c,f,l,fl}=current(),s=$('#sensor'),r=s.getBoundingClientRect(),v=$('.viz').getBoundingClientRect();
 const fail=m=>{throw Error(`${c.name} / ${f.name} / ${l.name} / ${fl}: ${m}`)};
 if(formatHasPhysicalDims(f)){
  if($('#area').textContent!==`${f.w.toFixed(2)}×${f.h.toFixed(2)}`)fail('area text');
  if(getComputedStyle(s).display==='none'||r.width<=0||r.height<=0)fail('invisible sensor');
  const sq=$('.stage').classList.contains('realMode')&&hasLensTag(l,'anamorphic')?Number(l.squeeze):1;
  if(Math.abs((r.width/r.height)/(f.w/f.h*sq)-1)>0.003)fail('aspect ratio');
  if(r.width>v.width+.1||r.height>v.height+.1)fail('frame outside viz');
  if(!$('.stage').classList.contains('realMode')){
   const ic=focalIcDisplay(l,fl);
   if(!hasLensTag(l,'anamorphic')&&ic){const circle=$('#circle').getBoundingClientRect();if(!circle.width||Math.abs(r.width/circle.width-f.w/ic.mm)>.005)fail('IC / sensor scale');}
  }else{const layer=$('#realTestLayer').getBoundingClientRect();if(Math.abs(layer.width-r.width)>.1||Math.abs(layer.height-r.height)>.1)fail('capture / sensor mismatch');}
 }else if(getComputedStyle(s).display!=='none')fail('unknown camera shown as known frame');
 if(state.viewMode==='real'&&!$('.stage').classList.contains('realMode'))fail('hidden real state');
 if(/undefined|NaN/.test($('#area').textContent+$('#ic').textContent+$('#realInfo').textContent))fail('invalid value');
 };});
 const cameras=await p.evaluate(()=>DATA.cameras.map((c,i)=>!c.ronin4d?i:null).filter(x=>x!==null));
 for(const ci of cameras){counts.optical+=await p.evaluate(ci=>{testPick('camera',ci);$('#modeOptical').click();let n=0;DATA.cameras[ci].formats.forEach((f,fi)=>{testPick('format',fi);DATA.lenses.forEach((l,li)=>{if(l.ronin4dOnly || (fi!==0 && ![0,7,19,21,30,82,100].includes(li)))return;testPick('lens',li);checkGeometry();n++;});});return n},ci);if(ci%10===0)console.log('Optical camera',ci,'checks',counts.optical);}
 for(const ci of cameras){counts.realModes+=await p.evaluate(ci=>{testPick('camera',ci);let n=0;DATA.cameras[ci].formats.forEach((f,fi)=>{testPick('format',fi);[7,19,82].forEach(li=>{testPick('lens',li);$('#modeReal').click();checkGeometry();n++;});});return n},ci);}
 // Real images are decoded, not only checked for a populated URL.
 const samples=await p.evaluate(()=>DATA.lenses.flatMap((l,li)=>Object.entries(l.realWorldVignetting?.focals||{}).flatMap(([fl,rt])=>['open','down'].filter(k=>rt[k]).map(k=>({li,fl:Number(fl),iris:k,url:rt[k]})))));
 for(const [i,sample] of samples.entries()){
  await p.evaluate(({sample,i})=>{testPick('camera',[0,5,9,14,39][i%5]);testPick('lens',sample.li);const l=current().l;if(hasLensTag(l,'zoom')){const input=$('#zoomInlineNum');$('#modeOptical').click();input.value=sample.fl;input.dispatchEvent(new Event('change',{bubbles:true}));}else testPick('focal',sample.fl);$('#modeReal').click();$(sample.iris==='open'?'#irisOpen':'#irisDown').click();checkGeometry();},{sample,i});
  await p.waitForFunction(url=>realImageStatus==='loaded'&&$('#realTestImg').getAttribute('src')===url&&$('#realTestImg').naturalWidth>0,sample.url);
  counts.captures++;if(counts.captures%100===0)console.log("Decoded captures",counts.captures);
 }
 // Visible Playwright interactions with mobile touch viewport, opposite selection order and reload.
 await p.setViewportSize({width:390,height:844});
 async function pick(t,i){await p.locator(`[data-picker="${t}"]`).click();await p.locator(`#sheetBody [data-idx="${i}"]`).click();}
 for(const ci of [0,5,9,14,17,20,39]){for(const li of [7,19,21,82,30]){await pick('lens',li);await pick('camera',ci);await pick('format',1);await p.locator('#modeOptical').click();await p.evaluate(()=>checkGeometry());if(await p.locator('#modeReal').isEnabled()){await p.locator('#modeReal').click();await p.evaluate(()=>checkGeometry());}counts.mobile++;}}
 await pick('camera',0);await pick('format',3);await pick('lens',7);await p.locator('#modeReal').click();await p.waitForFunction(()=>realImageStatus==='loaded');await p.screenshot({path:path.resolve(__dirname,'mobile-square.png'),fullPage:true});
 await pick('lens',13);await pick('focal',21);assert.equal(await p.evaluate(()=>state.viewMode),'optical');
 await p.locator('#modeReal').click();assert.equal(await p.evaluate(()=>state.focal),18);
 await p.reload();await p.waitForFunction(()=>realImageStatus==='loaded');await pick('camera',14);await pick('lens',21);await p.locator('#modeOptical').click();
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 const result={...counts,pageErrors:errors,result:'PASS'};fs.writeFileSync(path.resolve(__dirname,'results.json'),JSON.stringify(result,null,2));console.log(result);await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
