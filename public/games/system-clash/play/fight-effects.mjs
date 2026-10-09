import {drawRemainsParticle,remainsParticleGeometry} from './fight-remains.mjs';
import {createFightAudio} from './fight-audio.mjs';
const FLOOR = 620;
const PARTICLE_LIMIT = 420;
const DECAL_LIMIT = 64;
const SMEAR_LIMIT = 14;
const CHUNK_LIMIT = 96;
const SHAKE_LIMIT = 24;
const CLOTHING = {
  '6-bit':['#242726','#494843'], '9-bit':['#161b1b','#353933'],
  'cache-back':['#806115','#292d26'], cliff:['#807461','#344555'],
  'dj-floppydisc':['#938e80','#26292b'],'mac-modem':['#621c18','#292321'],
  'mr-nice-guy':['#67513c','#455045'],'ms-mayhem':['#64211c','#292121'],
  stolz:['#282e2e','#67665f'],'kaveman-brown':['#292a25','#65665f'],
  dr3wbaby:['#4e365c','#3b5163'],'ash-flowers':['#272b29','#977521'],
  wittyf0x:['#293c62','#624d38'],'lost-marbles':['#28352a','#2f6b30'],
  mutilator:['#ded9cb','#3b0909'],
  doofnoobler:['#db641c','#2696c9'],lyra:['#202d35','#22a7b9'],'papa-oak':['#485b2b','#785735'],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

// These cues describe contacts that already exist in the choreography. The
// effects follow the contact mechanism instead of giving every finisher the
// same full-screen splash.
function bloodProfile(event) {
  const cue=event.cue??'';
  if(event.type==='weapon-embed'||cue==='arrow-hit'||cue==='nail-strike')return 'puncture';
  if(event.damageKind==='cut'||cue.startsWith('disc-')||cue==='drive-blade-cut'||cue==='cable-snap')return 'cut';
  if(/crush|stamp|chrome-s|speaker-burial|pressure/.test(cue))return 'compression';
  if(/slam|truss-hit|sign-strike|stomp/.test(cue))return 'slam';
  return event.type==='deletion-impact'?'rupture':'blunt';
}

/** Whole-body fighters stay untouched: these are stage-space particles and sound. */
export function createFightEffects(options = {}) {
  let seed = (options.seed ?? 123) >>> 0;
  const random = () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const range = (min, max) => min + random() * (max - min);
  // Network cues choose debris independently of render cadence, camera shake and falling droplets.
  function debrisRandom(event,salt){
    let state=(options.seed??123)>>>0;
    const key=JSON.stringify([salt,event.type,event.cue,event.at,event.volley,event.site,event.attackerId,event.victimId,event.target]);
    for(let i=0;i<key.length;i++)state=Math.imul(state^key.charCodeAt(i),16777619)>>>0;
    return ()=>{state+=0x6d2b79f5;let value=state;value=Math.imul(value^value>>>15,value|1);value^=value+Math.imul(value^value>>>7,value|61);return ((value^value>>>14)>>>0)/4294967296;};
  }

  const particles = [];
  const decals = [];
  const smears = [];
  const chunks = [];
  const camera = { x: 0, y: 0 };
  let reducedMotion = Boolean(options.reducedMotion);
  let muted = Boolean(options.muted);
  let paused = Boolean(options.paused);
  let shake = 0;
  let flash = 0;
  const audio = options.audio ?? createFightAudio({...options.audioOptions,muted,reducedMotion});

  function appendBounded(array, item, limit) {
    array.push(item);
    if (array.length > limit) array.splice(0, array.length - limit);
  }

  function addDecal(x, width, options = {}) {
    const kind=options.kind??'pool',position=clamp(x,10,1270);
    // Nearby falling droplets feed one stain rather than displacing all older
    // wounds from the bounded floor list. Floor blood survives until reset.
    const existing=kind==='pool'?decals.find(decal=>decal.kind===kind&&
      Math.abs(decal.x-position)<Math.max(16,decal.width*.7)):null;
    if(existing) {
      const oldArea=existing.width*existing.height,addedArea=Math.max(4,width*2);
      existing.x=(existing.x*oldArea+position*addedArea)/(oldArea+addedArea);
      existing.width=clamp(Math.sqrt(existing.width**2+width**2*.36),3,120);
      existing.height=clamp(existing.height+width*.012,2.5,14);
      existing.wetness=clamp(existing.wetness+.025,.45,1);
      // New droplets feed an edge tongue at the landing side; a growing pool
      // does not simply scale up the same oval silhouette.
      const tongue=existing.tongues[Math.floor(random()*existing.tongues.length)];
      tongue.length=clamp(tongue.length+.035,.12,.66);
      return;
    }
    appendBounded(decals, {
      kind,x:position,y:FLOOR+range(0,9),width:clamp(width,3,120),
      height:kind==='smear'?range(5,10):range(2.5,6),
      tilt:kind==='smear'?range(-.045,.045):0,
      direction:options.direction===-1?-1:1,wetness:1,
      shade:random()>.65?'#891713':'#430909',
      outline:Array.from({length:24},(_,index)=>({
        angle:index*Math.PI*2/24,radius:range(.68,1.08),
      })),
      tongues:Array.from({length:kind==='smear'?4:3},()=>({
        side:random()>.5?1:-1,x:range(-.8,.8),length:range(.12,.43),width:range(.04,.13),
      })),
      lobes:Array.from({length:kind==='smear'?5:4},()=>({
        x:range(-.8,.8),y:range(-.55,.55),radius:range(.25,.6)})),
    }, DECAL_LIMIT);
  }

  function burst(kind, x, y, direction, count, strength = 1, profile = 'blunt') {
    for (let index = 0; index < count; index++) {
      const blood = kind === 'blood';
      const spark = kind === 'spark'||kind==='pulse-spark', glass=kind==='glass';
      const smoke=kind==='smoke',char=kind==='char';
      let speed = range(blood ? 100 : 60, spark ? 430 : 280) * strength;
      let angle = range(-1.3, 0.45),flow=direction;
      if(blood) {
        if(profile==='puncture'){angle=range(-.48,.08);speed*=range(.95,1.5);}
        else if(profile==='cut'){angle=range(-.75,.18);speed*=range(1,1.65);}
        else if(profile==='compression') {
          // A press expels low sheets to both sides rather than a radial star.
          angle=range(-.35,.12);flow=random()<.43?-direction:direction;speed*=range(.8,1.5);
        } else if(profile==='slam') {angle=range(-.95,-.04);speed*=range(.6,1.05);}
        else if(profile==='rupture') {
          angle=range(-1.45,.32);flow=random()<.2?-direction:direction;
        }
      }
      const vx=Math.cos(angle)*speed*flow+range(blood?-22:-65,blood?22:65);
      const vy=Math.sin(angle)*speed-(blood?profile==='compression'?25:65:smoke?20:10);
      const gravity=blood?720:glass?580:spark?340:char?480:-30;
      // Face-height blood must reach the floor instead of evaporating in midair.
      const landingMs=blood?1000*(-vy+Math.sqrt(vy*vy+2*gravity*Math.max(0,FLOOR-y)))/gravity:0;
      const life=Math.max(range(blood?380:160,blood?1200:smoke?1000:spark?400:700),landingMs+140);
      const size=blood?(random()<.82?range(1.1,3.2):range(3.5,7.5)):
        range(smoke?5:1,smoke?13:spark?2.5:char?3.5:9);
      const originX=x+(blood?range(-4,4):0),originY=y+(blood?range(-5,5):0);
      appendBounded(particles, {
        kind, x:originX, y:originY, px: originX, py: originY,
        vx:smoke?vx*.15:vx,vy:smoke?-range(20,55):vy,
        size,tail:blood?range(.004,profile==='puncture'?.035:.023):.013,
        profile:blood?profile:undefined,aspect:blood?range(.65,1.2):1,
        gravity,
        life, maxLife: life,
        color: blood ? (random() > .76 ? '#ac3524' : random() > .48 ? '#791b12' : '#4f100d')
          : kind==='pulse-spark'?'#e5a2e9':char?'#211c2a':smoke?'#54495f':glass?'#b8d1df':spark ? (random() > 0.5 ? '#edca7a' : '#d1e5ff') : '#697080',
        landed: false,
      }, PARTICLE_LIMIT);
    }
  }

  function addSmear(x, y, direction, strength, profile) {
    const life = profile==='puncture'?430:profile==='compression'?660:570;
    const count=profile==='puncture'?3:profile==='cut'?5:7;
    appendBounded(smears, {
      x:clamp(x,0,1280),y:clamp(y,60,FLOOR),direction,profile,life,maxLife:life,
      ribbons:Array.from({length:count},()=>{
        const angle=profile==='puncture'?range(-.4,.1):profile==='compression'?range(-.3,.2):range(-1.3,.35);
        const side=profile==='compression'&&random()<.45?-direction:direction;
        const reach=range(30,profile==='puncture'?80:130)*Math.min(strength,1.55);
        const width=profile==='puncture'?range(.8,2.2):range(1.4,6.5);
        return {x:Math.cos(angle)*reach*side,y:Math.sin(angle)*reach,
          rootX:range(-3,3),rootY:range(-4,4),bend:range(-14,14),width,
          bead:range(1.5,4.5),knot:range(.45,.8),shade:random()>.45?'#861c13':'#4d0c0a'};
      }),
    }, SMEAR_LIMIT);
  }

  function addChunks(event,x,y,direction,strength,profile) {
    if(/pressure/.test(event.cue??''))return;
    const random=debrisRandom(event,'flight'),range=(min,max)=>min+random()*(max-min);
    const victimScale=clamp(finite(event.victimHeight,320)/320,.45,1.4),puncture=profile==='puncture';
    const robot=event.victimMaterial==='metal'||event.victimMaterial!=='organic'&&event.victimId==='cache-back';
    const headOnly=event.injuryRegion==='head'||event.site==='head'||event.cue==='ban-stamp';
    const heavy=profile==='compression'||profile==='slam';
    const magic=event.cue==='blue-dissolve'||event.cue==='blue-erased';
    const smallContact=puncture||magic||['truss-hit','chrome-squeeze','disc-upper-cut','disc-body-cut'].includes(event.cue);
    const cloth=CLOTHING[event.victimId]??['#3e3630','#272b29'];
    const tissueCount=puncture?Math.max(1,Math.min(3,Math.round(strength))):magic?(event.cue==='blue-erased'?6:4):Math.round((headOnly?5:smallContact?3:profile==='cut'?6:heavy?10:7)*Math.min(strength,2));
    const clothCount=puncture?0:magic?(event.cue==='blue-erased'?3:2):headOnly?2:smallContact?1:Math.round((heavy?5:3)*Math.min(strength,1.5));
    const boneCount=robot||puncture||magic?0:headOnly?3:!smallContact&&heavy?6:!smallContact&&profile==='cut'&&strength>=1.8?2:0;
    const count=tissueCount+clothCount+boneCount;
    for(let index=0;index<count;index++) {
      const material=index>=tissueCount+clothCount?'bone':index>=tissueCount?'cloth':robot?'metal':'organic';
      const large=!headOnly&&!smallContact&&index<Math.max(2,Math.floor(tissueCount*.2));
      const width=(material==='cloth'?range(headOnly?6:12,headOnly?14:31):material==='bone'?range(5,headOnly?13:19):
        material==='metal'?(large?range(12,23):range(5,12)):large?range(24,39):range(puncture?4:headOnly?5:7,puncture?8:headOnly?13:16))*victimScale;
      const nativeSprite=material==='organic'?(random()<.5?'meat-shred':'meat-gristle'):material==='bone'?(headOnly&&event.cue!=='marble-strip'&&index===tissueCount+clothCount?'skull':'splinter'):null;
      const native=remainsParticleGeometry(options.getRemainsArt?.(),{material,nativeSprite,width,region:headOnly?'head':'body'});
      const height=native?.height??width*range(material==='bone'?.2:material==='metal'?.25:material==='cloth'?.25:profile==='cut'?.27:.42,
        material==='metal'?.55:material==='bone'?.4:material==='cloth'?.57:.8);
      const vertexCount=Math.floor(material==='metal'||material==='bone'?range(4,6):range(6,9));
      const points=native?.points??Array.from({length:vertexCount},(_,i)=>{
        const angle=i*Math.PI*2/vertexCount,radius=range(material==='cloth'?.48:.7,1.08);
        return {x:Math.cos(angle)*width*.5*radius,y:Math.sin(angle)*height*.5*radius};
      });
      const restingAngle=range(-.5,.5),c=Math.cos(restingAngle),s=Math.sin(restingAngle);
      const bottom=Math.max(...points.map(p=>p.x*s+p.y*c));
      const floorY=FLOOR+range(0,7),landingY=floorY-bottom;
      const spread=heavy?(random()<.48?-direction:direction):direction;
      const vx=range(headOnly?35:65,headOnly?135:large?170:240)*spread*Math.min(strength,1.5);
      const vy=-range(smallContact?45:headOnly?45:80,headOnly?145:large?160:255);
      const originX=clamp(x+range(headOnly?-4:-9,headOnly?4:9),12,1268),originY=Math.min(landingY,y+range(-7,7));
      const gravity=material==='cloth'?540:760,flightMs=1000*(-vy+Math.sqrt(vy*vy+2*gravity*(landingY-originY)))/gravity;
      const drag=material==='cloth'?2.6:1.45,flightSeconds=flightMs/1000;
      const landX=clamp(originX+vx*(1-Math.exp(-drag*flightSeconds))/drag,12,1268);
      const angle=range(-Math.PI,Math.PI);
      appendBounded(chunks,{
        material,nativeSprite,profile,region:headOnly?'head':'body',x:originX,y:originY,originX,originY,vx,vy,gravity,drag,
        landingY,floorY,landX,flightMs,age:0,settled:false,
        angle,rotation:angle,tumble:range(-8,8),restingAngle,
        width,height,points,large,bounce:material==='metal'?range(3,7):material==='cloth'?0:range(1,3),bounceMs:material==='metal'?220:140,
        behind:heavy&&!headOnly,body:material==='cloth'?cloth[index%cloth.length]:material==='bone'?'#82715b':
          material==='metal'?(random()>.5?'#454a49':'#2d3636'):(random()>.5?'#5b1710':'#38100b'),
        cutFace:material==='cloth'?'#4b1710':material==='bone'?'#b39e7c':material==='metal'?'#89877b':random()>.5?'#7d3826':'#672318',
        fibers:Array.from({length:material==='cloth'?4:large?3:1},()=>({x:range(-.32,.28),y:range(-.22,.22),length:range(.15,.4),angle:range(-.8,.8)})),
      },CHUNK_LIMIT);
    }
  }

  function addRupturePile(event,x,y,direction) {
    const butcher=event.aftermath==='butcher-heap';
    if(!butcher&&(event.aftermath!=='body-rupture'||event.injuryRegion==='head'||event.cue==='ban-stamp'))return;
    const random=debrisRandom(event,'pile'),range=(min,max)=>min+random()*(max-min);
    const victimScale=clamp(finite(event.victimHeight,320)/320,.45,1.4);
    const width=clamp(finite(event.aftermathWidth,320),160,450),center=clamp(finite(event.aftermathCenterX,x),45,1235);
    const robot=event.victimMaterial==='metal'||event.victimMaterial!=='organic'&&event.victimId==='cache-back';
    const cloth=CLOTHING[event.victimId]??['#3e3630','#272b29'];
    // A crushed body leaves substance at the machine's floor. Central pieces
    // stay under its real foreground; unequal side rags extend just outside.
    // All sizes and positions below are stage pixels, not screen-size decals.
    for(let index=0;index<12;index++) {
      const side=index<6?0:index<9?-1:1,material=butcher&&index===1?'bone':index%3===0?'cloth':robot?'metal':index===5?'bone':'organic';
      const large=side!==0&&index%3===0;
      const size=(material==='cloth'?range(large?47:34,large?68:53):material==='bone'?butcher&&index===1?range(29,39):range(13,19):range(side?25:31,side?43:50))*victimScale;
      const nativeSprite=material==='organic'?(random()<.5?'meat-shred':'meat-gristle'):material==='bone'?(butcher&&index===1?'skull':'splinter'):null;
      const native=remainsParticleGeometry(options.getRemainsArt?.(),{material,nativeSprite,width:size,region:butcher&&index===1?'head':'body'});
      const height=native?.height??size*range(material==='cloth'?.30:material==='bone'?.26:.49,material==='cloth'?.52:material==='bone'?.42:.74);
      const points=native?.points??Array.from({length:material==='metal'||material==='bone'?5:8},(_,i)=>{
        const angle=i*Math.PI*2/(material==='metal'||material==='bone'?5:8),radius=range(material==='cloth'?.50:.72,1.08);
        return{x:Math.cos(angle)*size*.5*radius,y:Math.sin(angle)*height*.5*radius};
      });
      const restingAngle=range(-.33,.33),c=Math.cos(restingAngle),s=Math.sin(restingAngle),floorY=FLOOR+range(1,8);
      const bottom=Math.max(...points.map(p=>p.x*s+p.y*c)),landingY=floorY-bottom;
      const offset=side?side*width*range(index<9?.49:.53,index<9?.62:.67):range(-.25,.25)*width;
      const px=clamp(center+offset+direction*range(-6,9),size*.5+2,1278-size*.5);
      const originX=clamp(center+range(-9,9),12,1268),originY=Math.min(landingY,y+range(-3,8)),vy=-range(25,75),gravity=760,drag=1.45;
      const flightMs=1000*(-vy+Math.sqrt(vy*vy+2*gravity*(landingY-originY)))/gravity;
      const vx=(px-originX)*drag/(1-Math.exp(-drag*flightMs/1000));
      appendBounded(chunks,{
        material,nativeSprite,profile:'rupture',region:butcher&&index===1?'head':'body',pile:true,x:originX,y:originY,originX,originY,
        vx,vy,gravity,drag,landingY,floorY,landX:px,flightMs,age:0,settled:false,
        angle:restingAngle,rotation:restingAngle,tumble:0,restingAngle,width:size,height,points,large,bounce:0,bounceMs:140,behind:true,
        body:material==='cloth'?cloth[index%cloth.length]:material==='metal'?'#3b4440':material==='bone'?'#857159':index%2?'#47150d':'#611d11',
        cutFace:material==='cloth'?'#4b1710':material==='metal'?'#8f8a75':material==='bone'?'#b09a73':'#86442b',
        fibers:Array.from({length:material==='cloth'?5:3},()=>({x:range(-.3,.3),y:range(-.23,.22),length:range(.17,.38),angle:range(-.75,.75)})),
      },CHUNK_LIMIT);
    }
  }

  function impact(amplitude, intensity = 0) {
    if (reducedMotion || paused) return;
    shake = Math.max(shake, clamp(amplitude, 0, SHAKE_LIMIT));
    // A low-opacity red wash decays slowly instead of flickering between white frames.
    flash = Math.max(flash, Math.min(intensity, 0.12));
  }

  function emit(event = {}) {
    const x = finite(event.x, 640);
    const y = finite(event.y, 430);
    const direction = event.direction === -1 ? -1 : 1;
    const strength = clamp(finite(event.strength, 1), 0.25, 2.5);
    // Peaceful contact and dialogue retain their audio cues, with native body art only.
    if(event.peaceful){audio.emit({...event,strength});return;}
    switch (event.type) {
      case 'hit': {
        const kind=event.damageKind??'bruise';
        if(kind==='scorch') {
          burst('pulse-spark',x,y,direction,Math.round(22*strength),strength);
          burst('char',x,y,direction,Math.round(10*strength),.55);
          burst('smoke',x,y,direction,8,.4);
        } else {
          const bloodWeight=clamp(finite(event.bloodWeight,1),.5,2);
          const count=Math.round((kind==='cut'?29:18)*strength*bloodWeight);
          burst('blood',x,y,direction,count,Math.min(2.4,strength*(kind==='cut'?1.08:.9)),bloodProfile(event));
        }
        impact(8.5 * strength, 0.055);
        break;
      }
      case 'weapon-pickup':
        burst('spark',x,y-10,direction,8,.4);
        break;
      case 'weapon-use':
        if(event.weaponType==='pulse-driver')burst('pulse-spark',x,y,direction,7,.5);
        break;
      case 'weapon-embed':
        burst('blood',x,y,direction,10,.65,'puncture');
        impact(4,0);
        break;
      case 'glass-impact':
        burst('spark',x,y,direction,8,.65);impact(3,0);
        break;
      case 'glass-break':
        burst('glass',x,y,1,22,1.5);burst('glass',x,y,-1,22,1.5);impact(6,.025);
        break;
      case 'jump':
        burst('dust',x,FLOOR-3,direction,7,.4);
        break;
      case 'eye-pop':
        burst('blood', x, y, direction, 16, 0.55);
        impact(3, 0);
        break;
      case 'block':
        burst('spark', x, y, direction, 12, strength);
        impact(2.5, 0);
        break;
      case 'throw':
        burst('dust', x, Math.min(FLOOR, y + 130), direction, 10, 0.7);
        impact(2, 0);
        break;
      case 'land':
      case 'ko':
        burst('dust', x, FLOOR - 3, direction, 18, strength);
        if (event.blood) {
          const wetness=clamp(finite(event.bloodWeight,1),.35,2);
          burst('blood',x,FLOOR-20,direction,Math.round(14*wetness),.55);
          addDecal(x,40*wetness,{kind:'smear',direction});
          addDecal(x+direction*20,20*wetness);
        }
        impact(4.5 * strength, 0);
        break;
      case 'deletion':
        burst('spark', x, y, direction, 20, 0.5);
        break;
      case 'deletion-cue':
        if(event.cue==='blue-dissolve'||event.cue==='blue-erased') {
          // Blue magic sheds a handful of the actual victim's clothing and
          // material from its airborne contact, without a machinery pile.
          addChunks(event,x,y,direction,event.cue==='blue-erased'?.9:.6,'dissolve');
        }
        break;
      case 'deletion-impact': {
        if(event.damageKind==='scorch'||event.cue==='heart-burst'){
          burst('pulse-spark',x,y,direction,Math.round(28*strength),strength);
          burst('char',x,y,direction,Math.round(10*strength),.65);
          burst('smoke',x,y,direction,10,.5);impact(16+4*strength,0);break;
        }
        const profile=bloodProfile(event),visualStrength=event.cue==='marble-strip'?strength*clamp(finite(event.victimHeight,320)/320,.45,1)**2:strength;
        if(event.cue==='cable-snap'||event.cue==='oak-rip') {
          burst('blood',x,y,-1,Math.round(46*visualStrength),visualStrength,profile);
          burst('blood',x,y,1,Math.round(46*visualStrength),visualStrength,profile);
        } else burst('blood', x, y, direction, Math.round(92 * visualStrength), visualStrength,profile);
        if(event.cue==='nail-strike')burst('spark',x,y,direction,24,1.2);
        if(event.cue==='disc-cut'||event.cue==='drive-blade-cut')burst('spark',x,y,-direction,36,1.1);
        if(event.cue==='compactor-crush'||event.cue==='chute-stamp')burst('dust',x,FLOOR-3,direction,22,1.6);
        // Airborne wounds build their floor puddle from falling droplets. A
        // floor impact can wet the ground at once because the contact is there.
        if(y>=FLOOR-65)addDecal(x,70*visualStrength,{kind:profile==='slam'?'smear':'pool',direction});
        addSmear(x,y,direction,visualStrength,profile);
        addChunks(event,x,y,direction,visualStrength,profile);
        addRupturePile(event,x,y,direction);
        impact(16 + 4 * strength, 0.11);
        break;
      }
    }
    audio.emit({...event,strength});
  }

  function update(dtMs) {
    const milliseconds = Math.max(0, finite(dtMs, 0));
    if (!milliseconds) return;
    const seconds = Math.min(milliseconds, 100) / 1000;
    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      particle.life -= milliseconds;
      if (particle.life <= 0) { particles.splice(index, 1); continue; }
      particle.px = particle.x;
      particle.py = particle.y;
      particle.vy += particle.gravity * seconds;
      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
      particle.vx *= Math.exp(-seconds * (particle.kind === 'dust' ? 3 : 0.55));
      if (particle.kind === 'blood' && particle.y >= FLOOR && !particle.landed) {
        addDecal(particle.x, particle.size * range(2, 4));
        particle.landed = true;
        particles.splice(index, 1);
      } else if (particle.x < -150 || particle.x > 1430 || particle.y > 760) {
        particles.splice(index, 1);
      }
    }
    for (const items of [smears]) {
      for (let index = items.length - 1; index >= 0; index--) {
        items[index].life -= milliseconds;
        if (items[index].life <= 0) items.splice(index, 1);
      }
    }
    for(const chunk of chunks) {
      if(chunk.settled)continue;
      chunk.age+=milliseconds;
      const seconds=Math.min(chunk.age,chunk.flightMs)/1000,p=clamp(chunk.age/chunk.flightMs,0,1);
      chunk.x=clamp(chunk.originX+chunk.vx*(1-Math.exp(-chunk.drag*seconds))/chunk.drag,12,1268);
      chunk.y=chunk.originY+chunk.vy*seconds+chunk.gravity*seconds*seconds/2;
      chunk.rotation=(chunk.angle+chunk.tumble*seconds)*(1-p*p*p)+chunk.restingAngle*p*p*p;
      if(chunk.age>=chunk.flightMs) {
        const bounce=clamp((chunk.age-chunk.flightMs)/chunk.bounceMs,0,1);
        chunk.y=chunk.landingY-chunk.bounce*Math.sin(bounce*Math.PI);
        chunk.x=clamp(chunk.landX+chunk.vx*Math.exp(-chunk.drag*seconds)*.045*(.5-.5*Math.cos(bounce*Math.PI)),12,1268);
        if(bounce===1)chunk.settled=true;
      }
    }
    shake *= Math.exp(-milliseconds / 115);
    flash *= Math.exp(-milliseconds / 170);
    if (shake < 0.05) shake = 0;
    if (flash < 0.001) flash = 0;
    camera.x = reducedMotion || paused ? 0 : range(-shake, shake);
    camera.y = reducedMotion || paused ? 0 : range(-shake * 0.45, shake * 0.45);
  }

  function drawBehind(ctx) {
    ctx.save();
    for (const decal of decals) {
      ctx.save();ctx.translate(decal.x,decal.y);ctx.rotate(decal.tilt);
      const phase=decal.lobes[0].x*9+decal.lobes[0].radius*13;
      const contour=(width,height,offsetX=0,offsetY=0,variant=0)=>{
        ctx.beginPath();
        for(let point=0;point<decal.outline.length;point++) {
          const vertex=decal.outline[point],angle=vertex.angle;
          const roughness=vertex.radius+.04*Math.sin(point*2.17+phase+variant);
          // The back edge and leading wet lip have different widths, while
          // individual landing-side tongues interrupt the pool footprint.
          const asymmetry=1+.13*Math.cos(angle+phase)+.08*Math.sin(angle*3+phase);
          const x=offsetX+Math.cos(angle)*width*roughness*asymmetry;
          const y=offsetY+Math.sin(angle)*height*roughness;
          if(point===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.closePath();
      };
      // A shallow irregular footprint, dried dark edge, and mottled interior
      // read as liquid on the floor instead of overlapping round balloons.
      ctx.globalAlpha=.95;ctx.fillStyle='#200605';
      contour(decal.width,decal.height);ctx.fill();
      ctx.globalAlpha=.86;ctx.fillStyle=decal.shade==='#891713'?'#65130d':'#3d0907';
      contour(decal.width*.97,decal.height*.85);ctx.fill();
      ctx.globalAlpha=.78;ctx.fillStyle='#59110c';
      for(const tongue of decal.tongues) {
        const x=tongue.x*decal.width,edge=tongue.side*decal.height*.7;
        const length=tongue.length*decal.width;
        ctx.beginPath();ctx.moveTo(x-decal.width*tongue.width,edge);
        ctx.bezierCurveTo(x+length*.12,edge+tongue.side*decal.height*.6,
          x+length*.65,edge+tongue.side*decal.height*.5,x+length,edge+tongue.side*decal.height*.25);
        ctx.bezierCurveTo(x+length*.65,edge-tongue.side*decal.height*.15,
          x+length*.2,edge-tongue.side*decal.height*.2,x+decal.width*tongue.width,edge);
        ctx.closePath();ctx.fill();
      }
      ctx.globalAlpha=.3;ctx.fillStyle='#2b0705';
      for(const lobe of decal.lobes.slice(0,3)) {
        contour(decal.width*lobe.radius*.65,decal.height*.5,
          lobe.x*decal.width*.75,lobe.y*decal.height*.65,lobe.radius*19);ctx.fill();
      }
      ctx.globalAlpha=.25*decal.wetness;ctx.strokeStyle='#cb8b6c';ctx.lineWidth=.9;
      for(const lobe of decal.lobes.slice(0,3)) {
        const x=lobe.x*decal.width*.7,y=lobe.y*decal.height*.55;
        const length=clamp(decal.width*.04,1,4.5);
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+length,y-.4);ctx.stroke();
      }
      ctx.restore();
    }
    drawChunks(ctx,false);
    ctx.restore();
  }

  function drawChunks(ctx,front) {
    for(const chunk of chunks) {
      if(front!==(!chunk.behind&&!chunk.settled))continue;
      ctx.save();
      if(chunk.settled) {
        // A short uneven contact shadow puts the gristle on the stage. Keeping
        // settled debris in the back layer lets real heavy hardware cover it.
        ctx.globalAlpha=.34;ctx.fillStyle='#170606';ctx.beginPath();
        ctx.moveTo(chunk.x-chunk.width*.55,chunk.floorY+.3);
        ctx.lineTo(chunk.x-chunk.width*.2,chunk.floorY-1.5);
        ctx.lineTo(chunk.x+chunk.width*.5,chunk.floorY-.5);
        ctx.lineTo(chunk.x+chunk.width*.43,chunk.floorY+2);
        ctx.lineTo(chunk.x-chunk.width*.3,chunk.floorY+2.5);ctx.closePath();ctx.fill();
      }
      ctx.translate(chunk.x,chunk.y);ctx.rotate(chunk.rotation);
      ctx.globalAlpha=.96;if(drawRemainsParticle(ctx,options.getRemainsArt?.(),chunk)){ctx.restore();continue;}ctx.fillStyle=chunk.body;ctx.strokeStyle=chunk.material==='metal'?'#161d1b':chunk.material==='cloth'?'#161a19':'#200805';ctx.lineWidth=.75;
      const points=chunk.points;
      ctx.beginPath();
      if(['metal','cloth','bone'].includes(chunk.material)) {
        ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
      } else {
        const last=points.at(-1);ctx.moveTo((last.x+points[0].x)/2,(last.y+points[0].y)/2);
        for(let index=0;index<points.length;index++) {
          const p=points[index],next=points[(index+1)%points.length];
          ctx.quadraticCurveTo(p.x,p.y,(p.x+next.x)/2,(p.y+next.y)/2);
        }
      }
      ctx.closePath();ctx.fill();ctx.stroke();
      ctx.globalAlpha=.58;ctx.fillStyle=chunk.cutFace;ctx.beginPath();
      ctx.moveTo(-chunk.width*.23,-chunk.height*.22);
      ctx.lineTo(chunk.width*.3,-chunk.height*.13);
      ctx.lineTo(chunk.width*.15,chunk.height*.18);
      ctx.lineTo(-chunk.width*.3,chunk.height*.07);ctx.closePath();ctx.fill();
      // Small pale fibers and torn surface facets add readable substance at
      // sprite size; these are not detached character limbs or round decals.
      ctx.globalAlpha=chunk.material==='metal'?.65:chunk.material==='cloth'?.45:.27;ctx.strokeStyle=chunk.material==='metal'?'#b5ad92':chunk.material==='cloth'?'#9d9480':'#b98c65';ctx.lineWidth=chunk.material==='metal'?.8:.65;
      for(const fiber of chunk.fibers) {
        const x=fiber.x*chunk.width,y=fiber.y*chunk.height,length=fiber.length*chunk.width;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(fiber.angle)*length,y+Math.sin(fiber.angle)*length);ctx.stroke();
      }
      if(chunk.material==='cloth') {
        // Torn fabric has directional creases and a few hanging warp threads.
        ctx.globalAlpha=.3;ctx.strokeStyle='#130d0a';ctx.lineWidth=.65;
        for(const fiber of chunk.fibers) {
          const x=fiber.x*chunk.width,y=fiber.y*chunk.height;
          ctx.beginPath();ctx.moveTo(x-chunk.width*.15,y);ctx.lineTo(x+chunk.width*.18,y+chunk.height*.13);ctx.stroke();
        }
        ctx.globalAlpha=.44;ctx.strokeStyle='#afa287';ctx.lineWidth=.5;
        for(const p of points.slice(0,3)) {ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+chunk.width*.07,p.y+chunk.height*.16);ctx.stroke();}
      }
      if(chunk.material==='metal') {
        ctx.globalAlpha=.7;ctx.strokeStyle='#681d11';ctx.lineWidth=1.4;
        ctx.beginPath();ctx.moveTo(-chunk.width*.3,chunk.height*.16);ctx.lineTo(chunk.width*.18,chunk.height*.23);ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawFront(ctx) {
    ctx.save();
    drawChunks(ctx,true);
    for (const particle of particles) {
      const alpha = Math.min(1, particle.life / (particle.maxLife * 0.4));
      ctx.globalAlpha = alpha * (particle.kind === 'dust' ? 0.35 : particle.kind==='smoke'?.3:.95);
      ctx.strokeStyle = particle.color;
      ctx.fillStyle = particle.color;
      if (particle.kind === 'glass') {
        ctx.save();ctx.translate(particle.x,particle.y);ctx.rotate(particle.life*.008);
        const size=particle.size*2.5;ctx.globalAlpha=alpha*.7;
        ctx.beginPath();ctx.moveTo(-size,0);ctx.lineTo(size*.7,-size*.4);ctx.lineTo(size*.2,size);ctx.closePath();ctx.fill();
        ctx.strokeStyle='#e1f0f7';ctx.lineWidth=.7;ctx.stroke();ctx.restore();
      } else if (particle.kind === 'dust'||particle.kind==='smoke') {
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, particle.size * 1.5, particle.size, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if(particle.kind==='blood') {
        // Fast, fine streaks carry the direction; larger clots stay separate
        // from the spray instead of turning the entire fan into equal lines.
        const speed=Math.hypot(particle.vx,particle.vy);
        const tail=Math.min(25,speed*particle.tail),nx=particle.vx/(speed||1),ny=particle.vy/(speed||1);
        ctx.lineWidth=Math.max(.65,particle.size*.58);ctx.lineCap='round';
        ctx.globalAlpha=alpha*.82;
        ctx.beginPath();ctx.moveTo(particle.x-nx*tail,particle.y-ny*tail);
        ctx.lineTo(particle.x,particle.y);ctx.stroke();
        ctx.beginPath();ctx.ellipse(particle.x,particle.y,particle.size*.62,
          particle.size*.46*particle.aspect,Math.atan2(particle.vy,particle.vx),0,Math.PI*2);ctx.fill();
        if(particle.size>3.5) {
          ctx.strokeStyle='#2d0806';ctx.lineWidth=.55;ctx.stroke();
          // A short warm reflection breaks up the dark clot surface; it does
          // not turn the entire spray into bright magenta punctuation marks.
          ctx.globalAlpha=alpha*.3;ctx.strokeStyle='#dc9671';ctx.lineWidth=.65;
          ctx.beginPath();ctx.moveTo(particle.x-particle.size*.19,particle.y-particle.size*.16);
          ctx.lineTo(particle.x+particle.size*.12,particle.y-particle.size*.25);ctx.stroke();
        }
      } else {
        ctx.lineWidth = particle.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(particle.px, particle.py);
        ctx.lineTo(particle.x + particle.vx * 0.013, particle.y + particle.vy * 0.013);
        ctx.stroke();
      }
    }
    for (const smear of smears) {
      ctx.save();
      ctx.translate(smear.x, smear.y);
      const age=smear.maxLife-smear.life,spread=clamp((age+12)/90,.12,1);
      const sag=Math.min(FLOOR-smear.y,age*age*.00028);
      const sheetAlpha=.64*Math.max(0,1-age/smear.maxLife)**1.7;
      ctx.globalAlpha=sheetAlpha;
      for(const ribbon of smear.ribbons) {
        const x=ribbon.x*spread,y=Math.min(FLOOR-smear.y,ribbon.y*spread+sag);
        const width=ribbon.width*spread;
        // The sheet breaks away from the wound after its first impulse. Keeping
        // every tail pinned to one root produces the old starburst appearance.
        const detached=clamp((age-45)/180,0,1),rootX=ribbon.rootX+x*.72*detached;
        const rootY=ribbon.rootY+y*.72*detached;
        const midX=rootX+(x-rootX)*ribbon.knot,midY=rootY+(y-rootY)*ribbon.knot+ribbon.bend*(1-detached*.5);
        ctx.fillStyle=ribbon.shade;ctx.beginPath();ctx.moveTo(rootX,rootY-width*.18);
        ctx.bezierCurveTo(rootX+(x-rootX)*.2,rootY+(y-rootY)*.2-width,
          midX,midY-width*1.5,x,y);
        ctx.bezierCurveTo(midX,midY+width*1.05,rootX+(x-rootX)*.22,rootY+(y-rootY)*.36+width,rootX,rootY+width*.2);
        ctx.closePath();ctx.fill();
        ctx.strokeStyle='#2e0806';ctx.lineWidth=.65;ctx.globalAlpha=sheetAlpha*.64;ctx.stroke();
        if(width>2.5) {
          ctx.strokeStyle='#ce865d';ctx.lineWidth=.65;ctx.globalAlpha=sheetAlpha*.24;
          ctx.beginPath();ctx.moveTo(midX,midY-width*.65);
          ctx.bezierCurveTo(midX+(x-midX)*.18,midY-width*.4,
            midX+(x-midX)*.35,midY+(y-midY)*.25,x*.9+midX*.1,y*.9+midY*.1);ctx.stroke();
        }
        ctx.globalAlpha=sheetAlpha;
        // The detached bulb at the end is tiny and irregular, never a large
        // oval wall decal. Its offset follows the same wet flow.
        const bead=ribbon.bead*spread;
        ctx.beginPath();ctx.moveTo(x-bead,y);ctx.lineTo(x-bead*.35,y-bead*.7);
        ctx.lineTo(x+bead*.8,y-bead*.18);ctx.lineTo(x+bead*.6,y+bead*.65);
        ctx.lineTo(x-bead*.6,y+bead*.8);ctx.closePath();ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function startAudio() { return audio.startAudio(); }

  return {
    emit, update, drawBehind, drawFront, camera,
    get flash() { return flash; },
    setReducedMotion(value) {
      reducedMotion = Boolean(value);
      audio.setReducedMotion(reducedMotion);
      if (reducedMotion) { shake = 0; flash = 0; camera.x = 0; camera.y = 0; }
    },
    setMuted(value) {
      muted = Boolean(value);
      audio.setMuted(muted);
    },
    startAudio,
    prepareCharacterAudio(ids){return audio.prepareCharacterLines?.(ids)??false;},
    setPaused(value) {
      paused = Boolean(value); audio.setPaused(paused);
      if (paused) { shake = 0; flash = 0; camera.x = 0; camera.y = 0; }
    },
    clear() {
      audio.clear();
      particles.length = 0; decals.length = 0; smears.length = 0;chunks.length=0;
      shake = 0; flash = 0; camera.x = 0; camera.y = 0;
    },
    getStats() {
      return {
        particles: particles.length,
        bloodParticles: particles.filter(particle => particle.kind === 'blood').length,
        sparkParticles: particles.filter(particle => particle.kind === 'spark').length,
        energyParticles:particles.filter(particle=>particle.kind==='pulse-spark'||particle.kind==='char'||particle.kind==='smoke').length,
        smokeParticles:particles.filter(particle=>particle.kind==='smoke').length,
        floorSmears:decals.filter(decal=>decal.kind==='smear').length,
        rupturePileChunks:chunks.filter(chunk=>chunk.pile).length,
        dissolvedChunks:chunks.filter(chunk=>chunk.profile==='dissolve').length,
        chunks:chunks.length,airborneChunks:chunks.filter(chunk=>!chunk.settled).length,
        settledChunks:chunks.filter(chunk=>chunk.settled).length,
        organicChunks:chunks.filter(chunk=>chunk.material==='organic'||chunk.material==='bone').length,
        clothChunks:chunks.filter(chunk=>chunk.material==='cloth').length,boneChunks:chunks.filter(chunk=>chunk.material==='bone').length,
        headChunks:chunks.filter(chunk=>chunk.region==='head').length,
        metalChunks:chunks.filter(chunk=>chunk.material==='metal').length,
        decals: decals.length, smears: smears.length, reducedMotion, muted, paused, shake,
        audioStarted: audio.getStats().audioStarted,
        audio: audio.getStats(),
      };
    },
  };
}
