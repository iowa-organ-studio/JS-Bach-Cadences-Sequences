import {getApp} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {getFirestore,collection,getDocs} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const STORAGE_KEY="iowaOrganStudentUid";
const DEFAULT_APP=document.body.dataset.practiceApp;
const APPS=[{id:"boyvin",label:"Boyvin"},{id:"js-bach",label:"J. S. Bach"},{id:"cpe-bach",label:"C. P. E. Bach"}];
const SCORE_COLS=["C","G","D","A","E","B","F#","C#","F","Bb","Eb","Ab","Db","Gb","Cb","a","e","b","f#","c#","g#","d#","a#","d","g","c","f","bb","eb","ab"];
const button=document.getElementById("exerciseHistoryButton");
const dialog=document.getElementById("exerciseHistoryDialog");
const close=document.getElementById("closeExerciseHistory");
const content=document.getElementById("exerciseHistoryContent");
const tabs=document.getElementById("composerHistoryTabs");
let activeApp=DEFAULT_APP;
let attempts=[];
let loadToken=0;

function normalizeKey(value){
  if(!value)return null;
  let s=String(value).trim().replace(/^Current key:\s*/i,"").replace(/♯/g,"#").replace(/♭/g,"b").replace(/\s+/g," ");
  let minor=/\bminor\b/i.test(s);
  if(!minor && /^[A-Ga-g][#b]?m$/.test(s)){minor=true;s=s.slice(0,-1)}
  s=s.replace(/\b(major|minor)\b/gi,"").trim();
  if(!/^[A-Ga-g][#b]?$/.test(s))return null;
  const key=(minor?s[0].toLowerCase():s[0].toUpperCase())+s.slice(1);
  return SCORE_COLS.includes(key)?key:null;
}
function prettyKey(key){return key[0]+key.slice(1).replace(/#/g,"♯").replace(/b/g,"♭")}
function cell(tag,value){const el=document.createElement(tag);el.textContent=value;return el}
function selectApp(app){activeApp=app;for(const b of tabs.querySelectorAll("button")){const chosen=b.dataset.app===app;b.classList.toggle("active",chosen);b.setAttribute("aria-selected",String(chosen))}render()}
function render(){
  content.replaceChildren();
  const selected=attempts.filter(a=>a.app===activeApp);
  if(!selected.length){content.textContent="No recorded bass lines yet.";return}
  const rows=new Map();let skipped=0;
  for(const a of selected){const key=normalizeKey(a.key);if(!key){skipped++;continue}
    const name=String(a.exercise||"Unknown exercise");if(!rows.has(name))rows.set(name,new Map());
    const counts=rows.get(name);counts.set(key,(counts.get(key)||0)+1);
  }
  const table=document.createElement("table");table.className="exercise-history-table";
  const head=document.createElement("thead"),heading=document.createElement("tr");
  for(const h of ["Exercise","Totals",...SCORE_COLS.map(prettyKey)])heading.appendChild(cell("th",h));
  head.appendChild(heading);table.appendChild(head);
  const body=document.createElement("tbody");const totals=Object.fromEntries(SCORE_COLS.map(k=>[k,0]));let grand=0;
  const names=[...rows.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
  for(const name of names){const tr=document.createElement("tr"),row=rows.get(name);tr.appendChild(cell("td",name));
    const total=SCORE_COLS.reduce((n,k)=>n+(row.get(k)||0),0);grand+=total;tr.appendChild(cell("td",total||""));
    for(const k of SCORE_COLS){const n=row.get(k)||0;totals[k]+=n;tr.appendChild(cell("td",n||""))}body.appendChild(tr)}
  const tr=document.createElement("tr");tr.className="history-totals-row";
  for(const v of ["Totals",grand||"",...SCORE_COLS.map(k=>totals[k]||"")])tr.appendChild(cell("td",v));
  body.prepend(tr);table.appendChild(body);
  const wrap=document.createElement("div");wrap.className="exercise-history-scroll";wrap.appendChild(table);content.appendChild(wrap);
  if(skipped){const warning=cell("p",`${skipped} attempt(s) had unrecognized keys and were omitted.`);content.appendChild(warning)}
}
async function loadHistory(){const uid=localStorage.getItem(STORAGE_KEY);const token=++loadToken;
  if(!uid){content.textContent="Please log in first.";return}
  content.textContent="Loading history…";
  try{const auth=getAuth(getApp());await auth.authStateReady();if(!auth.currentUser)throw Error("Authentication not ready");
    const db=getFirestore(getApp());const snapshot=await getDocs(collection(db,"users",uid,"webPractice"));
    if(token!==loadToken||localStorage.getItem(STORAGE_KEY)!==uid)return;
    attempts=snapshot.docs.map(d=>d.data()).filter(a=>APPS.some(app=>app.id===a.app));render();
  }catch(err){console.error("Practice history:",err);if(token===loadToken)content.textContent="Could not load practice history."}
}
for(const app of APPS){const b=document.createElement("button");b.type="button";b.textContent=app.label;b.dataset.app=app.id;b.setAttribute("role","tab");b.addEventListener("click",()=>selectApp(app.id));tabs.appendChild(b)}
button.addEventListener("click",()=>{selectApp(DEFAULT_APP);dialog.showModal();loadHistory()});
close.addEventListener("click",()=>dialog.close());
dialog.addEventListener("close",()=>{loadToken++});
