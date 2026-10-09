import {planUISound,createUIBufferBank} from './fight-ui-audio.mjs';
export {UI_SOUND_ASSETS} from './fight-ui-audio.mjs';
import {planRecordedFoley,createFoleyBufferBank} from './fight-foley.mjs';
import {CHARACTER_FOLEY_VARIANTS,planCharacterFoley} from './fight-audio-palettes.mjs';
/** Recorded and procedural arcade contact Foley and original synthetic effort voices.
 * Character voices are procedural phonation, not recordings or cloned identities.
 * The announcer and approved Doofnoobler quote are offline synthetic SAPI PCM samples.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,f)=>Number.isFinite(v)?v:f;
export const ARCADE_ANNOUNCER_PATH='assets/audio/delete-him-arcade.wav';
export const CHARACTER_LINE_ASSETS=Object.freeze({
 doofnoobler:Object.freeze({path:'assets/audio/doofnoobler-stay-kind.wav',cue:'stay-kind',text:'Stay soft, stay fuzzy, and stay kind.',bytes:125126})
});
export const FIGHT_AUDIO_PROFILES=Object.freeze(Object.fromEntries(Object.entries({
  'bnl-01':{pitch:208,formants:[710,1690,3290],rasp:.025,breath:.025,weight:.98,accent:1024,robot:true,digital:true,voice:'gentle computational syllables with clean resonant carrier intervals'},
  'mutilator':{pitch:96,formants:[650,1190,2380],rasp:.39,breath:.12,weight:1.28,accent:188,voice:'clipped gravel butcher bark and forceful chest effort'},
  'lost-marbles':{pitch:138,formants:[820,1480,2880],rasp:.29,breath:.23,weight:.95,accent:460,voice:'masked breathy rasp and clipped chaotic effort'},
  'doofnoobler':{pitch:246,formants:[980,1780,3190],rasp:.04,breath:.23,weight:.64,accent:790,voice:'soft felt puppet murmur'},
  'lyra':{pitch:282,formants:[1050,2130,3550],rasp:.09,breath:.05,weight:.88,accent:1670,robot:true,voice:'feline cyborg chirp'},
  'papa-oak':{pitch:62,formants:[430,870,1850],rasp:.36,breath:.11,weight:1.55,accent:53,voice:'resonant wooden elder rumble'},
  '6-bit':{pitch:119,formants:[760,1280,2540],rasp:.22,breath:.14,weight:1,accent:165,voice:'scrappy gravel'},
  '9-bit':{pitch: 72,formants:[570,980,2220],rasp:.44,breath:.08,weight:1.42,accent: 84,voice:'deep dark growl'},
  'cache-back':{pitch:188,formants:[640,1720,3100],rasp:.05,breath:.03,weight:.85,accent:780,robot:true,voice:'gated synthetic servo'},
  'mac-modem':{pitch:91,formants:[670,1130,2340],rasp:.34,breath:.18,weight:1.3,accent:112,voice:'rough chest grunt'},
  'dj-floppydisc':{pitch:157,formants:[830,1460,2870],rasp:.12,breath:.12,weight:.87,accent:440,voice:'bright clipped effort'},
  'cliff':{pitch:134,formants:[580,1610,2510],rasp:.19,breath:.1,weight:.94,accent:230,voice:'dry nasal bark'},
  'mr-nice-guy':{pitch:173,formants:[890,1590,3010],rasp:.06,breath:.24,weight:.92,accent:520,voice:'clear airy effort'},
  'ms-mayhem':{pitch:214,formants:[790,1360,2710],rasp:.4,breath:.1,weight:1.22,accent:185,voice:'sharp gravel roar'},
  'stolz':{pitch:83,formants:[490,1040,1980],rasp:.32,breath:.03,weight:1.38,accent:310,steel:true,voice:'heavy steel resonance'},
  'kaveman-brown':{pitch:104,formants:[690,1110,2240],rasp:.28,breath:.09,weight:1.25,accent: 64,voice:'low bass chest effort'},
  'dr3wbaby':{pitch:145,formants:[820,1830,2760],rasp:.27,breath:.16,weight:.97,accent:350,voice:'rhythmic rough shout'},
  'ash-flowers':{pitch:182,formants:[930,1490,2920],rasp:.1,breath:.3,weight:.96,accent:620,voice:'warm breathy effort'},
  'wittyf0x':{pitch:318,formants:[1180,2380,3740],rasp:.25,breath:.1,weight:.7,accent:1280,fox:true,voice:'fox bark yip and howl'},
}).map(([id,profile])=>[id,Object.freeze({...profile,formants:Object.freeze(profile.formants)})])));

export const FIGHT_VOCAL_VARIANTS=Object.freeze({attack:4,hurt:4,'big-hurt':4,scream:4});
export const MAX_VOCAL_CACHE_ENTRIES=48;
export const MAX_VOCAL_CACHE_BYTES=6*1024*1024;
// Independent articulation families: syllables, stop/breath onsets, closure,
// subharmonics, vocal fry and modulation differ in addition to pitch/formants.
const vocalFamilies={
 'bnl-01':{kind:'computational-resonance',duration:.91,open:.58,sub:0,nasal:.16,grit:.018,flutter:8,phrases:[['mi-uo','nu-ee','di-oh','li-eh'],['eh-u','mi-oh','nu-ih','ee-no'],['uo-ee-ah','di-eh-uo','mi-oo-eh','nu-ah-ee'],['ee-uo-aa','mi-ah-oo-ee','nu-ee-oh-aa','di-oo-aa-eh']]},
 mutilator:{kind:'butcher-bark',duration:1.04,open:.41,sub:.31,nasal:.05,grit:.58,flutter:14,phrases:[['kh-hah','ruh','gah-hup','hrr-yah'],['agh','kh-uh','oh-rr-kh','huh-agh'],['gh-ah-rr','akh-rah','uh-agh-hah','rr-khah'],['rr-aa-kh','gh-aaa-hah','akh-oh-rr','hrah-aa-ugh']]},
 'lost-marbles':{kind:'masked-staccato',duration:.92,open:.38,sub:.14,nasal:.19,grit:.47,flutter:23,phrases:[['kh-ha','heh','ts-hup','rr-kih'],['akh-eh','uh-kh','hff','kh-oh'],['ha-rr-agh','kh-aa-huh','eh-rr-ah','hff-aah'],['kh-ah-rr','heh-aa-kh','rr-aa-hff','hff-aa-eh']]},
 'doofnoobler':{kind:'felt-murmur',duration:.9,open:.71,sub:.01,nasal:.39,grit:.04,flutter:3,phrases:[['hu','hmm-hup','ho-eh','mmm'],['oh','oof','eh-oh','uh-hm'],['oh-hmm','hu-oof','ah-ohh','hmm-eh'],['oo-ah','oh-ehh','hu-ah-oh','mm-aa']]},
 'lyra':{kind:'cat-servo',duration:.82,open:.27,sub:.02,nasal:.32,grit:.13,flutter:31,phrases:[['ki','tss-ya','mr-ki','ya-tk'],['ih','mrr-eh','ki-ih','tss-ah'],['mrr-yah','ih-aa','tk-kee','yah-mrr'],['ee-yaa','mrr-ee-ah','ki-aa-yee','yah-ee-mrr']]},
 'papa-oak':{kind:'wood-throat',duration:1.21,open:.73,sub:.63,nasal:.06,grit:.49,flutter:2,phrases:[['hrum','hoom','gh-ho','hrr'],['uum','ohm','hr-ugh','ogh'],['hoom-aah','hr-augh','ogh-um','rr-ho'],['hooo-aa','aum-rr-ah','gh-oh-aa','hrum-aaa']]},
 '6-bit':{kind:'gravel',duration:.97,open:.48,sub:.18,nasal:.04,grit:.3,flutter:11,phrases:[['ha','hup','kya-ha','hu'],['uh','ah','oh-kh','ha-uh'],['rr-ah','uh-agh','ah-kha','oh-ah'],['aa-rr','uh-aah','ha-aa-rr','rr-aa']]},
 '9-bit':{kind:'dark-roar',duration:1.14,open:.64,sub:.62,nasal:0,grit:.66,flutter:7,phrases:[['grh','rah','hru-rr','kh-rr'],['rr-uh','gh-ah','oh-rr','hr-uh'],['gh-raa','uh-rr-ah','rr-oh','raa-gh'],['rr-aa','gh-aaa-rr','oh-rr-aa','raa-rr-oh']]},
 'cache-back':{kind:'servo',duration:.86,open:.31,sub:0,nasal:0,grit:.03,flutter:27,phrases:[['zzip','kt-bzz','zi-kt','brr-zzi'],['kt-zi','bzz-ah','zi-brr','kt-bzz-kt'],['brr-zzi','kt-aa-bzz','zi-kt-zi','bzz-brr'],['zzi-brr-aa','kt-zi-brr','aa-zzi-kt','brr-aa-bzz']]},
 'mac-modem':{kind:'chest-bellow',duration:1.07,open:.67,sub:.38,nasal:.08,grit:.44,flutter:8,phrases:[['haugh','huh','kh-hah','ho'],['ugh','ohh','ah-kh','huh-oh'],['gh-augh','oh-agh','kh-aa','uh-ohh'],['augh-aa','oh-ah-ugh','kh-aaa','aa-oh-rr']]},
 'dj-floppydisc':{kind:'clipped-syllables',duration:.87,open:.4,sub:.04,nasal:.23,grit:.1,flutter:19,phrases:[['tsah','hup','eh-ha','ki'],['ih','ah','eh-kh','uh-eh'],['eh-ah','kh-uh-ah','ih-eh','ah-kah'],['ee-aa','eh-ah-ee','aa-eh','ki-aa-ah']]},
 'cliff':{kind:'dry-nasal',duration:.93,open:.44,sub:.11,nasal:.51,grit:.2,flutter:13,phrases:[['keh','nah','kh-eh','ha-nah'],['eh','unh','ah-eh','kh-unh'],['neh-aa','uh-eh-ah','kh-ehh','ah-unh'],['eh-aa','nah-eh-aa','unh-aah','kh-aa-eh']]},
 'mr-nice-guy':{kind:'clean-air',duration:.98,open:.58,sub:.02,nasal:.06,grit:.02,flutter:5,phrases:[['hah','hey','hu-ah','ya'],['ah','oh','uh-ah','ehh'],['oh-aah','uh-oh','ha-ahh','eh-aa'],['ah-aaa','oh-ah-aa','eh-aah','ha-aa-oh']]},
 'ms-mayhem':{kind:'rasp-belt',duration:1.02,open:.36,sub:.2,nasal:.09,grit:.73,flutter:17,phrases:[['krah','hah','rr-kah','ya-ha'],['akh','gah','eh-rr','uh-kah'],['rr-aah','ka-aa','gh-ah-rr','yah-agh'],['kraa-aa','rr-ah-aaa','yaa-rr-ah','gh-aa-rr']]},
 'stolz':{kind:'steel-throat',duration:1.09,open:.55,sub:.44,nasal:0,grit:.28,flutter:9,phrases:[['hrum','kh-roh','grh','ruh-kh'],['gh-uh','hr-oh','rr-ah','kh-uh'],['grh-aah','rr-ohh','uh-hr-aa','kh-raa'],['hr-aa-rr','grh-oh-aa','rr-aaa','kh-aa-hr']]},
 'kaveman-brown':{kind:'bass-throat',duration:1.11,open:.7,sub:.48,nasal:.03,grit:.39,flutter:6,phrases:[['huh','roh','gh-hah','hoo'],['uhh','ogh','ah-uh','rr-oh'],['hrr-ah','oh-uhh','uh-gh-aa','rr-agh'],['hoo-aa','gh-aa-uh','rr-oh-aa','uh-aaa-gh']]},
 'dr3wbaby':{kind:'rhythmic-growl',duration:.95,open:.46,sub:.19,nasal:.17,grit:.42,flutter:21,phrases:[['yah','ha-huh','keh','rr-yah'],['akh','uh-ah','eh','kh-ah'],['yah-agh','uh-kah-aa','rr-eh','ah-ha'],['ya-aa','rr-ah-eh','ha-ah-aa','ee-ah-rr']]},
 'ash-flowers':{kind:'warm-breath',duration:1.03,open:.62,sub:.03,nasal:.04,grit:.04,flutter:4,phrases:[['ha','hu','eh-ha','ya'],['oh','ahh','uh-eh','ha-oh'],['oh-ah','uh-aah','eh-ohh','ha-aa'],['aa-oh','eh-ah-aa','oh-aaa','ha-aa-eh']]},
 'wittyf0x':{kind:'fox',duration:.81,open:.29,sub:.14,nasal:.28,grit:.41,flutter:25,phrases:[['yip','yak','ki-yip','rr-yak'],['ki','yelp','rr-i','iak'],['kee-yah','rr-kee','yak-aa','i-yak'],['yow-aa','rr-yee-aa','yip-aa-yow','hee-rr-aa']]},
};
const vowelForms={a:[1.19,1,1.01],u:[.6,.67,.88],o:[.75,.75,.92],e:[.91,1.3,1.04],i:[.52,1.55,1.17]};
const modeDuration={attack:.24,hurt:.31,'big-hurt':.55,scream:1.09};
function vocalVariant(mode,variant){const count=FIGHT_VOCAL_VARIANTS[mode]??4;return ((Math.floor(finite(variant,0))%count)+count)%count;}
export const FIGHT_VOCAL_BANKS=Object.freeze(Object.fromEntries(Object.entries(vocalFamilies).map(([id,family])=>[id,Object.freeze({family:family.kind,variants:Object.freeze(Object.fromEntries(Object.keys(FIGHT_VOCAL_VARIANTS).map((mode,index)=>[mode,Object.freeze(family.phrases[index].map((phrase,variant)=>Object.freeze({variant,phrase,duration:Number((modeDuration[mode]*family.duration*[.86,1.02,1.18,.96][variant]*(1+(phrase.split('-').length-1)*.075)).toFixed(4))}))) ])))})])));

/** Deterministic shuffle bags are independent for each fighter/action family.
 * A new bag never opens with the last sound played from the preceding bag.
 */
export function createFightVariationSelector(seed=94712){
 const states=new Map();
 return {next(key,count=4){
   count=Math.max(1,Math.floor(count));let state=states.get(key);
   if(!state){state={seed:hash(String(seed)+'|'+key),bag:[],last:-1};states.set(key,state);}
   const random=()=>{state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0;return state.seed/4294967296;};
   if(!state.bag.length){state.bag=Array.from({length:count},(_,i)=>i);for(let i=count-1;i>0;i--){const j=Math.floor(random()*(i+1));[state.bag[i],state.bag[j]]=[state.bag[j],state.bag[i]];}if(count>1&&state.bag[0]===state.last)[state.bag[0],state.bag[1]]=[state.bag[1],state.bag[0]];}
   const variant=state.bag.shift();state.last=variant;return variant;
 },clear(){states.clear();},get size(){return states.size;}};
}
const fallback=FIGHT_AUDIO_PROFILES['6-bit'];
const profile=id=>FIGHT_AUDIO_PROFILES[id]??fallback;
const layer=(kind,frequency,end,duration,gain,delay=0,extra={})=>({kind,frequency,end,duration,gain,delay,...extra});
const tone=(frequency,end,duration,gain,delay=0,waveform='sine')=>layer('tone',frequency,end,duration,gain,delay,{waveform});
const noise=(frequency,duration,gain,delay=0,filter='bandpass',q=.7)=>layer('noise',frequency,frequency,duration,gain,delay,{filter,q});

function mechanism(event){
  const cue=event.cue??'';
  if(/disc|blade|cable|tape/.test(cue)||event.damageKind==='cut')return 'cut';
  if(/stamp|crush|pressure|chrome|jaws|speaker-burial/.test(cue))return 'crush';
  if(/nail|arrow|spike/.test(cue)||event.type==='weapon-embed')return 'puncture';
  if(/peace|heart|blue|signal|pulse/.test(cue)||event.damageKind==='scorch')return 'energy';
  if(/slam|stomp|truss|sign-strike|topple/.test(cue))return 'slam';
  return 'blunt';
}

/** Pure deterministic routing; useful to review without a browser audio device. */
export function planFightSound(event={},variation=0){
  const ui=planUISound(event.type);if(ui)return ui;
  variation=((Math.floor(finite(variation,0))%CHARACTER_FOLEY_VARIANTS)+CHARACTER_FOLEY_VARIANTS)%CHARACTER_FOLEY_VARIANTS;
  const type=event.type??'',strength=clamp(finite(event.strength,1),.25,3.4);
  const attackerId=event.attackerId??event.fighterId,victimId=event.victimId??event.targetId;
  const attacker=profile(attackerId),victim=profile(victimId),layers=[],voices=[];
  const add=(...items)=>layers.push(...items);
  const voice=(id,mode,delay=0)=>{if(id&&FIGHT_AUDIO_PROFILES[id])voices.push({id,mode,delay});};
  const heavy=type==='deletion-impact'||strength>=1.65||finite(event.damage,0)>=18;
  const material=event.victimMaterial==='metal'||victim.robot||victim.steel?'metal':'organic';
  const contact=mechanism(event);
  let priority=1,announcer=false,characterLine=null;
  if(event.peaceful&&['deletion','deletion-cue','deletion-impact'].includes(type)){
    return {type,attackerId,victimId,material:'organic',contact:'cloth',heavy:false,priority:1,announcer:false,characterLine:null,layers:[noise(1750,.13,.07,0,'bandpass',.7),tone(390,520,.2,.055,.025,'triangle')],voices:[],variation,foleyFamily:'soft-hug',foleyFighterId:attackerId};
  }
  if(type==='character-line'){
    const id=event.fighterId??attackerId,spec=CHARACTER_LINE_ASSETS[id];
    characterLine=spec&&event.cue===spec.cue?id:null;
  }else if(type==='stage-warning'||type==='stage-activate'){
    const i=Math.max(0,['radio-studio','sheila-office','studio-rat-lair','containment','nature-simulation','witty-wasteland'].indexOf(event.stageId));
    priority=2;const freq=[690,240,180,1120,850,95][i];
    if(type==='stage-warning'){add(tone(freq,freq*.72,.11,.14,0,'square'),tone(freq*1.4,freq,.12,.11,.24,'triangle'));}
    else {add(noise([2300,710,460,4500,2900,850][i],.22+i*.025,.2,0,i===3?'highpass':'bandpass',.8+i*.25),tone(freq*.7,Math.max(32,freq*.15),.22+i*.02,.13,.012,i===4?'sine':'sawtooth'));}
  }else if(type==='stage-interact'){add(tone(540,920,.07,.1,0,'square'),noise(3200,.025,.08,.008,'highpass'));}
  else if(type==='wall-break'){
    const glass=event.stageId==='containment'||event.stageId==='nature-simulation';priority=3;
    add(noise(glass?6100:1600,.4,.25,0,glass?'highpass':'lowpass'),tone(glass?1280:105,glass?530:38,.28,.16,.016,'triangle'),noise(2800,.19,.13,.065,'bandpass',1.3));
  }else if(type==='stage-transition'){add(noise(1600,.2,.14,0,'highpass'),tone(120,360,.2,.08,.018,'sine'));}
  else if(type==='finish-prompt'){announcer=true;priority=4;}
  else if(type==='attack'||type==='special'){
    voice(attackerId,'attack');priority=1;
    add(noise(attacker.fox?3400:2200,.085,.12,0,'highpass'),tone(attacker.accent*1.2,attacker.accent*.55,.09,.08,0,'triangle'));
  } else if(type==='hit'||type==='deletion-impact'||type==='weapon-embed'){
    priority=heavy?3:2;
    const kick=/kick|uppercut/.test(event.action??'');
    const weight=clamp(strength*attacker.weight,.55,2.8);
    add(tone((kick?95:142)/Math.sqrt(attacker.weight),22,heavy?.29:.16,.42));
    // A short hard transient, irregular dry fractures, and a separate wet body
    // contact make heavy blows read as bone and flesh rather than a long buzz.
    if(material==='organic'){
      add(noise(kick?1350:2150,.027,.3,0,'bandpass',1.2),noise(heavy?610:920,heavy?.2:.095,.3,.008,'lowpass'));
      add(noise(880,heavy?.12:.047,heavy?.38:.19,.016,'bandpass',2.2));
      for(let i=0;i<(heavy?4:2);i++)add(tone(330+137*i,70+31*i,.022+i*.003,(heavy?.1:.055)/(1+i*.25),.018+i*.019,'triangle'));
      if(heavy)add(noise(430,.25,.23,.065,'lowpass'),noise(2800,.042,.19,.043,'highpass'));
    } else {
      add(noise(3400,.043,.31,0,'highpass'));
      for(const [i,f] of [417,731,1267].entries())add(tone(f*(victim.robot?1.18:1),f*.91,heavy?.36:.19,.17/(i+1),.008*i,'triangle'));
      add(noise(victim.robot?4400:1800,heavy?.2:.085,.2,.035,'bandpass',2));
    }
    if(contact==='cut')add(noise(4700,heavy?.25:.095,.3,.014,'highpass'),tone(920,140,.19,.13,0,'sawtooth'));
    if(contact==='crush')add(tone(61,17,.47,.24,.035,'triangle'),noise(380,.42,.24,.07,'lowpass'),noise(1320,.11,.21,.12));
    if(contact==='puncture')add(tone(1480,180,.12,.14,0,'triangle'),noise(2800,.06,.23,.012,'bandpass',3));
    if(contact==='energy')add(tone(1000,80,.3,.25,0,'sawtooth'),tone(1470,220,.19,.12,.06,'square'),noise(4300,.19,.21,.015,'highpass'));
    if(contact==='slam')add(tone(55,20,.38,.25,.03),noise(290,.27,.25,.016,'lowpass'));
    // Contact intensity governs vocal effort; repeats are rate limited at play.
    voice(victimId,type==='deletion-impact'?'scream':heavy?'big-hurt':'hurt',.025);
    if(type==='hit'&&!heavy&&finite(event.combo,1)>1)voice(attackerId,'attack',.035);
    if(weight>1.5)for(const item of layers)item.gain*=1.08;
  } else if(type==='block'){
    add(tone(420+attacker.accent*.18,190,.1,.2,0,'triangle'),noise(3900,.055,.3,0,'highpass'));
    if(victim.robot||victim.steel)add(tone(970,690,.2,.12,.012,'triangle'));
  } else if(type==='miss'){add(noise(2600,.14,.21,0,'highpass'));}
  else if(type==='throw'){priority=2;add(noise(1200,.19,.27,0,'lowpass'),tone(125, 42,.18,.2));voice(victimId,'big-hurt',.08);}
  else if(type==='land'||type==='ko'){
    priority=type==='ko'?3:1;
    add(tone(event.jump?90: 64,22,event.jump?.12:.28,event.jump?.13:.36),noise(500,event.jump?.07:.15,event.jump?.1:.26,0,'lowpass'));
    if(type==='ko'&&!event.timeout)voice(victimId,'big-hurt');
    else if(!event.jump&&strength>1.2)voice(victimId,'hurt');
  } else if(type==='deletion'){
    if(event.cue!=='complete'){priority=2;add(tone(148,44,.32,.17,0,'sawtooth'));voice(attackerId,'attack');}
    else add(tone(180,90,.16,.12,0,'triangle'));
  } else if(type==='deletion-cue'){
    const cue=event.cue??'';
    priority=2;
    if(/bind|tether|tape|snare|drag/.test(cue))add(noise(2100,.18,.15,0,'highpass'),tone(680,190,.12,.1,0,'triangle'));
    else if(/disc-release|arrow-release|rig-release/.test(cue))add(noise(4800,.22,.22,0,'highpass'),tone(780, 84,.2,.1,0,'triangle'));
    else if(/blue|peace|love|heart/.test(cue))add(tone(attacker.accent,attacker.accent*1.9,.42,.17,0,'triangle'),tone(attacker.accent*1.51,attacker.accent*2.3,.3,.1,.03));
    else if(/seal|lid-close|latch|entry|load|captured/.test(cue))add(tone(130, 42,.15,.19,0,'square'),noise(1350,.11,.2),tone(630,410,.16,.09,.02,'triangle'));
    else if(/spin|channel|charge|hoist|lift|raise/.test(cue))add(tone(95,320,.34,.16,0,'sawtooth'),noise(1400,.3,.1));
    else if(/drop|break|topple|gut|boot|sweep/.test(cue))add(tone(170, 32,.15,.2),noise(1650,.11,.18));
    else if(/eject|reopen|reveal|verdict|present|erased|signal/.test(cue))add(tone(attacker.accent,attacker.accent*.55,.19,.13,0,'triangle'),noise(2300,.09,.1));
    else add(noise(1400,.11,.13),tone(attacker.accent,attacker.accent*.6,.1,.07,0,'triangle'));
  } else if(type==='weapon-pickup')add(tone(420,840,.1,.16,0,'triangle'),tone(630,1050,.16,.12,.07,'triangle'));
  else if(type==='weapon-use'){
    if(event.weaponType==='pulse-driver')add(tone(1240,75,.2,.3,0,'sawtooth'),noise(5200,.11,.21,0,'highpass'));
    else add(noise(2850,.12,.21,0,'highpass'),tone(245, 72,.1,.14,0,'triangle'));
    voice(attackerId,'attack');
  } else if(type==='weapon-throw')add(noise(3300,.22,.24,0,'highpass'));
  else if(type==='weapon-empty')add(tone(210, 96,.045,.13,0,'square'));
  else if(type==='glass-break'||type==='glass-impact'){
    priority=2;add(noise(6100,type==='glass-break'?.44:.12,.31,0,'highpass'));
    for(let i=0;i<4;i++)add(tone(1700+i*511,470+i*113,.17+i*.035,.13/(i+1),i*.024,'triangle'));
  } else if(type==='eye-pop')add(noise(920,.07,.25,0,'lowpass'),tone(620, 72,.14,.2,0,'triangle'));
  else if(type==='round-start')add(tone(180,180,.1,.17,0,'square'),tone(270,270,.14,.17,.14,'square'));
  const foley=planCharacterFoley(event,{variant:variation,attackerId,victimId,strength,heavy,material,contact});
  if(foley.replace&&foley.layers.length)layers.length=0;
  layers.push(...foley.layers);
  // Bound the complete layer sum. A compressor and final soft limiter also
  // protect combined events, but no individual impact relies on hard clipping.
  const sum=layers.reduce((v,item)=>v+item.gain,0);
  const scale=Math.min(1,.95/Math.max(.01,sum));
  for(const item of layers)item.gain*=scale;
  return {type,attackerId,victimId,material,contact,heavy,priority,announcer,characterLine,layers,voices,variation,foleyFamily:foley.family,foleyFighterId:foley.fighterId};
}


function seededRandom(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};}
function hash(text){let out=2166136261;for(const char of text)out=Math.imul(out^char.charCodeAt(0),16777619);return out>>>0;}
function bandpass(frequency,q,rate){
  const omega=2*Math.PI*clamp(frequency,30,rate*.44)/rate,alpha=Math.sin(omega)/(2*q),a0=1+alpha;
  const b0=alpha/a0,b2=-b0,a1=-2*Math.cos(omega)/a0,a2=(1-alpha)/a0;
  let x1=0,x2=0,y1=0,y2=0;
  return x=>{const y=b0*x+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;return y;};
}
/** Original synthetic utterances with consonant/breath onsets and independently
 * voiced syllables. Variants change phrasing, contour, glottal closure, fry,
 * breath and vowel movement, rather than replaying one normalized waveform.
 * Existing (id,mode,sampleRate) callers retain variant zero by default.
 */
export function renderFightVocal(id,mode='hurt',sampleRate=22050,variant=0){
 const p=profile(id),family=vocalFamilies[id]??vocalFamilies['6-bit'];
 mode=FIGHT_VOCAL_VARIANTS[mode]?mode:'hurt';variant=vocalVariant(mode,variant);
 sampleRate=clamp(Math.floor(finite(sampleRate,22050)),8000,96000);
 const spec=FIGHT_VOCAL_BANKS[id]?.variants[mode]?.[variant]??FIGHT_VOCAL_BANKS['6-bit'].variants[mode][variant];
 const tokens=spec.phrase.split('-'),duration=spec.duration,count=Math.ceil(duration*sampleRate),data=new Float32Array(count);
 const random=seededRandom(hash(id+':'+mode+':'+variant)),weights=tokens.map(token=>Math.max(1,Math.min(2.1,token.length*.34))),total=weights.reduce((a,b)=>a+b,0);
 const pitchMode=mode==='hurt'?.85:mode==='big-hurt'?.93:mode==='scream'?1.14:1;
 const pitchVariant=[.92,1.12,1.02,.81][variant],gap=[.012,.031,.019,.042][variant];
 let phase=0,start=0,peak=.01;
 for(let syllable=0;syllable<tokens.length;syllable++){
   const token=tokens[syllable],length=duration*weights[syllable]/total,end=start+length;
   const vowel=token.includes('i')||token.includes('yip')?'i':token.includes('e')?'e':token.includes('o')?'o':token.includes('u')?'u':'a';
   const formants=vowelForms[vowel],filters=p.formants.map((f,index)=>bandpass(f*formants[index]*(1+[.025,-.035,.06,-.065][variant]),index===0?2.8:4.3,sampleRate));
   const from=Math.round(start*sampleRate),to=Math.min(count,Math.round(end*sampleRate));
   const hard=/^[kgkt]/.test(token),breathy=/^[huw]/.test(token),growl=/r|gh/.test(token);
   for(let i=from;i<to;i++){
     const t=i/sampleRate,local=t-start,u=clamp(local/length,0,1),whole=t/duration;
     const curve=variant===0?1.16-.35*u:variant===1?.91+.25*Math.sin(Math.PI*u):variant===2?1.19-.18*u+.11*Math.sin(u*2*Math.PI):1.04-.4*u;
     const cry=mode==='scream'?1+.1*Math.sin(whole*7*Math.PI+variant):1;
     const chirp=family.kind==='fox'?1+.29*Math.exp(-u*7)-.14*u:family.kind==='servo'?1+.2*Math.sin(u*Math.PI*(2+variant)):1;
     const pitch=p.pitch*pitchMode*pitchVariant*curve*cry*chirp*(1+.012*Math.sin(t*(47+variant*11))+family.grit*.025*Math.sin(t*133));
     phase+=2*Math.PI*pitch/sampleRate;
     const air=random(),cycle=(phase/(2*Math.PI))%1,open=clamp(family.open+[.015,-.06,.04,-.025][variant],.2,.75);
     const pulse=cycle<open?Math.sin(Math.PI*cycle/open):-.44*Math.exp(-(cycle-open)*(18+variant*5));
     const sub=Math.sin(phase*.5)*family.sub*(growl?1.4:1),nasal=Math.sin(phase*3.06)*family.nasal;
     const rasp=family.grit*(Math.sin(phase*.473)*.48+air*.25)*(1+[.15,-.2,.35,-.08][variant]);
     let throat=pulse*.72+Math.sin(phase)*.18+sub+nasal+rasp;
     if(family.kind==='computational-resonance')throat=Math.sin(phase)*.56+Math.sin(phase*1.5)*.17+Math.sin(phase*2)*.1;
     if(family.kind==='servo')throat=(cycle*2-1)*.6+Math.sin(phase*2.01)*Math.sin(t*2*Math.PI*(67+variant*19))*.65;
     if(family.kind==='fox')throat=pulse*.6+Math.sin(phase*2)*.34+Math.sin(phase*4)*.23+rasp;
     let value=filters.reduce((sum,filter,j)=>sum+filter(throat+air*p.breath*(breathy?1.7:1))*[1,.54,.25][j],0);
     const consonant=hard?air*Math.exp(-local*(variant===2?73:125))*.24:breathy?air*Math.exp(-local*48)*(.1+p.breath*.38):0;
     value+=consonant+air*p.breath*.045;
     const onset=clamp(local/(hard?.003:breathy?.018:.007),0,1),release=clamp((length-local-gap)/(mode==='attack'?.035:.075),0,1);
     let envelope=Math.pow(Math.sin(Math.PI*u),mode==='attack'?.45:.25)*onset*release;
     if(family.kind==='servo'){value=Math.round(value*([15,9,23,12][variant]))/[15,9,23,12][variant];envelope*=Math.sin(t*2*Math.PI*(23+variant*9))>-.35?1:.12;}
     else if(family.kind==='computational-resonance'){value=value*.9+Math.sin(phase*1.25)*.045;envelope*=.82+.18*Math.sin(local*Math.PI*(8+variant*3))**2;}
     else if(family.kind==='steel-throat')value=value*.8+Math.sin(t*2*Math.PI*(173+variant*37))*value*.32+sub*.22;
     else if(family.kind==='fox')envelope*=mode==='scream'?.68+.32*Math.sin(t*(17+variant*3))**2:.32+.68*Math.sin(t*(23+variant*7)+.7)**2;
     else if(family.kind==='rhythmic-growl'||family.kind==='clipped-syllables')envelope*=.68+.32*Math.sin(t*(family.flutter+variant*7))**2;
     else if(family.kind==='dark-roar'||family.kind==='bass-throat')envelope*=.78+.22*Math.sin(t*(family.flutter+variant))**2;
     value=Math.tanh(value*(1+p.rasp*2+family.grit*.6))*envelope;
     data[i]=value;peak=Math.max(peak,Math.abs(value));
   }
   start=end;
 }
 for(let i=0;i<count;i++)data[i]*=.78/peak;
 return data;
}
export function createFightAudio(options={}){
  let context=null,master=null,fxBus=null,uiBus=null,voiceBus=null,announcerBus=null,noiseBuffer=null,announcerBuffer=null;
  let muted=!!options.muted,paused=!!options.paused,reducedMotion=!!options.reducedMotion,announcerPlayed=false;
  let pendingStart=null,assetError='',playedEvents=0,droppedEvents=0,playedVoices=0,vocalCacheBytes=0,lastFoleyVariation=null,recordedFoleyPlayed=0,recordedFoleyFallbacks=0,lastRecordedFoley=null;
  const selectedCharacterLines=new Set(),lineBuffers=new Map(),linePromises=new Map();
  let characterLineError='',characterLinesPlayed=0,uiRecordedPlayed=0,uiFallbackPlayed=0,uiGestureRevision=0,pendingUIResume=null;
  const uiNow=options.uiNow??(()=>globalThis.performance?.now?.()??Date.now());
  const active=new Set(),voiceGroups=new Map(),cooldowns=new Map(),vocalBuffers=new Map(),lastVocalVariants=new Map();
  const variations=createFightVariationSelector(finite(options.seed,94712));
  const contextFactory=options.contextFactory??(()=>{
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    return Context?new Context({latencyHint:'interactive'}):null;
  });
  const fetchImpl=options.fetch??globalThis.fetch?.bind(globalThis);
  const foleyBank=createFoleyBufferBank({getContext:()=>context,fetch:fetchImpl,urlForAsset:asset=>globalThis.SYSTEM_CLASH_FIGHT_BUNDLE?.audio?.[asset.path]??new URL(asset.path,options.baseUrl??globalThis.document?.baseURI??globalThis.location?.href??'http://localhost/').href});
  const uiBank=createUIBufferBank({getContext:()=>context,fetch:fetchImpl,urlForAsset:asset=>globalThis.SYSTEM_CLASH_FIGHT_BUNDLE?.audio?.[asset.path]??new URL(asset.path,options.baseUrl??globalThis.document?.baseURI??globalThis.location?.href??'http://localhost/').href});
  function disconnect(node){try{node.disconnect();}catch{}}
  function stopGroup(group){
    if(!group||group.stopped)return;group.stopped=true;
    try{group.gain.gain.cancelScheduledValues(context.currentTime);group.gain.gain.setTargetAtTime(.0001,context.currentTime,.012);}catch{}
    for(const source of group.sources)try{source.stop(context.currentTime+.035);}catch{}
    active.delete(group);
    if(group.voiceId&&voiceGroups.get(group.voiceId)===group)voiceGroups.delete(group.voiceId);
  }
  function stopAll(){for(const group of [...active])stopGroup(group);}
  function busVolume(){if(!context)return;master.gain.setTargetAtTime(muted||paused?0:.72,context.currentTime,.02);}
  function makeGraph(){
    master=context.createGain();master.gain.value=muted||paused?0:.72;
    uiBus=context.createGain();uiBus.gain.value=.66;uiBus.connect(master);
    fxBus=context.createGain();fxBus.gain.value=.84;fxBus.connect(master);
    voiceBus=context.createGain();voiceBus.gain.value=.64;voiceBus.connect(master);
    announcerBus=context.createGain();announcerBus.gain.value=.8;announcerBus.connect(master);
    const compressor=context.createDynamicsCompressor();
    Object.assign(compressor.threshold,{value:-15});Object.assign(compressor.knee,{value:8});
    Object.assign(compressor.ratio,{value:5});Object.assign(compressor.attack,{value:.003});Object.assign(compressor.release,{value:.14});
    const limiter=context.createWaveShaper(),curve=new Float32Array(2048);
    for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=.97*Math.tanh(x*1.25);}
    limiter.curve=curve;limiter.oversample='2x';master.connect(compressor);compressor.connect(limiter);limiter.connect(context.destination);
    noiseBuffer=context.createBuffer(1,context.sampleRate,context.sampleRate);
    const data=noiseBuffer.getChannelData(0),random=seededRandom(948712);
    for(let i=0;i<data.length;i++)data[i]=random();
  }
  async function startAudio(){
    if(pendingStart){
      // A later trusted click/key can unlock a context first requested by controller polling.
      if(context?.state==='suspended')try{context.resume()?.catch?.(()=>{});}catch{}
      return pendingStart;
    }
    pendingStart=(async()=>{
      try{
        if(!context){context=contextFactory();if(!context)return false;makeGraph();}
        if(context.state==='suspended')await context.resume();
        if(options.uiSounds===true)void uiBank.prepare();
        if(!announcerBuffer&&fetchImpl){
          try{
            const bundle=globalThis.SYSTEM_CLASH_FIGHT_BUNDLE?.audio??{};
            const url=options.announcerUrl??bundle[ARCADE_ANNOUNCER_PATH]??new URL(ARCADE_ANNOUNCER_PATH,options.baseUrl??globalThis.document?.baseURI??globalThis.location?.href??'http://localhost/').href;
            const response=await fetchImpl(url);
            if(!response.ok)throw new Error('announcer HTTP '+response.status);
            announcerBuffer=await context.decodeAudioData(await response.arrayBuffer());
            assetError='';
          }catch(error){assetError=String(error?.message??'announcer unavailable');}
        }
        await prepareCharacterLines([...selectedCharacterLines]);
        return context.state==='running';
      }catch(error){assetError=String(error?.message??'audio unavailable');return false;}
    })().finally(()=>{pendingStart=null;});
    return pendingStart;
  }
  async function prepareCharacterLines(ids=[]){
    selectedCharacterLines.clear();for(const id of ids)if(CHARACTER_LINE_ASSETS[id])selectedCharacterLines.add(id);
    if(!context||!fetchImpl)return false;
    const jobs=[...selectedCharacterLines].map(id=>{
      if(lineBuffers.has(id))return true;if(linePromises.has(id))return linePromises.get(id);
      const job=(async()=>{try{
        const spec=CHARACTER_LINE_ASSETS[id],bundle=globalThis.SYSTEM_CLASH_FIGHT_BUNDLE?.audio??{};
        const controller=typeof AbortController==='function'?new AbortController():null;
        const timer=controller?setTimeout(()=>controller.abort(),8000):null;
        let bytes;try{const response=await fetchImpl(bundle[spec.path]??new URL(spec.path,options.baseUrl??globalThis.document?.baseURI??globalThis.location?.href??'http://localhost/').href,controller?{signal:controller.signal}:undefined);if(!response.ok)throw new Error('character line HTTP '+response.status);bytes=await response.arrayBuffer();}finally{if(timer)clearTimeout(timer);}
        if(bytes.byteLength!==spec.bytes||bytes.byteLength>250000)throw new Error('character line byte budget');
        const buffer=await context.decodeAudioData(bytes);if(buffer.duration<=0||buffer.duration>8||(buffer.numberOfChannels??1)!==1)throw new Error('character line format');
        lineBuffers.set(id,buffer);characterLineError='';return true;
      }catch(error){characterLineError=String(error?.message??'character line unavailable');return false;}
      finally{linePromises.delete(id);}})();linePromises.set(id,job);return job;
    });return (await Promise.all(jobs)).every(Boolean);
  }
  function group(bus,priority,voiceId=null){
    const sfx=[...active].filter(g=>!g.voiceId);
    if(!voiceId&&sfx.length>=10){
      const victim=sfx.find(g=>g.priority<=priority);
      if(victim)stopGroup(victim);else return null;
    }
    if(voiceId){
      const voices=[...active].filter(g=>g.voiceId&&g.voiceId!==voiceId);
      if(voices.length>=3){const victim=voices.find(g=>g.priority<=priority);if(victim)stopGroup(victim);else return null;}
    }
    const node=context.createGain();node.connect(bus);
    const entry={gain:node,nodes:[node],sources:[],remaining:0,priority,voiceId,stopped:false};
    active.add(entry);
    if(voiceId){stopGroup(voiceGroups.get(voiceId));voiceGroups.set(voiceId,entry);}
    return entry;
  }
  function own(group,source,nodes,endAt){
    group.sources.push(source);group.nodes.push(...nodes);group.remaining++;
    source.onended=()=>{
      disconnect(source);for(const node of nodes)disconnect(node);
      group.remaining--;
      if(!group.remaining){disconnect(group.gain);active.delete(group);if(group.voiceId&&voiceGroups.get(group.voiceId)===group)voiceGroups.delete(group.voiceId);}
    };
    source.stop(endAt+.025);
  }
  function envelope(node,at,duration,gain){
    node.gain.setValueAtTime(.0001,at);node.gain.exponentialRampToValueAtTime(Math.max(.0001,gain),at+.003);
    node.gain.exponentialRampToValueAtTime(.0001,at+duration);
  }
  function playLayer(item,entry,at){
    const gain=context.createGain();envelope(gain,at,item.duration,item.gain);gain.connect(entry.gain);
    if(item.kind==='tone'){
      const source=context.createOscillator();source.type=item.waveform;
      source.frequency.setValueAtTime(item.frequency,at);source.frequency.exponentialRampToValueAtTime(Math.max(10,item.end),at+item.duration);
      source.connect(gain);source.start(at);own(entry,source,[gain],at+item.duration);
    }else{
      const source=context.createBufferSource(),filter=context.createBiquadFilter();
      source.buffer=noiseBuffer;filter.type=item.filter;filter.frequency.setValueAtTime(item.frequency,at);filter.Q.value=item.q;
      source.connect(filter);filter.connect(gain);source.start(at,Math.min(.8,item.delay*1.7));own(entry,source,[gain,filter],at+item.duration);
    }
  }
  function playRecorded(item,buffer,entry,at){
    const source=context.createBufferSource(),gain=context.createGain(),duration=buffer.duration/item.rate;
    source.buffer=buffer;if(source.playbackRate)source.playbackRate.value=item.rate;
    gain.gain.setValueAtTime(item.gain,at);
    gain.gain.setValueAtTime(item.gain,at+Math.max(.002,duration-.012));
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(gain);gain.connect(entry.gain);source.start(at);
    own(entry,source,[gain],at+duration);recordedFoleyPlayed++;
  }
  function vocalBuffer(cue,variant){
    const key=cue.id+':'+cue.mode+':'+variant+':'+context.sampleRate;
    const cached=vocalBuffers.get(key);
    if(cached){vocalBuffers.delete(key);vocalBuffers.set(key,cached);return cached.buffer;}
    const data=renderFightVocal(cue.id,cue.mode,context.sampleRate,variant),bytes=data.byteLength;
    const buffer=context.createBuffer(1,data.length,context.sampleRate);buffer.getChannelData(0).set(data);
    while(vocalBuffers.size&&(vocalBuffers.size>=MAX_VOCAL_CACHE_ENTRIES||vocalCacheBytes+bytes>MAX_VOCAL_CACHE_BYTES)){
      const oldest=vocalBuffers.keys().next().value;vocalCacheBytes-=vocalBuffers.get(oldest).bytes;vocalBuffers.delete(oldest);
    }
    if(bytes<=MAX_VOCAL_CACHE_BYTES){vocalBuffers.set(key,{buffer,bytes});vocalCacheBytes+=bytes;}
    return buffer;
  }
  function playVocal(cue,priority,at){
    const last=cooldowns.get('voice:'+cue.id)??-Infinity;
    const wait=cue.mode==='scream'?.7:cue.mode==='big-hurt'?.27:cue.mode==='attack'?.2:.15;
    const vocalPriority=cue.mode==='scream'?4:cue.mode==='big-hurt'?3:cue.mode==='hurt'?2:1;
    const previous=voiceGroups.get(cue.id);
    if(at-last<wait&&(!previous||previous.priority>=vocalPriority))return;
    // New pain wins over an effort grunt; attack never masks an active scream.
    if(previous&&previous.priority>vocalPriority)return;
    const entry=group(voiceBus,vocalPriority,cue.id);if(!entry)return;
    const key=cue.id+':'+cue.mode,variant=variations.next('voice:'+key,FIGHT_VOCAL_VARIANTS[cue.mode]);
    const buffer=vocalBuffer(cue,variant);cooldowns.set('voice:'+cue.id,at);lastVocalVariants.set(key,variant);
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffer;gain.gain.value=cue.mode==='attack'?.31:cue.mode==='hurt'?.43:cue.mode==='big-hurt'?.5:.57;
    source.connect(gain);gain.connect(entry.gain);source.start(at);
    own(entry,source,[gain],at+buffer.duration);playedVoices++;
  }
  async function emitUISound(type){
    if(!planFightSound({type}).uiSound||muted||paused)return false;
    const revision=++uiGestureRevision,requestedAt=uiNow();
    try{
      if(!context){context=contextFactory();if(!context)return false;makeGraph();}
      if(context.state==='suspended'){
        if(!pendingUIResume)pendingUIResume=Promise.resolve(context.resume()).finally(()=>{pendingUIResume=null;});
        await pendingUIResume;
      }
      // Resume belongs to the current gesture; downloads only cache future cues.
      if(revision!==uiGestureRevision||uiNow()-requestedAt>250||context.state!=='running'||muted||paused)return false;
      void startAudio();
      return emit({type});
    }catch{return false;}
  }
  function emit(event={}){
    if(!context||context.state!=='running'||muted||paused){droppedEvents++;return false;}
    let plan=planFightSound(event);const at=context.currentTime+.004;
    if(plan.uiSound){
      const last=cooldowns.get(plan.type)??-Infinity;if(at-last<(plan.type==='ui-move'?.028:.065)){droppedEvents++;return false;}cooldowns.set(plan.type,at);
      const entry=group(uiBus,1);if(!entry)return false;
      const buffer=uiBank.peek(plan.uiAsset);
      if(buffer){const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=.62;source.connect(gain);gain.connect(entry.gain);source.start(at);own(entry,source,[gain],at+buffer.duration);uiRecordedPlayed++;}
      else{void uiBank.request(plan.uiAsset);for(const item of plan.layers)playLayer(item,entry,at+item.delay);uiFallbackPlayed++;}
      playedEvents++;return true;
    }
    if(plan.characterLine){
      const buffer=lineBuffers.get(plan.characterLine);if(!buffer){void prepareCharacterLines([plan.characterLine]);return false;}
      const key='line:'+plan.characterLine;if(cooldowns.has(key))return false;
      const entry=group(voiceBus,4,plan.characterLine);if(!entry)return false;
      const source=context.createBufferSource();source.buffer=buffer;source.connect(entry.gain);source.start(at);own(entry,source,[],at+buffer.duration);
      cooldowns.set(key,at);characterLinesPlayed++;playedEvents++;return true;
    }
    if(plan.announcer){
      if(announcerPlayed)return false;announcerPlayed=true;
      if(!announcerBuffer){assetError=assetError||'announcer not loaded';return false;}
      // Keep the spoken decision cue intelligible above ongoing contact tails.
      for(const entry of [...active])if(!entry.voiceId)stopGroup(entry);
      const entry=group(announcerBus,4,'announcer');if(!entry)return false;
      const source=context.createBufferSource();
      source.buffer=announcerBuffer;source.connect(entry.gain);source.start(at);own(entry,source,[],at+announcerBuffer.duration);
      playedEvents++;return true;
    }
    if(!plan.layers.length&&!plan.voices.length)return false;
    const throttleKey=plan.type+':'+(plan.attackerId??'')+':'+(plan.victimId??'')+':'+(event.cue??'');
    const last=cooldowns.get(throttleKey)??-Infinity;
    const spacing=['hit','deletion-impact','weapon-embed','ko'].includes(plan.type)?.032:.075;
    if(at-last<spacing){droppedEvents++;return false;}cooldowns.set(throttleKey,at);
    if(plan.layers.length){
      const entry=group(fxBus,plan.priority);
      if(entry){
        const actorId=plan.foleyFighterId??(['land','ko','block'].includes(plan.type)?plan.victimId??plan.attackerId:plan.attackerId??plan.victimId);
        const key='foley:'+(actorId??'stage')+':'+plan.type+':'+plan.contact;
        const variant=variations.next(key,CHARACTER_FOLEY_VARIANTS);plan=planFightSound(event,variant);
        lastFoleyVariation={key,variant,family:plan.foleyFamily};
        const recorded=planRecordedFoley(event,plan,(family,count)=>variations.next('recorded:'+family,count));
        // A cold/missing bank plays the established contact immediately. Loads
        // fill storage for a future event; no hit callback is retained or replayed.
        const buffers=recorded.layers.map(item=>foleyBank.peek(item.id));
        for(const item of recorded.layers)if(!foleyBank.peek(item.id))void foleyBank.request(item.id);
        const ready=recorded.layers.length>0&&buffers.every(Boolean);
        for(const item of plan.layers)playLayer(ready?{...item,gain:item.gain*.24}:item,entry,at+item.delay);
        if(ready){
          lastRecordedFoley={actor:recorded.actor,material:recorded.material,heavy:recorded.heavy,ids:recorded.layers.map(item=>item.id)};
          for(let i=0;i<recorded.layers.length;i++)playRecorded(recorded.layers[i],buffers[i],entry,at+recorded.layers[i].delay);
        }else if(recorded.layers.length)recordedFoleyFallbacks++;

      }
    }
    for(const cue of plan.voices)playVocal(cue,plan.priority,at+cue.delay);
    playedEvents++;return true;
  }
  return {emit,emitUISound,startAudio,prepareCharacterLines,
    setMuted(value){muted=!!value;if(muted){uiGestureRevision++;foleyBank.invalidate();stopAll();}busVolume();},
    setPaused(value){const next=!!value;if(next===paused)return;paused=next;if(paused){uiGestureRevision++;foleyBank.invalidate();stopAll();}busVolume();},
    setReducedMotion(value){reducedMotion=!!value;},
    clear(){uiGestureRevision++;foleyBank.invalidate();stopAll();cooldowns.clear();variations.clear();lastVocalVariants.clear();lastFoleyVariation=null;lastRecordedFoley=null;announcerPlayed=false;},
    getStats(){const foley=foleyBank.getStats(),ui=uiBank.getStats();return {uiCached:ui.cached,uiCacheBytes:ui.cacheBytes,uiPending:ui.pending,uiLoading:ui.loading,uiAssetFailures:ui.failed,uiRecordedPlayed,uiFallbackPlayed,characterLinesLoaded:lineBuffers.size,characterLinesPlayed,characterLineError,recordedFoleyPlayed,recordedFoleyFallbacks,cachedFoley:foley.cached,foleyCacheBytes:foley.cacheBytes,foleyPending:foley.pending,foleyLoading:foley.loading,foleyQueued:foley.queued,foleyAssetFailures:foley.failed,foleyError:foley.lastError,lastRecordedFoley:lastRecordedFoley?{...lastRecordedFoley,ids:[...lastRecordedFoley.ids]}:null,muted,paused,reducedMotion,audioStarted:!!context,audioRunning:context?.state==='running',announcerLoaded:!!announcerBuffer,announcerPlayed,assetError,activeGroups:active.size,activeVoices:voiceGroups.size,cachedVoices:vocalBuffers.size,vocalCacheBytes,vocalVariantCount:Object.keys(FIGHT_VOCAL_BANKS).length*Object.values(FIGHT_VOCAL_VARIANTS).reduce((a,b)=>a+b,0),variationFamilies:variations.size,lastVocalVariants:Object.fromEntries(lastVocalVariants),lastFoleyVariation:lastFoleyVariation?{...lastFoleyVariation}:null,playedEvents,playedVoices,droppedEvents};},
  };
}
