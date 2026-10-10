import {toggleDisplayMode} from './fight-ui.mjs';
const ROUTES=new Set(['index.html','fight.html','online.html','tournament-online.html','tournament-watch.html']);
export function safeGameScreenURL(value,base){try{const root=new URL('.',base),url=new URL(value,base);return url.origin===root.origin&&url.pathname.startsWith(root.pathname)&&ROUTES.has(url.pathname.slice(root.pathname.length))?url:null;}catch{return null;}}
export function createGameScreenHost({window:win=globalThis.window,document:doc=globalThis.document,onSuspend=()=>{},onDisplayChange=()=>{},onNavigate=()=>false}={}){
 let frame=null;
 function owner(){let current=win,result=null;try{for(let depth=0;depth<10&&current.parent&&current.parent!==current;depth++){current=current.parent;if(current.document?.documentElement?.dataset?.systemClashHost==='1')result=current;}}catch{}return result;}
 function loungeOwner(){let current=win;try{for(let depth=0;depth<10&&current.parent&&current.parent!==current;depth++){current=current.parent;if(current.document?.documentElement?.dataset?.systemClashLounge==='1')return current;}}catch{}return null;}
 if(loungeOwner()&&doc.documentElement)doc.documentElement.dataset.systemClashLoungeChild='1';
 if(!owner()&&doc.documentElement)doc.documentElement.dataset.systemClashHost='1';
 function isFullscreen(){try{const target=owner()?.document??doc;return !!target.fullscreenElement||!!target.documentElement?.classList?.contains('is-expanded');}catch{return false;}}
 function forwardState(){const origin=new URL(win.location.href).origin;for(const child of doc.querySelectorAll?.('iframe')??[])child.contentWindow?.postMessage?.({type:'system-clash:display-state'},origin);onDisplayChange(isFullscreen());}
 function navigate(value){const url=safeGameScreenURL(value,win.location.href);if(!url)return false;if(onNavigate(url)===true)return true;const parent=loungeOwner()??owner();if(parent){parent.postMessage({type:'system-clash:navigate',url:url.href},url.origin);return true;}
  if(!frame){frame=doc.createElement('iframe');frame.dataset&&(frame.dataset.systemClashScreen='');frame.title='BARCODE: SYSTEM CLASH';frame.setAttribute('allow','fullscreen; autoplay; gamepad');frame.setAttribute('allowfullscreen','');Object.assign(frame.style,{position:'fixed',inset:'0',width:'100%',height:'100%',border:'0',zIndex:'2147480000',background:'#080a0e'});frame.addEventListener('load',()=>{frame.focus?.();frame.contentWindow?.focus?.();forwardState();});doc.body.appendChild(frame);doc.body.classList.add('game-screen-hosted');onSuspend();}
  frame.src=url.href;return true;
 }
 async function displayMode(){const parent=owner();if(parent){parent.postMessage({type:'system-clash:display'},new URL(win.location.href).origin);return 'host';}const value=await toggleDisplayMode(doc,doc.documentElement);forwardState();return value;}
 function activeSender(source){const roots=[...(frame?[frame]:[]),...doc.querySelectorAll?.('iframe[data-system-clash-screen]')??[]];let current=source;try{for(let depth=0;depth<10&&current;depth++){if(roots.some(root=>current===root.contentWindow))return true;if(current.parent===current)break;current=current.parent;}}catch{}return false;}
 win.addEventListener('message',event=>{if(event.origin!==new URL(win.location.href).origin)return;if(event.data?.type==='system-clash:display-state'){if(owner()&&event.source===win.parent)forwardState();return;}if(!activeSender(event.source))return;if(event.data?.type==='system-clash:navigate')navigate(event.data.url);else if(event.data?.type==='system-clash:display')void displayMode();});
 doc.addEventListener?.('fullscreenchange',forwardState);
 return {navigate,displayMode,get active(){return !!frame;},get isFullscreen(){return isFullscreen();}};
}

