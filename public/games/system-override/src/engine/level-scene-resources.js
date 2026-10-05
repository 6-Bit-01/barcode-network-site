// Retire inactive Level 1 presentation resources at the prepared road handoff.
// Campaign state, active road audio and shared title/UI resources stay owned.
window.FILE_MANIFEST=window.FILE_MANIFEST||[];
window.FILE_MANIFEST.push({name:'src/engine/level-scene-resources.js',
  exports:['BARCODE.LevelSceneResources'],dependencies:['BARCODE.MusicProfiles']});
(function(B){
  'use strict';
  const releasedImages=new WeakSet();
  function probes(cache,select){
    return Object.entries(cache||{}).filter(([key])=>select(key)).map(([key,promise])=>{
      const probe={key,promise,settled:false,resolved:false,value:null};
      const resolved=value=>{probe.settled=true;probe.resolved=true;probe.value=value;};
      if(typeof promise?.then==='function')promise.then(resolved,()=>{probe.settled=true;});
      else resolved(promise);
      return probe;
    });
  }
  async function releaseLevel1(){
    const road=B.CacheRoadProof,audio=window.audioSystem,generation=road?.entryGeneration,state=road?.state;
    const profile=audio?.getActiveMusicProfile?.();
    const required=profile?.arrangement?.sources?.filter(source=>source.required)||[];
    const boundary=()=>B.CacheRoadProof===road&&window.audioSystem===audio&&road?.active&&road.state===state&&road.entryGeneration===generation&&
      audio?.getActiveMusicProfile?.()?.profileId==='level-02.proof'&&required.length>0&&
      required.every(source=>audio.musicTracks?.[source.sourceId]?.buffer);
    if(profile?.profileId!=='level-02.proof'||!boundary())return {ok:false,reason:'road-not-prepared'};
    const level1=B.MusicProfiles?.get?.('level-01.main')?.arrangement?.sources||[];
    const audioKeys=new Set(level1.map(source=>source.assetId));
    const imageProbes=probes(B.assetLoadPromises,key=>key.startsWith('image.level-01.'));
    const audioProbes=probes(audio.assetLoadPromises,key=>audioKeys.has(key));
    // A single microtask observes already-settled cache entries. It never waits
    // for network work, and pending jobs retain their original owner/generation.
    await Promise.resolve();
    if(!boundary())return {ok:false,reason:'handoff-cancelled'};
    const report={ok:true,releasedSourceImages:0,releasedImagePixels:0,releasedCanvasPixels:0,
      releasedAudioBuffers:0,releasedAudioBytes:0,pendingImageKeys:[],pendingAudioKeys:[],pendingParallaxLayers:0};
    const images=new Set(),buffers=new Set();
    const releaseImage=image=>{
      if(!image||images.has(image)||releasedImages.has(image))return;
      const pixels=(image.naturalWidth||image.width||0)*(image.naturalHeight||image.height||0);
      image.onload=null;image.onerror=null;
      try{if(typeof image.removeAttribute==='function')image.removeAttribute('src');else image.src='';}
      catch{return;}
      images.add(image);releasedImages.add(image);report.releasedSourceImages++;
      report.releasedImagePixels+=pixels;
    };
    const releaseCanvas=canvas=>{
      if(!canvas)return;report.releasedCanvasPixels+=(canvas.width||0)*(canvas.height||0);
      canvas.width=0;canvas.height=0;
    };
    const releaseTrack=track=>{
      if(!track)return;
      const buffer=track.buffer;
      if(buffer&&!buffers.has(buffer)){
        buffers.add(buffer);report.releasedAudioBuffers++;
        report.releasedAudioBytes+=(buffer.length||0)*(buffer.numberOfChannels||0)*4;
      }
      if(track.source){try{track.source.stop();}catch{}try{track.source.disconnect?.();track.source.buffer=null;}catch{}}
      try{track.gain?.disconnect?.();}catch{}
      track.source=null;track.gain=null;track.isPlaying=false;track.buffer=null;
    };
    const parallax=window.parallaxBackground;
    if(parallax){
      parallax.disposeSkyAnimation?.();
      for(const layer of parallax.layers||[]){
        if(layer.loaded)releaseImage(layer.imgElement||layer.image);
        else if(layer.imageUrl)report.pendingParallaxLayers++;
        layer.imgElement=null;layer.image=null;layer.loaded=false;
      }
      for(const canvas of Object.values(parallax.atmosphereSprites||{}))releaseCanvas(canvas);
      parallax.layers=[];parallax.atmosphereSprites=null;window.parallaxBackground=null;
    }
    const cutscene=window.cutsceneSystem;
    if(cutscene){
      // The inactive comic no longer owns audio suspension. Its normal destroy
      // can resume audio for its reader; scene retirement must stay silent.
      cutscene.userPaused=false;
      const canvas=cutscene.introCanvas;cutscene.destroy?.();releaseCanvas(canvas);
      for(const item of cutscene.cutsceneImages||[]){releaseImage(item.element);item.element=null;item.loaded=false;}
      cutscene.cutsceneImages=[];window.cutsceneSystem=null;
    }
    const ships=window.spaceShipSystem;
    if(ships){
      ships.dispose?.();
      for(const image of ships.shipImages||[])releaseImage(image);releaseImage(ships.warningImage);
      ships.shipImages=[];ships.shipSheets=[];ships.imagesLoaded=[];ships.warningImage=null;
      window.spaceShipSystem=null;
    }
    for(const probe of imageProbes){
      if(!probe.settled){report.pendingImageKeys.push(probe.key);continue;}
      if(probe.resolved&&B.assetLoadPromises[probe.key]===probe.promise){
        releaseImage(probe.value);delete B.assetLoadPromises[probe.key];
      }
    }
    for(const source of level1){
      const probe=audioProbes.find(item=>item.key===source.assetId);
      if(audio.activeProfilePreparationInFlight&&audio.activeProfilePreparationKey==='level-01.main'||
          probe&&!probe.settled){report.pendingAudioKeys.push(source.assetId);continue;}
      releaseTrack(audio.musicTracks?.[source.sourceId]);
      if(audio.musicTracks)delete audio.musicTracks[source.sourceId];
      if(probe?.resolved&&audio.assetLoadPromises[source.assetId]===probe.promise){
        releaseTrack(probe.value);delete audio.assetLoadPromises[source.assetId];
      }
    }
    return report;
  }
  B.LevelSceneResources=Object.freeze({releaseLevel1});
})(window.BARCODE=window.BARCODE||{});
