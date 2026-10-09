// New characters extend the same combat and Deletion owners as the original cast.
export const NEW_FIGHTER_STYLES={
 mutilator:{displayName:'Mutilator',height:320,name:'Brew City Butcher',description:'Deliberate steel-toe pressure, heavy close punches and punishing clinch throws.',signature:'HP → LP → HP',moveSpeed:220,jumpSpeed:175,punchDamage:1.23,kickDamage:1.09,throwDamage:1.22,reach:{punch:.98,kick:.97,throw:1.02},tempo:{punch:1.07,kick:1.1,throw:1.06},knockback:{punch:1.17,kick:1.1,throw:1.18},throwDistance:168,preferredSequence:['punch','low-punch','punch'],preferredMoves:['punch','low-punch','grab','double-punch','low-kick','power-kick']},
 doofnoobler:{displayName:'Doofnoobler',height:220,name:'Soft-Spoken Schemer',description:'Small warm puppet, quick clever feints and short close pressure.',signature:'LP → HP → HK',moveSpeed:285,jumpSpeed:225,punchDamage:.8,kickDamage:.85,throwDamage:.8,reach:{punch:.83,kick:.88,throw:.9},tempo:{punch:.76,kick:.84,throw:.88},knockback:{punch:.6,kick:.7,throw:.75},throwDistance:110,preferredSequence:['low-punch','punch','kick'],preferredMoves:['low-punch','punch','low-punch','double-punch','low-kick','grab','kick']},
 lyra:{displayName:'Lyra',height:320,name:'Cyborg Claw Precision',description:'Agile cat cyborg with sharp claws, precise tech and quick footwork.',signature:'HP → LP → HP',moveSpeed:310,jumpSpeed:245,punchDamage:1.03,kickDamage:1.05,throwDamage:.9,reach:{punch:.96,kick:1.02,throw:.94},tempo:{punch:.78,kick:.87,throw:.91},knockback:{punch:.84,kick:.94,throw:.86},throwDistance:134,preferredSequence:['punch','low-punch','punch'],preferredMoves:['punch','low-punch','double-punch','kick','low-kick','power-kick','grab']},
 'papa-oak':{displayName:'PapaOak',height:385,name:'Rooted Architect Grappler',description:'Heavy rooted pressure, broad bark hands and powerful deliberate grabs.',signature:'HP → LP → HP',moveSpeed:185,jumpSpeed:155,punchDamage:1.45,kickDamage:1.12,throwDamage:1.9,reach:{punch:1.08,kick:.94,throw:1.12},tempo:{punch:1.17,kick:1.16,throw:1.08},knockback:{punch:1.42,kick:1.3,throw:1.5},throwDistance:220,preferredSequence:['punch','low-punch','punch'],preferredMoves:['grab','low-punch','grab','punch','double-punch','low-kick','power-kick']},
 'lost-marbles':{displayName:'LostMarbles',height:320,name:'Chaotic Marble Pressure',description:'Agile masked brawler with irregular punch pressure and sharp footwork.',signature:'LP → HP → HK',moveSpeed:290,jumpSpeed:235,punchDamage:1,kickDamage:.94,throwDamage:.92,reach:{punch:1,kick:1,throw:1},tempo:{punch:.9,kick:.96,throw:1},knockback:{punch:.9,kick:.92,throw:.95},throwDistance:140,preferredSequence:['low-punch','punch','kick'],preferredMoves:['low-punch','punch','double-punch','low-kick','grab','kick']},
};
export const NEW_DELETIONS={
 mutilator:{id:'brew-city-massacre',name:'Brew City Massacre',mechanism:'cleaver',prop:false,retainFloorBody:true,duration:6000,beats:{approach:0,brandish:600,highCut:1150,torsoCut:1750,lowCut:2350,heavyWindup:2850,finalCut:3300,settled:4050,present:4250,complete:6000,shove:600,contact:1150,drive:1750,captured:600,pressure:2350,impact:3300,final:4050}},
 'lost-marbles':{id:'marble-theory',name:'The Marble Theory',mechanism:'marbles',prop:false,retainFloorBody:true,duration:5600,beats:{approach:0,shove:600,windup:750,firstLaunch:1000,firstImpact:1200,lastImpact:3900,fall:4400,landed:5050,present:5150,complete:5600,contact:1200,drive:1200,captured:1200,pressure:2550,impact:3900,final:5050}},
 doofnoobler:{id:'soft-power',name:'Soft Power',mechanism:'hug',peaceful:true,prop:false,retainFloorBody:false,duration:5200,line:'Stay soft, stay fuzzy, and stay kind.',beats:{approach:0,hugWindup:550,hugContact:1000,release:2100,shoveOff:2100,landed:2600,runStart:2600,escaped:3350,present:3500,complete:5200,shove:550,contact:1000,drive:1000,captured:1000,pressure:2100,impact:2100,final:3350}},
 lyra:{id:'litter-protocol',name:'Litter Protocol',mechanism:'litter-box',duration:5900,beats:{approach:0,boxReach:550,boxSet:850,scratchWindup:850,scratch1:1200,scratch2:1500,scratch3:1800,retreat:1850,fallStart:1850,basinContact:2350,basinSettled:2500,turn:2250,kick:2600,litterImpact:3000,buried:3750,present:4300,complete:5900,shove:550,contact:1200,drive:2250,captured:850,pressure:2600,impact:3000,final:3750}},
 'papa-oak':{id:'rooted-verdict',name:'Rooted Verdict',mechanism:'rip',prop:false,retainFloorBody:true,duration:5900,beats:{approach:0,gripWindup:600,gripContact:1000,strain:1750,rip:2400,separated:2850,settled:3500,present:4100,complete:5900,shove:600,contact:1000,drive:1000,captured:1000,pressure:1750,impact:2400,final:3500}},
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const duration=(clips,name,fallback)=>clips?.[name]?.nativeDuration??clips?.[name]?.duration??fallback;
const contact=(clips,name,fallback)=>clips?.[name]?.nativeContactMs??clips?.[name]?.contactMs??fallback;
const held=(clip,elapsed)=>({clip,elapsed:Math.max(0,elapsed)});
// Reuse one intact native hanging key for every lifted/carry/flying victim.
// IDs not yet packed retain their existing complete source pose.
export function hangingVictimPose(clips,fallback){return clips?.['delete-rip-front']?held('delete-rip-front',0):fallback;}
const eased=(t,start,end)=>{const p=clamp((t-start)/(end-start),0,1);return p*p*(3-2*p);};
const keyTime=(clips,name,index,fallback)=>clips?.[name]?.combatPoses?.entries?.find(e=>e.index===index)?.start??fallback;
export function litterBasinPose(clips){const asset=clips?.['delete-crumpled'],poses=asset?.combatPoses,frames=poses?.frames??asset?.data?.frames,entries=poses?.entries??asset?.timeline?.entries??[],count=frames?.right?.length??frames?.left?.length??0,index=count>2?count-2:(entries.at(-1)?.index??Math.max(0,count-1));return {clip:'delete-crumpled',elapsed:entries.find(e=>e.index===index)?.start??0,frameIndex:index};}
function compiledPose(clips,name,facing,elapsed=0,frameIndex){const poses=clips?.[name]?.combatPoses;if(!poses)return null;const t=clamp(elapsed,0,Math.max(0,(poses.duration??1)-.001)),index=Number.isInteger(frameIndex)&&poses.frames?.[facing]?.[frameIndex]?frameIndex:poses.entries?.find(e=>t>=e.start&&t<e.end)?.index??0;return poses.frames?.[facing]?.[index]??null;}
function captureLift(pose,site,contactPoint,maximum){const body=typeof site==='string'?pose?.sites?.[site]:site;if(!Number.isFinite(body?.y)||!Number.isFinite(contactPoint?.y))return 0;
 // The complete native capture pose supplies the height. Its top also limits
 // travel so a broad or raised body stays below the HUD at its unchanged scale.
 const clearance=Number.isFinite(pose?.bounds?.top)?Math.max(0,620+pose.bounds.top-140):maximum;
 return clamp(body.y-contactPoint.y,0,Math.min(maximum,clearance));}


// Plan contact from each actual authored blade edge to an actual native body band.
// Only the complete grounded winner root translates; neither source gains reach.
export function nativeCleaverContacts(match,definition=NEW_DELETIONS.mutilator){
 const o=match._deletionOrigin,hero=match.fighters[match.winner],victim=match.fighters[1-match.winner],facing=o.direction>0?'right':'left',capture=hangingVictimPose(victim._clips,{clip:'high',elapsed:210}),clip=hero._clips['delete-cleaver'];
 if(!clip?.combatPoses)return [];
 const alternatives=[capture,{clip:'high',elapsed:210},...[0,1,2,3].map(index=>({clip:'low',elapsed:keyTime(victim._clips,'low',index,index*100),frameIndex:index})),{clip:'crouch',elapsed:Math.max(0,(victim._clips.crouch?.duration??1)-.001)}];
 for(const victimPose of alternatives){const body=compiledPose(victim._clips,victimPose.clip,o.victimFacing,victimPose.elapsed,victimPose.frameIndex);if(!body)continue;
 const phases=[[definition.beats.highCut,'head',[0,1]],[definition.beats.torsoCut,'torso',[1,2]],[definition.beats.lowCut,'legs',[2]],[definition.beats.finalCut,'torso',[3,2]]];
 const plan=phases.map(([at,desired,indices])=>{
  const options=[];
  for(const [priority,index]of indices.entries()){
   const pose=clip.combatPoses.frames?.[facing]?.[index],a=pose?.strikeStart,z=pose?.strike;
   if(!a||!z)continue;
   for(const region of body.hurt??[]){
    if(region.site!==desired&&!(['head','legs'].includes(desired)&&region.site==='torso'))continue;
    const top=Math.max(Math.min(a.y,z.y),region.top),bottom=Math.min(Math.max(a.y,z.y),region.bottom);
    if(bottom-top<=.001)continue;
    const site=body.sites?.[region.site],y=clamp(site?.y??(top+bottom)/2,top+.0001,bottom-.0001),u=Math.abs(z.y-a.y)<1e-9?.5:(y-a.y)/(z.y-a.y),bladeX=a.x+(z.x-a.x)*u,edge=clamp(site?.x??(region.left+region.right)/2,region.left+.25,region.right-.25);
    const winnerX=o.originalVictim+edge-bladeX,contactX=o.originalVictim+edge;
    options.push({at,frameIndex:index,elapsed:keyTime(hero._clips,'delete-cleaver',index,index*600),site:region.site,winnerX,contact:{x:contactX,y},victimOffset:{x:contactX-o.originalVictim-(site?.x??0),y:y-(site?.y??0)},sourceOffset:{x:contactX-winnerX-z.x,y:y-z.y},score:(region.site===desired?0:10000)+priority*1000+Math.abs(y-(site?.y??y))+Math.max(region.left-(site?.x??0),0,(site?.x??0)-region.right)*4});
   }
  }
  options.sort((a,b)=>a.score-b.score);const selected=options[0];if(!selected)return null;
  const {score,...contact}=selected;return {...contact,victimPose};
 });
 if(plan.every(Boolean))return plan;
 }
 throw Error('No complete grounded native cleaver contact sequence for '+victim.id);
}
export function nativeCleaverPose(match,time,definition=NEW_DELETIONS.mutilator){
 const contacts=match._deletionOrigin.cleaverContacts??[],b=definition.beats;
 if(time<b.highCut||time>=b.present)return null;
 if(time>=b.heavyWindup&&time<b.finalCut&&match.fighters[match.winner]._clips['delete-cleaver-windup'])return {clip:'delete-cleaver-windup',elapsed:0,frameIndex:0};
 const contact=contacts.filter(c=>time>=c.at).at(-1);
 return contact?{clip:'delete-cleaver',elapsed:contact.elapsed,frameIndex:contact.frameIndex}:null;
}

export function butcherVictimState(t,definition=NEW_DELETIONS.mutilator,measuredContacts){const b=definition.beats,wounds=Array.isArray(measuredContacts)?[...new Set(measuredContacts.filter(c=>t>=c.at).map(c=>c.site))]:null;return {exposure:t>=b.finalCut?1:t>=b.lowCut?.85:t>=b.torsoCut?.5:t>=b.highCut?.25:0,tissue:t>=b.finalCut?0:1,pose:t>=b.finalCut?'heap':'standing',woundSites:wounds??(t>=b.lowCut?['head','torso','legs']:t>=b.torsoCut?['head','torso']:t>=b.highCut?['head']:[]),fall:0,rotation:0};}
export function newDeletionPose(role,t,definition,clips,fighterHeight=Infinity){const b=definition.beats;
 if(definition.mechanism==='cleaver'){
  if(role==='victim')return t<b.brandish?held('high',210):hangingVictimPose(clips,held('high',210));
  if(t<b.brandish)return held('walk',t);if(t<b.highCut)return held('delete-present',0);if(t>=b.present)return held('delete-present',t-b.present);
  const index=t>=b.finalCut?3:t>=b.lowCut?2:t>=b.torsoCut?1:0;return {...held('delete-cleaver',keyTime(clips,'delete-cleaver',index,index*180)),frameIndex:index};
 }
 if(definition.mechanism==='marbles'){
  if(role==='attacker'){if(t<b.windup)return held('walk',t);if(t>=b.present)return held('delete-present',t-b.present);const name='delete-marble',c=contact(clips,name,300),d=duration(clips,name,620);if(t<b.firstLaunch)return held(name,c*clamp((t-b.windup)/(b.firstLaunch-b.windup),0,1));if(t>=b.lastImpact)return held(name,d-1);const phase=(t-b.firstLaunch)%450;return held(name,phase<200?c+(d-c)*phase/200:c*(phase-200)/250);}
  return t<b.firstImpact?held('high',210):held(clips?.['delete-rip-front']?'delete-rip-front':'high',0);
 }
 if(definition.mechanism==='hug'){
  if(role==='attacker'){if(t<b.hugWindup)return held('walk',t);const clip=clips?.['delete-hug-happy']?'delete-hug-happy':'delete-hug',c=contact(clips,clip,300),d=duration(clips,clip,1100);if(t<b.hugContact)return held(clip,(t-b.hugWindup)*c/(b.hugContact-b.hugWindup));if(t<b.release)return held(clip,c);if(t<b.present)return held(clip,c+(t-b.release)*(d-c)/(b.present-b.release));return held('delete-present',t-b.present);}
  if(t<b.release)return held('high',210);if(t<b.runStart)return held('delete-shove',(t-b.release)*duration(clips,'delete-shove',500)/(b.runStart-b.release));return held('walk',t-b.runStart);
 }
 if(definition.mechanism==='litter-box'){
  if(role==='attacker'){if(t<b.boxReach)return held('walk',t);if(t<b.scratchWindup)return held('delete-litter-kick',(t-b.boxReach)*140/(b.boxSet-b.boxReach));if(t<b.scratch1)return held('delete-claw',(t-b.scratchWindup)*contact(clips,'delete-claw',280)/(b.scratch1-b.scratchWindup));if(t<b.retreat){const c=contact(clips,'delete-claw',280),k3=keyTime(clips,'delete-claw',3,430),k4=keyTime(clips,'delete-claw',4,590),d=duration(clips,'delete-claw',880);return held('delete-claw',t<b.scratch2?c+(t-b.scratch1)*(k3-c)/(b.scratch2-b.scratch1):t<b.scratch3?k3+(t-b.scratch2)*(k4-k3)/(b.scratch3-b.scratch2):k4+(t-b.scratch3)*(d-k4)/(b.retreat-b.scratch3));}if(t<b.turn)return held('walk',t-b.retreat);if(t<b.kick)return held('delete-litter-kick',230+(t-b.turn)*(contact(clips,'delete-litter-kick',320)-230)/(b.kick-b.turn));if(t<b.litterImpact)return held('delete-litter-kick',contact(clips,'delete-litter-kick',320));if(t<b.present)return held('delete-litter-kick',320+(t-b.litterImpact)*(duration(clips,'delete-litter-kick',820)-320)/(b.present-b.litterImpact));return held('delete-present',t-b.present);}
  if(t<b.boxSet)return held('high',210);if(t>=b.basinContact)return litterBasinPose(clips);if(t>=b.fallStart){const firstAir=keyTime(clips,'thrown',1,100),floorKey=keyTime(clips,'thrown',3,420);return hangingVictimPose(clips,held('thrown',firstAir+(floorKey-firstAir-.001)*clamp((t-b.fallStart)/(b.basinContact-b.fallStart),0,1)));}return hangingVictimPose(clips,fighterHeight<=260?held('delete-suspended',0):held('delete-brace',Math.min(300,t-b.boxSet)));
 }
 if(definition.mechanism==='rip'){
  if(role==='attacker'){if(t<b.gripWindup)return held('walk',t);const c=contact(clips,'delete-rip',300);if(t<b.gripContact)return held('delete-rip',(t-b.gripWindup)*c/(b.gripContact-b.gripWindup));if(t<b.rip)return held('delete-rip',c);const spread=keyTime(clips,'delete-rip',3,460);if(t<b.present)return held('delete-rip',spread+(t-b.rip)*(duration(clips,'delete-rip',1060)-spread)/(b.present-b.rip));return held('delete-present',t-b.present);}
  return t<b.gripWindup?held('high',210):hangingVictimPose(clips,held('delete-suspended',0));
 }
 return null;
}
export function newDeletionPositions(match,time,definition){
 const o=match._deletionOrigin,b=definition.beats;
 if(definition.mechanism==='cleaver'){const contacts=o.cleaverContacts??[],stations=[{at:0,winnerX:o.winner},...contacts];let winnerX=o.near;for(let i=1;i<stations.length;i++){const a=stations[i-1],z=stations[i];if(time<=z.at){winnerX=a.winnerX+(z.winnerX-a.winnerX)*eased(time,a.at,z.at);break;}winnerX=z.winnerX;}return {winnerX,winnerY:0,victimX:o.originalVictim,victimY:0};}
 if(definition.mechanism==='marbles'){const p=eased(time,0,b.shove);return {winnerX:o.winner+(o.target-o.direction*380-o.winner)*p,winnerY:0,victimX:o.originalVictim+(o.target-o.originalVictim)*p,victimY:0};}
 const p=clamp(time/(definition.mechanism==='hug'?b.hugWindup:b.shove),0,1),ease=p*p*(3-2*p);
 let winnerX=o.winner+(o.near-o.winner)*ease,victimX=o.originalVictim+(o.target-o.originalVictim)*ease,victimY=0,winnerY=0;
 if(definition.mechanism==='hug'){
  const victim=match.fighters[1-match.winner],hero=match.fighters[match.winner],clip=hero._clips['delete-hug-happy']?'delete-hug-happy':'delete-hug',hand=hero._clips[clip]?.contactGripOrigins?.[o.direction>0?'right':'left'],body=compiledPose(victim._clips,'high',o.victimFacing,210),torso=body?.sites?.torso,head=body?.sites?.head;
  if(torso&&head&&hand){const upper=torso.y+(head.y-torso.y)*.65,lift=Math.min(0,upper-hand.y);winnerY=lift*eased(time,b.hugWindup,b.hugContact)*(1-eased(time,b.release,b.landed));}
  if(time>=b.release)winnerX-=o.direction*95*eased(time,b.release,b.landed);
  if(time>=b.runStart)victimX=o.target+o.direction*1120*eased(time,b.runStart,b.escaped);
 }
 if(definition.mechanism==='litter-box'){
  const scratchNear=o.scratchNear??o.near,kickX=o.kickX??o.near;victimX=o.originalVictim;winnerX=o.winner+(scratchNear-o.winner)*ease;
  if(time>=b.retreat)winnerX=scratchNear+(kickX-scratchNear)*eased(time,b.retreat,b.turn);
  if(time>=b.present){winnerX=kickX+(o.target-o.direction*235-kickX)*eased(time,b.present,b.present+450);winnerY=36*eased(time,b.present,b.present+450);}
  const victim=match.fighters[1-match.winner],hero=match.fighters[match.winner],paw=hero._clips['delete-claw']?.contactStrikeOrigins?.[o.direction>0?'right':'left'],short=victim.height<=260,capture=hangingVictimPose(victim._clips,held(short?'delete-suspended':'delete-brace',short?0:300)),body=compiledPose(victim._clips,capture.clip,o.victimFacing,capture.elapsed);
  const lift=captureLift(body,short?'torso':'head',paw,230);
  if(time<b.fallStart)victimY=-lift*eased(time,b.boxSet,b.scratch1);
  else {
   const basinPose=litterBasinPose(victim._clips),floorBody=compiledPose(victim._clips,basinPose.clip,o.victimFacing,basinPose.elapsed,basinPose.frameIndex),basinRoot=-35-(floorBody?.bounds.bottom??0);
   if(time>=b.basinSettled)victimY=basinRoot+(190-basinRoot)*eased(time,b.litterImpact,b.buried);
   else {
    const startTorso=620+(body?.sites?.torso?.y??0)-lift,endTorso=620+basinRoot+(floorBody?.sites?.torso?.y??0),p=clamp((time-b.fallStart)/(b.basinContact-b.fallStart),0,1),settle=clamp((time-b.basinContact)/(b.basinSettled-b.basinContact),0,1),torso=time<b.basinContact?startTorso+(endTorso-startTorso)*p*p-22*4*p*(1-p):endTorso-8*Math.sin(Math.PI*settle),pose=newDeletionPose('victim',time,definition,victim._clips,victim.height),active=compiledPose(victim._clips,pose.clip,o.victimFacing,pose.elapsed,pose.frameIndex);
    // Native airborne and curled keys keep their own anchors. Register the
    // complete torso to one continuous ballistic path, then the basin floor.
    victimY=torso-620-(active?.sites?.torso?.y??0);
   }
  }
 }
 if(definition.mechanism==='rip'){
  const victim=match.fighters[1-match.winner],hero=match.fighters[match.winner],hand=hero._clips['delete-rip']?.contactGripOrigins?.[o.direction>0?'right':'left'],source=o.ripPose??{clip:victim._clips['delete-rip-front']?'delete-rip-front':'delete-suspended',elapsed:0},body=compiledPose(victim._clips,source.clip,o.victimFacing,source.elapsed),torso=body?.sites?.torso,torsoBands=body?.hurt?.filter(r=>r.site==='torso')??[],torsoBottom=torsoBands.length?Math.max(...torsoBands.map(r=>r.bottom)):NaN;
  // A long intact body can put its torso centre above the grounded palm.
  // Grip the existing lower torso in that case; keep the native body and cut
  // seam unchanged rather than imposing a lift past the real contact.
  const contactSite=torso&&hand&&torso.y<=hand.y&&Number.isFinite(torsoBottom)?{...torso,y:(torso.y+torsoBottom)/2}:torso,lift=captureLift(body,contactSite,hand,220);
  // The measured torso-to-palm distance controls the intact body's lift.
  // A minimum lift would carry short captures past the real closed hand.
  victimY=time>=b.settled?0:-lift*eased(time,b.gripContact,b.strain)*(1-eased(time,b.rip,b.settled));
 }
 return {winnerX,winnerY:winnerY===0?0:winnerY,victimX,victimY:victimY===0?0:victimY};
}
export function splitBodyState(time,definition){if(definition.mechanism!=='rip'||time<definition.beats.rip)return null;const p=clamp((time-definition.beats.rip)/(definition.beats.separated-definition.beats.rip),0,1);return {gap:85+25*p,progress:p,settled:time>=definition.beats.settled};}
