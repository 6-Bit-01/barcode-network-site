// New characters extend the same combat and Deletion owners as the original cast.
export const NEW_FIGHTER_STYLES={
 doofnoobler:{displayName:'Doofnoobler',height:220,name:'Soft-Spoken Schemer',description:'Small warm puppet, quick clever feints and short close pressure.',signature:'LP → HP → HK',moveSpeed:285,jumpSpeed:225,punchDamage:.8,kickDamage:.85,throwDamage:.8,reach:{punch:.83,kick:.88,throw:.9},tempo:{punch:.76,kick:.84,throw:.88},knockback:{punch:.6,kick:.7,throw:.75},throwDistance:110,preferredSequence:['low-punch','punch','kick'],preferredMoves:['low-punch','punch','low-punch','double-punch','low-kick','grab','kick']},
 lyra:{displayName:'Lyra',height:320,name:'Cyborg Claw Precision',description:'Agile cat cyborg with sharp claws, precise tech and quick footwork.',signature:'HP → LP → HP',moveSpeed:310,jumpSpeed:245,punchDamage:1.03,kickDamage:1.05,throwDamage:.9,reach:{punch:.96,kick:1.02,throw:.94},tempo:{punch:.78,kick:.87,throw:.91},knockback:{punch:.84,kick:.94,throw:.86},throwDistance:134,preferredSequence:['punch','low-punch','punch'],preferredMoves:['punch','low-punch','double-punch','kick','low-kick','power-kick','grab']},
 'papa-oak':{displayName:'PapaOak',height:385,name:'Rooted Architect Grappler',description:'Heavy rooted pressure, broad bark hands and powerful deliberate grabs.',signature:'HP → LP → HP',moveSpeed:185,jumpSpeed:155,punchDamage:1.45,kickDamage:1.12,throwDamage:1.9,reach:{punch:1.08,kick:.94,throw:1.12},tempo:{punch:1.17,kick:1.16,throw:1.08},knockback:{punch:1.42,kick:1.3,throw:1.5},throwDistance:220,preferredSequence:['punch','low-punch','punch'],preferredMoves:['grab','low-punch','grab','punch','double-punch','low-kick','power-kick']},
};
export const NEW_DELETIONS={
 doofnoobler:{id:'soft-power',name:'Soft Power',mechanism:'hug',peaceful:true,prop:false,retainFloorBody:true,duration:5200,line:'Stay soft, stay fuzzy, and stay kind.',beats:{approach:0,hugWindup:550,hugContact:1000,release:2100,slump:2750,landed:3350,present:3500,complete:5200,shove:550,contact:1000,drive:1000,captured:1000,pressure:2100,impact:2750,final:3350}},
 lyra:{id:'litter-protocol',name:'Litter Protocol',mechanism:'litter-box',duration:5900,beats:{approach:0,boxReach:550,boxSet:850,scratchWindup:850,scratch1:1200,scratch2:1500,scratch3:1800,retreat:1850,turn:2250,kick:2600,litterImpact:3000,buried:3750,present:4300,complete:5900,shove:550,contact:1200,drive:2250,captured:850,pressure:2600,impact:3000,final:3750}},
 'papa-oak':{id:'rooted-verdict',name:'Rooted Verdict',mechanism:'rip',prop:false,retainFloorBody:true,duration:5900,beats:{approach:0,gripWindup:600,gripContact:1000,strain:1750,rip:2400,separated:2850,settled:3500,present:4100,complete:5900,shove:600,contact:1000,drive:1000,captured:1000,pressure:1750,impact:2400,final:3500}},
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const duration=(clips,name,fallback)=>clips?.[name]?.nativeDuration??clips?.[name]?.duration??fallback;
const contact=(clips,name,fallback)=>clips?.[name]?.nativeContactMs??clips?.[name]?.contactMs??fallback;
const held=(clip,elapsed)=>({clip,elapsed:Math.max(0,elapsed)});
const eased=(t,start,end)=>{const p=clamp((t-start)/(end-start),0,1);return p*p*(3-2*p);};
const keyTime=(clips,name,index,fallback)=>clips?.[name]?.combatPoses?.entries?.find(e=>e.index===index)?.start??fallback;
function compiledPose(clips,name,facing,elapsed=0){const poses=clips?.[name]?.combatPoses;if(!poses)return null;const t=clamp(elapsed,0,Math.max(0,(poses.duration??1)-.001)),index=poses.entries?.find(e=>t>=e.start&&t<e.end)?.index??0;return poses.frames?.[facing]?.[index]??null;}
function captureLift(pose,site,contactPoint,maximum){const body=pose?.sites?.[site];if(!Number.isFinite(body?.y)||!Number.isFinite(contactPoint?.y))return 0;
 // The complete native capture pose supplies the height. Its top also limits
 // travel so a broad or raised body stays below the HUD at its unchanged scale.
 const clearance=Number.isFinite(pose?.bounds?.top)?Math.max(0,620+pose.bounds.top-140):maximum;
 return clamp(body.y-contactPoint.y,0,Math.min(maximum,clearance));}

export function newDeletionPose(role,t,definition,clips,fighterHeight=Infinity){const b=definition.beats;
 if(definition.mechanism==='hug'){
  if(role==='attacker'){if(t<b.hugWindup)return held('walk',t);const c=contact(clips,'delete-hug',300),d=duration(clips,'delete-hug',1100);if(t<b.hugContact)return held('delete-hug',(t-b.hugWindup)*c/(b.hugContact-b.hugWindup));if(t<b.release)return held('delete-hug',c);if(t<b.present)return held('delete-hug',c+(t-b.release)*(d-c)/(b.present-b.release));return held('delete-present',t-b.present);}
  if(t<b.hugWindup||fighterHeight<=260&&t<b.hugContact)return held('high',210);if(t<b.slump)return fighterHeight<=260?held('delete-brace',0):held('crouch',clamp((t-b.hugWindup)/(b.hugContact-b.hugWindup),0,1)*duration(clips,'crouch',510));if(t<b.landed)return held('knockdown',(t-b.slump)*duration(clips,'knockdown',630)/(b.landed-b.slump));return held('knockdown',10000);
 }
 if(definition.mechanism==='litter-box'){
  if(role==='attacker'){if(t<b.boxReach)return held('walk',t);if(t<b.scratchWindup)return held('delete-litter-kick',(t-b.boxReach)*140/(b.boxSet-b.boxReach));if(t<b.scratch1)return held('delete-claw',(t-b.scratchWindup)*contact(clips,'delete-claw',280)/(b.scratch1-b.scratchWindup));if(t<b.retreat){const c=contact(clips,'delete-claw',280),k3=keyTime(clips,'delete-claw',3,430),k4=keyTime(clips,'delete-claw',4,590),d=duration(clips,'delete-claw',880);return held('delete-claw',t<b.scratch2?c+(t-b.scratch1)*(k3-c)/(b.scratch2-b.scratch1):t<b.scratch3?k3+(t-b.scratch2)*(k4-k3)/(b.scratch3-b.scratch2):k4+(t-b.scratch3)*(d-k4)/(b.retreat-b.scratch3));}if(t<b.turn)return held('walk',t-b.retreat);if(t<b.kick)return held('delete-litter-kick',230+(t-b.turn)*(contact(clips,'delete-litter-kick',320)-230)/(b.kick-b.turn));if(t<b.litterImpact)return held('delete-litter-kick',contact(clips,'delete-litter-kick',320));if(t<b.present)return held('delete-litter-kick',320+(t-b.litterImpact)*(duration(clips,'delete-litter-kick',820)-320)/(b.present-b.litterImpact));return held('delete-present',t-b.present);}
  if(t<b.boxSet)return held('high',210);if(fighterHeight<=260&&t<b.turn)return held('delete-suspended',0);return held('delete-brace',Math.min(300,t-b.boxSet));
 }
 if(definition.mechanism==='rip'){
  if(role==='attacker'){if(t<b.gripWindup)return held('walk',t);const c=contact(clips,'delete-rip',300);if(t<b.gripContact)return held('delete-rip',(t-b.gripWindup)*c/(b.gripContact-b.gripWindup));if(t<b.rip)return held('delete-rip',c);const spread=keyTime(clips,'delete-rip',3,460);if(t<b.present)return held('delete-rip',spread+(t-b.rip)*(duration(clips,'delete-rip',1060)-spread)/(b.present-b.rip));return held('delete-present',t-b.present);}
  if(t>=b.separated)return held('knockdown',10000);return t<b.gripWindup?held('high',210):held('delete-brace',0);
 }
 return null;
}
export function newDeletionPositions(match,time,definition){const o=match._deletionOrigin,b=definition.beats,p=clamp(time/(definition.mechanism==='hug'?b.hugWindup:b.shove),0,1),ease=p*p*(3-2*p);let winnerX=o.winner+(o.near-o.winner)*ease,victimX=o.originalVictim+(o.target-o.originalVictim)*ease,victimY=0;
 if(definition.mechanism==='hug'){if(time>=b.slump){const f=match.fighters[1-match.winner],offset=f._clips.knockdown?.endOffsetX?.[o.victimFacing]??0;victimX=o.target-offset*clamp((time-b.slump)/(b.landed-b.slump),0,1);}}
 if(definition.mechanism==='litter-box'){const scratchNear=o.scratchNear??o.near;victimX=o.originalVictim;winnerX=o.winner+(scratchNear-o.winner)*ease;if(time>=b.retreat)winnerX=scratchNear+(o.near-scratchNear)*eased(time,b.retreat,b.turn);victimY=190*clamp((time-b.litterImpact)/(b.buried-b.litterImpact),0,1);const victim=match.fighters[1-match.winner],hero=match.fighters[match.winner],paw=hero._clips['delete-claw']?.contactStrikeOrigins?.[o.direction>0?'right':'left'],short=victim.height<=260,body=compiledPose(victim._clips,short?'delete-suspended':'delete-brace',o.victimFacing,short?0:300);if(time<b.turn){const lift=captureLift(body,short?'torso':'head',paw,230);victimY=-lift*eased(time,b.boxSet,b.scratch1)*(1-eased(time,b.retreat,b.turn));}}
 if(definition.mechanism==='rip'){const victim=match.fighters[1-match.winner],hero=match.fighters[match.winner],hand=hero._clips['delete-rip']?.contactGripOrigins?.[o.direction>0?'right':'left'],body=compiledPose(victim._clips,'delete-brace',o.victimFacing),lift=captureLift(body,'torso',hand,220);victimY=time>=b.settled?0:-lift*eased(time,b.gripWindup,b.gripContact)*(1-eased(time,b.rip,b.settled));}
 return {winnerX,victimX,victimY:victimY===0?0:victimY};
}
export function splitBodyState(time,definition){if(definition.mechanism!=='rip'||time<definition.beats.rip)return null;const p=clamp((time-definition.beats.rip)/(definition.beats.separated-definition.beats.rip),0,1);return {gap:85+25*p,progress:p,settled:time>=definition.beats.settled};}
