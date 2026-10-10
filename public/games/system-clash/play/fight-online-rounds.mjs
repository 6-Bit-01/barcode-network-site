import {createRoundSet,recordRoundResult} from './fight-rules.mjs';
import {validOnlineMatchRules} from './online-protocol.mjs';
/** One host-owned set; every guest only renders its published round state. */
export function createOnlineRoundProgression({rules={rounds:1,time:99},seed=0,intermission=2500}={}){
 if(!validOnlineMatchRules(rules)||!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isFinite(intermission)||intermission<0)throw new Error('Invalid online set rules.');
 let set=createRoundSet(rules),round=1,recorded=0,draws=0,pending=null,complete=false,winner=null;
 // Four drawn rounds require the host decision; decisive rounds keep their winner for the finisher.
 return {
  get round(){return round;},get set(){return set;},get wins(){return [...set.wins];},get complete(){return complete;},get winner(){return winner;},
  observe(match){if(complete||match?.phase!=='over'||recorded===round||![0,1,null].includes(match.winner))return false;recorded=round;set=recordRoundResult(set,{round,winner:match.winner});if(match.winner===null)draws++;if(set.complete||draws>=4||rules.rounds===1){complete=true;winner=set.complete?set.winner:rules.rounds===1?match.winner:null;pending=null;}else pending=intermission;return true;},
  tick(delta,{paused=false}={}){if(complete||pending===null||paused||!Number.isFinite(delta)||delta<0)return null;pending=Math.max(0,pending-delta);if(pending>0)return null;pending=null;round++;return {round,seed:(seed^Math.imul(round,0x9e3779b9))>>>0};},
  apply(match){if(!match)return;match.roundNumber=round;match.roundWins=[...set.wins];match.setComplete=complete;match.roundIntermission=pending;if(complete&&match.phase==='over'){match.winner=winner;if(winner===null)match.status='SET TIED — HOST DECISION';}else if(pending!==null)match.status='ROUND '+round+' COMPLETE · '+set.wins.join(' — ')+' · NEXT ROUND IN '+Math.ceil(pending/1000);},
 };
}

