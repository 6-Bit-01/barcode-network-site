// The Level 1 / Cache Road comic uses the gameplay RAF, Canvas and input owner.
// It never starts a music profile or a race clock; Drive owns that handoff.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/engine/cache-bridge.js',exports:['BARCODE.CacheBridge'],dependencies:['BARCODE.IntroSequence','BARCODE.CacheSceneLayouts','BARCODE.CacheSceneEffects','BARCODE.ComicDialogue']});
(function(B) {
  const root='./';
  const panels=Object.freeze([
    ['district','THE DISTRICT ANSWERS','The district is lit again. 6 Bit stands in the wet street.',
      ['MAC MODEM / COMMS','Outgoing relay is open.'],['6 BIT',"Hear that? They're still here."]],
    ['uplink','THE TRANSIT LINE IS OPEN','Mac and Cache reconnect the studio uplink.',
      ['MAC MODEM',"Local signal's back. The transit line is open."],['CACHE BACK','Then the original goes with me.']],
    ['original','THE ORIGINAL','DJ auditions the original recording for Cache.',
      ['DJ FLOPPYDISC','The original. Room noise, names, every mistake.'],['CACHE BACK','Play the other one.']],
    ['clean-copy','LISTEN TO THE GAPS','Cache and DJ compare the clean copy with the original.',
      ['DJ FLOPPYDISC','Cleaner. But listen to the gaps.'],['CACHE BACK',"It didn't fix the recording. It took us out."]],
    ['keep-it','KEEP BOTH TRACES','Cache seals the already-protected original for the journey.',
      ['CACHE BACK','Keep both traces. This one leaves with me.'],['DJ FLOPPYDISC','Both saved. Crew channel stays open.']],
    ['departure','ONE PIECE','Seen from behind, Cache approaches the yellow car. 6 Bit is on the radio.',
      ['6 BIT / COMMS','Get it there in one piece.'],['CACHE BACK','The recording or the car?']],
    ['ignition','ORIGINAL LOADED','Inside the yellow car, Cache loads the cassette and turns the ignition.',
      ['MAC MODEM / COMMS','Route is yours. Keep the original moving.'],['CACHE BACK','Original loaded.']],
    ['cache-line','THE CACHE LINE','The rear of the yellow car faces the open road. The crew channel stays connected.',
      ['6 BIT / COMMS',"We're on the line."],['CACHE BACK',"Then let's make some noise."]]
  ].map(([slug,title,visual,...lines],i)=>Object.freeze({title,visual,
    asset:`assets/cache-bridge/bridge-${String(i+1).padStart(2,'0')}-${slug}.webp`,
    lines:Object.freeze(lines.map(Object.freeze))})));
  const cues=Object.freeze([{kind:'title',holdMs:800},{kind:'dialogue',line:0,holdMs:4000},
    {kind:'dialogue',line:1,holdMs:Infinity}].map(Object.freeze));
  const sounds={'0:0':'relay','2:1':'original','3:1':'clean','4:1':'tape','6:1':'ignition'};
  const {ink,paper,mint,pink}=B.IntroSequence.format.palette,gold=pink;
  const frame=B.IntroSequence.format.frame;
  const bounds=B.IntroSequence.controls;
  const finite=(value,max)=>Number.isFinite(value)?Math.max(0,Math.min(max,Math.trunc(value))):0;
  function text(ctx,value,x,y,size=24,color=paper,bold=false) {
    ctx.fillStyle=color;ctx.font=`${bold?'bold ':''}${size}px monospace`;
    ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(value,x,y);
  }
  function wrap(ctx,value,width) {
    const lines=[];let line='';
    for(const word of value.split(' ')) {
      const candidate=line?`${line} ${word}`:word;
      if(line&&ctx.measureText(candidate).width>width){lines.push(line);line=word;}
      else line=candidate;
    }
    if(line)lines.push(line);return lines;
  }
  const bridge=B.CacheBridge={
    panels,cues,frame,bounds,active:false,page:0,cue:0,cueElapsedMs:0,sceneElapsedMs:0,skipMs:0,pending:false,
    generation:0,images:[],heldKeys:new Set(),skipHolds:new Map(),padBlocked:new Set(),
    padNeedsRelease:true,transcriptOpen:false,transcriptElement:null,
    normalize(saved) {
      if(!saved||typeof saved!=='object'||Array.isArray(saved)||saved.version!==1)
        return {version:1,page:0,cue:0};
      return {version:1,page:finite(saved.page,7),cue:finite(saved.cue,2)};
    },
    serialize(){return {version:1,page:this.page,cue:this.cue};},
    transcript(page=this.page) {
      const panel=panels[finite(page,7)];
      return `${panel.title}. ${panel.visual} ${panel.lines.map(line=>line.join(': ')).join(' ')}`;
    },
    syncTranscript() {
      if(this.transcriptElement)this.transcriptElement.textContent=this.transcriptOpen?this.transcript():
        `${panels[this.page].title}. ${this.cue?panels[this.page].lines.slice(0,this.cue).map(line=>line.join(': ')).join(' '):panels[this.page].visual}`;
    },
    start(saved) {
      if(this.active)return true;
      const state=this.normalize(saved);this.generation++;this.active=true;this.pending=false;
      this.page=state.page;this.cue=state.cue;this.cueElapsedMs=0;this.sceneElapsedMs=0;this.transcriptOpen=false;
      this.releaseInputs();
      this.heldKeys=new Set(window.inputManager?.resultKeysHeld||[]);
      window.inputManager?.resetActionEdges?.();
      window.audioSystem?.stopRuntimeAudio?.({stopMusic:true});
      this.loadImages();
      if(document.createElement&&document.body?.appendChild) {
        this.transcriptElement=document.createElement('div');
        this.transcriptElement.id='cacheBridgeTranscript';
        this.transcriptElement.setAttribute('aria-live','polite');
        this.transcriptElement.setAttribute('aria-label','The Cache Line bridge transcript');
        this.transcriptElement.style.cssText='position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);';
        document.body.appendChild(this.transcriptElement);
      }
      // Resuming a saved dialogue cue restores the reading position without
      // replaying its one-shot audition or ignition sound.
      this.syncTranscript();if(this.cue===0)this.playCue();return true;
    },
    loadImages() {
      const generation=this.generation;
      this.images=panels.map(panel=>({status:'loading',element:null,elapsedMs:0,attempt:0,
        sources:[root+panel.asset,panel.asset]}));
      this.images.forEach(item=>{
        item.next=()=>{
          if(!this.active||generation!==this.generation)return;
          if(item.element){item.element.onload=null;item.element.onerror=null;
            if(item.status==='loading')item.element.src='';}
          const src=item.sources[item.attempt++];
          if(!src||typeof Image!=='function'){item.status='unavailable';return;}
          const image=item.element=new Image();item.elapsedMs=0;image.crossOrigin='anonymous';
          image.onload=()=>{if(this.active&&generation===this.generation&&item.element===image){
            item.status='ready';image.onload=null;image.onerror=null;}};
          image.onerror=()=>{if(item.element===image)item.next();};image.src=src;
        };item.next();
      });
    },
    save(){return B.Campaign?.saveBridgeCheckpoint?.(this.serialize());},
    playCue(){const name=sounds[`${this.page}:${this.cue}`];if(name)window.audioSystem?.playCacheBridgeCue?.(name);},
    setCue(page,cue) {
      window.audioSystem?.stopCacheBridgeAudio?.();
      if(page!==this.page)this.sceneElapsedMs=0;
      this.page=page;this.cue=cue;this.cueElapsedMs=0;this.syncTranscript();this.save();this.playCue();
    },
    update(delta) {
      if(!this.active||this.pending||window.isPaused||window.gameState?.paused)return;
      const dt=Math.max(0,Math.min(100,Number.isFinite(delta)?delta:0));
      for(const item of this.images)if(item.status==='loading') {
        item.elapsedMs+=dt;if(item.elapsedMs>=8000)item.next();
      }
      if(this.transcriptOpen)return;
      if(this.skipHolds.size) {
        for(const [source,elapsed] of this.skipHolds)this.skipHolds.set(source,elapsed+dt);
        this.skipMs=Math.max(...this.skipHolds.values());
        if(this.skipMs>=5000)this.skipToReady();return;
      }
      if(this.images[this.page]?.status==='loading')return;
      this.cueElapsedMs+=dt;this.sceneElapsedMs+=dt;
      if(this.cue<2&&this.cueElapsedMs>=cues[this.cue].holdMs)this.setCue(this.page,this.cue+1);
    },
    advance({scene=false}={}) {
      if(!this.active||this.pending||window.isPaused||this.skipHolds.size)return false;
      if(this.transcriptOpen){this.toggleTranscript();return true;}
      if(!scene){if(this.cue<2)this.setCue(this.page,this.cue+1);return true;}
      if(this.cue<2)return false;
      if(this.page<7)this.setCue(this.page+1,0);
      else return this.drive();
      return true;
    },
    skipToReady() {
      if(!this.active||this.pending)return false;
      this.skipHolds.clear();this.skipMs=0;this.transcriptOpen=false;
      this.padBlocked.add('b1');this.padBlocked.add('b5');
      this.setCue(7,2);return true;
    },
    holdSkip(source,held) {
      if(held){if(!this.skipHolds.has(source))this.skipHolds.set(source,0);}
      else this.skipHolds.delete(source);
      this.skipMs=this.skipHolds.size?Math.max(...this.skipHolds.values()):0;
    },
    toggleTranscript() {
      if(this.pending)return false;
      this.transcriptOpen=!this.transcriptOpen;this.skipHolds.clear();this.skipMs=0;
      window.audioSystem?.stopCacheBridgeAudio?.();this.syncTranscript();return true;
    },
    async drive() {
      if(!this.active||this.pending||this.page!==7||this.cue!==2)return false;
      this.save();this.pending=true;this.releaseInputs();window.audioSystem?.stopCacheBridgeAudio?.();
      const generation=this.generation;
      try {
        const result=await B.CacheRoadProof?.enter?.();
        if(generation!==this.generation)return result;
        if(result?.ok)this.dispose();
        return result;
      } finally {if(generation===this.generation){this.pending=false;this.releaseInputs();}}
    },
    async architecture() {
      if(!this.active||this.pending)return false;
      this.save();this.pending=true;this.releaseInputs();window.audioSystem?.stopCacheBridgeAudio?.();
      const generation=this.generation;
      try {const result=await B.RunAndGunProof?.enter?.();
        if(generation===this.generation&&result?.ok)this.dispose();return result;
      } finally {if(generation===this.generation){this.pending=false;this.releaseInputs();}}
    },
    keyDown(event) {
      if(!this.active)return false;
      event.preventDefault?.();const key=event.key.toLowerCase();
      const held=this.heldKeys.has(key);this.heldKeys.add(key);
      if(event.repeat||held)return true;
      if(window.isPaused){if(key==='p'){this.releaseInputs();this.heldKeys.add(key);B.RuntimeLifecycle?.togglePause?.();}return true;}
      if(this.pending)return true;
      if(key==='escape')B.Campaign?.closeIntermission?.();
      else if(key==='p'){this.releaseInputs();this.heldKeys.add(key);B.RuntimeLifecycle?.togglePause?.();}
      else if(key==='s')this.holdSkip('keyboard',true);
      else if(key==='t')this.toggleTranscript();
      else if(key==='3')this.architecture();
      else if(key===' ')this.advance();
      else if(key==='enter')this.advance({scene:true});
      return true;
    },
    keyUp(event) {
      const key=event.key.toLowerCase();this.heldKeys.delete(key);
      if(key==='s')this.holdSkip('keyboard',false);
    },
    gamepad(input) {
      if(!this.active)return false;
      const held=input?.held||{},pressed=input?.pressed||{};
      if(input?.changed||this.padNeedsRelease) {
        this.padBlocked=new Set(Object.keys(held).filter(key=>held[key]));this.padNeedsRelease=false;
      }
      for(const key of this.padBlocked)if(!held[key])this.padBlocked.delete(key);
      if(window.isPaused){if(pressed.b9&&!this.padBlocked.has('b9')){this.releaseInputs();B.RuntimeLifecycle?.togglePause?.();}return true;}
      if(this.pending)return true;
      this.holdSkip('gamepad',!!held.b1&&!this.padBlocked.has('b1'));
      const edge=key=>!!pressed[key]&&!this.padBlocked.has(key);
      if(edge('b9')){this.releaseInputs();B.RuntimeLifecycle?.togglePause?.();}
      else if(edge('b8'))B.Campaign?.closeIntermission?.();
      else if(edge('b2'))this.toggleTranscript();
      else if(edge('b3'))this.architecture();
      else if(edge('b0'))this.advance();
      else if(edge('b5'))this.advance({scene:true});
      return true;
    },
    pointer(event) {
      if(!this.active||this.pending)return false;
      const rect=document.getElementById('gameCanvas')?.getBoundingClientRect?.();
      if(!rect?.width||!rect?.height)return true;
      const x=(event.clientX-rect.left)*1920/rect.width,y=(event.clientY-rect.top)*1080/rect.height;
      const hit=name=>{const [bx,by,w,h]=bounds[name];return x>=bx&&x<=bx+w&&y>=by&&y<=by+h;};
      if(window.isPaused){if(hit('pause')){this.releaseInputs();B.RuntimeLifecycle?.togglePause?.();}return true;}
      if(hit('dialogue'))this.advance();else if(hit('scene'))this.advance({scene:true});
      else if(hit('transcript'))this.toggleTranscript();
      else if(hit('pause')){this.releaseInputs();B.RuntimeLifecycle?.togglePause?.();}
      return true;
    },
    releaseInputs(){this.heldKeys.clear();this.skipHolds.clear();this.skipMs=0;this.padNeedsRelease=true;},
    dispose({reset=false}={}) {
      const wasActive=this.active;this.active=false;this.pending=false;this.generation++;
      this.releaseInputs();this.transcriptOpen=false;window.audioSystem?.stopCacheBridgeAudio?.();
      for(const item of this.images)if(item.element){item.element.onload=null;item.element.onerror=null;
        if(item.status==='loading')item.element.src='';}
      this.images=[];this.transcriptElement?.remove?.();this.transcriptElement=null;
      if(wasActive&&B.Campaign)B.Campaign.intermission=false;
      if(reset){this.page=0;this.cue=0;this.cueElapsedMs=0;this.sceneElapsedMs=0;}
    },
    imageRect() {
      const image=this.images[this.page],source=image?.status==='ready'?image.element:null;
      const sw=source?.naturalWidth||source?.width,sh=source?.naturalHeight||source?.height;
      if(!sw||!sh)return null;
      const scale=Math.min(frame.w/sw,frame.h/sh),w=sw*scale,h=sh*scale;
      const rect={x:frame.x+(frame.w-w)/2,y:frame.y+(frame.h-h)/2,w,h};
      const reduced=B.Preferences?.values?.reducedMotion||B.Preferences?.values?.flashes===false;
      return B.CacheSceneEffects.pose({chapter:'bridge',page:this.page,rect,
        sceneElapsedMs:this.sceneElapsedMs,reduced});
    },
    dialogueLayouts(ctx) {
      const rect=this.imageRect();
      const placements=rect?B.CacheSceneLayouts.bridge[this.page].placements:
        [{x:64,y:808,w:856,radio:true},{x:996,y:808,w:856,radio:true}];
      return B.ComicDialogue.layouts(ctx,panels[this.page].lines,placements,rect);
    },
    draw(ctx) {
      if(!ctx||!this.active)return;
      const panel=panels[this.page],reduced=B.Preferences?.values?.reducedMotion||B.Preferences?.values?.flashes===false;
      const pad=B.GamepadUI?.connected,button=index=>B.ControllerSettings?.button(index)||['A','B','X','Y'][index]||'View';
      ctx.save();ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.filter='none';
      ctx.fillStyle=ink;ctx.fillRect(0,0,1920,1080);
      B.IntroSequence.drawHeader(ctx,{title:panel.title,channel:'SYSTEM OVERRIDE / CREW CHANNEL',index:this.page,count:8});
      const image=this.images[this.page],source=image?.status==='ready'?image.element:null;
      const rect=this.imageRect();
      ctx.fillStyle='#152235';ctx.fillRect(frame.x,frame.y,frame.w,frame.h);
      if(rect) {
        ctx.drawImage(source,rect.x,rect.y,rect.w,rect.h);
        if(!this.transcriptOpen)B.CacheSceneEffects.draw(ctx,{chapter:'bridge',page:this.page,rect,
          sceneElapsedMs:this.sceneElapsedMs,cue:this.cue,cueElapsedMs:this.cueElapsedMs,reduced});
      } else {
        text(ctx,image?.status==='unavailable'?'PICTURE UNAVAILABLE / THE CHANNEL IS STILL OPEN':'TUNING THE PICTURE...',250,345,28,mint,true);
        ctx.font='26px monospace';wrap(ctx,panel.visual,1390).forEach((line,i)=>text(ctx,line,250,404+i*36,26));
      }
      B.IntroSequence.drawFrame(ctx);
      if(!this.transcriptOpen)B.ComicDialogue.draw(ctx,this.dialogueLayouts(ctx),
        {cue:this.cue,cueElapsedMs:this.cueElapsedMs,reduced});
      if(this.transcriptOpen)B.IntroSequence.drawTranscript(ctx,{...panel,index:this.page,count:panels.length,pad});
      B.IntroSequence.drawControls(ctx,{complete:this.cue===2,
        finalLabel:this.page===7?'DRIVE':'Next scene',pad,
        holding:this.skipHolds.size>0,skipProgress:this.skipMs/5000,
        transcriptOpen:this.transcriptOpen,pending:this.pending,paused:window.isPaused});
      if(B.Campaign?.roadAudioNotice)text(ctx,B.Campaign.roadAudioNotice,177,986,16,'#ffb281',true);
      else if(B.Campaign?.archive?.().status!=='ready')text(ctx,'Save unavailable / keep this session open.',177,986,16,'#ffb281');
      ctx.restore();
    }
  };
})(window.BARCODE=window.BARCODE||{});
