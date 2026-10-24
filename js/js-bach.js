import {createToolkit,renderKrn} from './render.js';
import {transformKrnFiguredBass} from './fb-transform.js';
const $=id=>document.getElementById(id);
const state={selected:new Set([0,1]),categories:new Set(["cadences"]),catalog:[],files:[],toolkit:null,scale:50,spacing:.32,krn:'',key:null,figureMode:'historic',doubleLength:'on',placement:'below'};
// Browser-local preferences are independent of the student's Firebase login.
const SETTINGS_KEY='jsBachPracticeSettingsV1';
function restoreSettings(){
  try{
    const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');
    if(!saved||typeof saved!=='object')return;
    if(Array.isArray(saved.selected))state.selected=new Set(saved.selected.filter(n=>Number.isInteger(n)&&n>=0&&n<=7));
    if(Array.isArray(saved.categories))state.categories=new Set(saved.categories.filter(c=>['cadences','sequences'].includes(c)));
    if(Number.isFinite(saved.scale))state.scale=Math.max(25,Math.min(80,saved.scale));
    if(Number.isFinite(saved.spacing))state.spacing=Math.max(.15,Math.min(.8,saved.spacing));
    for(const [field,values] of Object.entries({figureMode:['historic','modern'],doubleLength:['on','off'],placement:['above','below']})){
      if(values.includes(saved[field]))state[field]=saved[field];
    }
  }catch(error){console.warn('Could not restore Bach preferences',error);}
}
function saveSettings(){
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify({selected:[...state.selected],categories:[...state.categories],scale:state.scale,spacing:state.spacing,figureMode:state.figureMode,doubleLength:state.doubleLength,placement:state.placement}));}
  catch(error){console.warn('Could not save Bach preferences',error);}
}
function syncSettingsUI(){
  $('scale').value=state.scale;$('scaleValue').textContent=`${state.scale}%`;
  $('spacing').value=state.spacing;$('spacingValue').textContent=state.spacing.toFixed(2);
  document.querySelectorAll('.choices').forEach(group=>group.querySelectorAll('button[data-value]').forEach(button=>{
    const active=button.dataset.value===state[group.dataset.setting];
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  }));
}
const SHARP_MAJOR=['C','G','D','A','E','B','F#','C#'];
const FLAT_MAJOR=['C','F','Bb','Eb','Ab','Db','Gb','Cb'];
const SHARP_MINOR=['a','e','b','f#','c#','g#','d#','a#'];
const FLAT_MINOR=['a','d','g','c','f','bb','eb','ab'];
const point=(r,a)=>[160+r*Math.cos(a),160+r*Math.sin(a)];
function path(i){const a=-Math.PI/2+i*Math.PI/4+.014,b=-Math.PI/2+(i+1)*Math.PI/4-.014,p=point(65,a),q=point(145,a),r=point(145,b),s=point(65,b);return `M ${p.join(' ')} L ${q.join(' ')} A 145 145 0 0 1 ${r.join(' ')} L ${s.join(' ')} A 65 65 0 0 0 ${p.join(' ')} Z`;}
function drawWheel(){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 320 320');svg.setAttribute('aria-label','Key signature selection wheel');const add=(p,tag,attrs)=>{const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));p.appendChild(el);return el};add(svg,'circle',{cx:160,cy:160,r:151,fill:'#fff',stroke:'#000','stroke-width':2});for(let i=0;i<8;i++){const on=state.selected.has(i),g=add(svg,'g',{class:'wheel-segment',role:'button',tabindex:'0','aria-pressed':String(on),'aria-label':`${i} sharps or flats`});add(g,'path',{d:path(i),fill:on?'#8C3028':'#eeeeee',stroke:'#fff','stroke-width':3});const [x,y]=point(107,-Math.PI/2+(i+.5)*Math.PI/4),t=add(g,'text',{x,y,'text-anchor':'middle','dominant-baseline':'middle','font-size':46,fill:'#000',class:'wheel-number'});t.textContent=i;const toggle=()=>{on?state.selected.delete(i):state.selected.add(i);drawWheel();saveSettings()};g.addEventListener('click',toggle);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}})}const n=state.selected.size;add(svg,'circle',{cx:160,cy:160,r:63,fill:n===0?'#e5e5e5':`rgb(${Math.round(235-95*n/8)},${Math.round(235-130*n/8)},${Math.round(235-140*n/8)})`,stroke:'#fff','stroke-width':5});const center=add(svg,'text',{x:160,y:163,'text-anchor':'middle','dominant-baseline':'middle','font-family':'Arial,sans-serif','font-weight':900,'font-size':n===8?49:44});center.textContent=n===8?'😍':'♯/♭';$('keyWheel').replaceChildren(svg);$('keyCount').textContent=`${n} of 8 selected`;$('next').disabled=n===0||state.categories.size===0;}
function syncCategories(){document.querySelectorAll('[data-category]').forEach(button=>{const on=state.categories.has(button.dataset.category);button.classList.toggle('active',on);button.setAttribute('aria-pressed',String(on));});$('next').disabled=state.selected.size===0||state.categories.size===0;}
function choices(mode){const list=[];const sharp=mode==='minor'?SHARP_MINOR:SHARP_MAJOR,flat=mode==='minor'?FLAT_MINOR:FLAT_MAJOR;for(const n of state.selected){list.push(sharp[n]);if(n>0)list.push(flat[n]);}return list;}
function sourceKey(krn){const match=krn.match(/^\*([A-Ga-g][#-]?):/m);if(!match)return null;const raw=match[1],minor=raw[0]===raw[0].toLowerCase();return {tonic:raw.replace('-', 'b'),mode:minor?'minor':'major'};}
function displayKey(k){const mode=k[0]===k[0].toLowerCase()?'minor':'major';const note=k[0].toUpperCase()+k.slice(1).replace(/#/g,'♯').replace(/b/g,'♭');return note+' '+mode;}
function verovioTonic(k){const m=k.match(/^([A-Ga-g])([#b]?)$/);if(!m)return '';return m[1].toLowerCase()+(m[2]==='#'?'s':m[2]==='b'?'f':'');}

// Boyvin-specific display transforms; shared modules remain unchanged.
function applyDoubleLength(krn){
  const lines=krn.split(/\r?\n/);let kern=[];
  for(const line of lines){if(line.startsWith('**')){kern=line.split('\t').map((x,i)=>x==='**kern'?i:-1).filter(i=>i>=0);break;}}
  return lines.map(line=>{const cells=line.split('\t');
    for(let i=0;i<cells.length;i++){let t=cells[i];if(t==='*met(c)')cells[i]='*M4/2';else if(t==='*met(c|)')cells[i]='*M2/2';else{const m=t.match(/^\*M(\d+)\/(\d+)$/);if(m&&Number(m[2])>=2)cells[i]=`*M${m[1]}/${Number(m[2])/2}`;}}
    for(const i of kern){const t=cells[i];if(!t||/^[*.!=]/.test(t))continue;cells[i]=t.replace(/^(\d+)(\.*)(.*)$/,(_,n,d,rest)=>{const v=Number(n);return (v===1?'0':v%2===0?String(v/2):n)+d+rest.replace(/[LJ]/g,'');});}
    return cells.join('\t');
  }).join('\n');
}
function applyPlacement(krn,placement){
  const lines=krn.split(/\r?\n/);const head=lines.findIndex(l=>l.startsWith('**'));if(head<0)return krn;
  const cols=lines[head].split('\t');const index=cols.findIndex(x=>x==='**fb'||x==='**fba');if(index<0)return krn;
  cols[index]=placement==='above'?'**fba':'**fb';lines[head]=cols.join('\t');
  const count=t=>(t.match(/\d+/g)||[]).length;let max=0;
  for(let j=head+1;j<lines.length;j++){const t=lines[j].split('\t')[index]||'';if(t&&!/^[*.!=]/.test(t))max=Math.max(max,count(t));}
  for(let j=head+1;j<lines.length;j++){const cols=lines[j].split('\t');let t=cols[index];if(!t||/^[*.!=]/.test(t))continue;t=t.replace(/^(?:x\s+)+/,'');if(placement==='above'&&count(t))t='x '.repeat(Math.max(0,max-count(t)))+t;cols[index]=t;lines[j]=cols.join('\t');}
  return lines.join('\n');
}

// Translate the source's textual spine to Verovio's centered text-data spine.
// This is Bach-specific and does not alter the shared rendering modules.
function moveTextSpineToAbove(krnText) {
  const lines = krnText.split(/\r?\n/);
  const header = lines.findIndex(line => line.split('\t').includes('**text'));
  if (header < 0) return krnText;
  const columns = lines[header].split('\t');
  const index = columns.indexOf('**text');
  columns[index] = '**cdata';
  lines[header] = columns.join('\t');
  for (let i = header + 1; i < lines.length; i++) {
    if (!lines[i].includes('\t')) continue;
    const cells = lines[i].split('\t');
    const token = (cells[index] || '').trim();
    if (token === '*') cells[index] = '*above';
    else if (token.startsWith('*') && token !== '*-') cells[index] = '*';
    lines[i] = cells.join('\t');
  }
  return lines.join('\n');
}
function extractInstructions(krn) {
  return krn.match(/^!!\s*Instructions:\s*(.*)$/mi)?.[1]?.trim() || '';
}
function updateMusicLayout() {
  const isSequence = $('titlePill').textContent.trim().toLowerCase().startsWith('sequences');
  $('practiceGrid').classList.toggle('sequence-active', isSequence);
  $('practiceGrid').classList.toggle('cadence-active', !isSequence);
}
async function render(){if(!state.krn||!state.toolkit||!state.key)return;const source=sourceKey(state.krn);let data=state.krn;if(source){try{data=transformKrnFiguredBass({krnText:state.krn,fromTonic:source.tonic,toTonic:state.key,mode:source.mode,fbMode:state.figureMode}).transformedKrn;}catch(err){console.warn('Figure transformation unavailable for this exercise',err);}}if(state.doubleLength==='on')data=applyDoubleLength(data);data=applyPlacement(data,state.placement);data=moveTextSpineToAbove(data);const transpose=verovioTonic(state.key);await renderKrn(state.toolkit,data,$('svg'),{scale:state.scale,spacing:state.spacing},transpose);}
async function newExercise(){if(!state.files.length)return;const eligible=state.catalog.filter(item=>state.categories.has(item.category));if(!eligible.length){console.warn('No exercises match selected exercise types');return;}const file=eligible[Math.floor(Math.random()*eligible.length)].file;try{const response=await fetch(file);if(!response.ok)throw Error(`HTTP ${response.status}`);const krn=await response.text(),source=sourceKey(krn);if(!source)throw Error('Could not identify original key');const available=choices(source.mode);if(!available.length)throw Error('Choose at least one key signature');state.krn=krn;state.key=available[Math.floor(Math.random()*available.length)];$('titlePill').textContent=(state.catalog.find(item=>item.file===file)?.title||file.split('/').pop().replace(/\.krn$/i,'').replace(/_/g,' '));$('keyPillValue').textContent=displayKey(state.key);const instructions=extractInstructions(krn);$('instructionsBox').textContent=instructions;$('instructionsBox').hidden=!instructions;updateMusicLayout();await render();window.recordBassLineAttempt?.();}catch(err){console.error(err);console.warn('Could not load exercise:',err.message);}}
async function init(){restoreSettings();syncSettingsUI();drawWheel();syncCategories();document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{const category=button.dataset.category;if(state.categories.has(category))state.categories.delete(category);else state.categories.add(category);syncCategories();saveSettings();}));document.querySelectorAll('.choices').forEach(group=>{group.addEventListener('click',e=>{const button=e.target.closest('button[data-value]');if(!button)return;state[group.dataset.setting]=button.dataset.value;group.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});saveSettings();render().catch(console.error);});group.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('active'))));});$('loginToggle').addEventListener('click',()=>{$('loginPanel').hidden=!$('loginPanel').hidden});$('loginClose').addEventListener('click',()=>{$('loginPanel').hidden=true});$('next').addEventListener('click',newExercise);for(const [id,format] of [['scale',n=>`${n}%`],['spacing',n=>n.toFixed(2)]]){$(id).addEventListener('input',e=>{state[id]=Number(e.target.value);$(id+'Value').textContent=format(state[id]);saveSettings();render().catch(console.error)})}try{const response=await fetch('tunes.json');if(!response.ok)throw Error('Could not load tunes.json');state.files=await response.json();state.catalog=(await Promise.all(state.files.map(async file=>{try{const res=await fetch(file);if(!res.ok)return null;const text=await res.text();const category=file.includes('sequences')?'sequences':'cadences';const title=text.match(/^!!\s*Title\s+([^\r\n]+)/mi)?.[1]?.trim();const number=text.match(/^!!\s*Number\s+([^\r\n]+)/mi)?.[1]?.trim();return {file,category,title:category==='cadences'?'Cadences '+(number||''): 'Sequences '+(number||'')};}catch{return null;}}))).filter(Boolean);state.toolkit=await createToolkit();await newExercise()}catch(err){console.error(err);console.warn('Initialization error:',err.message);}}init();