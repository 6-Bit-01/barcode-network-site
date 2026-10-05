// Retained scenery rendering. The game's existing loop calls prepare and render.
// Pixi owns only this graphics surface, never a ticker, controls or audio.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/engine/cache-road-gpu-renderer.js',
  exports:['BARCODE.CacheRoadGPU'],dependencies:['BARCODE.CacheRoadGPUContext','BARCODE.CacheRoadTextureBank']});
(function () {
  'use strict';
  const B=window.BARCODE=window.BARCODE||{};
  // This GPU residency limit is separate from the existing PA 32MP derivative
  // limit. It includes all original-source mip levels and color work targets.
  const WIDTH=1920,HEIGHT=1080,TEXEL_CAP=256*1024*1024,MAX_COMMANDS=4096,MAX_STOPS=16;
  const WORLD_SAMPLERS=8,WORLD_FLOATS=29,WORLD_MAX_VERTICES=32768;
  const IDENTITY={a:1,b:0,c:0,d:1,e:0,f:0};
  const blendModes={'source-over':'normal',screen:'screen',lighter:'add',multiply:'multiply'};
  const state={status:'waiting',renderer:null,canvas:null,stage:null,initializing:null,
    sources:new Map(),text:new Map(),pendingSources:new Map(),pendingText:new Map(),sceneStages:new Map(),renderTick:0,
    demands:new Map(),pools:new Map(),clipGroups:new Map(),texels:0,tick:0,frames:0,uploads:0,evictions:0,
    sourceInfo:new Map(),decodes:new Map(),optionalSources:new Map(),optionalUploadFailed:new Set(),
    optionalNotReady:0,optionalStatus:null,prefetchUploads:0,warmupResult:null,warmupGeneration:0,textureBankSession:null,
    fallback:null,error:null,gradientProgram:null,hueProgram:null,disposed:false,
    worldProgram:null,worldBatches:new Map(),worldCompiler:{enabled:false,reason:'not-initialized'},
    targetTexels:0,targetSamples:1,rearTarget:null,rearViewport:null,
    rearStage:null,rearSprite:null,pendingRearViewport:null,
    layerNativeCanvas:null,layerNativeStyles:null,layerVisible:false,layerFrameContext:null,
    frameFailed:false,pendingForward:null,pendingRear:null,nativeFallbackDepth:0,
    finalStage:null,rearGlass:null,rearBlurTarget:null,rearBlurStage:null,rearBlurMesh:null,
    rearDisplayMesh:null,blurProgram:null,pendingDirectRear:false,directFrames:0,
    copiesByKind:{forward:0,rear:0},
    framesByKind:{forward:0,rear:0},groupsByKind:{}};

  function dimensions(image){return [image?.naturalWidth||image?.width||0,image?.naturalHeight||image?.height||0];}
  function mipTexels(width,height){let count=0;for(;;){count+=width*height;if(width===1&&height===1)return count;
    width=Math.max(1,width>>1);height=Math.max(1,height>>1);}}
  function imageCost(image){const [w,h]=dimensions(image);return w>0&&h>0?mipTexels(w,h):Infinity;}
  function finite(values){return values.every(Number.isFinite);}
  function transformPoint(m,x,y){return [m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f];}
  function inverse(m){const determinant=m.a*m.d-m.b*m.c;if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-12)return null;
    return new Float32Array([m.d/determinant,-m.b/determinant,0,-m.c/determinant,m.a/determinant,0,
      (m.c*m.f-m.d*m.e)/determinant,(m.b*m.e-m.a*m.f)/determinant,1]);}
  const colorCache=new Map();
  function rgba(value){
    if(typeof value!=='string')throw Error('Unsupported GPU color');
    if(colorCache.has(value))return colorCache.get(value);
    let color;const hex=value.trim().match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
    if(hex){let s=hex[1];if(s.length<5)s=s.split('').map(c=>c+c).join('');
      color=[parseInt(s.slice(0,2),16)/255,parseInt(s.slice(2,4),16)/255,
        parseInt(s.slice(4,6),16)/255,s.length===8?parseInt(s.slice(6,8),16)/255:1];
    }else{const rgb=value.trim().match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
      if(rgb)color=[Number(rgb[1])/255,Number(rgb[2])/255,Number(rgb[3])/255,rgb[4]===undefined?1:Number(rgb[4])];
      else if(value==='transparent')color=[0,0,0,0];else{const c=new window.PIXI.Color(value);color=Array.from(c.toArray());}}
    if(!finite(color))throw Error('Invalid GPU color');color=color.map(v=>Math.max(0,Math.min(1,v)));
    if(colorCache.size<512)colorCache.set(value,color);return color;
  }
  function colorStyle(value){const c=rgba(value);return {color:(Math.round(c[0]*255)<<16)|(Math.round(c[1]*255)<<8)|Math.round(c[2]*255),alpha:c[3]};}
  function fallback(reason){state.fallback=reason;if(state.layerFrameContext)state.frameFailed=true;return false;}
  function supportedContext(ctx){return ctx&&ctx.canvas&&ctx.canvas.width===WIDTH&&ctx.canvas.height===HEIGHT;}
  function hide(){
    if(state.pendingForward||state.pendingRear)state.frameFailed=true;
    state.pendingForward=null;state.pendingRear=null;state.layerVisible=false;
    if(state.canvas?.style){state.canvas.style.display='none';state.canvas.style.visibility='hidden';}
    const native=state.layerNativeCanvas,styles=state.layerNativeStyles;
    if(native&&styles){
      native.style.background=styles.background;native.style.backgroundColor=styles.backgroundColor;
      native.style.zIndex=styles.zIndex;
      if(!styles.hadActiveClass)native.classList?.remove('cache-road-gpu-active');
    }
  }
  function beginFrame(ctx){
    state.pendingForward=null;state.pendingRear=null;state.frameFailed=false;state.layerFrameContext=null;
    const native=ctx?.canvas;
    if(state.nativeFallbackDepth||state.status!=='ready'||!supportedContext(ctx)||
      ctx!==window.renderer?.ctx||!document.getElementById?.('standalone-viewport-style')||
      native!==document.getElementById?.('gameCanvas')||!native.parentNode||!state.canvas){hide();return false;}
    if(state.layerNativeCanvas!==native){
      hide();state.layerNativeCanvas=native;
      state.layerNativeStyles={background:native.style.background,backgroundColor:native.style.backgroundColor,
        zIndex:native.style.zIndex,hadActiveClass:!!native.classList?.contains('cache-road-gpu-active')};
    }
    state.canvas.id='cacheRoadGpuCanvas';state.canvas.setAttribute?.('aria-hidden','true');
    state.canvas.style.pointerEvents='none';state.canvas.style.zIndex='0';
    if(state.canvas.parentNode!==native.parentNode)native.parentNode.insertBefore(state.canvas,native);
    state.layerFrameContext=ctx;return true;
  }
  function showLayer(){
    const native=state.layerNativeCanvas;
    native.style.background='transparent';native.style.backgroundColor='transparent';native.style.zIndex='1';
    native.classList?.add('cache-road-gpu-active');
    state.canvas.style.display='block';state.canvas.style.visibility='visible';state.layerVisible=true;
  }
  function withNativeFallback(callback){
    hide();state.frameFailed=false;state.layerFrameContext=null;state.nativeFallbackDepth++;
    try{return callback();}finally{state.nativeFallbackDepth--;}
  }
  function snapshotTo(snapshotContext,nativeCanvas){
    if(!state.layerVisible||state.status!=='ready'||nativeCanvas!==state.layerNativeCanvas)return false;
    snapshotContext.save();
    try{
      snapshotContext.setTransform(1,0,0,1,0,0);snapshotContext.globalAlpha=1;
      snapshotContext.globalCompositeOperation='copy';snapshotContext.filter='none';
      snapshotContext.drawImage(state.canvas,0,0);
      snapshotContext.globalCompositeOperation='source-over';snapshotContext.drawImage(nativeCanvas,0,0);
    }finally{snapshotContext.restore();}
    return true;
  }
  function descriptorsFor(descriptors){
    const images=new Map(),notReady=[];
    for(const descriptor of descriptors||[]){
      const image=descriptor?.image;if(!image)continue;
      const key=typeof descriptor.key==='string'?descriptor.key:'unlabelled';
      // Only local asset paths are diagnostic data; never expose signed or
      // remote source URLs from another host's presentation-asset descriptors.
      const path=typeof descriptor.path==='string'&&/^assets\//.test(descriptor.path)?descriptor.path:null;
      state.sourceInfo.set(image,{key,path});
      const cost=imageCost(image);
      if(image.complete===false||!Number.isFinite(cost))notReady.push(key);
      else images.set(image,cost);
    }
    return {images,notReady};
  }
  function decodeImage(image){
    const prior=state.decodes.get(image);if(prior)return prior;
    const decoded={status:'ready',promise:Promise.resolve()};state.decodes.set(image,decoded);
    if(typeof image.decode!=='function')return decoded;
    decoded.status='pending';
    try{
      // Decoding is asynchronous. Its settlement only records readiness;
      // the existing prepare/warmup owners perform every actual GL upload.
      decoded.promise=Promise.resolve(image.decode()).then(()=>{
        if(!state.disposed)decoded.status='ready';
      },()=>{if(!state.disposed)decoded.status='failed';});
    }catch(_){decoded.status='failed';}
    return decoded;
  }
  function labelFor(image){return state.sourceInfo.get(image)?.key||'unlabelled';}
  function fontDescriptor(font){const match=String(font).match(/^(.*?)\s*(\d+(?:\.\d+)?)px\s+(.+)$/);
    if(!match)throw Error('Unsupported GPU font');const prefix=match[1].trim();
    return {size:Number(match[2]),prefix,family:match[3],baseFont:(prefix?prefix+' ':'')+'64px '+match[3]};}
  // Moving parking signs change apparent size every frame. Like bitmap text
  // in game engines, retain one high-resolution white glyph and scale/tint it.
  function textKey(command){return JSON.stringify([command.text,fontDescriptor(command.font).baseFont]);}

  // All raster source creation and GPU uploads happen in prepare, outside draw.
  function release(entry){
    if(entry.text){state.renderer.canvasText.returnTexture(entry.texture);entry.texture.source.unload();}
    else entry.texture.destroy(true);
    state.texels-=entry.cost;state.evictions++;
  }
  function makeRoom(cost,protectedImages,protectedText){
    const candidates=[];
    for(const [image,entry]of state.sources)if(!protectedImages.has(image))candidates.push({image,entry});
    for(const [key,entry]of state.text)if(!protectedText.has(key))candidates.push({key,entry});
    candidates.sort((a,b)=>a.entry.used-b.entry.used);
    for(const item of candidates){if(state.texels+cost+state.targetTexels<=TEXEL_CAP)return true;
      release(item.entry);if(item.image)state.sources.delete(item.image);else state.text.delete(item.key);}
    return state.texels+cost+state.targetTexels<=TEXEL_CAP;
  }
  function protectDemand(){const images=new Set(),texts=new Set();
    for(const demand of state.demands.values())if(state.tick-demand.tick<=2){
      for(const image of demand.images)images.add(image);for(const key of demand.texts)texts.add(key);}
    return {images,texts};
  }
  function prepareImage(image,cost){
    const P=window.PIXI,[w,h]=dimensions(image);
    if(image.complete===false||!w||!h)return false;
    const gl=state.renderer.gl;if(w>gl.getParameter(gl.MAX_TEXTURE_SIZE)||h>gl.getParameter(gl.MAX_TEXTURE_SIZE))return false;
    let texture;
    try{const source=new P.ImageSource({resource:image,width:w,height:h,resolution:1,
      scaleMode:'linear',mipmapFilter:'linear',autoGenerateMipmaps:true,
      alphaMode:'premultiply-alpha-on-upload',autoGarbageCollect:false,label:'Cache road original'});
      texture=new P.Texture({source});state.renderer.texture.initSource(source);
      state.sources.set(image,{texture,cost,used:state.tick,width:w,height:h,
        textureWidth:w,textureHeight:h,storageBytes:cost*4,format:'rgba8unorm',compressed:false,
        expectedOriginal:!!state.sourceInfo.get(image)?.expectedOriginal});
      state.texels+=cost;state.uploads++;return true;
    }catch(error){texture?.destroy(true);state.error=String(error?.message||error);return false;}
  }
  function prepareCompressed(image,cost,record){
    const P=window.PIXI,[w,h]=dimensions(image);let texture;
    try{
      if(!P.CompressedSource||record.width<w||record.height<h||!record.resource.length)return false;
      const source=new P.CompressedSource({resource:record.resource,width:record.width,height:record.height,
        resolution:1,format:record.format,alphaMode:'premultiplied-alpha',scaleMode:'linear',
        mipmapFilter:'linear',autoGenerateMipmaps:false,autoGarbageCollect:false,label:'Cache road compressed original'});
      texture=new P.Texture({source});state.renderer.texture.initSource(source);
      state.sources.set(image,{texture,cost,used:state.tick,width:w,height:h,
        textureWidth:record.width,textureHeight:record.height,
        storageBytes:record.resource.reduce((bytes,mip)=>bytes+mip.byteLength,0),format:record.format,compressed:true});
      state.texels+=cost;state.uploads++;return true;
    }catch(error){texture?.destroy(true);state.error=String(error?.message||error);return false;}
  }
  function fontStyle(command){const {prefix,family}=fontDescriptor(command.font);
    return new window.PIXI.TextStyle({fontFamily:family.split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,'')),
      fontSize:64,fontWeight:/\bbold\b/.test(prefix)?'bold':'normal',
      fontStyle:/\bitalic\b/.test(prefix)?'italic':'normal',fill:0xffffff,padding:2,trim:false});
  }
  function prepareText(key,command,ctx,protectedImages,protectedText){
    let texture;
    if(document.fonts?.check&&!document.fonts.check(command.font,command.text))return false;
    try{const style=fontStyle(command),measure=window.PIXI.CanvasTextMetrics.measureText(command.text,style);
      const estimate=Math.pow(2,Math.ceil(Math.log2(Math.max(1,measure.width+4))))*
        Math.pow(2,Math.ceil(Math.log2(Math.max(1,measure.height+4))));
      if(!makeRoom(estimate,protectedImages,protectedText))return false;
      texture=state.renderer.canvasText.getTexture({text:command.text,style,resolution:1,autoGenerateMipmaps:false});
      const cost=texture.source.pixelWidth*texture.source.pixelHeight;
      if(!makeRoom(cost,protectedImages,protectedText)){state.renderer.canvasText.returnTexture(texture);texture.source.unload();return false;}
      ctx.save();ctx.font=fontDescriptor(command.font).baseFont;const metrics=ctx.measureText(command.text);ctx.restore();
      state.text.set(key,{texture,cost,used:state.tick,text:true,style,
        width:measure.width,height:measure.height,ascent:measure.fontProperties.ascent,
        descent:measure.fontProperties.descent,nativeWidth:metrics.width});
      state.texels+=cost;state.uploads++;return true;
    }catch(error){if(texture){state.renderer.canvasText.returnTexture(texture);texture.source.unload();}
      state.error=String(error?.message||error);return false;}
  }
  async function initialize(){
    const P=window.PIXI;if(!P?.WebGLRenderer||state.disposed)return;
    state.status='initializing';
    // The renderer is manually driven by the existing game RAF. Pixi's shared
    // and system tickers must never become a second scheduling owner.
    for(const ticker of [P.Ticker.system,P.Ticker.shared]){ticker.autoStart=false;ticker.stop();}
    const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
    state.canvas=canvas;const renderer=new P.WebGLRenderer();state.renderer=renderer;
    // The complete scenery background is opaque. Original RGBA artwork still
    // blends within it; the transparent native Canvas owns foreground/HUD.
    try{await renderer.init({canvas,width:WIDTH,height:HEIGHT,resolution:1,
      antialias:false,useContextAlpha:false,backgroundAlpha:1,clearBeforeRender:true,roundPixels:false,
      preserveDrawingBuffer:true,autoDensity:false,manageImports:false,gcActive:false});
      // This scenery surface never owns pointer input. Pixi's documented null
      // target removes its native event bindings; the game keeps its input owner.
      renderer.events.setTargetElement(null);
      for(const ticker of [P.Ticker.system,P.Ticker.shared]){ticker.autoStart=false;ticker.stop();}
      if(state.disposed){renderer.destroy(false);return;}
      state.stage=new P.Container({eventMode:'none'});
      state.sceneStages.set('forward',state.stage);
      state.finalStage=new P.Container({eventMode:'none'});
      const samples=Math.max(1,renderer.gl.getParameter(renderer.gl.SAMPLES)||1);
      state.targetSamples=samples;state.targetTexels=WIDTH*HEIGHT*(samples>1?samples+1:1);
      state.rearStage=new P.Container({eventMode:'none'});
      initializeWorldCompiler();
      canvas.addEventListener('webglcontextlost',()=>{state.status='lost';state.fallback='context-lost';hide();});
      // Pixi restores its GL systems first; the next ordinary game update then
      // restores resident originals before another scene is allowed to render.
      canvas.addEventListener('webglcontextrestored',()=>{state.status='restoring';state.fallback='restoring-sources';hide();});
      state.status='ready';
    }catch(error){state.error=String(error?.message||error);state.status='unavailable';
      try{renderer.destroy(false);}catch(_){}state.renderer=null;state.canvas=null;state.targetTexels=0;}
  }
  async function warmup(ctx,descriptors,options={}){
    if(!supportedContext(ctx)||state.disposed)return {ready:false,fit:false,status:state.status,reason:'unsupported-context'};
    const generation=++state.warmupGeneration;
    state.textureBankSession?.destroy();state.textureBankSession=null;
    const cancelled=()=>{
      if(state.disposed||generation!==state.warmupGeneration)return true;
      try{return !!options.cancelled?.();}catch(_){return true;}
    };
    const cancelledResult=()=>({ready:false,fit:null,status:state.status,reason:'warmup-cancelled'});
    if(cancelled())return cancelledResult();
    if(state.status==='waiting'&&window.PIXI?.WebGLRenderer&&!state.initializing)state.initializing=initialize();
    if(state.initializing)await state.initializing;
    if(cancelled())return cancelledResult();
    if(state.status!=='ready')return {ready:false,fit:false,status:state.status,reason:'renderer-not-ready'};
    // Warmup is a route handoff: its caller holds gameplay/music advancement
    // until preparation completes. Loading owns the screen during this
    // handoff, so old view demands need not pin the previous route while a
    // retry, replay or checkpoint prepares a different source set.
    // Keep reusable resident textures; ordinary LRU can reclaim old ones.
    state.demands.clear();state.pendingSources.clear();state.pendingText.clear();
    state.optionalSources.clear();state.optionalUploadFailed.clear();
    state.optionalNotReady=0;state.optionalStatus=null;state.warmupResult=null;
    hide();state.frameFailed=false;state.layerFrameContext=null;
    if(options.rearViewport){state.pendingRearViewport={...options.rearViewport};state.pendingDirectRear=true;prepare(ctx);}
    const selected=descriptorsFor(descriptors),protectedDemand=protectDemand(),
      images=new Set([...protectedDemand.images,...selected.images.keys()]),
      textCommands=options.texts||[{text:'P',font:'bold 64px Oxanium'}],texts=new Set(protectedDemand.texts);
    for(const command of textCommands)texts.add(textKey(command));
    let requiredTexels=state.targetTexels;
    for(const image of images)requiredTexels+=imageCost(image);
    for(const key of texts)requiredTexels+=state.text.get(key)?.cost||0;
    const report=(fit,reason)=>{
      if(cancelled())return cancelledResult();
      const missingSources=[...selected.images.keys()].filter(image=>!state.sources.has(image)).map(labelFor),
        missingTexts=textCommands.filter(command=>!state.text.has(textKey(command))).map(command=>command.text),
        decodeFailedSources=[...selected.images.keys()].filter(image=>state.decodes.get(image)?.status==='failed').map(labelFor);
      const ready=fit&&state.status==='ready'&&!state.disposed&&selected.notReady.length===0&&missingSources.length===0&&missingTexts.length===0;
      state.warmupResult={ready,
        fit,status:state.status,reason:reason||(!ready?'source-not-ready':null),requiredTexels,residentBudgetTexels:TEXEL_CAP,
        suppliedSources:selected.images.size+selected.notReady.length,notReadySources:selected.notReady,
        missingSources,missingTexts,decodeFailedSources};
      return {...state.warmupResult};
    };
    if(requiredTexels>TEXEL_CAP)return report(false,'initial-source-set-exceeds-cap');
    // The level-owned decoder prepares compressed originals first. Successful
    // sources retain their full mip buffers for context recovery and never
    // explicitly decode the parallel native fallback image.
    let compressed=new Map(),bankResult=null;
    const absent=(descriptors||[]).filter(descriptor=>selected.images.has(descriptor.image)&&!state.sources.has(descriptor.image));
    if(absent.length&&B.CacheRoadTextureBank&&window.PIXI.CompressedSource){
      const session=B.CacheRoadTextureBank.createSession(state.renderer.gl,{cancelled});
      state.textureBankSession=session;
      try{compressed=await session.prepare(absent);bankResult={...session.result};}
      catch(error){if(cancelled())return cancelledResult();state.error=String(error?.message||error);}
      finally{session.destroy();if(state.textureBankSession===session)state.textureBankSession=null;}
      if(cancelled())return cancelledResult();
      const originals=new Set(bankResult?.expectedOriginal||[]);
      for(const descriptor of absent){
        const info=state.sourceInfo.get(descriptor.image);if(info)info.expectedOriginal=originals.has(descriptor.key);
      }
    }
    // No image decode, texture transcode or GL upload has a new frame owner.
    const preparation=[...selected.images.keys()].filter(image=>!compressed.has(image)&&
      !state.sources.get(image)?.compressed).map(image=>decodeImage(image).promise);
    if(typeof document.fonts?.load==='function')for(const command of textCommands){
      try{preparation.push(document.fonts.load(command.font,command.text));}catch(_){}
    }
    await Promise.allSettled(preparation);
    if(cancelled())return cancelledResult();
    if(state.disposed||state.status!=='ready')return report(true,'renderer-not-ready');
    // Explicit collection belongs to the loading handoff. Active prepare
    // retains bounded originals/objects and never collects during gameplay.
    state.renderer.gc.run();
    for(const command of textCommands){const key=textKey(command);
      if(!state.text.has(key))prepareText(key,command,ctx,images,texts);}
    requiredTexels=state.targetTexels;
    for(const image of images)requiredTexels+=imageCost(image);
    for(const key of texts)requiredTexels+=state.text.get(key)?.cost||0;
    if(requiredTexels>TEXEL_CAP)return report(false,'initial-source-set-exceeds-cap');
    state.demands.set('warmup',{images:new Set(selected.images.keys()),texts,tick:state.tick});
    for(const [image,cost]of selected.images){
      if(state.sources.has(image))continue;
      if(!makeRoom(cost,images,texts))return report(false,'initial-source-set-exceeds-cap');
      const record=compressed.get(image);
      if(record&&prepareCompressed(image,cost,record))continue;
      // A failed or unsupported compressed source retains the original upload
      // path. Decode ownership is still outside active gameplay.
      if(record){await decodeImage(image).promise;if(cancelled())return cancelledResult();}
      prepareImage(image,cost);
    }
    const result=report(true,null);
    if(state.warmupResult&&bankResult){state.warmupResult.textureBank=bankResult;result.textureBank=bankResult;}
    return result;
  }
  function prepare(ctx,descriptors){
    if(!supportedContext(ctx)||state.disposed)return;
    state.tick++;
    if(state.status==='waiting'&&window.PIXI?.WebGLRenderer&&!state.initializing)state.initializing=initialize();
    if(state.status==='restoring'){
      try{
        for(const entry of state.sources.values()){
          entry.texture.source.unload();state.renderer.texture.initSource(entry.texture.source);state.uploads++;}
        // Pixi's text raster canvas is pooled. Regenerate labels from their
        // saved descriptors instead of uploading a canvas reused by another label.
        for(const [key,entry]of state.text){release(entry);state.text.delete(key);}
        if(state.rearTarget){state.rearTarget.source.unload();state.renderer.texture.initSource(state.rearTarget.source);
          state.renderer.renderTarget.getGpuRenderTarget(state.renderer.renderTarget.getRenderTarget(state.rearTarget));}
        if(state.rearBlurTarget){state.rearBlurTarget.source.unload();state.renderer.texture.initSource(state.rearBlurTarget.source);
          state.renderer.renderTarget.getGpuRenderTarget(state.renderer.renderTarget.getRenderTarget(state.rearBlurTarget));}
        initializeWorldCompiler();state.status='ready';state.fallback=null;
      }catch(error){state.error=String(error?.message||error);state.fallback='restoring-sources';return;}
    }
    if(state.status!=='ready')return;
    const protectedDemand=protectDemand();let total=0;
    if(state.pendingRearViewport){const viewport=state.pendingRearViewport,old=state.rearViewport,
      changed=!old||old.width!==viewport.width||old.height!==viewport.height;
      if(changed){const cost=viewport.width*viewport.height*(state.targetSamples>1?state.targetSamples+1:1),
        previous=old?old.width*old.height*(state.targetSamples>1?state.targetSamples+1:1):0;
        if(!makeRoom(Math.max(0,cost-previous),protectedDemand.images,protectedDemand.texts)){
          state.fallback='rear-target-cap';return;}
        state.rearTarget?.destroy(true);state.targetTexels-=previous;
        state.rearTarget=window.PIXI.RenderTexture.create({width:viewport.width,height:viewport.height,
          resolution:1,antialias:false,autoGarbageCollect:false,label:'Cache rear view'});
        state.renderer.texture.initSource(state.rearTarget.source);
        state.renderer.renderTarget.getGpuRenderTarget(state.renderer.renderTarget.getRenderTarget(state.rearTarget));
        state.targetTexels+=cost;
        if(!state.rearSprite){state.rearSprite=new window.PIXI.Sprite(state.rearTarget);state.rearStage.addChild(state.rearSprite);}
        else state.rearSprite.texture=state.rearTarget;
      }
      state.rearViewport={...viewport};state.pendingRearViewport=null;
    }
    if(state.pendingDirectRear&&state.rearViewport&&!prepareRearBlur(state.rearViewport,protectedDemand))return;
    for(const image of protectedDemand.images)total+=imageCost(image);
    // Do not cycle uploads forever if the simultaneous whole-source demand cannot fit.
    if(total+state.targetTexels>TEXEL_CAP){state.fallback='source-demand-exceeds-cap';return;}
    for(const [image,cost]of state.pendingSources){if(state.sources.has(image)){state.pendingSources.delete(image);continue;}
      if(!protectedDemand.images.has(image)){state.pendingSources.delete(image);continue;}
      if(!makeRoom(cost,protectedDemand.images,protectedDemand.texts)){state.fallback='texture-cap';break;}
      const decoded=decodeImage(image);if(decoded.status==='pending')continue;
      if(prepareImage(image,cost))state.pendingSources.delete(image);
    }
    for(const [key,command]of state.pendingText){if(state.text.has(key)){state.pendingText.delete(key);continue;}
      if(!protectedDemand.texts.has(key)){state.pendingText.delete(key);continue;}
      if(prepareText(key,command,ctx,protectedDemand.images,protectedDemand.texts))state.pendingText.delete(key);
    }
    if(Array.isArray(descriptors)){
      const selected=descriptorsFor(descriptors);state.optionalSources=selected.images;state.optionalNotReady=selected.notReady.length;
      for(const image of state.optionalUploadFailed)if(!state.optionalSources.has(image))state.optionalUploadFailed.delete(image);
    }
    // Keep currently requested resident lookahead images while preparing
    // others. An over-budget lookahead cannot churn textures or invalidate
    // the actual forward/rear demand. Dropped route images remain ordinary LRU.
    const optionalProtected=new Set([...protectedDemand.images,...state.optionalSources.keys()]);
    let uploads=0,decodes=0;state.optionalStatus=null;
    for(const [image,cost]of state.optionalSources){
      if(state.sources.has(image)||state.optionalUploadFailed.has(image))continue;
      let decoded=state.decodes.get(image);
      if(!decoded){if(decodes>=2)continue;decoded=decodeImage(image);decodes++;}
      if(decoded.status==='pending')continue;
      if(uploads>=2)continue;
      if(!makeRoom(cost,optionalProtected,protectedDemand.texts)){state.optionalStatus='budget-limited';continue;}
      uploads++;
      if(prepareImage(image,cost))state.prefetchUploads++;
      else{state.optionalUploadFailed.add(image);state.optionalStatus='upload-unavailable';}
    }
  }
  function begin(ctx,options={}){
    if(state.nativeFallbackDepth||state.status!=='ready'||!supportedContext(ctx)||!B.CacheRoadGPUContext)return null;
    return new B.CacheRoadGPUContext(ctx,options);
  }

  function geometry(){return new window.PIXI.MeshGeometry({positions:new Float32Array(8),
    uvs:new Float32Array(8),indices:new Uint32Array([0,1,2,0,2,3])});}
  function poolFor(kind){let pool=state.pools.get(kind);if(!pool){pool=[];state.pools.set(kind,pool);}return pool;}
  function groupsFor(kind){let groups=state.clipGroups.get(kind);if(!groups){groups=[];state.clipGroups.set(kind,groups);}return groups;}
  function stageFor(kind){let stage=state.sceneStages.get(kind);if(!stage){
    stage=new window.PIXI.Container({eventMode:'none'});state.sceneStages.set(kind,stage);}return stage;}
  function sameClips(a,b){return a&&a.length===b.length&&a.every((clip,index)=>clip===b[index]);}
  function placeChild(parent,child,index){
    if(child.parent!==parent)parent.addChildAt(child,Math.min(index,parent.children.length));
    else if(parent.children[index]!==child)parent.setChildIndex(child,index);
  }
  function visibility(object,visible){if(object&&object.visible!==visible)object.visible=visible;}
  function slot(pool,index){
    if(pool[index])return pool[index];const P=window.PIXI;
    const root=new P.Container({eventMode:'none'}),content=new P.Container({eventMode:'none'});
    root.addChild(content);const item={root,content,clips:[],image:null,hueImage:null,graphics:null,gradient:null,gradientMask:null};
    pool[index]=item;return item;
  }
  function ensureImage(item){if(!item.image){item.image=new window.PIXI.Mesh({geometry:geometry(),texture:window.PIXI.Texture.EMPTY});
    item.content.addChild(item.image);}return item.image;}
  function meshBuffers(mesh){
    if(mesh.cacheRoadBuffers)return mesh.cacheRoadBuffers;
    const positions=new Float32Array(16),uvs=new Float32Array(16),indices=new Uint32Array(18),
      positionViews=[],uvViews=[],indexViews=[];
    for(let i=0;i<6;i++)indices.set([0,i+1,i+2],i*3);
    for(let count=3;count<=8;count++){positionViews[count]=positions.subarray(0,count*2);
      uvViews[count]=uvs.subarray(0,count*2);indexViews[count]=indices.subarray(0,(count-2)*3);}
    return mesh.cacheRoadBuffers={positions,uvs,positionViews,uvViews,indexViews};
  }
  function updateMesh(mesh,count,positions,uvs,interleaved=false){const buffers=meshBuffers(mesh);
    if(interleaved){for(let i=0;i<count;i++){buffers.positions[i*2]=positions[i*4];buffers.positions[i*2+1]=positions[i*4+1];
      buffers.uvs[i*2]=positions[i*4+2];buffers.uvs[i*2+1]=positions[i*4+3];}}
    else{buffers.positions.set(positions);buffers.uvs.set(uvs);}
    // The same small buffers and views cover triangles through octagons.
    // Reset fan count when a pooled image returns from a clip to a plain quad.
    mesh.geometry.positions=buffers.positionViews[count];mesh.geometry.uvs=buffers.uvViews[count];
    mesh.geometry.indices=buffers.indexViews[count];
    mesh.geometry.getBuffer('aPosition').update();mesh.geometry.getBuffer('aUV').update();mesh.geometry.indexBuffer.update();
  }
  function updateQuad(mesh,positions,uvs){updateMesh(mesh,4,positions,uvs);}
  function showContents(item,kind){visibility(item.image,kind==='image');visibility(item.hueImage,kind==='hueImage');
    visibility(item.graphics,kind==='graphics');visibility(item.gradient,kind==='gradient');
    visibility(item.gradientMask,kind==='gradient'&&item.gradientUsesMask!==false);}
  function drawPaths(graphics,paths){graphics.clear();
    for(const path of paths){const p=path.points;if(p.length<4)continue;
      graphics.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)graphics.lineTo(p[i],p[i+1]);
      if(path.closed)graphics.closePath();}
  }
  function area(points){let value=0;for(let i=0,j=points.length-2;i<points.length;j=i,i+=2)
    value+=points[j]*points[i+1]-points[i]*points[j+1];return value/2;}
  function contains(points,x,y){let inside=false;for(let i=0,j=points.length-2;i<points.length;j=i,i+=2){
    const xi=points[i],yi=points[i+1],xj=points[j],yj=points[j+1];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
  function fillPaths(graphics,paths,rule,style){
    graphics.clear();const contours=paths.filter(p=>p.points.length>=6).map(path=>({path,area:area(path.points)}));
    contours.sort((a,b)=>Math.abs(b.area)-Math.abs(a.area));
    const prior=[];
    for(const contour of contours){const p=contour.path.points,parents=prior.filter(parent=>contains(parent.path.points,p[0],p[1]));
      const winding=parents.reduce((sum,parent)=>sum+Math.sign(parent.area),0),
        hole=rule==='evenodd'?parents.length%2===1:winding!==0&&winding+Math.sign(contour.area)===0;
      graphics.poly(p,true);if(hole)graphics.cut();else graphics.fill(style);prior.push(contour);}
  }
  function resetGraphicTransform(graphics){graphics.setFromMatrix(new window.PIXI.Matrix());}
  function strokePaths(graphics,command,style){
    const P=window.PIXI,m=command.strokeTransform;
    drawPaths(graphics,command.strokePaths||command.paths);
    if(m&&command.strokePaths)graphics.setFromMatrix(new P.Matrix(m.a,m.b,m.c,m.d,m.e,m.f));
    else resetGraphicTransform(graphics);
    graphics.stroke({...style,width:command.strokePaths?command.nativeLineWidth:command.lineWidth,
      cap:command.lineCap,join:command.lineJoin,miterLimit:command.miterLimit});
  }
  function configureClips(item,clips){let parent=item.root;
    for(let i=0;i<clips.length;i++){let pair=item.clips[i];if(!pair){pair={container:new window.PIXI.Container({eventMode:'none'}),
      graphics:new window.PIXI.Graphics({eventMode:'none'})};item.clips[i]=pair;}
      if(pair.container.parent!==parent)parent.addChild(pair.container);
      if(pair.graphics.parent!==parent)parent.addChild(pair.graphics);
      fillPaths(pair.graphics,clips[i].paths,clips[i].rule,{color:0xffffff});visibility(pair.graphics,true);
      visibility(pair.container,true);if(pair.container.mask!==pair.graphics)pair.container.mask=pair.graphics;parent=pair.container;
    }
    if(item.content.parent!==parent)parent.addChild(item.content);
    for(let i=clips.length;i<item.clips.length;i++){visibility(item.clips[i].container,false);visibility(item.clips[i].graphics,false);}
  }
  function imageQuad(command,entry){let [sx,sy,sw,sh]=command.source,[dx,dy,dw,dh]=command.dest;
    if(!finite([sx,sy,sw,sh,dx,dy,dw,dh])||sw===0||sh===0||dw===0||dh===0)return null;
    if(sw<0){sx+=sw;sw=-sw;}if(sh<0){sy+=sh;sh=-sh;}if(dw<0){dx+=dw;dw=-dw;}if(dh<0){dy+=dh;dh=-dh;}
    const x0=Math.max(0,sx),y0=Math.max(0,sy),x1=Math.min(entry.width,sx+sw),y1=Math.min(entry.height,sy+sh);
    if(x1<=x0||y1<=y0)return null;
    const left=dx+(x0-sx)*dw/sw,top=dy+(y0-sy)*dh/sh,right=dx+(x1-sx)*dw/sw,bottom=dy+(y1-sy)*dh/sh;
    const m=command.transform||IDENTITY;
    return {positions:[...transformPoint(m,left,top),...transformPoint(m,right,top),
      ...transformPoint(m,right,bottom),...transformPoint(m,left,bottom)],
      uvs:[x0/(entry.textureWidth||entry.width),y0/(entry.textureHeight||entry.height),
        x1/(entry.textureWidth||entry.width),y0/(entry.textureHeight||entry.height),
        x1/(entry.textureWidth||entry.width),y1/(entry.textureHeight||entry.height),
        x0/(entry.textureWidth||entry.width),y1/(entry.textureHeight||entry.height)]};
  }
  function soleClipAreaPath(clip){
    if(!clip||clip.rule!=='nonzero')return null;let selected=null;
    for(const path of clip.paths){const p=path.points;if(!finite(p))return null;
      // Canvas closePath/rect keep a point-only current subpath. Point and
      // collinear line subpaths have no filled area and do not add a mask.
      let second=-1;for(let i=2;i<p.length;i+=2)if(p[i]!==p[0]||p[i+1]!==p[1]){second=i;break;}
      if(second<0)continue;const dx=p[second]-p[0],dy=p[second+1]-p[1];let hasArea=false;
      for(let i=2;i<p.length;i+=2)if(dx*(p[i+1]-p[1])-dy*(p[i]-p[0])!==0){hasArea=true;break;}
      if(!hasArea)continue;if(selected)return null;selected=path;
    }
    return selected;
  }
  function convexClipOrientation(clip){
    const path=soleClipAreaPath(clip);if(!path)return 0;
    const p=path.points;if(!path.closed||(p.length!==6&&p.length!==8))return 0;
    const count=p.length/2;let sign=0;
    for(let i=0;i<count;i++){const j=(i+1)%count,k=(i+2)%count,
      cross=(p[j*2]-p[i*2])*(p[k*2+1]-p[j*2+1])-(p[j*2+1]-p[i*2+1])*(p[k*2]-p[j*2]);
      if(!Number.isFinite(cross)||cross===0)return 0;
      const current=Math.sign(cross);if(sign&&current!==sign)return 0;sign=current;}
    return sign;
  }
  function clipImageQuad(quad,clip,scratch){
    const orientation=convexClipOrientation(clip);if(!orientation)return -1;
    let input=scratch.a,output=scratch.b,count=4;
    for(let i=0;i<4;i++){input[i*4]=quad.positions[i*2];input[i*4+1]=quad.positions[i*2+1];
      input[i*4+2]=quad.uvs[i*2];input[i*4+3]=quad.uvs[i*2+1];}
    const p=soleClipAreaPath(clip).points,edges=p.length/2;
    for(let edge=0;edge<edges;edge++){
      if(!count){scratch.result=input;return 0;}
      const next=(edge+1)%edges,ax=p[edge*2],ay=p[edge*2+1],dx=p[next*2]-ax,dy=p[next*2+1]-ay;
      let length=0;
      const emit=(x,y,u,v)=>{if(length&&output[(length-1)*4]===x&&output[(length-1)*4+1]===y)return true;
        if(length>=8)return false;const offset=length++*4;output[offset]=x;output[offset+1]=y;output[offset+2]=u;output[offset+3]=v;return true;};
      let previous=(count-1)*4,previousDistance=orientation*(dx*(input[previous+1]-ay)-dy*(input[previous]-ax));
      for(let i=0;i<count;i++){
        const current=i*4,distance=orientation*(dx*(input[current+1]-ay)-dy*(input[current]-ax)),
          inside=distance>=0,previousInside=previousDistance>=0;
        if(inside!==previousInside){const denominator=previousDistance-distance;
          if(!Number.isFinite(denominator)||denominator===0)return -1;
          const t=previousDistance/denominator;if(!Number.isFinite(t)||t<0||t>1)return -1;
          const offset=t===0?previous:t===1?current:null;
          const emitted=offset!==null?emit(input[offset],input[offset+1],input[offset+2],input[offset+3]):
            emit(input[previous]+(input[current]-input[previous])*t,input[previous+1]+(input[current+1]-input[previous+1])*t,
              input[previous+2]+(input[current+2]-input[previous+2])*t,input[previous+3]+(input[current+3]-input[previous+3])*t);
          if(!emitted)return -1;
        }
        if(inside&&!emit(input[current],input[current+1],input[current+2],input[current+3]))return -1;
        previous=current;previousDistance=distance;
      }
      if(length>1&&output[0]===output[(length-1)*4]&&output[1]===output[(length-1)*4+1])length--;
      count=length;const swap=input;input=output;output=swap;
    }
    scratch.result=input;return count>=3?count:0;
  }

  // A custom shader mesh cannot join Pixi's default sprite batch. Compile an
  // ordered run ourselves instead: artwork, convex fills and short analytic
  // gradients share one material and one retained pair of typed buffers.
  // Clip chains, blend changes and unsupported primitives remain boundaries.
  const worldVertex=`precision highp float;
    attribute vec2 aPosition;attribute vec4 aPoint;attribute vec4 aGeometry;
    attribute vec4 aRadiiKind;attribute vec4 aColor0;attribute vec4 aColor1;
    attribute vec4 aColor2;attribute vec3 aOffsets;
    varying vec4 vPoint;varying vec4 vGeometry;varying vec4 vRadiiKind;
    varying vec4 vColor0;varying vec4 vColor1;varying vec4 vColor2;varying vec3 vOffsets;
    uniform mat3 uProjectionMatrix;uniform mat3 uWorldTransformMatrix;uniform mat3 uTransformMatrix;
    void main(){vPoint=aPoint;vGeometry=aGeometry;vRadiiKind=aRadiiKind;
      vColor0=aColor0;vColor1=aColor1;vColor2=aColor2;vOffsets=aOffsets;
      vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);
      gl_Position=vec4(p.xy,0.0,1.0);}`;
  const worldFragment=`precision highp float;
    varying vec4 vPoint;varying vec4 vGeometry;varying vec4 vRadiiKind;
    varying vec4 vColor0;varying vec4 vColor1;varying vec4 vColor2;varying vec3 vOffsets;
    ${Array.from({length:WORLD_SAMPLERS},(_,i)=>`uniform sampler2D uTexture${i};`).join('\n')}
    void main(){
      if(vRadiiKind.z<0.5){vec4 sampleColor;
        ${Array.from({length:WORLD_SAMPLERS},(_,i)=>`${i?'else ':''}if(vRadiiKind.w<${i+.5})sampleColor=texture2D(uTexture${i},vPoint.xy);`).join('\n')}
        else discard;
        gl_FragColor=sampleColor*vColor0;return;}
      vec4 color=vColor0;
      if(vRadiiKind.z<2.5){vec2 delta=vGeometry.zw-vGeometry.xy;
        vec2 relative=vPoint.zw-vGeometry.xy;float t=0.0;
        if(vRadiiKind.z<1.5){float len=dot(delta,delta);if(len<0.00000001)discard;
          t=dot(relative,delta)/len;}
        else{float dr=vRadiiKind.y-vRadiiKind.x;float a=dot(delta,delta)-dr*dr;
          float b=-2.0*(dot(relative,delta)+vRadiiKind.x*dr);
          float c=dot(relative,relative)-vRadiiKind.x*vRadiiKind.x;
          if(abs(a)<0.00000001){if(abs(b)<0.00000001)discard;t=-c/b;}
          else{float discriminant=b*b-4.0*a*c;if(discriminant<0.0)discard;
            float root=sqrt(discriminant);float t0=(-b-root)/(2.0*a);float t1=(-b+root)/(2.0*a);
            bool valid0=vRadiiKind.x+t0*dr>=0.0;bool valid1=vRadiiKind.x+t1*dr>=0.0;
            if(!valid0&&!valid1)discard;t=valid0&&valid1?max(t0,t1):(valid0?t0:t1);}}
        if(t>=vOffsets.x){float span=vOffsets.y-vOffsets.x;
          float f=span>0.0?clamp((t-vOffsets.x)/span,0.0,1.0):1.0;color=mix(vColor0,vColor1,f);}
        if(t>=vOffsets.y){float span=vOffsets.z-vOffsets.y;
          float f=span>0.0?clamp((t-vOffsets.y)/span,0.0,1.0):1.0;color=mix(vColor1,vColor2,f);}
      }
      // Stops interpolate in straight RGBA; premultiply only the final color.
      gl_FragColor=vec4(color.rgb*color.a,color.a);
    }`;
  function initializeWorldCompiler(){
    const P=window.PIXI,gl=state.renderer.gl;
    const limits={samplerLimit:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      attributeLimit:gl.getParameter(gl.MAX_VERTEX_ATTRIBS),varyingLimit:gl.getParameter(gl.MAX_VARYING_VECTORS)};
    const unavailable=!P.Buffer||!P.Geometry||!P.BufferUsage||!gl.createShader;
    if(unavailable||limits.samplerLimit<WORLD_SAMPLERS||limits.attributeLimit<8||limits.varyingLimit<7){
      state.worldCompiler={enabled:false,reason:unavailable?'unsupported-geometry-api':'shader-capacity',...limits};return;
    }
    let vertex,fragment,linked;
    try{
      state.worldProgram ||= P.GlProgram.from({vertex:worldVertex,fragment:worldFragment,
        preferredFragmentPrecision:'highp',name:'cache-road-world-batch'});
      // Validate the actual preprocessed Pixi shader on this context before
      // accepting any batches. Older hardware keeps the complete old path.
      const compile=(type,source)=>{const shader=gl.createShader(type);
        gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);throw Error(message||'World shader compilation failed');}return shader;};
      vertex=compile(gl.VERTEX_SHADER,state.worldProgram.vertex);
      fragment=compile(gl.FRAGMENT_SHADER,state.worldProgram.fragment);
      linked=gl.createProgram();gl.attachShader(linked,vertex);gl.attachShader(linked,fragment);gl.linkProgram(linked);
      if(!gl.getProgramParameter(linked,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(linked)||'World shader link failed');
      state.worldCompiler={enabled:true,reason:null,samplers:WORLD_SAMPLERS,vertexFloats:WORLD_FLOATS,...limits};
    }catch(error){state.worldCompiler={enabled:false,reason:'shader-unavailable',error:String(error?.message||error),...limits};}
    finally{if(linked)gl.deleteProgram(linked);if(vertex)gl.deleteShader(vertex);if(fragment)gl.deleteShader(fragment);}
  }
  function batchesFor(kind){let batches=state.worldBatches.get(kind);
    if(!batches){batches=[];state.worldBatches.set(kind,batches);}return batches;}
  function worldBatch(batches,index){
    if(batches[index])return batches[index];const P=window.PIXI;
    const vertices=new Float32Array(64*WORLD_FLOATS),indices=new Uint16Array(64*3),
      vertexBuffer=new P.Buffer({data:vertices,usage:P.BufferUsage.VERTEX|P.BufferUsage.COPY_DST,
        shrinkToFit:false,label:'Cache world vertices'}),
      indexBuffer=new P.Buffer({data:indices,usage:P.BufferUsage.INDEX|P.BufferUsage.COPY_DST,
        shrinkToFit:false,label:'Cache world indices'});
    vertexBuffer.autoGarbageCollect=false;indexBuffer.autoGarbageCollect=false;
    const attributes={},layout=[['aPosition',2],['aPoint',4],['aGeometry',4],['aRadiiKind',4],
      ['aColor0',4],['aColor1',4],['aColor2',4],['aOffsets',3]];let offset=0;
    for(const [name,size]of layout){attributes[name]={buffer:vertexBuffer,format:'float32x'+size,
      stride:WORLD_FLOATS*4,offset:offset*4};offset+=size;}
    const geometry=new P.Geometry({attributes,indexBuffer,topology:'triangle-list'});
    geometry.autoGarbageCollect=false;geometry.indexCount=0;
    const resources={};for(let i=0;i<WORLD_SAMPLERS;i++)resources['uTexture'+i]=P.Texture.EMPTY.source;
    const shader=new P.Shader({glProgram:state.worldProgram,resources}),mesh=new P.Mesh({geometry,shader});
    mesh.alpha=1;mesh.eventMode='none';
    return batches[index]={mesh,geometry,shader,vertexBuffer,indexBuffer,vertices,indices,
      textures:[],vertexCount:0,indexCount:0,commandCount:0,usedFrame:0};
  }
  function reserveWorldBatch(batch,vertexCount,indexCount){
    if(vertexCount>WORLD_MAX_VERTICES)throw Error('World batch vertex capacity');
    if(batch.vertices.length<vertexCount*WORLD_FLOATS){let capacity=batch.vertices.length/WORLD_FLOATS;
      while(capacity<vertexCount)capacity*=2;
      batch.vertices=new Float32Array(capacity*WORLD_FLOATS);batch.vertices.set(batch.vertexBuffer.data);
      batch.vertexBuffer.data=batch.vertices;}
    if(batch.indices.length<indexCount){let capacity=batch.indices.length;
      while(capacity<indexCount)capacity*=2;
      const previous=batch.indices;batch.indices=new Uint16Array(capacity);batch.indices.set(previous);
      batch.indexBuffer.data=batch.indices;}
  }
  function worldPrimitive(command,quad,entry,clippedCount,scratch){
    if(command.kind==='image'){
      if(command.filter&&command.filter!=='none')return null;
      return {kind:0,count:clippedCount>=3?clippedCount:4,quad,entry,
        interleaved:clippedCount>=3?scratch.result:null};
    }
    if(command.kind!=='path'||command.stroke||!convexClipOrientation(command))return null;
    const points=soleClipAreaPath(command).points;
    if(typeof command.style==='string')return {kind:3,count:points.length/2,points,color:rgba(command.style)};
    const gradient=command.style;
    if(gradient.stops.length>3)return null;
    const inv=inverse(gradient.transform||IDENTITY);if(!inv)return null;
    const stops=gradient.stops.slice().sort((a,b)=>a.offset-b.offset);
    if(!stops.length)return null;
    return {kind:gradient.type==='radial'?2:1,count:points.length/2,points,inv,args:gradient.args,
      stops:stops.map(stop=>({offset:stop.offset,color:rgba(stop.color)}))};
  }
  function appendWorldPrimitive(batch,primitive,command){
    const start=batch.vertexCount,count=primitive.count,indexCount=(count-2)*3;
    reserveWorldBatch(batch,start+count,batch.indexCount+indexCount);
    let textureId=0;
    if(primitive.kind===0){const source=primitive.entry.texture.source;
      textureId=batch.textures.indexOf(source);
      if(textureId<0){textureId=batch.textures.length;
        if(textureId>=WORLD_SAMPLERS)throw Error('World sampler capacity');batch.textures.push(source);}}
    for(let i=0;i<count;i++){
      const offset=(start+i)*WORLD_FLOATS,v=batch.vertices;
      // Every field is overwritten when a retained slot changes primitive type.
      v.fill(0,offset,offset+WORLD_FLOATS);
      if(primitive.kind===0){const q=primitive.interleaved;
        v[offset]=q?q[i*4]:primitive.quad.positions[i*2];v[offset+1]=q?q[i*4+1]:primitive.quad.positions[i*2+1];
        v[offset+2]=q?q[i*4+2]:primitive.quad.uvs[i*2];v[offset+3]=q?q[i*4+3]:primitive.quad.uvs[i*2+1];
        v[offset+13]=textureId;v.fill(command.alpha,offset+14,offset+18);
      }else{
        const x=primitive.points[i*2],y=primitive.points[i*2+1];v[offset]=x;v[offset+1]=y;v[offset+12]=primitive.kind;
        if(primitive.kind===3){v.set(primitive.color,offset+14);v[offset+17]*=command.alpha;}
        else{const inv=primitive.inv,args=primitive.args;
          v[offset+4]=inv[0]*x+inv[3]*y+inv[6];v[offset+5]=inv[1]*x+inv[4]*y+inv[7];
          if(primitive.kind===2){v.set([args[0],args[1],args[3],args[4]],offset+6);v[offset+10]=args[2];v[offset+11]=args[5];}
          else v.set(args,offset+6);
          for(let stop=0;stop<3;stop++){const value=primitive.stops[Math.min(stop,primitive.stops.length-1)];
            v.set(value.color,offset+14+stop*4);v[offset+17+stop*4]*=command.alpha;v[offset+26+stop]=value.offset;}
        }
      }
    }
    for(let i=0;i<count-2;i++){batch.indices[batch.indexCount++]=start;
      batch.indices[batch.indexCount++]=start+i+1;batch.indices[batch.indexCount++]=start+i+2;}
    batch.vertexCount+=count;batch.commandCount++;
  }
  function finishWorldBatch(batch){if(!batch)return;
    for(let i=0;i<WORLD_SAMPLERS;i++)batch.shader.resources['uTexture'+i]=batch.textures[i]||window.PIXI.Texture.EMPTY.source;
    batch.geometry.indexCount=batch.indexCount;
    batch.vertexBuffer.update(batch.vertexCount*WORLD_FLOATS*4);batch.indexBuffer.update(batch.indexCount*2);
  }

  // Gradients use device-space shader uniforms. No gradient canvas or texture is
  // made when camera, beat glow or lamp endpoints change.
  const gradientVertex=`precision highp float;
    attribute vec2 aPosition; varying vec2 vPoint;
    uniform mat3 uProjectionMatrix;uniform mat3 uWorldTransformMatrix;uniform mat3 uTransformMatrix;
    void main(){vPoint=aPosition;vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);
      gl_Position=vec4(p.xy,0.0,1.0);}`;
  const hueVertex=`precision highp float;attribute vec2 aPosition;attribute vec2 aUV;varying vec2 vUV;
    uniform mat3 uProjectionMatrix;uniform mat3 uWorldTransformMatrix;uniform mat3 uTransformMatrix;
    void main(){vUV=aUV;vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);
      gl_Position=vec4(p.xy,0.0,1.0);}`;
  const hueFragment=`precision highp float;varying vec2 vUV;uniform sampler2D uTexture;
    uniform mat3 uHue;uniform float uAlpha;
    void main(){vec4 color=texture2D(uTexture,vUV);vec3 straight=color.a>0.0?color.rgb/color.a:vec3(0.0);
      vec3 rotated=clamp(uHue*straight,0.0,1.0);float alpha=color.a*uAlpha;
      gl_FragColor=vec4(rotated*alpha,alpha);}`;
  // One completed reflection gets a separable 2.3px Gaussian. The small
  // horizontal target is owned and budgeted here, rather than borrowing a
  // filter pool that can silently allocate full-screen work surfaces.
  const blurWeights=Array.from({length:8},(_,i)=>Math.exp(-i*i/(2*2.3*2.3)));
  const blurWeightSum=blurWeights[0]+2*blurWeights.slice(1).reduce((sum,value)=>sum+value,0);
  const blurFragment=`precision highp float;varying vec2 vUV;uniform sampler2D uTexture;uniform vec2 uStep;uniform float uAlpha;
    void main(){vec4 color=texture2D(uTexture,vUV)*${(blurWeights[0]/blurWeightSum).toFixed(10)};
      ${blurWeights.slice(1).map((weight,index)=>`color+=(texture2D(uTexture,vUV+uStep*${index+1}.0)+
        texture2D(uTexture,vUV-uStep*${index+1}.0))*${(weight/blurWeightSum).toFixed(10)};`).join('\n')}
      gl_FragColor=color*uAlpha;}`;
  function blurMesh(texture,step){const P=window.PIXI;
    state.blurProgram ||= P.GlProgram.from({vertex:hueVertex,fragment:blurFragment,name:'cache-road-mirror-gaussian'});
    const shader=new P.Shader({glProgram:state.blurProgram,resources:{uTexture:texture.source,
      blurUniforms:{uStep:{value:new Float32Array(step),type:'vec2<f32>'},uAlpha:{value:1,type:'f32'}}}});
    return new P.Mesh({geometry:geometry(),shader});
  }
  function prepareRearBlur(viewport,protectedDemand){
    const P=window.PIXI,previous=state.rearBlurTarget,
      changed=!previous||previous.width!==viewport.width||previous.height!==viewport.height;
    if(changed){
      const cost=viewport.width*viewport.height,
        priorCost=previous?previous.source.pixelWidth*previous.source.pixelHeight:0;
      if(!makeRoom(Math.max(0,cost-priorCost),protectedDemand.images,protectedDemand.texts)){
        state.fallback='rear-blur-target-cap';return false;
      }
      previous?.destroy(true);state.targetTexels-=priorCost;
      state.rearBlurTarget=P.RenderTexture.create({width:viewport.width,height:viewport.height,
        resolution:1,antialias:false,autoGarbageCollect:false,label:'Cache rear horizontal Gaussian'});
      state.renderer.texture.initSource(state.rearBlurTarget.source);
      state.renderer.renderTarget.getGpuRenderTarget(state.renderer.renderTarget.getRenderTarget(state.rearBlurTarget));
      state.targetTexels+=cost;
    }
    if(!state.rearBlurMesh){
      state.rearBlurStage=new P.Container({eventMode:'none'});
      state.rearBlurMesh=blurMesh(state.rearTarget,[1/viewport.width,0]);
      state.rearBlurStage.addChild(state.rearBlurMesh);
      state.rearGlass=slot([],0);
      state.rearDisplayMesh=blurMesh(state.rearBlurTarget,[0,1/viewport.height]);
      state.rearGlass.content.addChild(state.rearDisplayMesh);
    }
    const horizontal=state.rearBlurMesh,vertical=state.rearDisplayMesh;
    horizontal.shader.resources.uTexture=state.rearTarget.source;
    vertical.shader.resources.uTexture=state.rearBlurTarget.source;
    horizontal.shader.resources.blurUniforms.uniforms.uStep.set([1/viewport.width,0]);
    vertical.shader.resources.blurUniforms.uniforms.uStep.set([0,1/viewport.height]);
    horizontal.shader.resources.blurUniforms.update();vertical.shader.resources.blurUniforms.update();
    updateQuad(horizontal,[0,0,viewport.width,0,viewport.width,viewport.height,0,viewport.height],[0,0,1,0,1,1,0,1]);
    updateQuad(vertical,[viewport.x,viewport.y,viewport.x+viewport.width,viewport.y,
      viewport.x+viewport.width,viewport.y+viewport.height,viewport.x,viewport.y+viewport.height],[0,0,1,0,1,1,0,1]);
    state.pendingDirectRear=false;return true;
  }
  function hueMatrix(){const angle=315*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    return new Float32Array([.213+.787*c-.213*s,.213-.213*c+.143*s,.213-.213*c-.787*s,
      .715-.715*c-.715*s,.715+.285*c+.140*s,.715-.715*c+.715*s,
      .072-.072*c+.928*s,.072-.072*c-.283*s,.072+.928*c+.072*s]);}
  function ensureHueImage(item){if(item.hueImage)return item.hueImage;const P=window.PIXI;
    state.hueProgram ||= P.GlProgram.from({vertex:hueVertex,fragment:hueFragment,name:'cache-road-hue315'});
    const shader=new P.Shader({glProgram:state.hueProgram,resources:{uTexture:P.Texture.EMPTY.source,
      hueUniforms:{uHue:{value:hueMatrix(),type:'mat3x3<f32>'},uAlpha:{value:1,type:'f32'}}}});
    item.hueImage=new P.Mesh({geometry:geometry(),shader});item.content.addChild(item.hueImage);return item.hueImage;}
  const stopDeclarations=Array.from({length:MAX_STOPS},(_,i)=>`uniform vec4 uColor${i};uniform float uOffset${i};`).join('\n');
  const stopInterpolation=Array.from({length:MAX_STOPS-1},(_,i)=>`if(uCount>${i+1}.0 && t>=uOffset${i}){
    float span=uOffset${i+1}-uOffset${i};float f=span>0.0?clamp((t-uOffset${i})/span,0.0,1.0):1.0;
    color=mix(uColor${i},uColor${i+1},f);}`).join('\n');
  const gradientFragment=`precision highp float;varying vec2 vPoint;
    uniform mat3 uInverse;uniform vec4 uGeometry;uniform vec2 uRadii;
    uniform float uKind;uniform float uCount;uniform float uAlpha;${stopDeclarations}
    void main(){vec2 p=(uInverse*vec3(vPoint,1.0)).xy;vec2 delta=uGeometry.zw-uGeometry.xy;
      vec2 relative=p-uGeometry.xy;float t=0.0;
      if(uKind<0.5){float len=dot(delta,delta);if(len<0.00000001)discard;t=dot(relative,delta)/len;}
      else{float dr=uRadii.y-uRadii.x;float a=dot(delta,delta)-dr*dr;
        float b=-2.0*(dot(relative,delta)+uRadii.x*dr);float c=dot(relative,relative)-uRadii.x*uRadii.x;
        if(abs(a)<0.00000001){if(abs(b)<0.00000001)discard;t=-c/b;}
        else{float discriminant=b*b-4.0*a*c;if(discriminant<0.0)discard;
          float root=sqrt(discriminant);float t0=(-b-root)/(2.0*a);float t1=(-b+root)/(2.0*a);
          bool valid0=uRadii.x+t0*dr>=0.0;bool valid1=uRadii.x+t1*dr>=0.0;
          if(!valid0&&!valid1)discard;t=valid0&&valid1?max(t0,t1):(valid0?t0:t1);}}
      vec4 color=uColor0;${stopInterpolation}
      float alpha=color.a*uAlpha;gl_FragColor=vec4(color.rgb*alpha,alpha);}`;
  function ensureGradient(item){
    if(item.gradient)return item.gradient;const P=window.PIXI,uniforms={
      uInverse:{value:inverse(IDENTITY),type:'mat3x3<f32>'},uGeometry:{value:new Float32Array(4),type:'vec4<f32>'},
      uRadii:{value:new Float32Array(2),type:'vec2<f32>'},uKind:{value:0,type:'f32'},
      uCount:{value:0,type:'f32'},uAlpha:{value:1,type:'f32'}};
    for(let i=0;i<MAX_STOPS;i++){uniforms['uColor'+i]={value:new Float32Array(4),type:'vec4<f32>'};
      uniforms['uOffset'+i]={value:1,type:'f32'};}
    state.gradientProgram ||= P.GlProgram.from({vertex:gradientVertex,fragment:gradientFragment,name:'cache-road-gradient'});
    const shader=new P.Shader({glProgram:state.gradientProgram,resources:{gradientUniforms:uniforms}});
    const mesh=new P.Mesh({geometry:geometry(),shader});item.gradient=mesh;
    item.gradientMask=new P.Graphics({eventMode:'none'});item.content.addChild(mesh,item.gradientMask);
    mesh.mask=item.gradientMask;return mesh;
  }
  function paintGradient(item,command){const gradient=command.style,mesh=ensureGradient(item),
    uniforms=mesh.shader.resources.gradientUniforms.uniforms,stops=gradient.stops.slice().sort((a,b)=>a.offset-b.offset);
    const inv=inverse(gradient.transform||IDENTITY);if(!inv)throw Error('Singular gradient transform');
    uniforms.uInverse=inv;uniforms.uKind=gradient.type==='radial'?1:0;uniforms.uAlpha=command.alpha;
    const args=gradient.args;
    if(gradient.type==='radial'){uniforms.uGeometry.set([args[0],args[1],args[3],args[4]]);uniforms.uRadii.set([args[2],args[5]]);}
    else{uniforms.uGeometry.set(args);uniforms.uRadii.fill(0);}
    uniforms.uCount=stops.length;
    for(let i=0;i<MAX_STOPS;i++){const stop=stops[Math.min(i,stops.length-1)];
      uniforms['uColor'+i].set(stop?rgba(stop.color):[0,0,0,0]);uniforms['uOffset'+i]=stop?stop.offset:1;}
    mesh.shader.resources.gradientUniforms.update();
    // A convex triangle or quad is already its own exact fill boundary. Feed
    // its device-space vertices directly to the gradient shader, just as
    // road image meshes do, instead of rebuilding a stencil for the same
    // polygon. Curves, compound fills and strokes retain their complete mask.
    const polygon=!command.stroke&&convexClipOrientation(command)?soleClipAreaPath(command).points:null;
    if(polygon){
      const vertexCount=polygon.length/2;
      item.gradientUVs ||= {3:new Float32Array(6),4:new Float32Array(8)};
      updateMesh(mesh,vertexCount,polygon,item.gradientUVs[vertexCount]);
      if(mesh.mask!==null)mesh.mask=null;
      item.gradientUsesMask=false;visibility(item.gradientMask,false);
      mesh.blendMode=blendModes[command.composite];mesh.alpha=1;visibility(mesh,true);
      return true;
    }
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const path of command.paths)for(let i=0;i<path.points.length;i+=2){const x=path.points[i],y=path.points[i+1];
      x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    if(command.stroke){const m=command.strokeTransform,
      width=m&&command.nativeLineWidth?command.nativeLineWidth*Math.hypot(m.a,m.b,m.c,m.d):command.lineWidth,
      margin=width*(command.lineJoin==='miter'?command.miterLimit:1)/2;
      x0-=margin;y0-=margin;x1+=margin;y1+=margin;}
    if(!finite([x0,y0,x1,y1])){visibility(mesh,false);visibility(item.gradientMask,false);return false;}
    updateQuad(mesh,[x0,y0,x1,y0,x1,y1,x0,y1],[0,0,1,0,1,1,0,1]);
    if(command.stroke)strokePaths(item.gradientMask,command,{color:0xffffff});
    else{resetGraphicTransform(item.gradientMask);fillPaths(item.gradientMask,command.paths,command.rule,{color:0xffffff});}
    if(mesh.mask!==item.gradientMask)mesh.mask=item.gradientMask;
    item.gradientUsesMask=true;
    mesh.blendMode=blendModes[command.composite];mesh.alpha=1;visibility(mesh,true);visibility(item.gradientMask,true);
    return false;
  }
  function paintPath(item,command){
    if(typeof command.style!=='string')return paintGradient(item,command);
    item.graphics ||= new window.PIXI.Graphics({eventMode:'none'});
    if(item.graphics.parent!==item.content)item.content.addChild(item.graphics);
    const style=colorStyle(command.style);
    if(command.stroke)strokePaths(item.graphics,command,style);
    else{resetGraphicTransform(item.graphics);fillPaths(item.graphics,command.paths,command.rule,style);}
    item.graphics.alpha=command.alpha;item.graphics.blendMode=blendModes[command.composite];item.graphics.visible=true;
  }
  function paintText(item,command,entry){
    const mesh=ensureImage(item),texture=entry.texture,width=texture.orig.width,height=texture.orig.height,
      padding=entry.style.padding,scaleY=fontDescriptor(command.font).size/64,
      scaleX=scaleY*(command.maxWidth>0?Math.min(1,command.maxWidth/(entry.nativeWidth*scaleY)):1);
    let x=command.x-padding*scaleX,y=command.y-padding*scaleY;
    if(command.align==='center')x-=entry.nativeWidth*scaleX/2;else if(command.align==='right'||command.align==='end')x-=entry.nativeWidth*scaleX;
    if(command.baseline==='alphabetic')y-=entry.ascent*scaleY;else if(command.baseline==='middle')y-=(entry.ascent-entry.descent)*scaleY/2;
    else if(command.baseline==='bottom'||command.baseline==='ideographic')y-=(entry.ascent+entry.descent)*scaleY;
    const m=command.transform||IDENTITY,positions=[...transformPoint(m,x,y),...transformPoint(m,x+width*scaleX,y),
      ...transformPoint(m,x+width*scaleX,y+height*scaleY),...transformPoint(m,x,y+height*scaleY)];
    mesh.texture=texture;updateQuad(mesh,positions,[0,0,1,0,1,1,0,1]);
    mesh.tint=colorStyle(command.style).color;
    mesh.alpha=command.alpha*rgba(command.style)[3];mesh.blendMode=blendModes[command.composite];mesh.visible=true;
  }
  function validate(commands,kind){const images=new Set(),texts=new Set(),samplers=new Map();let missing=false;
    for(const command of commands){
      if(!blendModes[command.composite])return fallback('unsupported-composite:'+command.composite);
      if(command.filter&&command.filter!=='none'&&!(command.kind==='image'&&/^hue-rotate\(\s*315deg\s*\)$/.test(command.filter)))
        return fallback('unsupported-filter:'+command.filter);
      if((command.shadowBlur>0||command.shadowOffsetX||command.shadowOffsetY)&&rgba(command.shadowColor||'transparent')[3]>0)
        return fallback('unsupported-shadow');
      if(command.kind==='image'){const smooth=command.smoothing!==false;
        if(samplers.has(command.image)&&samplers.get(command.image)!==smooth)return fallback('mixed-source-samplers');
        samplers.set(command.image,smooth);images.add(command.image);if(!state.sources.has(command.image)){
        state.pendingSources.set(command.image,imageCost(command.image));missing=true;}}
      else if(command.kind==='text'){if(typeof command.style!=='string')return fallback('gradient-text');
        const key=textKey(command);texts.add(key);if(!state.text.has(key)){state.pendingText.set(key,command);missing=true;}}
      else if(command.kind==='path'){if(command.dash?.length)return fallback('dashed-stroke');
        if(typeof command.style!=='string'&&(!['linear','radial'].includes(command.style?.type)||command.style.stops.length>MAX_STOPS))return fallback('unsupported-gradient');}
      else return fallback('unsupported-command');
    }
    state.demands.set(kind,{images,texts,tick:state.tick});
    if(missing)return fallback('preparing-visible-sources');return true;
  }
  function render(commands,ctx,options={}){
    if(state.nativeFallbackDepth||state.status!=='ready'||!supportedContext(ctx)||!Array.isArray(commands))return fallback('renderer-not-ready');
    if(commands.balanced===false)return fallback('unbalanced-scene');
    if(commands.length>MAX_COMMANDS)return fallback('command-cap');const kind=options.kind||'forward',
      viewport=options.viewport||{x:0,y:0,width:WIDTH,height:HEIGHT};
    if(!finite([viewport.x,viewport.y,viewport.width,viewport.height])||viewport.width<=0||viewport.height<=0||
      viewport.width>WIDTH||viewport.height>HEIGHT)return fallback('unsupported-viewport');
    const deferred=kind==='forward'&&options.defer===true,directRear=kind==='rear'&&options.direct===true;
    if((deferred||directRear)&&state.layerFrameContext!==ctx)return fallback('direct-frame-not-started');
    if(directRear&&(!state.pendingForward||!options.glassClip?.paths?.length))return fallback('direct-rear-not-ready');
    try{if(!validate(commands,kind))return false;}catch(error){state.error=String(error?.message||error);return fallback('invalid-scene');}
    if(kind==='rear'&&(!state.rearTarget||!state.rearViewport||state.rearViewport.width!==viewport.width||
      state.rearViewport.height!==viewport.height)){
      state.pendingRearViewport={...viewport};return fallback('preparing-rear-target');}
    if(directRear&&(!state.rearBlurTarget||!state.rearGlass||
      state.rearBlurTarget.source.pixelWidth!==viewport.width||state.rearBlurTarget.source.pixelHeight!==viewport.height)){
      state.pendingRearViewport={...viewport};state.pendingDirectRear=true;return fallback('preparing-rear-blur-target');
    }
    const pool=poolFor(kind),groups=groupsFor(kind),stage=stageFor(kind),batches=batchesFor(kind),renderTick=++state.renderTick;
    try{
      let lastClips=null,group=null,groupCount=0,maskCount=0,meshClips=0,gradientMeshes=0,gradientMasks=0;
      let activeBatch=null,batchCount=0,batchCommands=0,batchVertices=0,batchIndices=0,
        batchImages=0,batchSolids=0,batchGradients=0,fallbackCommands=0;
      const flush=()=>{finishWorldBatch(activeBatch);activeBatch=null;};
      for(let i=0;i<commands.length;i++){const command=commands[i],item=slot(pool,i);
        // Clip entries are immutable objects shared by adjacent recorded
        // commands. Reuse the chain once for the complete ordered run so its
        // geometry/stencil does not split every otherwise batchable image.
        let clips=command.clips||[],quad=null,entry=null,clippedCount=-1;
        if(command.kind==='image'){
          entry=state.sources.get(command.image);entry.used=state.tick;quad=imageQuad(command,entry);if(!quad)continue;
          if(clips.length&&convexClipOrientation(clips[clips.length-1])){
            item.clipScratch ||= {a:new Float64Array(32),b:new Float64Array(32),result:null};
            clippedCount=clipImageQuad(quad,clips[clips.length-1],item.clipScratch);
            if(clippedCount>=0){meshClips++;if(!clippedCount)continue;
              const earlier=item.meshClipChain ||= [];earlier.length=clips.length-1;
              for(let j=0;j<earlier.length;j++)earlier[j]=clips[j];clips=earlier;}
          }
        }
        if(!sameClips(lastClips,clips)){flush();group=slot(groups,groupCount++);group.frameChildCount=0;group.usedFrame=renderTick;
          configureClips(group,clips);placeChild(stage,group.root,groupCount-1);visibility(group.root,true);
          maskCount+=clips.length;lastClips=clips;}
        const primitive=state.worldCompiler.enabled?worldPrimitive(command,quad,entry,clippedCount,item.clipScratch):null;
        if(primitive){
          if(command.kind==='image')entry.texture.source.style.scaleMode=command.smoothing===false?'nearest':'linear';
          const source=primitive.entry?.texture.source,
            newSampler=source&&activeBatch&&!activeBatch.textures.includes(source);
          if(activeBatch&&(activeBatch.mesh.blendMode!==blendModes[command.composite]||
            activeBatch.vertexCount+primitive.count>WORLD_MAX_VERTICES||
            (newSampler&&activeBatch.textures.length===WORLD_SAMPLERS)))flush();
          if(!activeBatch){activeBatch=worldBatch(batches,batchCount++);
            activeBatch.vertexCount=0;activeBatch.indexCount=0;activeBatch.commandCount=0;activeBatch.textures.length=0;
            activeBatch.usedFrame=renderTick;activeBatch.mesh.blendMode=blendModes[command.composite];
            placeChild(group.content,activeBatch.mesh,group.frameChildCount++);visibility(activeBatch.mesh,true);}
          appendWorldPrimitive(activeBatch,primitive,command);batchCommands++;
          batchVertices+=primitive.count;batchIndices+=(primitive.count-2)*3;
          if(primitive.kind===0)batchImages++;else if(primitive.kind===3)batchSolids++;else batchGradients++;
          continue;
        }
        flush();fallbackCommands++;
        placeChild(group.content,item.root,group.frameChildCount++);item.usedFrame=renderTick;visibility(item.root,true);
        showContents(item,command.kind==='image'?(command.filter&&command.filter!=='none'?'hueImage':'image'):
          command.kind==='path'?(typeof command.style==='string'?'graphics':'gradient'):'image');
        if(command.kind==='image'){const hue=command.filter&&command.filter!=='none',
            mesh=hue?ensureHueImage(item):ensureImage(item);mesh.texture=entry.texture;mesh.tint=0xffffff;
          entry.texture.source.style.scaleMode=command.smoothing===false?'nearest':'linear';
          if(hue){mesh.shader.resources.uTexture=entry.texture.source;
            mesh.shader.resources.hueUniforms.uniforms.uAlpha=command.alpha;mesh.shader.resources.hueUniforms.update();}
          if(clippedCount>=3)updateMesh(mesh,clippedCount,item.clipScratch.result,null,true);
          else updateQuad(mesh,quad.positions,quad.uvs);
          mesh.alpha=hue?1:command.alpha;mesh.blendMode=blendModes[command.composite];mesh.visible=true;
        }else if(command.kind==='path'){
          const directGradient=paintPath(item,command);
          if(typeof command.style!=='string'){
            if(directGradient)gradientMeshes++;else if(item.gradientMask?.visible)gradientMasks++;
          }
        }
        else{const entry=state.text.get(textKey(command));entry.used=state.tick;paintText(item,command,entry);}
      }
      flush();
      for(const item of pool)if(item.usedFrame!==renderTick)visibility(item.root,false);
      for(const item of groups)if(item.usedFrame!==renderTick)visibility(item.root,false);
      for(const batch of batches)if(batch.usedFrame!==renderTick)visibility(batch.mesh,false);
      state.groupsByKind[kind]={commands:commands.length,groups:groupCount,masks:maskCount,meshClips,gradientMeshes,gradientMasks,
        worldBatches:batchCount,worldBatchCommands:batchCommands,worldBatchVertices:batchVertices,worldBatchIndices:batchIndices,
        worldBatchImages:batchImages,worldBatchSolids:batchSolids,worldBatchGradients:batchGradients,fallbackCommands};
      if(deferred){
        state.pendingForward={stage,ctx};
        // The original Canvas remains the sole foreground/HUD surface. Clear
        // its old frame only after the complete scenery scene was accepted.
        ctx.save();try{ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,WIDTH,HEIGHT);}finally{ctx.restore();}
        return true;
      }
      if(directRear){
        configureClips(state.rearGlass,[options.glassClip]);
        const opacity=options.opacity===undefined?1:options.opacity;
        if(!Number.isFinite(opacity))return fallback('invalid-rear-opacity');
        state.pendingRear={stage,viewport:{...viewport},opacity:Math.max(0,Math.min(1,opacity))};return true;
      }
      if(kind==='rear'){
        state.renderer.render({container:stage,target:state.rearTarget,clear:true,
          transform:new window.PIXI.Matrix(1,0,0,1,-viewport.x,-viewport.y)});
        state.rearSprite.position.set(viewport.x,viewport.y);
        state.renderer.render({container:state.rearStage,clear:true});
      }else state.renderer.render({container:stage,clear:true});
      ctx.save();try{ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';
        ctx.drawImage(state.canvas,viewport.x,viewport.y,viewport.width,viewport.height,
          viewport.x,viewport.y,viewport.width,viewport.height);}finally{ctx.restore();}
      state.frames++;state.framesByKind[kind]=(state.framesByKind[kind]||0)+1;
      state.copiesByKind[kind]=(state.copiesByKind[kind]||0)+1;state.fallback=null;return true;
    }catch(error){state.error=String(error?.message||error);return fallback('render-error');}
  }
  function directFrameActive(){return !!state.layerFrameContext&&!state.nativeFallbackDepth;}
  function present(ctx){
    if(state.frameFailed||state.status!=='ready'){
      const failed=state.frameFailed||!!state.pendingForward||!!state.layerFrameContext;
      hide();state.layerFrameContext=null;state.frameFailed=false;return !failed;
    }
    const forward=state.pendingForward,rear=state.pendingRear;
    if(!forward){state.layerFrameContext=null;return true;}
    if(ctx!==forward.ctx){hide();state.layerFrameContext=null;state.frameFailed=false;return fallback('direct-context-changed');}
    try{
      if(rear){
        const viewport=rear.viewport;
        // Paint and blur the full reflection, then fade its premultiplied
        // RGBA once when compositing over the forward world. Container alpha
        // does not feed this custom shader's uniforms.
        const uniforms=state.rearDisplayMesh.shader.resources.blurUniforms;
        uniforms.uniforms.uAlpha=rear.opacity;uniforms.update();
        state.renderer.render({container:rear.stage,target:state.rearTarget,clear:true,
          transform:new window.PIXI.Matrix(1,0,0,1,-viewport.x,-viewport.y)});
        state.renderer.render({container:state.rearBlurStage,target:state.rearBlurTarget,clear:true});
      }
      placeChild(state.finalStage,forward.stage,0);
      if(state.rearGlass){placeChild(state.finalStage,state.rearGlass.root,1);visibility(state.rearGlass.root,!!rear);}
      // This is the only screen presentation. Neither view crosses into a
      // Canvas2D drawImage call during an accepted direct GPU game frame.
      state.renderer.render({container:state.finalStage,clear:true});
      showLayer();state.frames++;state.framesByKind.forward++;
      if(rear){state.frames++;state.framesByKind.rear++;}
      state.directFrames++;state.pendingForward=null;state.pendingRear=null;
      state.layerFrameContext=null;state.frameFailed=false;state.fallback=null;return true;
    }catch(error){
      state.error=String(error?.message||error);state.fallback='direct-present-error';
      hide();state.layerFrameContext=null;state.frameFailed=false;return false;
    }
  }
  function diagnostics(){let demandTexels=0,sourceStorageBytes=0,compressedSources=0,expectedOriginalSources=0;
    const unique=new Set(),sourceFormats={};let retainedWorldBatches=0,retainedWorldGeometryBytes=0;
    for(const batches of state.worldBatches.values())for(const batch of batches){retainedWorldBatches++;
      retainedWorldGeometryBytes+=batch.vertices.byteLength+batch.indices.byteLength;}
    for(const entry of state.sources.values()){
      sourceStorageBytes+=entry.storageBytes||entry.cost*4;
      if(entry.compressed)compressedSources++;
      if(entry.expectedOriginal)expectedOriginalSources++;
      const format=entry.format||'rgba8unorm';sourceFormats[format]=(sourceFormats[format]||0)+1;
    }
    for(const demand of state.demands.values())for(const image of demand.images)unique.add(image);
    for(const image of unique)demandTexels+=imageCost(image);
    return {status:state.status,renderer:'PixiJS WebGL',nativeWidth:WIDTH,nativeHeight:HEIGHT,
      residentBudgetTexels:TEXEL_CAP,sourceMipTexels:state.texels,residentTexels:state.texels+state.targetTexels,residentSources:state.sources.size,
      residentTexts:state.text.size,demandTexels,pendingSources:state.pendingSources.size,
      compressedSources,expectedOriginalSources,
      originalFallbackSources:state.sources.size-compressedSources-expectedOriginalSources,
      compressedFallbackSources:state.sources.size-compressedSources-expectedOriginalSources,sourceStorageBytes,sourceFormats,
      textureBank:B.CacheRoadTextureBank?.diagnostics?.()||null,
      worldCompiler:{...state.worldCompiler,maxVertices:WORLD_MAX_VERTICES,
        retainedBatches:retainedWorldBatches,retainedGeometryBytes:retainedWorldGeometryBytes},
      targetTexels:state.canvas?state.targetTexels:0,targetSamples:state.targetSamples,
      rearTarget:state.rearViewport?{...state.rearViewport}:null,antialias:false,frames:state.frames,
      framesByKind:{...state.framesByKind},clipGroupsByKind:{...state.groupsByKind},
      presentation:state.layerVisible?'direct-gpu-layer':'native-canvas',directFrames:state.directFrames,
      copiesByKind:{...state.copiesByKind},directFramePending:!!state.pendingForward,
      rearBlur:state.rearBlurTarget?{width:state.rearViewport.width,height:state.rearViewport.height,sigma:2.3,passes:2}:null,
      pixiSystemTickerStarted:!!window.PIXI?.Ticker.system.started,
      pixiSharedTickerStarted:!!window.PIXI?.Ticker.shared.started,automaticGC:false,
      residentSourceDescriptors:[...state.sources].map(([image,entry])=>({
        ...state.sourceInfo.get(image),width:entry.width,height:entry.height,
        textureWidth:entry.textureWidth||entry.width,textureHeight:entry.textureHeight||entry.height,
        format:entry.format||'rgba8unorm',compressed:!!entry.compressed,expectedOriginal:!!entry.expectedOriginal,
        storageBytes:entry.storageBytes||entry.cost*4,
        mipTexels:entry.cost,lastUsed:entry.used})),
      optionalRequestedSources:state.optionalSources.size,optionalNotReadySources:state.optionalNotReady,
      optionalPendingSources:[...state.optionalSources.keys()].filter(image=>!state.sources.has(image)).length,
      optionalDecodePending:[...state.optionalSources.keys()].filter(image=>state.decodes.get(image)?.status==='pending').length,
      optionalDecodeFailed:[...state.optionalSources.keys()].filter(image=>state.decodes.get(image)?.status==='failed').length,
      optionalUploadFailed:state.optionalUploadFailed.size,optionalStatus:state.optionalStatus,prefetchUploads:state.prefetchUploads,
      warmup:state.warmupResult?{...state.warmupResult}:null,
      uploads:state.uploads,evictions:state.evictions,fallback:state.fallback,error:state.error};
  }
  // A level owns its images. Keep only the small renderer/surface and object
  // pools between visits; destroyed sources must not pin decoded scene art.
  // The next guarded handoff uploads its own complete source set again.
  function releaseLevel(){
    hide();state.layerFrameContext=null;state.frameFailed=false;state.warmupGeneration++;
    state.textureBankSession?.destroy();state.textureBankSession=null;
    // Bind groups listen to source destruction. Detach retained materials
    // before destroying the level's sources, rather than leaving null bindings.
    for(const batches of state.worldBatches.values())for(const batch of batches){
      batch.textures.length=0;batch.vertexCount=0;batch.indexCount=0;batch.commandCount=0;batch.geometry.indexCount=0;
      for(let i=0;i<WORLD_SAMPLERS;i++)batch.shader.resources['uTexture'+i]=window.PIXI.Texture.EMPTY.source;
      visibility(batch.mesh,false);
    }
    for(const entry of state.sources.values())release(entry);
    for(const entry of state.text.values())release(entry);
    state.sources.clear();state.text.clear();state.pendingSources.clear();state.pendingText.clear();
    state.demands.clear();state.sourceInfo.clear();state.decodes.clear();
    state.optionalSources.clear();state.optionalUploadFailed.clear();
    state.optionalNotReady=0;state.optionalStatus=null;state.warmupResult=null;
  }
  function destroy(){releaseLevel();state.disposed=true;state.status='destroyed';
    for(const entry of state.sources.values())release(entry);for(const entry of state.text.values())release(entry);
    state.sources.clear();state.text.clear();state.pendingSources.clear();state.pendingText.clear();state.demands.clear();
    state.sourceInfo.clear();state.decodes.clear();state.optionalSources.clear();state.optionalUploadFailed.clear();state.warmupResult=null;
    for(const pool of state.pools.values())for(const item of pool){item.image?.geometry.destroy();
      item.hueImage?.geometry.destroy();item.hueImage?.shader.destroy(false);
      item.gradient?.geometry.destroy();item.gradient?.shader.destroy(false);item.root.destroy({children:true});}
    for(const groups of state.clipGroups.values())for(const group of groups){group.content.removeChildren();group.root.destroy({children:true});}
    state.clipGroups.clear();
    for(const batches of state.worldBatches.values())for(const batch of batches){
      batch.geometry.destroy(true);batch.shader.destroy(false);batch.mesh.destroy();}
    state.worldBatches.clear();state.worldProgram?.destroy();
    for(const stage of state.sceneStages.values())stage.destroy({children:false});state.sceneStages.clear();
    state.pools.clear();state.gradientProgram?.destroy();state.hueProgram?.destroy();state.rearTarget?.destroy(true);
    state.rearBlurMesh?.geometry.destroy();state.rearBlurMesh?.shader.destroy(false);
    state.rearDisplayMesh?.geometry.destroy();state.rearDisplayMesh?.shader.destroy(false);
    state.rearGlass?.root.destroy({children:true});state.rearBlurStage?.destroy({children:true});
    state.rearBlurTarget?.destroy(true);state.blurProgram?.destroy();state.finalStage?.destroy({children:false});
    state.rearStage?.destroy({children:true});state.renderer?.destroy(false);
    state.canvas?.remove?.();state.layerNativeCanvas=null;state.layerNativeStyles=null;
    state.renderer=null;state.canvas=null;state.stage=null;state.targetTexels=0;
  }
  B.CacheRoadGPU={warmup,prepare,begin,beginFrame,directFrameActive,render,present,rejectFrame:fallback,snapshotTo,hide,withNativeFallback,diagnostics,releaseLevel,destroy};
})();
