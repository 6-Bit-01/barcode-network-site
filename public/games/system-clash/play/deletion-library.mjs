export const DELETION_POSES = {
  attacker:[
    {id:'shove',name:'Shove',uses:'Feed a trap, topple a speaker stack, drive a target into a cabinet.'},
    {id:'pull',name:'Pull / operate',uses:'Pull cables, close a press, operate a coffin or trap.'},
    {id:'stomp',name:'Stomp / downforce',uses:'Stamp a floor switch, crush a lid, apply the final pressure.'},
    {id:'present',name:'Present the result',uses:'Turn toward the camera, reveal the prop, end the broadcast.'},
  ],
  victim:[
    {id:'brace',name:'Trap brace',uses:'Resist a closing CRT, trash chute, press, or falling hardware.'},
    {id:'suspended',name:'Suspended',uses:'Cables, microphone tethers, hoists, restraints, or a hanging trap.'},
    {id:'compressed',name:'Compression / eye pop',uses:'A new whole-body squash for CRT jaws, presses, coffins, and speaker burial.'},
    {id:'crumpled',name:'Crumpled',uses:'Fold into a cabinet, settle beneath a press, collapse after a heavy impact.'},
  ],
};

export const BROADCAST_CUT = {
  duration:6500,
  beats:{approach:0,shove:600,contact:900,drive:1100,glassImpact:1350,glassBreak:1470,enter:1550,captured:1800,brace:1950,pressure:2350,eyePop:2950,crumple:3450,crush:3850,stomp:4050,signalCut:4650,present:4900,complete:6500},
};

// The approved mechanisms have different body actions, not a shared press path.
// Legacy beat aliases remain for scene framing; named contacts drive choreography.
export const NINTH_NAIL = {
  duration:6500,
  beats:{approach:0,bootWindup:600,bootContact:800,entry:800,landed:1440,captured:1500,
    lidClose:1800,nailApproach:1800,latchTimes:[2000,2150,2300,2450,2600,2750,2900,3050],nailRaise:3300,nailStrike:3800,
    final:4150,signalCut:4600,present:4950,complete:6500,
    shove:600,contact:800,drive:800,pressure:3300,impact:3800},
};
export const GARBAGE_COLLECTION = {
  duration:6100,
  beats:{approach:0,fold:660,gutContact:770,grab:1050,gripContact:1220,folded:1550,load:1650,
    captured:2200,lidClose:2350,hopOn:2700,lidTop:3120,stampWindup:3500,stamp:3750,
    final:4150,hopOff:4450,signalCut:4550,present:4750,complete:6100,
    shove:660,contact:770,drive:1650,pressure:3120,impact:3750},
};
export const BAD_SECTOR = {
  duration:6200,
  beats:{approach:0,windup:600,release:800,upperCut:1150,bodyCut:1500,tapeCast:1850,
    ankleSnare:2150,fall:2150,prone:2780,dragStart:2780,captured:3900,bladeCut:4100,
    ejectWindup:4480,eject:4650,signalCut:5000,present:5050,complete:6200,
    shove:600,contact:1150,drive:2780,pressure:4100,impact:4100,final:4650},
};

// Authored ahead of activation. The roster only exposes this scene after its
// paired body banks and sign hardware pass the asset loader's checks.
export const EXIT_INTERVIEW = {
  id:'exit-interview',name:'Exit Interview',mechanism:'sign',duration:6200,
  beats:{approach:0,noticeWindup:600,noticePin:850,noticeEnd:1100,retreat:1100,
    operate:1750,signRelease:2200,signImpact:3000,landed:3630,signalCut:4200,
    present:4400,closedStamp:4640,complete:6200,
    shove:600,contact:850,drive:2200,captured:3000,pressure:2200,impact:3000,final:3630},
};
export const FRIENDLY_FIRE = {
  id:'friendly-fire',name:'Friendly Fire',mechanism:'wheel',duration:6400,retainFloorBody:true,
  beats:{approach:0,bind:600,bindContact:850,captured:1250,retreat:1250,aim:2150,
    spin:2200,release:3000,arrowHit:3350,wheelBreak:3600,launch:3600,landed:4240,
    signalCut:4750,present:4850,complete:6400,
    shove:600,contact:850,drive:1250,pressure:2200,impact:3350,final:4240},
};
export const APPEAL_DENIED = {
  id:'appeal-denied',name:'Appeal Denied',mechanism:'stamp',duration:6200,
  beats:{approach:0,gut:600,gutContact:770,sweep:1000,sweepContact:1160,fall:1160,
    landed:1790,stampRaise:2100,stampStrike:3000,stamped:3350,lift:3750,reveal:4250,
    signalCut:4300,present:4400,complete:6200,
    shove:600,contact:770,drive:1160,captured:1790,pressure:2100,impact:3000,final:3350},
};
export const CHROME_COFFIN = {
  id:'chrome-coffin',name:'Chrome Coffin',mechanism:'jaws',duration:6500,
  beats:{approach:0,grip:600,gripContact:850,haul:1250,captured:1700,close:2200,
    squeeze:2900,sealed:3350,reopen:4050,cube:4350,signalCut:4700,present:4800,complete:6500,
    shove:600,contact:850,drive:1250,pressure:2200,impact:3350,final:4350},
};
export const SPEAKER_BURIAL = {
  id:'speaker-burial',name:'Speaker Burial',mechanism:'speaker-stack',duration:6300,
  beats:{approach:0,kickWindup:600,kickContact:840,fall:840,landed:1480,stackReach:1750,
    push:2550,topple:3000,burial:3450,final:3950,signalCut:4350,present:4600,complete:6300,
    shove:600,contact:840,drive:1750,captured:1480,pressure:2550,impact:3450},
};
export const ENCORE_NOBODY_ASKED_FOR = {
  id:'encore-nobody-asked-for',name:'Encore Nobody Asked For',mechanism:'truss',duration:6500,retainFloorBody:true,
  beats:{approach:0,cableCast:650,bind:900,hoistWindup:1500,hoist:1750,captured:1750,
    trussHit:2200,slamWindup:2900,slamPull:3250,floorSlam:3880,micDrop:4250,
    signalCut:4450,present:4050,complete:6500,
    shove:650,contact:900,drive:1750,pressure:3250,impact:2200,final:3880},
};
export const GOOD_VIBES_ONLY = {
  id:'good-vibes-only',name:'Good Vibes Only',mechanism:'positivity',duration:6200,retainFloorBody:true,
  beats:{approach:0,castWindup:500,peacePulse:900,loveCharge:1600,positivitySurge:3000,
    landed:3630,peace:4200,signalCut:4150,present:4200,complete:6200,
    shove:500,contact:900,drive:1600,captured:900,pressure:1600,impact:3000,final:3630},
};
export const BLUE_SHIFT = {
  id:'blue-shift',name:'Blue Shift',mechanism:'wand',duration:6300,
  beats:{approach:0,castWindup:500,bind:900,lift:1750,lifted:2300,channel:2600,
    dissolve:3000,erased:4300,signalCut:4400,present:4600,complete:6300,
    shove:500,contact:900,drive:1750,captured:900,pressure:2600,impact:3000,final:4300},
};

export const DELETIONS = {
  '6-bit':{id:'broadcast-cut',name:'Broadcast Cut',duration:BROADCAST_CUT.duration,beats:BROADCAST_CUT.beats,mechanism:'crt'},
  '9-bit':{id:'ninth-nail',name:'Ninth Nail',...NINTH_NAIL,mechanism:'coffin'},
  'cache-back':{id:'garbage-collection',name:'Garbage Collection',...GARBAGE_COLLECTION,mechanism:'waste-chute'},
  'mac-modem':{id:'hard-disconnect',name:'Hard Disconnect',duration:6200,mechanism:'winch',beats:{shove:600,contact:900,drive:1150,captured:1700,pressure:2300,impact:3300,final:3900,signalCut:4400,present:4750,complete:6200}},
  'dj-floppydisc':{id:'bad-sector',name:'Bad Sector',...BAD_SECTOR,mechanism:'drive'},
  'ash-flowers':GOOD_VIBES_ONLY,
  'wittyf0x':BLUE_SHIFT,
  'cliff':EXIT_INTERVIEW,
  'kaveman-brown':SPEAKER_BURIAL,
  'stolz':CHROME_COFFIN,
  'dr3wbaby':ENCORE_NOBODY_ASKED_FOR,
  'mr-nice-guy':FRIENDLY_FIRE,
  'ms-mayhem':APPEAL_DENIED,
};

export function deletionDefinition(fighterId='6-bit') {return DELETIONS[fighterId]??null;}

const nativeDuration=(clips,id,fallback)=>clips?.[id]?.nativeDuration??clips?.[id]?.duration??fallback;
const nativeContact=(clips,id,fallback)=>clips?.[id]?.nativeContactMs??clips?.[id]?.contactMs??fallback;
const held=(clip,elapsed)=>({clip,elapsed:Math.max(0,elapsed)});
const flying=(elapsed,from,to,clips,mechanism='crt')=>{
  const duration=nativeDuration(clips,'thrown',640),measured=Number(clips?.thrown?.airborneEndMs);
  // The last native thrown key is already on the floor. Air travel may reach
  // the previous key and hold it, but cannot display that floor key early.
  const end=Number.isFinite(measured)&&measured>=0?Math.min(duration-.001,measured):duration*.68;
  const p=Math.max(0,Math.min(1,(elapsed-from)/(to-from)));
  // Lift the outgoing intact pose for the first126/99ms, before selecting a
  // compact air key. A standing thrown key cannot pass through the floor.
  if(p<.18)return mechanism==='crt'?held('delete-brace',Math.min(650,BROADCAST_CUT.beats.drive-BROADCAST_CUT.beats.shove)):held('delete-crumpled',DELETIONS['cache-back'].beats.load-DELETIONS['cache-back'].beats.folded);
  const start=Number(clips?.thrown?.[mechanism==='crt'?'airborneStartMs':'airborneExtendedMs'])||(mechanism==='crt'?100:260);
  return held('thrown',Math.min(end,start+(end-start)*(p-.18)/.82));
};

export function deletionPose(role,elapsed,fighterId='6-bit',clips=null) {
  const definition=deletionDefinition(fighterId);if(!definition)return {clip:'idle',elapsed:0};
  if(fighterId==='6-bit')return broadcastCutPose(role,elapsed,clips);
  const t=Math.max(0,elapsed),b=definition.beats;
  if(definition.mechanism==='positivity') {
    if(role==='attacker') {
      if(t<b.castWindup)return held('walk',t);
      if(t<b.peacePulse)return held('delete-positivity',(t-b.castWindup)*nativeContact(clips,'delete-positivity',200)/(b.peacePulse-b.castWindup));
      if(t<b.loveCharge)return held('delete-positivity',nativeContact(clips,'delete-positivity',200));
      if(t<b.present)return held('delete-positivity',Math.max(nativeContact(clips,'delete-positivity',200),clips?.['delete-positivity']?.channelMs??420));
      return held('delete-positivity',nativeDuration(clips,'delete-positivity',980)-1);
    }
    if(t<b.peacePulse)return held('high',210);
    if(t<b.loveCharge)return held('delete-brace',t-b.peacePulse);
    if(t<b.positivitySurge)return held('low',Math.min(280,70+t-b.loveCharge));
    if(t<b.landed)return held('knockdown',(t-b.positivitySurge)*nativeDuration(clips,'knockdown',630)/(b.landed-b.positivitySurge));
    return held('knockdown',10000);
  }
  if(definition.mechanism==='wand') {
    if(role==='attacker') {
      if(t<b.castWindup)return held('walk',t);
      if(t<b.bind)return held('delete-cast',(t-b.castWindup)*nativeContact(clips,'delete-cast',200)/(b.bind-b.castWindup));
      if(t<b.channel)return held('delete-cast',nativeContact(clips,'delete-cast',200));
      if(t<b.present)return held('delete-cast',Math.max(nativeContact(clips,'delete-cast',200),clips?.['delete-cast']?.channelMs??nativeDuration(clips,'delete-cast',800)/2));
      return held('delete-present',t-b.present);
    }
    if(t<b.bind)return held('high',210);
    if(t<b.lift)return held('delete-brace',t-b.bind);
    return held('delete-suspended',t-b.lift);
  }
  if(definition.mechanism==='wheel') {
    if(role==='attacker') {
      if(t<b.bind)return held('walk',t);
      if(t<b.retreat)return held('punch',(t-b.bind)*nativeContact(clips,'punch',170)/(b.bindContact-b.bind));
      if(t<b.aim)return held('walk',t-b.retreat);
      if(t<b.present) {
        const bow=clips['delete-bow']?'delete-bow':'delete-pull';
        const contact=nativeContact(clips,bow,240);
        return held(bow,t<b.release?(t-b.aim)*contact/(b.release-b.aim):contact+t-b.release);
      }
      return held('delete-present',t-b.present);
    }
    if(t<b.bindContact)return held('high',210);
    if(t<b.captured)return held('grabbed',t-b.bindContact);
    if(t<b.launch)return held('delete-brace',0);
    if(t<b.landed)return held('thrown',(t-b.launch)*nativeDuration(clips,'thrown',640)/(b.landed-b.launch));
    return held('knockdown',10000);
  }
  if(definition.mechanism==='stamp') {
    if(role==='attacker') {
      if(t<b.gut)return held('walk',t);
      if(t<b.sweep)return held('crouch-punch',(t-b.gut)*nativeContact(clips,'crouch-punch',110)/(b.gutContact-b.gut));
      if(t<b.landed)return held('crouch-kick',(t-b.sweep)*nativeContact(clips,'crouch-kick',160)/(b.sweepContact-b.sweep));
      if(t<b.stampRaise)return clips['delete-hammer']?(t>=b.stampRaise-120?held('delete-hammer',0):held('pickup',(t-b.landed)*nativeDuration(clips,'pickup',600)/(b.stampRaise-120-b.landed))):held('idle',t-b.landed);
      if(t<(clips['delete-hammer']?b.reveal:b.present)) {
        const stamp=clips['delete-hammer']?'delete-hammer':clips['delete-stamp']?'delete-stamp':'delete-stomp',contact=nativeContact(clips,stamp,240);
        const elapsed=t<b.stampStrike?(t-b.stampRaise)*contact/(b.stampStrike-b.stampRaise):t<b.lift?contact:contact+(t-b.lift)*(nativeDuration(clips,stamp,700)-contact)/(b.reveal-b.lift);
        return held(stamp,elapsed);
      }
      return held('delete-present',t-(clips['delete-hammer']?b.reveal:b.present));
    }
    if(t<b.gutContact)return held('high',210);
    if(t<b.fall)return held('low',Math.min(280,70+t-b.gutContact));
    if(t<b.landed)return held('knockdown',(t-b.fall)*nativeDuration(clips,'knockdown',630)/(b.landed-b.fall));
    return held('knockdown',10000);
  }
  if(definition.mechanism==='jaws') {
    if(role==='attacker') {
      if(t<b.grip)return held('walk',t);
      if(t<b.haul)return held('punch',(t-b.grip)*nativeContact(clips,'punch',170)/(b.gripContact-b.grip));
      if(t<b.captured)return held('delete-shove',t-b.haul);
      const contact=nativeContact(clips,'punch',170),duration=nativeDuration(clips,'punch',400);
      if(t<b.close)return held('punch',(t-b.captured)*contact/(b.close-b.captured));
      if(t<b.close+380)return held('punch',contact+(t-b.close)*(duration-contact)/380);
      return held('idle',t-b.close-380);
    }
    if(t<b.gripContact)return held('high',210);
    if(t<b.captured)return held('grabbed',t-b.gripContact);
    if(t<b.close)return held('delete-brace',t-b.captured);
    return held('delete-compressed',(t-b.close)*nativeDuration(clips,'delete-compressed',700)/(b.sealed-b.close));
  }
  if(definition.mechanism==='speaker-stack') {
    if(role==='attacker') {
      if(t<b.kickWindup)return held('walk',t);
      if(t<b.landed)return held('power-kick',(t-b.kickWindup)*nativeContact(clips,'power-kick',240)/(b.kickContact-b.kickWindup));
      if(t<b.stackReach)return held('walk',t-b.landed);
      if(t<b.push)return held('delete-pull',t-b.stackReach);
      if(t<b.present)return held('delete-shove',(t-b.push)*nativeContact(clips,'delete-shove',250)/(b.topple-b.push));
      return held('delete-present',t-b.present);
    }
    if(t<b.kickContact)return held('high',210);
    if(t<b.landed)return held('thrown',(t-b.fall)*nativeDuration(clips,'thrown',640)/(b.landed-b.fall));
    return held('knockdown',10000);
  }
  if(definition.mechanism==='truss') {
    if(role==='attacker') {
      if(t<b.cableCast)return held('walk',t);
      if(t<b.hoistWindup)return held('delete-shove',(t-b.cableCast)*nativeContact(clips,'delete-shove',250)/(b.bind-b.cableCast));
      if(t<b.slamWindup)return held('delete-pull',(t-b.hoistWindup)*nativeContact(clips,'delete-pull',240)/(b.hoist-b.hoistWindup));
      if(t<b.present)return held('delete-pull',(t-b.slamWindup)*nativeContact(clips,'delete-pull',240)/(b.slamPull-b.slamWindup));
      return held('delete-present',(t-b.present)*nativeContact(clips,'delete-present',240)/(b.micDrop-b.present));
    }
    if(t<b.bind)return held('high',210);
    if(t<b.hoist)return held('grabbed',t-b.bind);
    if(t<b.trussHit)return held('delete-suspended',t-b.hoist);
    if(t<b.slamPull)return held('high',280);
    if(t<b.floorSlam)return held('knockdown',(t-b.slamPull)*nativeDuration(clips,'knockdown',630)/(b.floorSlam-b.slamPull));
    return held('knockdown',10000);
  }
  if(definition.mechanism==='sign') {
    if(role==='attacker') {
      if(t<b.noticeWindup)return held('walk',t);
      if(t<b.retreat)return held('punch',(t-b.noticeWindup)*nativeContact(clips,'punch',170)/(b.noticePin-b.noticeWindup));
      if(t<b.operate)return held('walk',t-b.retreat);
      // The second complete native key is the physical lever yank. Holding
      // that pose after release never loops back to the reach key.
      if(t<b.present)return held('delete-pull',(t-b.operate)*nativeContact(clips,'delete-pull',240)/(b.signRelease-b.operate));
      return held('delete-present',(t-b.present)*nativeContact(clips,'delete-present',240)/(b.closedStamp-b.present));
    }
    if(t<b.noticePin)return held('high',210);
    if(t<b.signRelease)return held('high',Math.min(280,70+t-b.noticePin));
    if(t<b.signImpact)return held('delete-brace',t-b.signRelease);
    if(t<b.landed)return held('knockdown',(t-b.signImpact)*nativeDuration(clips,'knockdown',630)/(b.landed-b.signImpact));
    return held('knockdown',10000);
  }
  if(fighterId==='9-bit') {
    if(role==='attacker') {
      if(t<b.bootWindup)return held('walk',t);
      if(t<b.captured)return held('power-kick',(t-b.bootWindup)*nativeContact(clips,'power-kick',240)/(b.bootContact-b.bootWindup));
      if(t<b.nailApproach)return held('delete-pull',t-b.captured);
      if(t<b.nailRaise)return held('walk',t-b.nailApproach);
      if(t<b.nailStrike-180)return held('delete-nail',(t-b.nailRaise)*320/(b.nailStrike-180-b.nailRaise));
      if(t<b.nailStrike+160)return held('delete-shove',(t-(b.nailStrike-180))*nativeContact(clips,'delete-shove',240)/180);
      if(t<b.present)return held('delete-nail',nativeDuration(clips,'delete-nail',800)-1);
      return held('delete-present',t-b.present);
    }
    if(t<b.bootContact)return held('high',210);
    if(t<b.landed)return held('thrown',(t-b.entry)*nativeDuration(clips,'thrown',640)/(b.landed-b.entry));
    return held('knockdown',10000);
  }
  if(fighterId==='cache-back') {
    if(role==='attacker') {
      if(t<b.fold)return held('walk',t);
      if(t<b.grab)return held('crouch-punch',(t-b.fold)*nativeContact(clips,'crouch-punch',110)/(b.gutContact-b.fold));
      if(t<b.folded)return held('punch',(t-b.grab)*nativeContact(clips,'punch',170)/(b.gripContact-b.grab));
      if(t<b.captured)return held('delete-shove',t-b.folded);
      if(t<b.hopOn)return held('delete-pull',t-b.captured);
      if(t<b.lidTop)return held('jump',(t-b.hopOn)*nativeDuration(clips,'jump',580)/(b.lidTop-b.hopOn));
      if(t<b.stampWindup)return held('idle',t-b.lidTop);
      if(t<b.hopOff)return held('delete-stomp',(t-b.stampWindup)*250/(b.stamp-b.stampWindup));
      if(t<b.present)return held('jump',(t-b.hopOff)*nativeDuration(clips,'jump',580)/(b.present-b.hopOff));
      return held('delete-present',t-b.present);
    }
    if(t<b.gutContact)return held('high',210);
    if(t<b.gripContact)return held('low',Math.min(280,70+t-b.gutContact));
    if(t<b.folded)return held('grabbed',Math.min(340,220+t-b.gripContact));
    if(t>=b.load&&t<b.captured)return flying(t,b.load,b.captured,clips,'waste-chute');
    // The visible body is folded into the open chute. Compression exists only
    // after the opaque lid has closed and the final boot stamps it.
    if(t<b.stamp)return held('delete-crumpled',t-b.folded);
    return held('delete-compressed',10000);
  }
  if(fighterId==='dj-floppydisc') {
    if(role==='attacker') {
      if(t<b.windup)return held('walk',t);
      if(t<b.tapeCast)return held('delete-disc-throw',(t-b.windup)*nativeContact(clips,'delete-disc-throw',200)/(b.release-b.windup));
      if(t<b.ejectWindup)return held('delete-pull',t-b.tapeCast);
      if(t<b.present)return held('punch',(t-b.ejectWindup)*nativeContact(clips,'punch',170)/(b.eject-b.ejectWindup));
      return held('delete-present',t-b.present);
    }
    if(t<b.upperCut)return held('high',210);
    if(t<b.bodyCut)return held('high',Math.min(280,70+t-b.upperCut));
    if(t<b.fall)return held('grabbed',Math.min(340,220+t-b.bodyCut));
    if(t<b.prone)return held('grabbed',340);
    return held('delete-suspended',0);
  }
  // Mac's accepted cable scene is deliberately unchanged.
  if(role==='attacker') {
    if(t<b.shove)return {clip:'walk',elapsed:t};
    if(t<b.captured)return {clip:'delete-shove',elapsed:t-b.shove};
    if(definition.mechanism==='compactor'&&t>=b.pressure-420&&t<b.pressure)return {clip:'jump',elapsed:t-(b.pressure-420)};
    if(definition.mechanism==='compactor'&&t>=b.present-300&&t<b.present)return {clip:'jump',elapsed:t-(b.present-300)};
    if(definition.mechanism==='compactor'&&t>=b.pressure&&t<b.present)return {clip:'delete-stomp',elapsed:t<b.impact?0:10000};
    if(t<b.final)return {clip:'delete-pull',elapsed:Math.max(0,t-b.captured)};
    if(t<b.present)return {clip:'delete-stomp',elapsed:t-b.final};
    return {clip:'delete-present',elapsed:t-b.present};
  }
  if(t<b.shove)return {clip:'high',elapsed:210};
  if(t<b.captured)return {clip:'delete-brace',elapsed:t-b.shove};
  if(definition.mechanism==='winch'&&t<b.impact)return {clip:'delete-suspended',elapsed:t-b.captured};
  if(t<b.pressure)return {clip:'delete-brace',elapsed:10000};
  if(t<b.impact)return {clip:'delete-compressed',elapsed:t-b.pressure};
  return {clip:'delete-crumpled',elapsed:10000};
}

export function deletionPropState(elapsed,fighterId='6-bit') {
  const definition=deletionDefinition(fighterId);if(!definition)return null;
  const t=Math.max(0,elapsed),b=definition.beats;
  if(definition.mechanism==='positivity')return t<b.loveCharge?'open':t<b.positivitySurge?'captured':t<b.present?'impact':'dead';
  if(definition.mechanism==='wand')return t<b.bind?'open':t<b.dissolve?'captured':t<b.erased?'impact':'dead';
  if(definition.mechanism==='wheel')return t<b.captured?'open':t<b.arrowHit?'captured':t<b.signalCut?'impact':'dead';
  if(definition.mechanism==='stamp')return t<b.stampRaise?'open':t<b.stampStrike?'captured':t<b.reveal?'impact':'dead';
  if(definition.mechanism==='jaws')return t<b.close?'open':t<b.sealed?'captured':t<b.cube?'impact':'dead';
  if(definition.mechanism==='speaker-stack')return t<b.stackReach?'open':t<b.burial?'captured':t<b.signalCut?'impact':'dead';
  if(definition.mechanism==='truss')return t<b.bind?'open':t<b.trussHit?'captured':t<b.micDrop?'impact':'dead';
  if(definition.mechanism==='sign')return t<b.signRelease?'open':t<b.signImpact?'captured':t<b.signalCut?'impact':'dead';
  if(fighterId==='9-bit')return t<b.lidClose?'open':t<b.nailStrike?'captured':t<b.signalCut?'impact':'dead';
  if(fighterId==='cache-back')return t<b.captured?'open':t<b.lidClose?'closing':t<b.stamp?'captured':t<b.signalCut?'impact':'dead';
  if(fighterId==='dj-floppydisc')return t<b.captured?'open':t<b.bladeCut?'captured':t<b.eject?'impact':'dead';
  return t<b.captured?'open':t<b.impact?'captured':t<b.signalCut?'impact':'dead';
}

export function broadcastCutPose(role,elapsed,clips=null) {
  const t=Math.max(0,elapsed),b=BROADCAST_CUT.beats;
  if(role==='attacker') {
    if(t<b.shove)return {clip:'walk',elapsed:t};
    if(t<b.captured)return {clip:'delete-shove',elapsed:t-b.shove};
    if(t<b.stomp)return {clip:'delete-pull',elapsed:Math.max(0,t-b.brace)};
    if(t<b.present)return {clip:'delete-stomp',elapsed:t-b.stomp};
    return {clip:'delete-present',elapsed:t-b.present};
  }
  if(t<b.shove)return {clip:'high',elapsed:210};
  if(t>=b.drive&&t<b.captured)return flying(t,b.drive,b.captured,clips);
  if(t<b.pressure)return {clip:'delete-brace',elapsed:Math.min(650,t-b.shove)};
  if(t<b.eyePop)return {clip:'delete-compressed',elapsed:0};
  if(t<b.crumple)return {clip:'delete-compressed',elapsed:10000};
  return {clip:'delete-crumpled',elapsed:10000};
}

export function broadcastCutStage(elapsed) {
  const t=Math.max(0,elapsed),b=BROADCAST_CUT.beats;
  return t<b.pressure?'open':t<b.crush?'partial':t<b.signalCut?'crush':'dead';
}

export function broadcastCutFrontStage(elapsed) {
  const b=BROADCAST_CUT.beats,t=Math.max(0,elapsed);
  return t<b.glassImpact?'intact':t<b.glassBreak?'cracked':t<b.captured?'breached':t<b.pressure?'settled':null;
}

export function broadcastCutDepth(elapsed) {
  return elapsed<BROADCAST_CUT.beats.enter?'front':'inside';
}
