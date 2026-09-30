const fs=require('fs'); const {JSDOM}=require('jsdom');
const out=[]; const log=(...a)=>out.push(a.join(' '));
const res=[];
const check=(n,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e);
  res.push(`${ok?'PASS':'FAIL'} ${n} => ${JSON.stringify(a)}${ok?'':' (exp '+JSON.stringify(e)+')'}`);return ok;};
const html=fs.readFileSync('index.html','utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
  beforeParse(w){w.alert=()=>{};w.confirm=()=>true;}});
const win=dom.window,doc=win.document,ev=e=>win.eval(e);
const errs=[];dom.virtualConsole.on('jsdomError',e=>errs.push('E:'+e.message));
setTimeout(()=>{
  win.initGame(1,true);
  doc.getElementById('decision-modal').style.display='none';

  log('=== 1. 苗字・名前の拡張 ===');
  check('苗字200件', ev('SURNAMES_TOP200.length'), 200);
  check('苗字の重複なし', ev('new Set(SURNAMES_TOP200).size'), 200);
  check('苗字は文字列のみ', ev('SURNAMES_TOP200.every(s=>typeof s==="string" && s.length>0 && /^[^\x00-\x7F]+$/.test(s))'), true);
  const keys=ev('Object.keys(FEMALE_READINGS_MAP)');
  check('名前200件', keys.length, 200);
  check('名前の重複なし', ev('new Set(Object.keys(FEMALE_READINGS_MAP)).size'), 200);
  check('全ての名に漢字候補あり', ev('Object.values(FEMALE_READINGS_MAP).every(a=>Array.isArray(a)&&a.length>=3)'), true);
  check('漢字候補が重複しない', ev('Object.values(FEMALE_READINGS_MAP).every(a=>new Set(a).size===a.length)'), true);
  log('  苗字サンプル:', ev('SURNAMES_TOP200.slice(180,190).join(",")'));
  log('  名前サンプル:', keys.slice(195).join(","));
  const nm = [];
  for (let i=0;i<12;i++) nm.push(ev('generateIdolName().fullName'));
  log('  生成サンプル:', nm.join(' / '));

  log('');
  log('=== 2. 候補者プール ===');
  ev('draftCount=0; startDraftMeeting(); setDraftPickTotal(10); beginDraftPicking();');
  const teams=ev('leagueTeams.length');
  const pool=ev('draftState.pool.length');
  check('プール=チーム数×20', pool, teams*20);
  log('  チーム数:', teams, '/ プール:', pool);
  const ages=ev('draftState.pool.map(m=>m.age)');
  check('全員14〜20歳', ev('Math.min.apply(null,draftState.pool.map(m=>m.age))')>=14 && ev('Math.max.apply(null,draftState.pool.map(m=>m.age))')<=20, true);
  log('  年齢範囲:', ev('Math.min.apply(null,draftState.pool.map(m=>m.age))'), '〜', ev('Math.max.apply(null,draftState.pool.map(m=>m.age))'));
  check('全員生年を持つ', ev('draftState.pool.every(m=>Number.isInteger(m.birthYear)&&m.birthYear>1900)'), true);
  check('年齢が誕生日と整合', ev('draftState.pool.every(m=>{const t=getGameDateObject();let a=t.getFullYear()-m.birthYear;const p=(t.getMonth()+1)>m.birthdayMonth||((t.getMonth()+1)===m.birthdayMonth&&t.getDate()>=m.birthdayDay);if(!p)a--;return a===m.age;})'), true);
  const yrs=ev('draftState.pool.map(m=>m.birthYear)');
  log('  生年範囲:', ev('Math.min.apply(null,draftState.pool.map(m=>m.birthYear))'), '〜', ev('Math.max.apply(null,draftState.pool.map(m=>m.birthYear))'));
  check('氏名がすべて異なる', ev('new Set(draftState.pool.map(m=>m.name)).size')===pool, true);
  check('既存名簿と重複しない', ev('idolRoster.every(p=>!draftState.pool.some(c=>c.name===p.name))'), true);
  const stats=ev('draftState.pool.map(m=>Object.keys(m.stats).length)');
  check('各自固有のステータスを持つ', ev('new Set(draftState.pool.map(m=>JSON.stringify(m.stats))).size')>pool*0.9, true);

  log('');
  log('=== 3. 画面表示 ===');
  log('  候補カード:', doc.querySelectorAll('.draft-candidate').length);
  log('  1枚目:', doc.querySelector('.draft-candidate').textContent.replace(/\s+/g,' ').trim().slice(0,72));
  check('生年月日が表示される', /\d+年\d+月\d+日生/.test(doc.querySelector('.draft-candidate').textContent), true);
  const before=ev('draftState.pool.length');
  ev('resolveDraftPick(0);');
  check('指名でプールから1名消費', ev('draftState.pool.length'), before-1);
  check('指名した子はプールから消える', ev('draftState.acquired.length'), 1);
  ev('closeDraftModal();');

  log('');
  log('=== 4. 複数回ドラフト ===');
  ev('draftCount=1; startDraftMeeting(); setDraftPickTotal(10); beginDraftPicking();');
  check('2回目もプールが生成される', ev('draftState.pool.length')>=teams*20, true);
  ev('closeDraftModal();');
  ev('draftCount=2; startDraftMeeting();');
  check('偶数回で新チーム加入', ev('leagueTeams.length'), teams+1);
  ev('closeDraftModal();');

  log('');
  log('=== 5. エラー ===');
  log(errs.length?errs.join(' | '):'なし');
  log('');
  log('########## サマリ ##########');
  res.forEach(r=>log(r));
  log('合計 '+res.length+' 件 / 失敗 '+res.filter(r=>r.startsWith('FAIL')).length+' 件');
  fs.writeFileSync('/tmp/tt.txt',out.join('\n'));
},500);
