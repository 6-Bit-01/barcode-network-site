// Cache's authored delivery ending shares the gameplay Canvas, RAF and input.
// The earned chapter facts belong to CacheChapter; reading cannot award them.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/engine/cache-ending.js',exports:['BARCODE.CacheEnding'],dependencies:['BARCODE.IntroSequence','BARCODE.CacheSceneLayouts','BARCODE.CacheSceneEffects','BARCODE.ComicDialogue','BARCODE.CacheChapter']});
(function(B) {
  'use strict';
  const root='./';
  const panels=Object.freeze([
    ['delivered','ORIGINAL DELIVERED','Cache stands at the receiving station with the protected original recording.',
      ['CACHE BACK','Original delivered. Names, room noise, all of it.'],['DJ FLOPPYDISC / COMMS','It matches. Nothing missing.']],
    ['unverified','DELIVERED / UNVERIFIED','The receiver acknowledges the transfer, but distribution remains on hold.',
      ['CACHE BACK',"They took the file. Why isn't it going out?"],['MAC MODEM / COMMS','Delivery passed. Distribution says UNVERIFIED.']],
    ['held','THE LABEL HOLDS','Back in the studio, DJ and Mac compare the preserved traces. Cache remains connected from the receiver.',
      ['DJ FLOPPYDISC / COMMS','The original arrived. The distribution hold is still there.'],['CACHE BACK / COMMS',"Then being delivered isn't enough. They're stopping it here."]],
    ['street-access','STREET ACCESS','Elsewhere, Mac reaches the street-access gate. The crew remains connected over comms.',
      ['MAC MODEM / COMMS',"The hold points to street enforcement. I'll find a way through."],['6 BIT / COMMS','Cache got it here. Mac, get it heard.']]
  ].map(([slug,title,visual,...lines],i)=>Object.freeze({title,visual,
    asset:`assets/cache-ending/ending-${String(i+1).padStart(2,'0')}-${slug}.webp`,
    lines:Object.freeze(lines.map(Object.freeze))})));
  const cues=Object.freeze([{kind:'title',holdMs:800},{kind:'dialogue',line:0,holdMs:4000},
    {kind:'dialogue',line:1,holdMs:Infinity}].map(Object.freeze));
  const sounds=Object.freeze({'0:0':'relay','2:0':'tape'});
  const {ink,paper,mint,pink}=B.IntroSequence.format.palette,gold=pink;
  const frame=B.IntroSequence.format.frame;
  // Measured source-image centers and safe widths inside scene 2's painted screens.
  const screenLabels=Object.freeze([
    Object.freeze({text:'DELIVERED',x:363,y:336,width:250,font:28,color:'#b5fbd7',tilt:.15}),
    Object.freeze({text:'UNVERIFIED',x:721,y:384,width:175,font:20,color:'#ffe0a0',tilt:.14})
  ]);
  const bounds=B.IntroSequence.controls;
  const finite=(value,max)=>Number.isFinite(value)?Math.max(0,Math.min(max,Math.trunc(value))):0;
  const paused=()=>!!(window.isPaused||window.gameState?.paused);
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
  const ending=B.CacheEnding={
    panels,cues,frame,bounds,screenLabels,active:false,page:0,cue:0,done:false,cueElapsedMs:0,sceneElapsedMs:0,skipMs:0,
    generation:0,images:[],heldKeys:new Set(),skipHolds:new Map(),padBlocked:new Set(),
    padNeedsRelease:true,transcriptOpen:false,transcriptElement:null,
    normalize(saved) {
      if(!saved||typeof saved!=='object'||Array.isArray(saved)||saved.version!==1)
        return {version:1,page:0,cue:0,done:false};
      return {version:1,page:finite(saved.page,3),cue:finite(saved.cue,2),done:saved.done===true};
    },
    serialize(){return {version:1,page:this.page,cue:this.cue,done:this.done};},
    transcript(page=this.page) {
      const panel=panels[finite(page,3)];
      return `${panel.title}. ${panel.visual} ${panel.lines.map(line=>line.join(': ')).join(' ')}`;
    },
    syncTranscript() {
      if(this.transcriptElement)this.transcriptElement.textContent=this.transcriptOpen?this.transcript():
        `${panels[this.page].title}. ${this.cue?panels[this.page].lines.slice(0,this.cue).map(line=>line.join(': ')).join(' '):panels[this.page].visual}`;
    },
    start(saved) {
      if(this.active)return true;
      const road=B.CacheRoadProof;
      if(!road?.active||road.status!=='clear'||!road.chapter?.delivery)return false;
      const state=this.normalize(saved);this.generation++;this.active=true;
      this.page=state.page;this.cue=state.cue;this.done=state.done;this.cueElapsedMs=0;this.sceneElapsedMs=0;this.transcriptOpen=false;
      this.releaseInputs();
      this.heldKeys=new Set(window.inputManager?.resultKeysHeld||[]);
      for(const [key,held] of Object.entries(window.inputManager?.keys||{}))if(held)this.heldKeys.add(key);
      window.inputManager?.resetActionEdges?.();
      window.audioSystem?.stopRuntimeAudio?.({stopMusic:true});window.audioSystem?.stopRoadEngine?.();
      this.loadImages();
      if(document.createElement&&document.body?.appendChild) {
        this.transcriptElement=document.createElement('div');
        this.transcriptElement.id='cacheEndingTranscript';
        this.transcriptElement.setAttribute('aria-live','polite');
        this.transcriptElement.setAttribute('aria-label','Cache delivery ending transcript');
        this.transcriptElement.style.cssText='position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);';
        document.body.appendChild(this.transcriptElement);
      }
      this.syncTranscript();this.save();
      // Restoring any reading position is silent, including a saved title.
      if(!saved)this.playCue();return true;
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
    save() {
      const road=B.CacheRoadProof;
      if(!road?.chapter?.delivery)return false;
      road.chapter.delivery.ending=this.serialize();
      return B.CacheChapter?.persist?.(road)===true;
    },
    playCue(){const name=sounds[`${this.page}:${this.cue}`];if(name)window.audioSystem?.playCacheBridgeCue?.(name);},
    setCue(page,cue) {
      window.audioSystem?.stopCacheBridgeAudio?.();
      const nextPage=finite(page,3);if(nextPage!==this.page)this.sceneElapsedMs=0;
      this.page=nextPage;this.cue=finite(cue,2);this.cueElapsedMs=0;
      this.syncTranscript();this.save();this.playCue();
    },
    update(delta) {
      if(!this.active||paused())return;
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
      if(!this.active||paused()||this.skipHolds.size)return false;
      if(this.transcriptOpen){this.toggleTranscript();return true;}
      if(!scene){if(this.cue<2)this.setCue(this.page,this.cue+1);return true;}
      if(this.cue<2)return false;
      if(this.page<3)this.setCue(this.page+1,0);
      else return this.finish();
      return true;
    },
    skipToReady() {
      if(!this.active)return false;
      this.skipHolds.clear();this.skipMs=0;this.transcriptOpen=false;
      this.padBlocked.add('b1');this.padBlocked.add('b5');this.setCue(3,2);return true;
    },
    holdSkip(source,held) {
      if(held){if(!this.skipHolds.has(source))this.skipHolds.set(source,0);}
      else this.skipHolds.delete(source);
      this.skipMs=this.skipHolds.size?Math.max(...this.skipHolds.values()):0;
    },
    toggleTranscript() {
      if(!this.active)return false;
      this.transcriptOpen=!this.transcriptOpen;this.skipHolds.clear();this.skipMs=0;
      window.audioSystem?.stopCacheBridgeAudio?.();this.syncTranscript();return true;
    },
    back() {
      if(!this.active)return false;
      this.save();this.dispose();B.CacheRoadProof?.armResultControls?.();return true;
    },
    finish() {
      if(!this.active||paused()||this.page!==3||this.cue!==2)return false;
      this.done=true;this.save();this.dispose();B.CacheRoadProof?.armResultControls?.();return true;
    },
    keyDown(event) {
      if(!this.active)return false;
      event.preventDefault?.();const key=event.key.toLowerCase();
      const held=this.heldKeys.has(key);this.heldKeys.add(key);
      if(event.repeat||held)return true;
      if(paused()){if(key==='p'){this.releaseInputs();this.heldKeys.add(key);B.RuntimeLifecycle?.togglePause?.();}return true;}
      if(key==='escape')this.back();
      else if(key==='p'){this.releaseInputs();this.heldKeys.add(key);B.RuntimeLifecycle?.togglePause?.();}
      else if(key==='s')this.holdSkip('keyboard',true);
      else if(key==='t')this.toggleTranscript();
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
      if(paused()){if(pressed.b9&&!this.padBlocked.has('b9')){this.releaseInputs();B.RuntimeLifecycle?.togglePause?.();}return true;}
      this.holdSkip('gamepad',!!held.b1&&!this.padBlocked.has('b1'));
      const edge=key=>!!pressed[key]&&!this.padBlocked.has(key);
      if(edge('b9')){this.releaseInputs();B.RuntimeLifecycle?.togglePause?.();}
      else if(edge('b8'))this.back();
      else if(edge('b2'))this.toggleTranscript();
      else if(edge('b0'))this.advance();
      else if(edge('b5'))this.advance({scene:true});
      return true;
    },
    pointer(event) {
      if(!this.active)return false;
      const rect=document.getElementById('gameCanvas')?.getBoundingClientRect?.();
      if(!rect?.width||!rect?.height)return true;
      const x=(event.clientX-rect.left)*1920/rect.width,y=(event.clientY-rect.top)*1080/rect.height;
      const hit=name=>{const [bx,by,w,h]=bounds[name];return x>=bx&&x<=bx+w&&y>=by&&y<=by+h;};
      if(paused()){if(hit('pause')){this.releaseInputs();B.RuntimeLifecycle?.togglePause?.();}return true;}
      if(hit('dialogue'))this.advance();else if(hit('scene'))this.advance({scene:true});
      else if(hit('transcript'))this.toggleTranscript();
      else if(hit('pause')){this.releaseInputs();B.RuntimeLifecycle?.togglePause?.();}
      return true;
    },
    releaseInputs(){this.heldKeys.clear();this.skipHolds.clear();this.skipMs=0;this.padNeedsRelease=true;},
    dispose({reset=false}={}) {
      this.active=false;this.generation++;this.releaseInputs();this.transcriptOpen=false;
      window.audioSystem?.stopCacheBridgeAudio?.();
      for(const item of this.images)if(item.element){item.element.onload=null;item.element.onerror=null;
        if(item.status==='loading')item.element.src='';}
      this.images=[];this.transcriptElement?.remove?.();this.transcriptElement=null;
      if(reset){this.page=0;this.cue=0;this.done=false;this.cueElapsedMs=0;this.sceneElapsedMs=0;}
    },
    imageRect() {
      const image=this.images[this.page],source=image?.status==='ready'?image.element:null;
      const sw=source?.naturalWidth||source?.width,sh=source?.naturalHeight||source?.height;
      if(!sw||!sh)return null;
      const scale=Math.min(frame.w/sw,frame.h/sh),w=sw*scale,h=sh*scale;
      const rect={x:frame.x+(frame.w-w)/2,y:frame.y+(frame.h-h)/2,w,h};
      const reduced=B.Preferences?.values?.reducedMotion||B.Preferences?.values?.flashes===false;
      return B.CacheSceneEffects.pose({chapter:'ending',page:this.page,rect,
        sceneElapsedMs:this.sceneElapsedMs,reduced});
    },
    dialogueLayouts(ctx) {
      const rect=this.imageRect();
      const placements=rect?B.CacheSceneLayouts.ending[this.page].placements:
        [{x:64,y:808,w:856,radio:true},{x:996,y:808,w:856,radio:true}];
      return B.ComicDialogue.layouts(ctx,panels[this.page].lines,placements,rect);
    },
    draw(ctx) {
      if(!ctx||!this.active)return;
      const panel=panels[this.page],reduced=B.Preferences?.values?.reducedMotion||B.Preferences?.values?.flashes===false;
      const pad=B.GamepadUI?.connected,button=index=>B.ControllerSettings?.button(index)||['A','B','X','Y'][index]||(index===9?'Menu':'View');
      ctx.save();ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.filter='none';
      ctx.fillStyle=ink;ctx.fillRect(0,0,1920,1080);
      B.IntroSequence.drawHeader(ctx,{title:panel.title,channel:'SYSTEM OVERRIDE / DELIVERY CHANNEL',index:this.page,count:4});
      const image=this.images[this.page],source=image?.status==='ready'?image.element:null;
      const rect=this.imageRect();
      ctx.fillStyle='#152235';ctx.fillRect(frame.x,frame.y,frame.w,frame.h);
      if(rect) {
        ctx.drawImage(source,rect.x,rect.y,rect.w,rect.h);
        if(!this.transcriptOpen)B.CacheSceneEffects.draw(ctx,{chapter:'ending',page:this.page,rect,
          sceneElapsedMs:this.sceneElapsedMs,cue:this.cue,cueElapsedMs:this.cueElapsedMs,reduced});
        if(this.page===1&&!this.transcriptOpen)for(const label of screenLabels) {
          ctx.save();ctx.translate(rect.x,rect.y);ctx.scale(rect.w/1860,rect.h/845);
          ctx.translate(label.x,label.y);ctx.transform(1,label.tilt,-.02,1,0,0);
          ctx.fillStyle=label.color;ctx.font=`bold ${label.font}px Oxanium, sans-serif`;
          ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor=label.color;ctx.shadowBlur=3;
          ctx.fillText(label.text,0,0,label.width);ctx.restore();
        }
      } else {
        text(ctx,image?.status==='unavailable'?'PICTURE UNAVAILABLE / DELIVERY CHANNEL OPEN':'TUNING THE PICTURE...',250,345,28,mint,true);
        ctx.font='26px monospace';wrap(ctx,panel.visual,1390).forEach((line,i)=>text(ctx,line,250,404+i*36,26));
      }
      B.IntroSequence.drawFrame(ctx);
      if(!this.transcriptOpen)B.ComicDialogue.draw(ctx,this.dialogueLayouts(ctx),
        {cue:this.cue,cueElapsedMs:this.cueElapsedMs,reduced});
      if(this.transcriptOpen)B.IntroSequence.drawTranscript(ctx,{...panel,index:this.page,count:panels.length,pad});
      B.IntroSequence.drawControls(ctx,{complete:this.cue===2,
        finalLabel:this.page===3?'FINISH CHAPTER':'Next scene',pad,
        holding:this.skipHolds.size>0,skipProgress:this.skipMs/5000,
        transcriptOpen:this.transcriptOpen,pending:this.pending,paused:paused()});
      const archive=B.Campaign?.archive?.(),earned=archive?.record?.progress?.items?.includes('stem.bass');
      if(earned)text(ctx,'BASS RECOVERED',178,986,16,gold,true);
      const saved=B.CacheChapter?.saveStatus?.(B.CacheRoadProof);
      text(ctx,saved==='saved'?'PROGRESS SAVED':'SAVE UNAVAILABLE / KEEP THIS SESSION OPEN',earned?385:178,986,16,saved==='saved'?mint:'#ffb281');
      if(this.page===3&&this.cue===2)text(ctx,"Mac's chapter is next.",1326,986,18,paper,true);
      ctx.restore();
    }
  };
})(window.BARCODE=window.BARCODE||{});
