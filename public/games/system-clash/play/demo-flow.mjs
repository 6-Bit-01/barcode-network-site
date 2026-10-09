import {STAGES,stageById} from './fight-stages.mjs';
// An explicit user choice survives every title/lobby/fight URL handoff.
export function resolveInterfaceSettings(value, {prefersReducedMotion=false}={}){
 const params=value instanceof URLSearchParams?value:new URL(value,'https://system-clash.invalid/').searchParams;
 const motion=params.get('motion');
 return {muted:params.get('sound')==='0',reducedMotion:motion==='1'?true:motion==='0'?false:Boolean(prefersReducedMotion)};
}
export const DEMO_ROSTER_CAPACITY=19;
export const CORPORATE_FIGHTERS=Object.freeze(['bnl-01','9-bit']);
export const FUTURE_FIGHTERS=Object.freeze([{id:'mutilator',name:'Mutilator',enabled:false}].map(Object.freeze));
export function demoRoster(mains,{corporateUnlocked=false}={}){
 if(!mains.length||mains.length>DEMO_ROSTER_CAPACITY||new Set(mains.map(f=>f.id)).size!==mains.length)throw new Error('The demo roster is unavailable.');
 const active=mains.map(f=>({...f,enabled:CORPORATE_FIGHTERS.includes(f.id)?corporateUnlocked===true:f.enabled!==false}));
 const roster=[...active,...FUTURE_FIGHTERS.filter(f=>!active.some(a=>a.id===f.id))].slice(0,DEMO_ROSTER_CAPACITY);
 const opening=['6-bit','cache-back','dj-floppydisc','mac-modem','cliff','mr-nice-guy','lost-marbles','ash-flowers','wittyf0x','lyra','papa-oak','ms-mayhem'];
 const position=id=>opening.includes(id)?opening.indexOf(id):id==='mutilator'?opening.length+1:id==='bnl-01'?opening.length+2:id==='9-bit'?opening.length+3:opening.length;
 return roster.sort((a,b)=>position(a.id)-position(b.id));
}
export function createDemoSelection(mains,options={}){
 const roster=demoRoster(mains,options),ids=roster.filter(f=>f.enabled).map(f=>f.id);
 const picks=[ids.includes(options.p1)?options.p1:ids[0],ids.includes(options.p2)?options.p2:ids[Math.min(1,ids.length-1)]];
 return {roster,stage:stageById(options.stage).id,mode:['local','tournament'].includes(options.mode)?options.mode:'cpu',screen:options.screen==='select'?'select':'title',activePlayer:0,picks,confirmed:[false,false]};
}
export function selectDemoStage(state,id){
 if(!STAGES.some(stage=>stage.id===id))return state;return {...state,stage:id};
}
export function cycleDemoStage(state,direction){
 const index=STAGES.findIndex(stage=>stage.id===state.stage),step=direction<0?-1:1;
 return selectDemoStage(state,STAGES[(Math.max(0,index)+step+STAGES.length)%STAGES.length].id);
}
export function beginDemoSelection(state,mode){
 if(!['cpu','local','tournament'].includes(mode))return state;
 return {...state,mode,screen:'select',activePlayer:0,confirmed:[false,false]};
}
export function previewDemoFighter(state,id){
 if(state.screen!=='select'||!state.roster.some(f=>f.id===id&&f.enabled))return state;
 const picks=[...state.picks];picks[state.activePlayer]=id;return {...state,picks};
}
export function confirmDemoFighter(state){
 if(state.screen!=='select')return state;
 if(state.mode==='tournament')return {...state,confirmed:[true,true],activePlayer:0,screen:'ready'};
 const confirmed=[...state.confirmed];confirmed[state.activePlayer]=true;
 return {...state,confirmed,activePlayer:1,screen:confirmed.every(Boolean)?'ready':'select'};
}
export function backDemoSelection(state){
 if(state.screen==='title')return state;
 if(state.mode==='tournament'&&state.screen==='ready')return {...state,screen:'select',activePlayer:0,confirmed:[false,false]};
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
 if(state.screen!=='ready'||!state.confirmed.every(Boolean)||state.picks.some(id=>!state.roster.some(f=>f.id===id&&f.enabled)))throw new Error('Choose both fighters before entering the arena.');
 if(state.mode==='tournament')throw new Error('Tournament launch needs its saved run.');
 const url=new URL('fight.html',baseURL);
 for(const [key,value]of Object.entries({demo:'1',stage:stageById(state.stage).id,mode:state.mode,p1:state.picks[0],p2:state.picks[1],sound:settings.muted?'0':'1',motion:settings.reducedMotion?'1':'0'}))url.searchParams.set(key,value);
 return withControllerSeats(url,settings.controllerSeats);
}
export function parseDemoLaunch(value,roster){
 const params=new URL(value,'https://system-clash.invalid/').searchParams,ids=roster.filter(f=>f.enabled!==false).map(f=>f.id);
 return {stage:stageById(params.get('stage')).id,enabled:params.get('demo')==='1',mode:params.get('mode')==='local'?'local':'cpu',
 p1:ids.includes(params.get('p1'))?params.get('p1'):ids[0],p2:ids.includes(params.get('p2'))?params.get('p2'):ids[Math.min(1,ids.length-1)],
 ...resolveInterfaceSettings(params)};
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
