import {normalizeMatchRules,withMatchRules,matchRulesFromURL} from './fight-rules.mjs';
import {STAGES,stageById} from './fight-stages.mjs';
import {withControllerSeats} from './demo-flow.mjs';
const LEGACY_STAGES=['radio-studio','sheila-office','studio-rat-lair','containment','nature-simulation','witty-wasteland'];
export const TOURNAMENT_STORAGE_KEY='system-clash-tournament-v1';
const STATUSES=['ready','fighting','won','lost','draw','complete'];
function rosterIds(roster){return roster.filter(f=>f.enabled!==false).map(f=>f.id);}
function normalizedSettings(value={}){const controllerSeats=[0,1].map(i=>Number.isSafeInteger(value.controllerSeats?.[i])&&value.controllerSeats[i]>=0?value.controllerSeats[i]:null);if(controllerSeats[0]!==null&&controllerSeats[0]===controllerSeats[1])controllerSeats[1]=null;return {muted:!!value.muted,reducedMotion:!!value.reducedMotion,controllerSeats,matchRules:normalizeMatchRules(value.matchRules)};}
function opponentsFor(ids,fighterId,seed){let value=seed>>>0;const random=()=>{value=(value+0x6D2B79F5)>>>0;let n=value;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};const pool=ids.filter(id=>id!==fighterId);for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,8);}
export function createTournamentRun(roster,{fighterId,seed=Math.floor(Math.random()*4294967296),runId=globalThis.crypto?.randomUUID?.()??'run-'+Date.now().toString(36),settings={}}={}){
 const ids=rosterIds(roster);if(!ids.includes(fighterId)||new Set(ids).size!==ids.length||ids.length<9||!Number.isInteger(seed)||seed<0||seed>4294967295||!validRunId(runId))throw new Error('Tournament needs a playable fighter and eight distinct opponents.');
 return {version:1,runId,seed,fighterId,availableStages:STAGES.map(stage=>stage.id),availableFighters:[...ids],opponents:opponentsFor(ids,fighterId,seed),node:0,attempt:0,status:'ready',resultId:null,settings:normalizedSettings(settings)};
}
function validRunId(value){return typeof value==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value);}
function token(run){return run.runId+'.'+run.node+'.'+run.attempt;}
export function validateTournamentRun(value,roster){
 try{
  if(!value||value.version!==1||!validRunId(value.runId)||!Number.isInteger(value.seed)||value.seed<0||value.seed>4294967295||!Number.isInteger(value.node)||value.node<0||value.node>7||!Number.isSafeInteger(value.attempt)||value.attempt<0||value.attempt>100000||!STATUSES.includes(value.status))return null;
  const catalogIds=roster.map(f=>f.id),pools=value.availableFighters?[value.availableFighters]:[rosterIds(roster),catalogIds.filter(id=>id!=='bnl-01')];
  // A pre-expansion v1 run used the original18 catalog, including9 Bit.
  const ids=pools.find(pool=>Array.isArray(pool)&&pool.length>=9&&new Set(pool).size===pool.length&&pool.every(id=>catalogIds.includes(id))&&pool.includes(value.fighterId)&&JSON.stringify(value.opponents)===JSON.stringify(opponentsFor(pool,value.fighterId,value.seed)));if(!ids)return null;
  if(value.availableStages!==undefined&&(!Array.isArray(value.availableStages)||!value.availableStages.length||new Set(value.availableStages).size!==value.availableStages.length||value.availableStages.some(id=>!STAGES.some(stage=>stage.id===id))))return null;
  if(!value.settings||typeof value.settings.muted!=='boolean'||typeof value.settings.reducedMotion!=='boolean'||JSON.stringify(value.settings.controllerSeats)!==JSON.stringify(normalizedSettings(value.settings).controllerSeats))return null;
  if(value.status==='ready'){if(value.resultId!==null)return null;}else if(value.attempt<1||value.resultId!==token(value))return null;
  if(value.status==='complete'&&value.node!==7||value.status==='won'&&value.node===7||value.attempt<value.node+(value.status==='ready'?0:1))return null;
  return {version:1,runId:value.runId,seed:value.seed,fighterId:value.fighterId,...(value.availableStages?{availableStages:[...value.availableStages]}:{}),...(value.availableFighters?{availableFighters:[...ids]}:{}),opponents:[...value.opponents],node:value.node,attempt:value.attempt,status:value.status,resultId:value.resultId,settings:normalizedSettings(value.settings)};
 }catch{return null;}
}
export function saveTournamentRun(storage,run,roster){try{const valid=validateTournamentRun(run,roster);if(!valid)return false;storage.setItem(TOURNAMENT_STORAGE_KEY,JSON.stringify(valid));return true;}catch{return false;}}
export function loadTournamentRun(storage,roster){try{return validateTournamentRun(JSON.parse(storage.getItem(TOURNAMENT_STORAGE_KEY)),roster);}catch{return null;}}
export function tournamentStage(run){const stages=run.availableStages??LEGACY_STAGES;return stages[((run.seed>>>0)+run.node)%stages.length];}
export function launchTournamentMatch(run,baseURL,settings=run.settings){
 if(run.status!=='ready'||run.attempt>=100000)throw new Error('This tournament node is not ready.');
 const next={...run,attempt:run.attempt+1,status:'fighting',settings:normalizedSettings(settings)};next.resultId=token(next);
 const url=new URL('fight.html',baseURL);for(const [key,value]of Object.entries({demo:'1',stage:tournamentStage(next),mode:'cpu',tournament:'1',run:next.runId,match:next.resultId,p1:next.fighterId,p2:next.opponents[next.node],sound:next.settings.muted?'0':'1',motion:next.settings.reducedMotion?'1':'0'}))url.searchParams.set(key,value);
 return {run:next,url:withMatchRules(withControllerSeats(url,next.settings.controllerSeats),next.settings.matchRules)};
}
export function readTournamentContext(value,roster,storage){
 const params=new URL(value,'https://system-clash.invalid/').searchParams,run=loadTournamentRun(storage,roster);
 if(params.get('tournament')!=='1'||params.get('demo')!=='1'||params.get('mode')!=='cpu'||!run||run.status==='ready'||params.get('run')!==run.runId||params.get('match')!==run.resultId||params.get('p1')!==run.fighterId||params.get('p2')!==run.opponents[run.node]||stageById(params.get('stage')).id!==tournamentStage(run))return null;if(JSON.stringify(matchRulesFromURL(value))!==JSON.stringify(run.settings.matchRules))return null;return run;
}
export function consumeTournamentResult(run,{resultId,phase,winner}={}){
 if(run.status!=='fighting'||phase!=='over'||resultId!==run.resultId||![0,1,null].includes(winner))return run;
 return {...run,status:winner===0?(run.node===7?'complete':'won'):winner===1?'lost':'draw'};
}
export function continueTournamentRun(run){return run.status==='won'?{...run,node:run.node+1,status:'ready',resultId:null}:run;}
export function retryTournamentRun(run){return ['lost','draw'].includes(run.status)?{...run,status:'ready',resultId:null}:run;}
export function leaveTournamentRun(storage){try{storage.removeItem(TOURNAMENT_STORAGE_KEY);return true;}catch{return false;}}
