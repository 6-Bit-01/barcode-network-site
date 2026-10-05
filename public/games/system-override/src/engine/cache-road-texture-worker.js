// One loading worker owns the Basis decoder and each temporary native KTX file.
// It transfers compressed mip buffers; it never creates a graphics context.
'use strict';
const targets={
  'bc7-rgba-unorm':6,'astc-4x4-unorm':10,'etc2-rgba8unorm':1,'bc3-rgba-unorm':3
};
let decoder=null,format=null;

async function initialize(message){
  if(!Object.hasOwn(targets,message.format))throw Error('Unsupported road texture target');
  format=message.format;
  importScripts(message.jsUrl);
  decoder=await BASIS({locateFile:()=>message.wasmUrl});
  decoder.initializeBasis();
  if(typeof decoder.KTX2File!=='function')throw Error('Pinned decoder has no KTX2 support');
}

async function loadTexture(message){
  if(!decoder)throw Error('Road texture decoder is not initialized');
  const response=await fetch(message.url);
  if(!response.ok)throw Error('Road texture request failed: '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());
  let file;
  try{
    file=new decoder.KTX2File(bytes);
    if(!file.isValid()||!file.isUASTC()||file.isSRGB()||file.getDFDTransferFunc()!==1||
        !(file.getDFDFlags()&1)||file.getFaces()!==1||file.getLayers()>1)
      throw Error('Road texture must be premultiplied linear UASTC 2D');
    const width=file.getWidth(),height=file.getHeight(),levels=file.getLevels();
    if(width!==message.width||height!==message.height||levels!==message.levels||
        !file.startTranscoding())throw Error('Road texture metadata/transcode mismatch');
    const resource=[],target=targets[format];
    let w=width,h=height;
    for(let level=0;level<levels;level++){
      const size=file.getImageTranscodedSizeInBytes(level,0,0,target);
      if(size!==Math.ceil(w/4)*Math.ceil(h/4)*16)throw Error('Road texture mip size mismatch');
      const output=new Uint8Array(size);
      if(!file.transcodeImage(output,level,0,0,target,0,-1,-1))
        throw Error('Road texture transcode failed');
      resource.push(output);w=Math.max(1,w>>1);h=Math.max(1,h>>1);
    }
    return {width,height,format,resource,alphaMode:'premultiplied-alpha'};
  }finally{
    // Both the copied input and decoder allocations belong to this file.
    // The worker itself is terminated when guarded warmup finishes.
    if(file){try{file.close();}finally{file.delete();}}
  }
}

self.onmessage=async event=>{
  const message=event.data;
  try{
    if(message.type==='init'){
      await initialize(message);self.postMessage({id:message.id,type:'ready'});
    }else if(message.type==='load'){
      const texture=await loadTexture(message);
      self.postMessage({id:message.id,type:'texture',texture},texture.resource.map(mip=>mip.buffer));
    }else throw Error('Unknown road texture worker request');
  }catch(error){self.postMessage({id:message.id,type:'error',error:String(error?.message||error)});}
};
