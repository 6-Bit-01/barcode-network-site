export const FUTURE_FIGHTERS=Object.freeze([
 {id:'hellcat',name:'Hellcat',enabled:false},{id:'papaoak',name:'PapaOak',enabled:false},
 {id:'mutilator',name:'Mutilator',enabled:false},{id:'doofnoobler',name:'Doofnoobler',enabled:false},
 {id:'unknown-signal',name:'Unknown signal',enabled:false},
].map(Object.freeze));
export function demoRoster(mains){
 const active=mains.map(f=>({...f,enabled:true}));
 if(!active.length||active.length>18||new Set(active.map(f=>f.id)).size!==active.length)throw new Error('The demo roster is unavailable.');
 return [...active,...FUTURE_FIGHTERS.filter(f=>!active.some(a=>a.id===f.id))].slice(0,18);
}
export function createDemoSelection(mains,options={}){
 const roster=demoRoster(mains),ids=roster.filter(f=>f.enabled).map(f=>f.id);
 const picks=[ids.includes(options.p1)?options.p1:ids[0],ids.includes(options.p2)?options.p2:ids[Math.min(1,ids.length-1)]];
 return {roster,mode:options.mode==='local'?'local':'cpu',screen:options.screen==='select'?'select':'title',activePlayer:0,picks,confirmed:[false,false]};
}
export function beginDemoSelection(state,mode){
 if(!['cpu','local'].includes(mode))return state;
 return {...state,mode,screen:'select',activePlayer:0,confirmed:[false,false]};
}
export function previewDemoFighter(state,id){
 if(state.screen!=='select'||!state.roster.some(f=>f.id===id&&f.enabled))return state;
 const picks=[...state.picks];picks[state.activePlayer]=id;return {...state,picks};
}
export function confirmDemoFighter(state){
 if(state.screen!=='select')return state;
 const confirmed=[...state.confirmed];confirmed[state.activePlayer]=true;
 return {...state,confirmed,activePlayer:1,screen:confirmed.every(Boolean)?'ready':'select'};
}
export function backDemoSelection(state){
 if(state.screen==='title')return state;
 if(state.activePlayer===1)return {...state,screen:'select',activePlayer:0,confirmed:[false,false]};
 return {...state,screen:'title',confirmed:[false,false]};
}
export function randomDemoFighter(state,random=Math.random){
 if(state.screen!=='select')return state;
 const ids=state.roster.filter(f=>f.enabled&&f.id!==state.picks[state.activePlayer]).map(f=>f.id);
 if(!ids.length)return state;
 const number=random(),index=Math.floor(Math.max(0,Math.min(.999999,Number.isFinite(number)?number:0))*ids.length);
 return previewDemoFighter(state,ids[index]);
}
export function navigateDemoFighter(state,key){
 const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-6,ArrowDown:6}[key];
 if(!delta||state.screen!=='select')return state;
 let index=state.roster.findIndex(f=>f.id===state.picks[state.activePlayer]);
 for(let i=0;i<state.roster.length;i++){
  index=(index+delta+state.roster.length)%state.roster.length;
  if(state.roster[index].enabled)return previewDemoFighter(state,state.roster[index].id);
 }
 return state;
}
export function demoFightURL(state,baseURL,settings={}){
 if(state.screen!=='ready'||!state.confirmed.every(Boolean))throw new Error('Choose both fighters before entering the arena.');
 const url=new URL('fight.html',baseURL);
 for(const [key,value]of Object.entries({demo:'1',mode:state.mode,p1:state.picks[0],p2:state.picks[1],sound:settings.muted?'0':'1',motion:settings.reducedMotion?'1':'0'}))url.searchParams.set(key,value);
 return withControllerSeats(url,settings.controllerSeats);
}
export function parseDemoLaunch(value,roster){
 const params=new URL(value,'https://system-clash.invalid/').searchParams,ids=roster.map(f=>f.id);
 return {enabled:params.get('demo')==='1',mode:params.get('mode')==='local'?'local':'cpu',
 p1:ids.includes(params.get('p1'))?params.get('p1'):ids[0],p2:ids.includes(params.get('p2'))?params.get('p2'):ids[Math.min(1,ids.length-1)],
 muted:params.get('sound')==='0',reducedMotion:params.get('motion')==='1'};
}

export function controllerSeatsFromURL(value){
 const params=new URL(value,'https://system-clash.invalid/').searchParams;
 const seats=['pad1','pad2'].map(key=>{const raw=params.get(key);const index=raw!==null&&/^\d+$/.test(raw)?Number(raw):NaN;return Number.isSafeInteger(index)&&index>=0?index:null;});
 if(seats[0]!==null&&seats[0]===seats[1])seats[1]=null;
 return seats;
}
export function withControllerSeats(value,indices=[]){
 const url=new URL(value,'https://system-clash.invalid/');
 const seats=[0,1].map(i=>Number.isSafeInteger(indices?.[i])&&indices[i]>=0?indices[i]:null);
 if(seats[0]!==null&&seats[0]===seats[1])seats[1]=null;
 ['pad1','pad2'].forEach((key,i)=>{if(seats[i]===null)url.searchParams.delete(key);else url.searchParams.set(key,String(seats[i]));});
 return url;
}
