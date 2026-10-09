import test from 'node:test';
import assert from 'node:assert/strict';
import {FIGHTER_STYLES} from '../public/games/system-clash/play/fight-engine.mjs';
import {CHARACTER_FOLEY_VARIANTS,CHARACTER_FOLEY_PALETTES,planCharacterFoley} from '../public/games/system-clash/play/fight-audio-palettes.mjs';

const ids=Object.keys(CHARACTER_FOLEY_PALETTES);
const events=[
  {type:'jump'}, {type:'attack'}, {type:'special'}, {type:'miss'},
  {type:'hit',strength:1}, {type:'hit',strength:2.4,damage:25},
  {type:'deletion-impact',cue:'drive-blade-cut',strength:3.4},
  {type:'weapon-embed',cue:'arrow-hit'}, {type:'block'}, {type:'throw'},
  {type:'land'}, {type:'land',jump:true}, {type:'ko'},
  {type:'deletion',cue:'start'}, {type:'deletion',cue:'complete'},
  {type:'deletion-cue',cue:'bind'}, {type:'deletion-cue',cue:'charge'},
  {type:'weapon-pickup'}, {type:'weapon-use',weaponType:'pulse-driver'},
  {type:'weapon-use',weaponType:'blade'}, {type:'weapon-throw'}, {type:'weapon-empty'},
];
const signature=layers=>JSON.stringify(layers.map(({kind,waveform,filter,q,delay,duration})=>({kind,waveform,filter,q,delay:Number(delay.toFixed(5)),duration:Number(duration.toFixed(5))})));
const attackerLayers=plan=>plan.layers.filter(item=>item.role==='attacker-signature');
const bounded=(plan,label)=>{
  assert.ok(plan.layers.length>0&&plan.layers.length<=8,label+' bounded layer count');
  const budget=plan.replace?.55:.28;
  assert.ok(plan.layers.reduce((sum,item)=>sum+item.gain,0)<=budget+1e-10,label+' aggregate gain');
  for(const item of plan.layers){
    assert.ok(Number.isFinite(item.gain)&&item.gain>0&&item.gain<=.2,label+' finite gain');
    assert.ok(Number.isFinite(item.duration)&&item.duration>=.01&&item.duration<=.36,label+' short duration');
    assert.ok(Number.isFinite(item.delay)&&item.delay>=0&&item.delay<=.22,label+' bounded onset');
    assert.ok(item.duration+item.delay<=.58,label+' bounded complete tail');
    assert.ok(Number.isFinite(item.frequency)&&item.frequency>=25&&item.frequency<=7900,label+' bounded frequency');
    assert.ok(Number.isFinite(item.end)&&item.end>=20&&item.end<=7900,label+' bounded sweep end');
    if(item.kind==='tone')assert.ok(['sine','square','sawtooth','triangle'].includes(item.waveform));
    else {assert.equal(item.kind,'noise');assert.ok(['highpass','lowpass','bandpass'].includes(item.filter));assert.ok(item.q>0&&item.q<=5);}
  }
};

test('all nineteen enabled mains have separate immutable sound identities and four authored gestures',()=>{
  assert.deepEqual(ids.sort(),Object.keys(FIGHTER_STYLES).sort());
  assert.equal(ids.length,19);assert.equal(CHARACTER_FOLEY_VARIANTS,4);
  assert.equal(new Set(ids.map(id=>CHARACTER_FOLEY_PALETTES[id].texture)).size,ids.length);
  const structures=[];
  for(const id of ids){
    const palette=CHARACTER_FOLEY_PALETTES[id];
    assert.equal(palette.gestures.length,4);
    assert.ok(Object.isFrozen(palette)&&Object.isFrozen(palette.gestures));
    assert.ok(palette.gestures.every(gesture=>Object.isFrozen(gesture)&&gesture.every(Object.isFrozen)));
    assert.equal(new Set(palette.gestures.map(signature)).size,4,id+' gestures change rhythm and sources, not only pitch/gain');
    structures.push(palette.gestures.map(signature).join('|'));
  }
  assert.equal(new Set(structures).size,ids.length,'each fighter has its own source/rhythm language independent of frequency/gain');
});

test('every fighter action family has four structurally different deterministic variants within bounds',()=>{
  let reviewed=0;
  for(const id of ids)for(const event of events){
    const structures=[];
    for(let variant=0;variant<CHARACTER_FOLEY_VARIANTS;variant++){
      const input={...event,attackerId:id,victimId:id},before=JSON.stringify(input);
      const plan=planCharacterFoley(input,{variant});
      assert.deepEqual(plan,planCharacterFoley(input,{variant}),'same event/variant is deterministic');
      assert.equal(JSON.stringify(input),before,'caller event is untouched');
      bounded(plan,id+':'+event.type+':'+variant);
      structures.push(signature(plan.layers));reviewed++;
    }
    assert.equal(new Set(structures).size,4,id+':'+event.type+' retains four different sequences even without frequency/gain');
  }
  assert.equal(reviewed,ids.length*events.length*4);
});

test('attacker signature remains independent of victim material; Cache contacts retain metal',()=>{
  for(const variant of [0,1,2,3]){
    const organic=planCharacterFoley({type:'hit',attackerId:'dj-floppydisc',victimId:'6-bit'},{variant});
    const cache=planCharacterFoley({type:'hit',attackerId:'dj-floppydisc',victimId:'cache-back'},{variant,material:'organic'});
    assert.deepEqual(attackerLayers(organic),attackerLayers(cache),'the opponent cannot replace the attacker signature');
    assert.equal(organic.material,'organic');assert.equal(cache.material,'metal');
    assert.equal(cache.replace,false,'metal hit bed remains owned by fight-audio');
    const throwBody=planCharacterFoley({type:'throw',attackerId:'dj-floppydisc',victimId:'6-bit'},{variant});
    const throwCache=planCharacterFoley({type:'throw',attackerId:'dj-floppydisc',victimId:'cache-back'},{variant});
    assert.deepEqual(attackerLayers(throwBody),attackerLayers(throwCache));
    const metal=throwCache.layers.filter(item=>item.role==='victim-material');
    assert.equal(metal.length,2);assert.ok(metal.every(item=>item.fighterId==='cache-back'&&item.texture==='metal'));
    assert.notDeepEqual(metal,throwBody.layers.filter(item=>item.role==='victim-material'));
  }
});

test('movement, shield and action ownership follow the actual fighter rather than the opponent',()=>{
  const jump=planCharacterFoley({type:'jump',attackerId:'wittyf0x',victimId:'cache-back'});
  assert.equal(jump.fighterId,'wittyf0x');assert.ok(jump.layers.every(item=>item.fighterId==='wittyf0x'));
  const land=planCharacterFoley({type:'land',attackerId:'wittyf0x',victimId:'cache-back'});
  assert.equal(land.fighterId,'cache-back');assert.equal(land.material,'metal');assert.equal(land.replace,false);
  assert.ok(land.layers.every(item=>item.role==='victim-signature'&&item.fighterId==='cache-back'));
  const block=planCharacterFoley({type:'block',attackerId:'wittyf0x',victimId:'cache-back'});
  assert.equal(block.fighterId,'cache-back');assert.equal(block.material,'metal');
  assert.ok(block.layers.every(item=>item.fighterId==='cache-back'));
  const effort=planCharacterFoley({type:'attack',fighterId:'mr-nice-guy',targetId:'stolz'});
  assert.equal(effort.fighterId,'mr-nice-guy');assert.ok(effort.layers.every(item=>item.fighterId==='mr-nice-guy'));
  const victimOnly=planCharacterFoley({type:'land',victimId:'ash-flowers'});
  assert.equal(victimOnly.fighterId,'ash-flowers');
});

test('damage and all established deletion mechanisms retain their existing beds',()=>{
  for(const type of ['hit','weapon-embed','deletion-impact','deletion','deletion-cue']){
    for(const cue of ['drive-blade-cut','chrome-seal','nail-strike','heart-burst','encore-floor-slam','bind','complete']){
      const plan=planCharacterFoley({type,cue,attackerId:'ms-mayhem',victimId:'cache-back',damageKind:'cut'},{contact:'cut'});
      assert.equal(plan.replace,false,type+':'+cue+' must append instead of replacing a mechanism');
      assert.ok(plan.layers.every(item=>item.role==='attacker-signature'));
    }
  }
});

test('pulse-driver source texture is preserved beneath character weapon gestures',()=>{
  for(const id of ids)for(let variant=0;variant<4;variant++){
    const plan=planCharacterFoley({type:'weapon-use',attackerId:id,weaponType:'pulse-driver'},{variant});
    assert.equal(plan.replace,true);
    assert.ok(plan.layers.some(item=>item.kind==='tone'&&item.frequency===1240&&item.end===75&&item.waveform==='sawtooth'));
    assert.ok(plan.layers.some(item=>item.kind==='noise'&&item.frequency===5200&&item.filter==='highpass'));
  }
});

test('unsupported events and IDs keep generic handling; selector and intensity inputs are sanitized',()=>{
  for(const event of [{type:'round-start',attackerId:'6-bit'},{type:'finish-prompt',attackerId:'6-bit'},{type:'attack',attackerId:'unknown'},{}]){
    const plan=planCharacterFoley(event);assert.deepEqual(plan.layers,[]);assert.equal(plan.replace,false);
  }
  const event={type:'attack',attackerId:'6-bit'};
  assert.deepEqual(planCharacterFoley(event,{variant:4}),planCharacterFoley(event,{variant:0}));
  assert.deepEqual(planCharacterFoley(event,{variant:-1}),planCharacterFoley(event,{variant:3}));
  assert.deepEqual(planCharacterFoley(event,{variant:Infinity}),planCharacterFoley(event,{variant:0}));
  bounded(planCharacterFoley(event,{variant:NaN,strength:NaN}),'non-finite');
  bounded(planCharacterFoley(event,{strength:999999}),'large strength');
  bounded(planCharacterFoley(event,{strength:-999999}),'negative strength');
});
