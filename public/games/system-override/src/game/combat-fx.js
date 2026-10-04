// Frame-owned feedback. These shapes describe resolved actions; they never
// deal damage, advance the music, or own a timer/render loop.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/combat-fx.js', exports: ['BARCODE.CombatFX'], dependencies: ['BARCODE.MusicTransport'] });
(function() {
  const BARCODE = window.BARCODE = window.BARCODE || {};
  const TAU = Math.PI * 2;
  const colors = { virus: '#efffff', corrupted: '#ff65e8', firewall: '#ffac48', boss: '#77ffe1', broadcast_jammer: '#92fff1' };
  // Stateless samples from an event seed. Rendering never advances random state.
  function noise(seed, salt) {
    let x = (seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x21f0aaad); x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
    return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
  }
  class CombatFX {
    constructor() { this.randomState = (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0 || 0x6b17; this.reset(); }
    nextSeed() {
      let x = this.randomState; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.randomState = x >>> 0; return this.randomState;
    }
    sample(seed, salt) { return noise(seed, salt); }
    reset() { this.powerMode="none";this.powerAge=0;this.hackDeflectMs=0;this.events = []; this.timeMs = 0; this.sceneKick = 0; this.sceneSample = null; this.serial = 0; this.lastCombo = 0; this.damageFeedback = null; this.ampNotice = null; }
    add(event) {
      if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) return;
      if (this.events.length >= 96) this.events.shift();
      this.events.push({ age: 0, duration: 420, color: '#77ffe1', id: ++this.serial, seed: this.nextSeed(), ...event });
    }
    update(ms) {
      if (!Number.isFinite(ms) || ms < 0 || window.isPaused || window.gameState?.paused) return;
      this.timeMs += ms;
      this.updatePower(ms);
      const audioTime = window.audioSystem?.context?.currentTime;
      this.sceneSample = Number.isFinite(audioTime) ? BARCODE.MusicTransport?.sample?.(audioTime) : null;
      this.sceneKick = Math.max(0, this.sceneKick - ms / 600);
      for (const key of ['damageFeedback', 'ampNotice']) {
        if (this[key]) {
          this[key].age += ms;
          if (this[key].age >= this[key].duration) this[key] = null;
        }
      }
      let write = 0;
      for (const event of this.events) {
        event.age += ms;
        if (event.age < event.duration) this.events[write++] = event;
      }
      this.events.length = write;
    }
    powerSettings() {
      const p=BARCODE.Preferences?.values || {};
      return { reduced:!!p.reducedMotion, flashes:p.flashes!==false && window.BARCODE_RENDER_QUALITY?.flashes!==false };
    }
    updatePower(ms) {
      const mode=window.hackingSystem?.isActive?.()?'hack':window.rhythmSystem?.isActive?.()?'rhythm':'none';
      if(mode!==this.powerMode) {
        if(this.powerMode==='hack')window.audioSystem?.playModeCue?.('hack-out');
        this.powerMode=mode;this.powerAge=0;
        if(mode==='hack')window.audioSystem?.playModeCue?.('hack-in');
      }
      this.powerAge+=ms;this.hackDeflectMs=Math.max(0,this.hackDeflectMs-ms);
    }
    hackDeflect() {
      this.hackDeflectMs=420;
      const p=window.player;if(p)this.add({kind:'power-hit',x:p.position.x,y:p.position.y-22,radius:125,duration:420,color:'#b4ffff'});
      window.audioSystem?.playModeCue?.('hack-guard');
    }
    sceneFilter() { return window.hackingSystem?.isActive?.()?'saturate(0.36) contrast(1.08) brightness(0.8)':'none'; }
    drawHackField(ctx,x,y) {
      if(!window.hackingSystem?.isActive?.() || !this.visible(x,y,700))return;
      const {reduced,flashes}=this.powerSettings(),time=reduced?0:this.powerAge/1000,side=window.player?.facing||1;
      const hand={x:x+side*76,y:y-76};
      ctx.save();
      const halo=ctx.createRadialGradient(x,y-15,15,x,y-15,245);
      halo.addColorStop(0,'rgba(79,246,255,0.19)');halo.addColorStop(1,'rgba(30,128,230,0)');
      ctx.fillStyle=halo;ctx.fillRect(x-245,y-260,490,490);
      ctx.strokeStyle='#80e9ff';ctx.lineWidth=2;ctx.globalAlpha=.6;
      for(let i=0;i<3;i++){
        const r=105+i*32,phase=time*(i%2?.8:-.6)+i;
        ctx.beginPath();ctx.ellipse(x,y+72,r,r*.24,0,phase,phase+Math.PI*1.55);ctx.stroke();
      }
      // A few slowly drifting motes make the stopped world visible even when
      // enemies are idle. Personal rings/gestures keep the real frame clock.
      ctx.fillStyle='#98eaff';ctx.globalAlpha=.55;
      for(let i=0;i<(reduced?8:26);i++){
        const dx=(noise(61,i)-.5)*620,dy=(noise(93,i)*360+time*7)%360;
        ctx.fillRect(x+dx,y+95-dy,i%4?2:4,i%4?7:16);
      }
      const target=window.hackingSystem.hijackTarget;
      if(target?.active && Math.abs(target.position.x-x)<1000){
        const box=target.getHitbox(),tx=box.x+box.width/2,ty=box.y+box.height/2;
        ctx.strokeStyle='#b1a2ff';ctx.globalAlpha=.8;ctx.lineWidth=2;ctx.setLineDash([9,12]);ctx.lineDashOffset=-time*90;
        ctx.beginPath();ctx.moveTo(hand.x,hand.y);ctx.quadraticCurveTo((hand.x+tx)/2,Math.min(hand.y,ty)-85,tx,ty);ctx.stroke();ctx.setLineDash([]);
        ctx.strokeRect(box.x-12,box.y-12,box.width+24,box.height+24);
      }
      ctx.globalAlpha=1;ctx.strokeStyle='#b3ffff';ctx.fillStyle='#d9ffff';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(hand.x,hand.y,flashes?16+Math.sin(time*8)*3:16,0,TAU);ctx.stroke();
      for(let i=0;i<3;i++){const a=time*2+i*TAU/3;ctx.fillRect(hand.x+Math.cos(a)*23-2,hand.y+Math.sin(a)*23-2,4,4);}
      if(this.hackDeflectMs>0){
        ctx.lineWidth=6;ctx.globalAlpha=this.hackDeflectMs/420;
        ctx.beginPath();ctx.arc(hand.x,hand.y,45+(1-this.hackDeflectMs/420)*36,-1.3+(side<0?Math.PI:0),1.3+(side<0?Math.PI:0));ctx.stroke();
      }
      ctx.restore();
    }
    drawPowerScreen(ctx) {
      const hack=window.hackingSystem?.isActive?.(),rhythm=window.rhythmSystem?.isActive?.();
      if(!hack&&!rhythm)return;
      const {reduced,flashes}=this.powerSettings();if(reduced||!flashes)return;
      const v=hack?window.hackingSystem.getSceneViewport?.():{x:0,y:210,width:1920,height:760};if(!v)return;
      const projected=BARCODE.sceneProjection?.worldToScreen?.(window.player?.position||{x:960,y:760});
      const x=Math.max(v.x+60,Math.min(v.x+v.width-60,projected?.x??960)),y=Math.max(v.y+60,Math.min(v.y+v.height-60,projected?.y??700));
      const beat=this.beat(),pulse=rhythm?Math.pow(1-beat.fraction,3):0;
      ctx.save();ctx.beginPath();ctx.rect(v.x,v.y,v.width,v.height);ctx.clip();
      const edge=ctx.createRadialGradient(x,y,80,x,y,v.width*.66);
      edge.addColorStop(0,'rgba(0,0,0,0)');edge.addColorStop(.5,'rgba(0,0,0,0)');
      edge.addColorStop(1,hack?'rgba(5,55,95,0.65)':`rgba(89,9,95,${.22+pulse*.12})`);
      ctx.fillStyle=edge;ctx.fillRect(v.x,v.y,v.width,v.height);
      const entry=Math.max(0,1-this.powerAge/650);
      if(entry>0){
        ctx.strokeStyle=hack?'#b4ffff':'#f0a7ff';ctx.globalAlpha=entry*.55;ctx.lineWidth=2;
        for(let i=0;i<18;i++){
          const a=i*TAU/18,r=90+(1-entry)*v.width*.5;
          ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r*.6);
          ctx.lineTo(x+Math.cos(a)*(r+90*entry),y+Math.sin(a)*(r+90*entry)*.6);ctx.stroke();
        }
      }
      ctx.restore();
    }
    playerDamaged(player, previousHealth, sourcePosition = null) {
      if (!player || !Number.isFinite(previousHealth) || !Number.isFinite(player.health) || player.health >= previousHealth) return;
      const dx = Number.isFinite(sourcePosition?.x) ? sourcePosition.x - player.position.x : 0;
      const dy = Number.isFinite(sourcePosition?.y) ? sourcePosition.y - player.position.y : 0;
      const angle = dx || dy ? Math.atan2(dy, dx) : null;
      this.damageFeedback = { player, from: previousHealth, to: player.health, direction: Math.sign(dx), age: 0, duration: 950 };
      this.add({ kind: 'hurt', x: player.position.x, y: player.position.y - 12, angle, color: '#ff987b', duration: 340 });
      window.renderer?.impact?.('hurt', { direction: -Math.sign(dx) });
    }
    ampChanged(kind, charges, player = window.player) {
      const empty = kind === 'use' && charges === 0;
      this.ampNotice = { kind: empty ? 'empty' : kind, charges, age: 0, duration: empty || kind === 'pickup' ? 2400 : 500 };
      if (player && (empty || kind === 'pickup')) {
        this.add({ kind: empty ? 'amp-empty' : 'amp-pickup', x: player.position.x, y: player.position.y + 40, color: '#efa0ff', duration: 650 });
      }
    }
    dataCollected(fragment) {
      this.add({ kind: 'data-flight', x: fragment.position.x, y: fragment.position.y, duration: 1400, color: '#c6a0ff' });
    }
    fragmentFlightPose(event, project) {
      const source = project({ x: event.x, y: event.y });
      const assembly = Math.min(1, event.age / 320);
      const travel = Math.max(0, Math.min(1, (event.age - 320) / 760));
      const eased = travel * travel * (3 - 2 * travel);
      const lore = BARCODE.ComicHUD?.lore || { x:1552, y:24, width:338, height:51 };
      return { x: source.x + (lore.x + lore.width / 2 - source.x) * eased,
        y: source.y + (lore.y + lore.height / 2 - source.y) * eased - Math.sin(travel * Math.PI) * 65,
        assembly, travel, scale: 1.4 - travel * 0.75,
        alpha: event.age <= 1080 ? 1 : Math.max(0, (1400 - event.age) / 320) };
    }
    drawFragmentFlights(ctx) {
      const projection = BARCODE.sceneProjection;
      if (!projection) return;
      for (const event of this.events) {
        if (event.kind !== 'data-flight') continue;
        const pose = this.fragmentFlightPose(event, point => projection.worldToScreen(point));
        ctx.save(); ctx.globalAlpha = pose.alpha;
        if (pose.travel === 1) {
          ctx.strokeStyle = '#c6a0ff'; ctx.lineWidth = 2;
          const lore = BARCODE.ComicHUD?.lore || { x:1552, y:24, width:338, height:51 };
          ctx.strokeRect(lore.x - (1 - pose.alpha) * 5, lore.y - (1 - pose.alpha) * 3, lore.width + (1 - pose.alpha) * 10, lore.height + (1 - pose.alpha) * 6);
        }
        ctx.translate(pose.x, pose.y); ctx.scale(pose.scale, pose.scale);
        const offset = (1 - pose.assembly) * 20;
        for (const sideX of [-1, 1]) for (const sideY of [-1, 1]) {
          ctx.fillStyle = '#131e37'; ctx.strokeStyle = sideX === sideY ? '#d0a7ff' : '#91ffe5'; ctx.lineWidth = 1.5;
          const x = sideX * (8 + offset) - 7, y = sideY * (8 + offset) - 7;
          ctx.fillRect(x, y, 14, 14); ctx.strokeRect(x, y, 14, 14);
          ctx.fillStyle = ctx.strokeStyle;
          for (let bar = 0; bar < 3; bar++) ctx.fillRect(x + 3 + bar * 3, y + 3, bar === 1 ? 1 : 2, 8);
        }
        ctx.restore();
      }
    }
    drawAmpIcon(ctx, x, y, size = 1, chargeCount = 3) {
      const { reduced, flashes } = this.powerSettings();
      const timeMs = reduced || !flashes ? 0 : this.timeMs;
      if(BARCODE.Level1SignalArt?.drawAmp?.(ctx,{x,y,scale:size,chargeCount,timeMs,
        reduced:reduced||!flashes}))return;
      const pulse = 0.5 + 0.5 * Math.sin(timeMs / 160);
      ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
      ctx.fillStyle = '#0a1526'; ctx.strokeStyle = '#efa0ff'; ctx.lineWidth = 2;
      ctx.fillRect(-22, -22, 44, 44); ctx.strokeRect(-22, -22, 44, 44);
      ctx.strokeStyle = '#a3ffee'; ctx.strokeRect(-9, -28, 18, 6);
      for (let i = 0; i < 9; i++) {
        const height = 9 + (1 + Math.sin(i * 1.8 + timeMs / 160)) * 4;
        ctx.fillStyle = i % 3 ? '#efa0ff' : '#a3ffee';
        ctx.fillRect(-17 + i * 4, -16, i % 3 ? 2 : 3, height);
      }
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < chargeCount ? '#a3ffee' : '#354555'; ctx.fillRect(-15 + i * 11, 11, 8, 4);
      }
      ctx.globalAlpha *= 0.3 + pulse * 0.35; ctx.strokeStyle = '#efa0ff';
      ctx.beginPath(); ctx.arc(0, 0, 30 + pulse * 4, -0.5, 0.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 30 + pulse * 4, Math.PI - 0.5, Math.PI + 0.5); ctx.stroke();
      ctx.restore();
    }
    drawDamageHUD(ctx, player, x, y, width, height) {
      const hit = this.damageFeedback;
      if (!hit || hit.player !== player || !(player.maxHealth > 0)) return;
      const fade = Math.min(1, (hit.duration - hit.age) / 450);
      const segmentWidth = width / player.maxHealth;
      ctx.save(); ctx.globalAlpha = fade; ctx.strokeStyle = '#ff987b'; ctx.lineWidth = 3;
      for (let i = Math.ceil(hit.to); i < Math.min(player.maxHealth, Math.ceil(hit.from)); i++) {
        if (i < player.health) continue; // Healing must not look like new damage.
        if (window.BARCODE_RENDER_QUALITY?.flashes !== false) {
          ctx.fillStyle = `rgba(255,125,100,${0.45 * (1 - hit.age / hit.duration)})`;
          ctx.fillRect(x + i * segmentWidth + 2, y + 2, segmentWidth - 2, height - 4);
        }
        ctx.strokeRect(x + i * segmentWidth + 2, y + 2, segmentWidth - 2, height - 4);
      }
      // A short inward chevron identifies the source side. Unknown sources
      // show the actual loss without inventing a direction.
      if (hit.direction) {
        const edge = hit.direction < 0 ? x - 30 : x + width + 30;
        ctx.beginPath(); ctx.moveTo(edge, y + 5); ctx.lineTo(edge - hit.direction * 10, y + height / 2); ctx.lineTo(edge, y + height - 5); ctx.stroke();
      }
      ctx.fillStyle = '#ffb49c'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`−${hit.from - hit.to}`, x + width + 20, y + height + 8);
      ctx.restore();
    }
    drawAmpHUD(ctx) {
      const charges = Math.max(0, Math.min(3, BARCODE.signalAmpCharges || 0));
      BARCODE.ComicHUD?.amp(ctx, { charges, notice: this.ampNotice,
        visible: charges || window.sector1Progression?.signalAmpCollected || this.ampNotice,
        active: window.rhythmSystem?.isActive?.() });
    }
    beat() {
      const time = window.audioSystem?.context?.currentTime;
      const sample = Number.isFinite(time) ? BARCODE.MusicTransport?.sample?.(time - (BARCODE.Preferences?.values.visualOffsetMs || 0) / 1000) : null;
      return sample?.running && sample.grid ? { fraction: sample.grid.beatFloat % 1, index: Math.floor(sample.grid.beatFloat) } : { fraction: 1, index: 0 };
    }
    visible(x, y, radius = 100) {
      const center = window.gameCamera?.centerX ?? ((window.gameCamera?.x || 0) + 960);
      const zoom = Math.max(0.4, window.renderer?.zoomLevel || 1);
      return x + radius >= center - 960 / zoom && x - radius <= center + 960 / zoom && y + radius >= (window.gameCamera?.y || 0) - 300 && y - radius <= (window.gameCamera?.y || 0) + 1200;
    }
    mode(entering, player = window.player) {
      if (!player) return;
      this.lastCombo = 0;
      this.sceneKick = entering ? 1 : 0;
      this.add({ kind: 'entry', x: player.position.x, y: player.position.y + 72, duration: entering ? 650 : 220, radius: entering ? 210 : 95, color: entering ? '#7cffe2' : '#b0bed6' });
      window.audioSystem?.playCombatCue?.(entering ? 'enter' : 'exit');
      if(entering)window.audioSystem?.playModeCue?.('rhythm-in');
    }
    contact(type, x, y, direction = 1, defeated = false, perfect = false) {
      this.add({ kind: 'impact', x, y, direction: direction || 1, material: type, defeated, perfect, color: colors[type] || '#7cffe2', duration: defeated ? 900 : 380 });
      window.audioSystem?.playCombatCue?.(type === 'firewall' ? 'metal' : type === 'corrupted' ? 'tear' : 'data', { material: type });
      BARCODE.stageFX?.react?.(x, defeated ? 1 : 0.5);
    }
    movement(kind, player, speed = 0) {
      if (!player) return;
      const strength = kind === 'land' ? Math.max(0.2, Math.min(1, speed / 1000)) : kind === 'stomp' ? 1 : 0.45;
      const x = player.position.x, y = player.position.y + 72;
      this.add({ kind: 'movement', movement: kind, x, y, strength, direction: player.facing || 1,
        color: player.supportedSurfaceId ? '#d8b6ff' : '#96fff0', duration: kind === 'step' ? 180 : 420 });
      if (kind === 'stomp' || (kind === 'land' && speed > 500)) window.renderer?.impact?.(kind, { strength });
      if (kind === 'stomp' || kind === 'land') BARCODE.stageFX?.react?.(x, strength, kind);
    }
    resolved(result, player, range) {
      if (!player || !result.timing?.available) return;
      const combo = window.rhythmSystem?.combo || 0;
      if (!result.ok) { this.lastCombo = combo; return; }
      const x = player.position.x, y = player.position.y;
      const perfect = result.timing.timing === 'perfect';
      const color = result.reason === 'boss-guarded' ? '#ffbe70' : result.targets.length ? '#7cffe2' : '#8babb8';
      this.sceneKick = result.targets.length ? 1 : 0.4;
      this.add({ kind: 'pulse', x, y, radius: range, color, duration: perfect ? 340 : 270, perfect });
      const pattern = result.pattern || 'pulse';
      if (pattern !== 'pulse') this.add({ kind: 'wave', x, y: y - 24, radius: result.waveReach || range,
        direction: player.facing || 1, color: pattern === 'discharge' ? '#ffa0ed' : '#7cffe2', duration: 360, perfect });
      for (const target of result.targets) {
        this.add({ kind: 'link', x: target.fromX ?? x, y: (target.fromY ?? y) - 24, tx: target.x, ty: target.contactY ?? target.y, chain: target.via === 'chain', color: target.via === 'chain' ? '#ffa0ed' : colors[target.type] || color, duration: perfect ? 240 : 180, perfect });
        if (target.type === 'boss' || target.type === 'broadcast_jammer') this.contact(target.type, target.x, target.contactY ?? target.y, Math.sign(target.x - x), false, perfect);
      }
      if(result.targets.length && perfect){this.add({kind:'power-hit',x,y,radius:range,duration:420,color:'#e6a6ff'});window.audioSystem?.playModeCue?.('rhythm-hit');}
      if (result.targets.length) { player.impactHoldMs = perfect ? 55 : 30; BARCODE.stageFX?.react?.(x, 1, 'hit'); }
      if (result.reason === 'boss-guarded') {
        const boss = window.sector1Progression?.boss;
        if (boss) this.add({ kind: 'guard', x: boss.x, y: boss.y, duration: 260, color: '#ffbe70', direction: Math.sign(x - boss.x) || -1 });
      }
      window.audioSystem?.playCombatCue?.(Number.isFinite(result.liftCharges) ? 'lift' : result.reason === 'boss-guarded' ? 'guard' : result.targets.length ? (perfect ? 'perfect' : 'hit') : 'empty');
      if (pattern !== 'pulse' && result.targets.length) window.audioSystem?.playCombatCue?.(pattern);
      if ((combo >= 5 && this.lastCombo < 5) || (combo >= 10 && this.lastCombo < 10)) {
        const tier = combo >= 10 ? 10 : 5;
        this.add({ kind: 'combo', x, y: y - 10, tier, duration: 540, color: tier === 10 ? '#ff8af3' : '#7cffe2' });
        player.afterimageMs = 220;
        window.audioSystem?.playCombatCue?.(tier === 10 ? 'combo10' : 'combo5');
      }
      this.lastCombo = combo;
    }
    drawRhythmField(ctx, x, y) {
      if (!this.visible(x, y, 430)) return;
      const quiet=this.powerSettings().reduced || !this.powerSettings().flashes;
      const { fraction, index } = quiet ? {fraction:1,index:0} : this.beat();
      const pulse = Math.pow(1 - fraction, 3);
      const combo = window.rhythmSystem?.combo || 0;
      const range = window.rhythmSystem?.getAuthoritativeDamageRadius?.() || 250;
      ctx.save();
      // The complete thin circle uses the same origin/radius as the ordinary
      // damage query. The compact foot field conveys stance, not attack reach.
      ctx.strokeStyle = `rgba(109,255,226,${0.12 + pulse * 0.12})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 12]); ctx.beginPath(); ctx.arc(x, y, range, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if ((BARCODE.signalAmpCharges || 0) > 0) {
        ctx.strokeStyle = 'rgba(244,151,255,0.22)'; ctx.setLineDash([3, 15]);
        ctx.beginPath(); ctx.arc(x, y, 430, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      const foot = y + 72;
      ctx.fillStyle = `rgba(38,234,218,${0.09 + pulse * 0.09})`;
      ctx.beginPath(); ctx.ellipse(x, foot, 85 + pulse * 20, 20, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = combo >= 10 ? '#ffa0ed' : '#81ffe5'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, foot, 68 + pulse * 16, 16 + pulse * 4, 0, 0, TAU); ctx.stroke();
      // Broad floor ripples and vertical equalizer fins frame the performer.
      // The outer damage circle above retains the real gameplay radius.
      for(let i=0;i<3;i++){
        const phase=quiet ? 0.35 :(fraction+i/3)%1,r=50+phase*170;
        ctx.globalAlpha=(1-phase)*.5;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,foot,r,r*.23,0,0,TAU);ctx.stroke();
      }
      const tier=Math.min(1,combo/10);ctx.globalAlpha=.55;
      for(let i=0;i<12;i++){
        const side=i<6?-1:1,n=i%6,dx=side*(54+n*13),height=22+(quiet?16:pulse*66)*(1-n/8)+tier*25;
        ctx.fillStyle=tier>=1?'#ffa0ed':'#83ffe6';ctx.fillRect(x+dx-2,foot-height,4,height);
      }
      ctx.globalAlpha=1;
      // Stable, beat-indexed short tendrils remain close to the performer.
      ctx.globalAlpha = 0.45 + pulse * 0.3; ctx.lineWidth = 2;
      for (let side = -1; side <= 1; side += 2) {
        ctx.beginPath(); ctx.moveTo(x + side * 32, foot - 12);
        for (let i = 1; i <= 5; i++) ctx.lineTo(x + side * (32 + Math.sin(index * 1.7 + i) * (10 + Math.min(combo, 10))), foot - 12 - i * (11 + pulse * 3));
        ctx.stroke();
      }
      ctx.restore();
    }
    draw(ctx) {
      for (const e of this.events) {
        if (e.kind === 'data-flight') continue; // Draw once in HUD coordinates.
        if (!this.visible(e.x, e.y, e.radius || (e.tx ? Math.abs(e.tx - e.x) + 80 : 200))) continue;
        const t = e.age / e.duration, fade = 1 - t;
        ctx.save(); ctx.globalAlpha = fade; ctx.strokeStyle = e.color; ctx.fillStyle = e.color; ctx.lineWidth = e.perfect ? 4 : 2;
        if(e.kind==='power-hit') {
          const quiet=this.powerSettings().reduced || !this.powerSettings().flashes;
          ctx.lineWidth=quiet?2:6*fade;ctx.globalAlpha=fade*(quiet ? 0.25 : 0.8);
          const radius=quiet?e.radius:30+(e.radius-30)*Math.sin(t*Math.PI/2);
          ctx.beginPath();ctx.arc(e.x,e.y,radius,0,TAU);ctx.stroke();
          if(!quiet){ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(e.x,e.y+72,radius,radius*.24,0,0,TAU);ctx.stroke();}
        } else if (e.kind === 'entry') {
          ctx.beginPath(); ctx.ellipse(e.x, e.y, 30 + t * e.radius, 8 + t * 32, 0, 0, TAU); ctx.stroke();
          for (let i = 0; i < 12; i++) ctx.fillRect(e.x - 58 + i * 10, e.y - 6 - Math.sin(i * 1.8) * 8 - t * 65, i % 3 ? 3 : 5, 12 * fade);
        } else if (e.kind === 'hurt') {
          ctx.lineWidth = 4;
          if (e.angle !== null) {
            ctx.beginPath(); ctx.arc(e.x, e.y, 56 + 16 * t, e.angle - 0.6, e.angle + 0.6); ctx.stroke();
          } else {
            ctx.strokeRect(e.x - 36 - 12 * t, e.y - 44 - 12 * t, 72 + 24 * t, 88 + 24 * t);
          }
        } else if (e.kind === 'amp-pickup' || e.kind === 'amp-empty') {
          for (let i = 0; i < 12; i++) {
            const angle = i * TAU / 12;
            const radius = e.kind === 'amp-empty' ? 28 + t * 62 : 70 * (1 - t);
            ctx.fillRect(e.x + Math.cos(angle) * radius, e.y + Math.sin(angle) * radius * 0.5 - t * 45, i % 3 ? 3 : 6, 14 * fade);
          }
        } else if (e.kind === 'movement') {
          const step = e.movement === 'step', radius = (step ? 24 : 110 * e.strength) * t;
          ctx.lineWidth = step ? 2 : 4 * fade;
          ctx.beginPath(); ctx.moveTo(e.x - radius, e.y);
          for (let i = 0; i < 10; i++) ctx.lineTo(e.x + radius * (i / 4.5 - 1), e.y - noise(e.seed, i) * radius * 0.2);
          ctx.stroke();
          for (let i = 0; i < (step ? 4 : 12); i++) {
            const side = i % 2 ? 1 : -1, dx = side * (12 + radius * (0.35 + noise(e.seed, i + 20)));
            const dy = -Math.sin(t * Math.PI) * (step ? 12 : 15 + noise(e.seed, i + 40) * 50) * e.strength;
            ctx.fillRect(e.x + dx, e.y + dy, (step ? 6 : 12) * fade, 3);
          }
        } else if (e.kind === 'pulse') {
          const variant = e.seed % 3, rotation = noise(e.seed, 99) * TAU;
          const radius = e.radius * (0.12 + 0.72 * Math.min(1, t * 2));
          ctx.translate(e.x, e.y - 24); ctx.rotate(rotation);
          const pieces = variant === 0 ? 7 : variant === 1 ? 11 : 5;
          for (let i = 0; i < pieces; i++) {
            const a = i * TAU / pieces + (noise(e.seed, i) - 0.5) * 0.85;
            const inner = radius * (0.42 + noise(e.seed, i + 10) * 0.25), outer = radius * (0.8 + noise(e.seed, i + 20) * 0.35);
            const spread = variant === 1 ? 0.08 : 0.13 + noise(e.seed, i + 40) * 0.16;
            ctx.beginPath(); ctx.moveTo(Math.cos(a - spread) * inner, Math.sin(a - spread) * inner);
            if (variant === 0) {
              ctx.lineTo(Math.cos(a - spread * 0.65) * outer * 0.8, Math.sin(a - spread * 0.65) * outer * 0.8);
              ctx.lineTo(Math.cos(a - spread * 0.3) * inner * 1.05, Math.sin(a - spread * 0.3) * inner * 1.05);
            }
            ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
            if (variant === 2) {
              ctx.lineTo(Math.cos(a + spread) * outer * 0.82, Math.sin(a + spread) * outer * 0.82);
              ctx.lineTo(Math.cos(a + spread * 0.45) * inner * 0.9, Math.sin(a + spread * 0.45) * inner * 0.9);
            }
            ctx.lineTo(Math.cos(a + spread) * inner, Math.sin(a + spread) * inner);
            ctx.lineTo(Math.cos(a + 0.08) * inner * 0.8, Math.sin(a + 0.08) * inner * 0.8); ctx.closePath();
            ctx.globalAlpha = fade * (variant === 2 ? 0.35 : 0.65); ctx.fill();
            ctx.strokeStyle = e.color; ctx.lineWidth = 2 + fade * 3; ctx.globalAlpha = fade; ctx.stroke();
            // Short offset scratches and splinters break the clean radial edge.
            ctx.save(); ctx.rotate(a); ctx.fillStyle = i % 3 ? e.color : '#fff6db';
            ctx.fillRect(outer + 6 + noise(e.seed, i + 60) * 18, -7, (8 + noise(e.seed, i + 80) * 22) * fade, 2 + noise(e.seed, i + 90) * 5);
            if (variant === 1) { ctx.fillRect(inner * 0.8, -14, (outer - inner) * 0.7, 3); ctx.fillRect(outer * 0.9, 6, 9, 8); }
            ctx.restore();
          }
        } else if (e.kind === 'wave') {
          ctx.translate(e.x, e.y); ctx.scale(e.direction, 1);
          for (const offset of [-12, 0, 12]) {
            ctx.beginPath();
            for (let i = 0; i <= 40; i++) {
              const d = i / 40, px = d * e.radius * Math.min(1, t * 3);
              const py = (Math.sin(d * Math.PI * (4 + e.seed % 5) - t * 9) * (24 + 48 * d) +
                (noise(e.seed, i) - 0.5) * 55 * d) * fade + offset;
              if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.lineWidth = offset ? 2 : 7; ctx.globalAlpha = fade * (offset ? 0.45 : 0.9); ctx.stroke();
          }
        } else if (e.kind === 'link') {
          if (!Number.isFinite(e.tx) || !Number.isFinite(e.ty)) { ctx.restore(); continue; }
          ctx.lineWidth = e.chain ? 7 : 4;
          ctx.beginPath(); ctx.moveTo(e.x, e.y);
          for (let i = 1; i < 8; i++) ctx.lineTo(e.x + (e.tx - e.x) * i / 8, e.y + (e.ty - e.y) * i / 8 + (noise(e.seed, i) - 0.5) * (e.chain ? 72 : 46) * fade);
          ctx.lineTo(e.tx, e.ty); ctx.stroke();
          ctx.strokeStyle = '#f7ffff'; ctx.lineWidth = 1.5; ctx.stroke();
          for (let i = 0; i < 3; i++) {
            const d = 0.2 + i * 0.23, bx = e.x + (e.tx - e.x) * d, by = e.y + (e.ty - e.y) * d;
            const side = noise(e.seed, i + 12) > 0.5 ? 1 : -1;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 12, by + side * 18 * fade); ctx.lineTo(bx + 30 * fade, by + side * 8 * fade); ctx.stroke();
          }
        } else if (e.kind === 'impact') {
          const core = window.BARCODE_RENDER_QUALITY?.flashes === false ? 0 : Math.max(0, 1 - e.age / 140);
          if (core > 0) {
            ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(noise(e.seed, 100) * TAU); ctx.globalAlpha = core;
            ctx.beginPath();
            for (let i = 0; i < 16; i++) {
              const a = i * TAU / 16, r = (i % 2 ? 10 + noise(e.seed, i) * 16 : (e.defeated ? 95 : 62) * (0.5 + noise(e.seed, i))) * (0.8 + 0.2 * core);
              if (!i) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fffdeb';
            ctx.beginPath(); ctx.ellipse(0, 0, 18 * core, 30 * core, -0.3, 0, TAU); ctx.fill(); ctx.restore();
          }
          ctx.globalAlpha = fade * 0.8;
          const count = e.defeated ? 22 : 10;
          for (let i = 0; i < count; i++) {
            const angle = noise(e.seed, i) * TAU;
            const age = Math.max(0, t - noise(e.seed, i + 30) * 0.12);
            const distance = (e.defeated ? 280 : 125) * age * (0.3 + noise(e.seed, i + 60));
            const px = e.x + Math.cos(angle) * distance + e.direction * t * 35;
            const py = e.y + Math.sin(angle) * distance + (e.material === 'firewall' ? 80 * t * t : -t * 14);
            ctx.save(); ctx.translate(px, py); ctx.rotate(angle + age * (noise(e.seed, i + 90) - 0.5) * 9);
            if (e.material === 'corrupted') { ctx.fillRect(0, 0, (1 + noise(e.seed, i + 120) * 4) * 16 * fade, 5); ctx.fillStyle = '#ffffff'; ctx.fillRect(6, -4, 16 * fade, 2); }
            else if (e.material === 'firewall') { ctx.beginPath(); ctx.moveTo(0, -14 * fade); ctx.lineTo(16 * fade, 8); ctx.lineTo(-9 * fade, 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff8c5'; ctx.fillRect(0, 0, 3, 3); }
            else { const size = 4 + noise(e.seed, i + 150) * 11; ctx.fillRect(0, 0, size, size); ctx.strokeRect(3, -3, size, size); }
            ctx.restore();
          }
        } else if (e.kind === 'guard') {
          const angle = e.direction < 0 ? Math.PI : 0;
          ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y, 65 + t * 25, angle - 0.85, angle + 0.85); ctx.stroke();
        } else if (e.kind === 'combo') {
          for (let i = 0; i < 18; i++) {
            const angle = i * TAU / 18 + noise(e.seed, i) * 0.3, radius = 45 + t * (e.tier === 10 ? 210 : 135) * (0.5 + noise(e.seed, i + 20));
            ctx.save(); ctx.translate(e.x + Math.cos(angle) * radius, e.y + Math.sin(angle) * radius * 0.7); ctx.rotate(angle);
            ctx.fillRect(0, -2, (i % 3 + 1) * 5, 4); ctx.restore();
          }
        }
        ctx.restore();
      }
    }
  }
  BARCODE.CombatFX = CombatFX;
  BARCODE.combatFX = new CombatFX();
})();
