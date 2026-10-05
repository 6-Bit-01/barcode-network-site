// Full-resolution compressed scenery is prepared before the existing loop
// advances controls/music. Originals remain the native fallback owner.
window.FILE_MANIFEST=window.FILE_MANIFEST||[];
window.FILE_MANIFEST.push({name:'src/engine/cache-road-texture-bank.js',
  exports:['BARCODE.CacheRoadTextureBank'],dependencies:[]});
(function(){
  'use strict';
  const B=window.BARCODE=window.BARCODE||{};
  const ENCODER_COMMIT='4d6fc70eaf62ad0558e63e8d97eb9766118327a6';
  const TRANSCODER_COMMIT='9bebe16726b3a61c8c213eeee3b7cffb462ef34e';
  const script=document.currentScript?.src||new URL('src/engine/cache-road-texture-bank.js',
    document.baseURI||window.location?.href).href;
  const root=new URL('../../',script);
  const manifestURL=new URL('assets/cache-road/gpu-textures/manifest.json',root).href;
  let manifest=null,activeSession=null,lastResult=null,workerStarts=0;
  function aborted(){const error=Error('Road texture preparation cancelled');error.name='AbortError';return error;}
  function formatFor(gl){
    if(!gl?.getExtension)return null;
    for(const [extension,format]of [
      ['EXT_texture_compression_bptc','bc7-rgba-unorm'],
      ['WEBGL_compressed_texture_astc','astc-4x4-unorm'],
      ['WEBGL_compressed_texture_etc','etc2-rgba8unorm'],
      ['WEBGL_compressed_texture_s3tc','bc3-rgba-unorm']])
      if(gl.getExtension(extension))return format;
    return null;
  }
  function validManifest(value){
    return value?.version===1&&value.encoderCommit===ENCODER_COMMIT&&value.transcoderCommit===TRANSCODER_COMMIT&&
      value.alphaMode==='premultiplied-alpha'&&value.colorSpace==='unorm'&&
      value.entries&&typeof value.entries==='object'&&!Array.isArray(value.entries);
  }
  function entryFor(value,descriptor,maxSize){
    const entry=value.entries[descriptor.key],image=descriptor.image;
    if(!entry||entry.kind!=='compressed'||!Number.isInteger(entry.width)||!Number.isInteger(entry.height)||
      entry.width<1||entry.height<1||entry.width%4||entry.height%4||
      entry.width>maxSize||entry.height>maxSize||
      entry.originalWidth!==(image.naturalWidth||image.width)||
      entry.originalHeight!==(image.naturalHeight||image.height)||
      entry.width!==Math.ceil(entry.originalWidth/4)*4||entry.height!==Math.ceil(entry.originalHeight/4)*4||
      entry.levels!==Math.floor(Math.log2(Math.max(entry.width,entry.height)))+1||
      typeof entry.path!=='string'||!/^assets\/cache-road\/gpu-textures\/[\w.-]+\.ktx2$/.test(entry.path))return null;
    return entry;
  }
  function originalEntry(value,descriptor){
    const entry=value.entries[descriptor.key],image=descriptor.image;
    return entry?.kind==='original'&&entry.path===descriptor.path&&/\.svg$/i.test(entry.path)&&
      entry.originalWidth===(image.naturalWidth||image.width)&&entry.originalHeight===(image.naturalHeight||image.height)&&
      entry.width===entry.originalWidth&&entry.height===entry.originalHeight;
  }
  class Session{
    constructor(gl,cancelled){
      this.gl=gl;this.cancelled=cancelled;this.format=formatFor(gl);
      this.worker=null;this.jobs=new Map();this.id=0;this.closed=false;
      this.abort=typeof window.AbortController==='function'?new window.AbortController():null;
      this.result={requested:0,compressed:0,expectedOriginal:[],failed:[],unlisted:[],format:this.format,cancelled:false};
    }
    current(){
      if(this.closed)throw aborted();
      let cancelled=false;try{cancelled=!!this.cancelled?.();}catch{cancelled=true;}
      if(cancelled){this.destroy();throw aborted();}
    }
    request(message){
      this.current();if(this.failure)throw this.failure;const id=++this.id;
      return new Promise((resolve,reject)=>{
        this.jobs.set(id,{resolve,reject});
        try{this.worker.postMessage({...message,id});}
        catch(error){this.jobs.delete(id);reject(error);}
      });
    }
    async initialize(){
      this.current();
      this.worker=new window.Worker(new URL('src/engine/cache-road-texture-worker.js',root).href);
      workerStarts++;
      this.worker.onmessage=event=>{
        const message=event.data,job=this.jobs.get(message.id);if(!job)return;
        this.jobs.delete(message.id);
        if(message.type==='error')job.reject(Error(message.error));else job.resolve(message);
      };
      const failed=event=>{
        const error=Error(event.message||'Road texture worker failed');
        for(const job of this.jobs.values())job.reject(error);this.jobs.clear();
        this.failure=error;this.worker?.terminate();this.worker=null;
      };
      this.worker.onerror=failed;this.worker.onmessageerror=failed;
      await this.request({type:'init',format:this.format,
        jsUrl:new URL('src/vendor/basis-2.50/basis_transcoder.js',root).href,
        wasmUrl:new URL('src/vendor/basis-2.50/basis_transcoder.wasm',root).href});
      this.current();
    }
    async prepare(descriptors){
      const textures=new Map();this.result.requested=descriptors.length;
      if(!this.format||typeof window.Worker!=='function'||
        !document.getElementById?.('standalone-viewport-style')){
        if(activeSession===this)lastResult={...this.result};this.destroy();return textures;
      }
      try{
        this.current();
        if(!manifest){
          const response=await window.fetch(manifestURL,this.abort?{signal:this.abort.signal}:undefined);
          this.current();if(!response.ok)throw Error('Road texture manifest unavailable');
          const value=await response.json();this.current();
          if(!validManifest(value))throw Error('Road texture manifest version mismatch');
          manifest=value;
        }
        const maxSize=this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE),entries=[];
        for(const descriptor of descriptors){
          if(originalEntry(manifest,descriptor)){this.result.expectedOriginal.push(descriptor.key);continue;}
          const entry=entryFor(manifest,descriptor,maxSize);
          if(entry)entries.push([descriptor,entry]);else this.result.unlisted.push(descriptor.key);
        }
        if(!entries.length)return textures;
        await this.initialize();
        // Sequential requests bound the decoder's temporary file/output memory.
        // There is exactly one worker, without a ticker, timer or display surface.
        for(const [descriptor,entry]of entries){
          this.current();
          try{
            const reply=await this.request({type:'load',key:descriptor.key,
              url:new URL(entry.path,root).href,width:entry.width,height:entry.height,levels:entry.levels});
            this.current();
            const texture=reply.texture;
            if(reply.type!=='texture'||texture?.format!==this.format||texture.width!==entry.width||
              texture.height!==entry.height||texture.alphaMode!=='premultiplied-alpha'||
              !Array.isArray(texture.resource)||texture.resource.length!==entry.levels)
              throw Error('Road texture worker returned invalid metadata');
            let w=entry.width,h=entry.height;
            for(const mip of texture.resource){
              if(!ArrayBuffer.isView(mip)||mip.BYTES_PER_ELEMENT!==1||
                mip.byteLength!==Math.ceil(w/4)*Math.ceil(h/4)*16)throw Error('Road texture worker returned invalid mips');
              w=Math.max(1,w>>1);h=Math.max(1,h>>1);
            }
            textures.set(descriptor.image,texture);this.result.compressed++;
          }catch(error){if(error.name==='AbortError')throw error;this.result.failed.push(descriptor.key);}
        }
        return textures;
      }catch(error){
        if(error.name==='AbortError'){this.result.cancelled=true;throw error;}
        this.result.error=String(error?.message||error);return textures;
      }finally{
        if(activeSession===this)lastResult={...this.result};
        this.destroy();
      }
    }
    destroy(){
      if(this.closed)return;this.closed=true;this.abort?.abort();
      for(const job of this.jobs.values())job.reject(aborted());this.jobs.clear();
      if(this.worker){this.worker.onmessage=null;this.worker.onerror=null;this.worker.onmessageerror=null;this.worker.terminate();this.worker=null;}
      if(activeSession===this)activeSession=null;
    }
  }
  function createSession(gl,{cancelled}={}){
    activeSession?.destroy();const session=new Session(gl,cancelled);activeSession=session;return session;
  }
  B.CacheRoadTextureBank=Object.freeze({createSession,diagnostics:()=>({
    workerActive:!!activeSession?.worker,pendingJobs:activeSession?.jobs.size||0,
    workerStarts,lastResult:lastResult?{...lastResult}:null})});
})();
