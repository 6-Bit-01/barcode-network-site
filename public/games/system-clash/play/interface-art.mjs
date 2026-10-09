const KEYS=Object.freeze(['railP1','railP2','portraitP1','portraitP2','timer','announcement','weaponP1','weaponP2','barcodeMark']);
const EXTRA_KEYS=Object.freeze(['tournamentNode','menuPlate','hazardShutter','hazardBeam','hazardThorns','hazardFeedback','hazardBlast','hazardBarrel','hazardWarning','wallCracks','endTransmission','transmissionEnded']);
const MANIFEST_PATH='assets/ui/manifest.json';
function validManifest(value){
 if(value?.version!==1||!value.assets||!KEYS.every(key=>value.assets[key])||Object.keys(value.assets).some(key=>![...KEYS,...EXTRA_KEYS].includes(key)))return false;
 return Object.keys(value.assets).every(key=>{const asset=value.assets[key];return asset&&/^[a-z0-9-]+\.(?:svg|webp)$/.test(asset.file)&&(!asset.runtimeFile||/^[a-z0-9-]+\.webp$/.test(asset.runtimeFile))&&Number.isInteger(asset.width)&&asset.width>0&&asset.width<=2048&&Number.isInteger(asset.height)&&asset.height>0&&asset.height<=1024;});
}
function imageSource(path,base,bundle){
 const embedded=bundle?.images?.[path];
 if(bundle&&!embedded)return null;
 if(typeof embedded==='string'&&/^data:image\/(?:svg\+xml|png|webp)(?:;[a-z0-9=-]+)*,/i.test(embedded))return embedded;
 if(bundle)return null; // Portable packs never reach outside embedded image data.
 const url=new URL(embedded??path,base);
 return url.origin===base.origin&&url.protocol===base.protocol&&['https:','http:','file:'].includes(url.protocol)?url.href:null;
}
function decodeImage(source,asset,key,imageFactory,timeoutMs){
 return new Promise((resolve,reject)=>{
  const image=imageFactory(asset,key),timer=setTimeout(()=>finish(false),timeoutMs);
  function finish(ok){clearTimeout(timer);image.onload=null;image.onerror=null;if(ok&&(image.naturalWidth||image.width)===asset.width&&(image.naturalHeight||image.height)===asset.height)resolve(image);else reject(new Error('Interface image unavailable.'));}
  image.decoding='async';image.onload=()=>finish(true);image.onerror=()=>finish(false);try{image.src=source;}catch{finish(false);}
 });
}
/** Hosted play requires the complete current artwork; older portable packs keep their native HUD fallback. */
export async function loadInterfaceArt({baseURL=globalThis.location?.href,bundle,fetch=globalThis.fetch,imageFactory=()=>new Image(),timeoutMs=15000}={}){
 const empty={manifest:null,images:{},failures:[]};let manifest,base;
 try{
  base=new URL(baseURL);
  if(bundle){manifest=bundle.interface;if(!manifest)return empty;}
  else {const response=await fetch(new URL(MANIFEST_PATH,base),{cache:'no-store',...(globalThis.AbortSignal?.timeout?{signal:AbortSignal.timeout(timeoutMs)}:{})});if(!response.ok)throw Error('Interface manifest unavailable.');manifest=await response.json();}
  if(!validManifest(manifest)||(!bundle&&!EXTRA_KEYS.every(key=>manifest.assets[key])))throw Error('Invalid interface manifest.');
 }catch{return {...empty,failures:['manifest']};}
 const failures=[],images={};
 await Promise.all(Object.keys(manifest.assets).map(async key=>{
  try{const asset=manifest.assets[key],selected=asset.runtimeFile&&(!bundle||bundle.images?.['assets/ui/'+asset.runtimeFile])?asset.runtimeFile:asset.file,source=imageSource('assets/ui/'+selected,base,bundle);if(!source)throw Error('Unavailable interface source.');images[key]=await decodeImage(source,asset,key,imageFactory,timeoutMs);}
  catch{failures.push(key);}
 }));
 return {manifest,images,failures};
}
