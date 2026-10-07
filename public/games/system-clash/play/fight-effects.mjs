const FLOOR = 620;
const PARTICLE_LIMIT = 420;
const DECAL_LIMIT = 64;
const SMEAR_LIMIT = 14;
const CHUNK_LIMIT = 96;

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
  const particles = [];
  const decals = [];
  const smears = [];
  const chunks = [];
  const camera = { x: 0, y: 0 };
  let reducedMotion = Boolean(options.reducedMotion);
  let muted = Boolean(options.muted);
  let shake = 0;
  let flash = 0;
  let audioContext = null;
  let master = null;
  let noiseBuffer = null;
  let lastSoundAt = -Infinity;

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
    if(profile==='puncture'||/pressure/.test(event.cue??''))return;
    const material=event.victimMaterial==='metal'||event.victimMaterial!=='organic'&&event.victimId==='cache-back'?'metal':'organic';
    const heavy=profile==='compression'||profile==='slam';
    const smallContact=['truss-hit','chrome-squeeze'].includes(event.cue);
    const count=Math.round((smallContact?3:profile==='cut'?6:heavy?10:7)*Math.min(strength,2));
    for(let index=0;index<count;index++) {
      const large=!smallContact&&index<Math.max(2,Math.floor(count*.2));
      const width=material==='metal'?(large?range(12,23):range(5,12)):
        large?range(24,39):range(7,16);
      const height=width*range(material==='metal'?.25:profile==='cut'?.27:.42,material==='metal'?.55:.8);
      const vertexCount=Math.floor(material==='metal'?range(4,6):range(6,9));
      const points=Array.from({length:vertexCount},(_,i)=>{
        const angle=i*Math.PI*2/vertexCount,radius=range(.7,1.08);
        return {x:Math.cos(angle)*width*.5*radius,y:Math.sin(angle)*height*.5*radius};
      });
      const restingAngle=range(-.5,.5),c=Math.cos(restingAngle),s=Math.sin(restingAngle);
      const bottom=Math.max(...points.map(p=>p.x*s+p.y*c));
      const floorY=FLOOR+range(0,7),landingY=floorY-bottom;
      const spread=heavy?(random()<.48?-direction:direction):direction;
      const vx=range(65,large?170:240)*spread*Math.min(strength,1.5);
      const vy=-range(smallContact?45:80,large?160:255);
      const originX=clamp(x+range(-9,9),12,1268),originY=Math.min(landingY,y+range(-7,7));
      const gravity=760,flightMs=1000*(-vy+Math.sqrt(vy*vy+2*gravity*(landingY-originY)))/gravity;
      const drag=1.45,flightSeconds=flightMs/1000;
      const landX=clamp(originX+vx*(1-Math.exp(-drag*flightSeconds))/drag,12,1268);
      const angle=range(-Math.PI,Math.PI);
      appendBounded(chunks,{
        material,profile,x:originX,y:originY,originX,originY,vx,vy,gravity,drag,
        landingY,floorY,landX,flightMs,age:0,settled:false,
        angle,rotation:angle,tumble:range(-8,8),restingAngle,
        width,height,points,large,bounce:material==='metal'?range(3,7):range(1,3),bounceMs:material==='metal'?220:140,
        behind:heavy,body:material==='metal'?(random()>.5?'#454a49':'#2d3636'):(random()>.5?'#5b1710':'#38100b'),
        cutFace:material==='metal'?'#89877b':random()>.5?'#7d3826':'#672318',
        fibers:Array.from({length:large?3:1},()=>({x:range(-.32,.28),y:range(-.22,.22),length:range(.15,.4),angle:range(-.8,.8)})),
      },CHUNK_LIMIT);
    }
  }

  function impact(amplitude, intensity = 0) {
    if (reducedMotion) return;
    shake = Math.max(shake, amplitude);
    // A low-opacity red wash decays slowly instead of flickering between white frames.
    flash = Math.max(flash, Math.min(intensity, 0.12));
  }

  function envelope(node, at, duration, volume) {
    node.gain.setValueAtTime(0.0001, at);
    node.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0001), at + 0.006);
    node.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  }

  function tone(at, frequency, endFrequency, duration, volume, waveform = 'sine') {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, endFrequency), at + duration);
    envelope(gain, at, duration, volume);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  function noise(at, duration, volume, frequency = 1200) {
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, at);
    envelope(gain, at, duration, volume);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(at);
    source.stop(at + duration + 0.02);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  function playSound(type, strength, event={}) {
    if (!audioContext || !master || muted || audioContext.state !== 'running') return;
    const at = audioContext.currentTime;
    if (at - lastSoundAt < 0.045 && !['deletion-impact','hit','weapon-embed'].includes(type)) return;
    lastSoundAt = at;
    const weight = clamp(strength, 0.4, 2);
    if (type === 'hit' || type === 'deletion-impact') {
      tone(at, type === 'hit' ? 110 : 75, 24, 0.2, 0.8 * weight);
      noise(at, type === 'hit' ? 0.13 : 0.35, 0.75 * weight, type === 'hit' ? 1900 : 850);
      if (type === 'deletion-impact') tone(at + 0.06, 180, 35, 0.32, 0.35, 'sawtooth');
      if(event.cue==='nail-strike'){tone(at,1300,210,.18,.5,'triangle');noise(at,.15,.45,4700);}
      if(event.cue==='compactor-crush'||event.cue==='chute-stamp'){noise(at,.48,.6,440);tone(at,70,18,.42,.4,'square');}
      if(event.cue==='cable-snap'){tone(at,980,80,.12,.48,'triangle');noise(at,.12,.55,6100);}
      if(event.cue==='disc-cut'||event.cue?.startsWith('disc-')||event.cue==='drive-blade-cut'){tone(at,860,130,.48,.32,'sawtooth');noise(at,.4,.45,3300);}
    } else if(type==='deletion-cue') {
      if(event.cue==='coffin-latch'){tone(at,440,180,.07,.15,'triangle');noise(at,.06,.15,2600);}
      else if(event.cue?.includes('lid-close')){noise(at,.15,.26,1100);tone(at,140,70,.10,.16,'square');}
      else if(event.cue?.startsWith('tape-'))noise(at,.16,.13,1900);
      else if(event.cue==='disc-release')noise(at,.25,.18,4100);
      else if(event.cue==='drive-eject'){tone(at,430,580,.12,.12,'square');noise(at,.18,.16,1400);}
    } else if(type==='weapon-pickup') {
      tone(at,360,720,.12,.24,'triangle');tone(at+.08,540,900,.16,.18,'triangle');
    } else if(type==='weapon-use') {
      if(event.weaponType==='pulse-driver') {
        tone(at,980,105,.19,.42,'sawtooth');noise(at,.12,.22,4200);
      } else {noise(at,.10,.26,2000);tone(at,210,90,.10,.25,'triangle');}
    } else if(type==='weapon-throw') {
      noise(at,.20,.28,2600);
    } else if(type==='weapon-embed') {
      tone(at,480,160,.14,.32,'triangle');noise(at,.09,.27,1250);
    } else if(type==='weapon-empty') {
      tone(at,185,110,.06,.16,'square');
    } else if(type==='glass-break'||type==='glass-impact') {
      noise(at,type==='glass-break'?0.38:0.12,0.65,6500);
      tone(at,1250,180,0.15,0.25,'triangle');
    } else if (type === 'eye-pop') {
      tone(at, 620, 90, 0.12, 0.45, 'triangle');
      noise(at, 0.08, 0.3, 1600);
    } else if (type === 'block') {
      tone(at, 390, 190, 0.1, 0.3, 'triangle');
      noise(at, 0.065, 0.4, 3600);
    } else if (type === 'miss') {
      noise(at, 0.12, 0.18, 2700);
    } else if (type === 'throw' || type === 'land' || type === 'ko') {
      tone(at, type === 'throw' ? 135 : 70, 22, 0.25, 0.65 * weight);
      noise(at, 0.16, 0.42 * weight, 600);
    } else if (type === 'deletion') {
      tone(at, 130, 30, 0.7, 0.35, 'sawtooth');
      noise(at + 0.04, 0.45, 0.2, 550);
    } else if (type === 'round-start') {
      tone(at, 180, 180, 0.1, 0.2, 'square');
      tone(at + 0.14, 270, 270, 0.15, 0.2, 'square');
    }
  }

  function emit(event = {}) {
    const x = finite(event.x, 640);
    const y = finite(event.y, 430);
    const direction = event.direction === -1 ? -1 : 1;
    const strength = clamp(finite(event.strength, 1), 0.25, 2.5);
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
        impact(5.5 * strength, 0.055);
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
      case 'deletion-impact': {
        const profile=bloodProfile(event);
        if(event.cue==='cable-snap') {
          burst('blood',x,y,-1,Math.round(46*strength),strength,profile);
          burst('blood',x,y,1,Math.round(46*strength),strength,profile);
        } else burst('blood', x, y, direction, Math.round(92 * strength), strength,profile);
        if(event.cue==='nail-strike')burst('spark',x,y,direction,24,1.2);
        if(event.cue==='disc-cut'||event.cue==='drive-blade-cut')burst('spark',x,y,-direction,36,1.1);
        if(event.cue==='compactor-crush'||event.cue==='chute-stamp')burst('dust',x,FLOOR-3,direction,22,1.6);
        // Airborne wounds build their floor puddle from falling droplets. A
        // floor impact can wet the ground at once because the contact is there.
        if(y>=FLOOR-65)addDecal(x,70*strength,{kind:profile==='slam'?'smear':'pool',direction});
        addSmear(x,y,direction,strength,profile);
        addChunks(event,x,y,direction,strength,profile);
        impact(14, 0.11);
        break;
      }
    }
    playSound(event.type, strength,event);
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
    shake *= Math.exp(-milliseconds / 95);
    flash *= Math.exp(-milliseconds / 170);
    if (shake < 0.05) shake = 0;
    if (flash < 0.001) flash = 0;
    camera.x = reducedMotion ? 0 : range(-shake, shake);
    camera.y = reducedMotion ? 0 : range(-shake * 0.45, shake * 0.45);
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
      ctx.globalAlpha=.96;ctx.fillStyle=chunk.body;ctx.strokeStyle=chunk.material==='metal'?'#161d1b':'#200805';ctx.lineWidth=.75;
      const points=chunk.points;
      ctx.beginPath();
      if(chunk.material==='metal') {
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
      ctx.globalAlpha=chunk.material==='metal'?.65:.27;ctx.strokeStyle=chunk.material==='metal'?'#b5ad92':'#b98c65';ctx.lineWidth=chunk.material==='metal'?.8:.65;
      for(const fiber of chunk.fibers) {
        const x=fiber.x*chunk.width,y=fiber.y*chunk.height,length=fiber.length*chunk.width;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(fiber.angle)*length,y+Math.sin(fiber.angle)*length);ctx.stroke();
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

  async function startAudio() {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return false;
    try {
      if (!audioContext) {
        audioContext = new Context();
        master = audioContext.createGain();
        master.gain.value = muted ? 0 : 0.09;
        master.connect(audioContext.destination);
        noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        // Audio noise has its own deterministic generator; it does not disturb visual sequences.
        let audioSeed = 948712;
        for (let index = 0; index < data.length; index++) {
          audioSeed = (Math.imul(audioSeed, 1664525) + 1013904223) >>> 0;
          data[index] = audioSeed / 2147483648 - 1;
        }
      }
      if (audioContext.state === 'suspended') await audioContext.resume();
      return audioContext.state === 'running';
    } catch {
      return false;
    }
  }

  return {
    emit, update, drawBehind, drawFront, camera,
    get flash() { return flash; },
    setReducedMotion(value) {
      reducedMotion = Boolean(value);
      if (reducedMotion) { shake = 0; flash = 0; camera.x = 0; camera.y = 0; }
    },
    setMuted(value) {
      muted = Boolean(value);
      if (master && audioContext) master.gain.setTargetAtTime(muted ? 0 : 0.09, audioContext.currentTime, 0.02);
    },
    startAudio,
    clear() {
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
        chunks:chunks.length,airborneChunks:chunks.filter(chunk=>!chunk.settled).length,
        settledChunks:chunks.filter(chunk=>chunk.settled).length,
        organicChunks:chunks.filter(chunk=>chunk.material==='organic').length,
        metalChunks:chunks.filter(chunk=>chunk.material==='metal').length,
        decals: decals.length, smears: smears.length, reducedMotion, muted,
        audioStarted: Boolean(audioContext),
      };
    },
  };
}
