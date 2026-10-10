/** The active screen controls the existing persistent fullscreen owner. */
export function onlineSessionScore(params){
 if(params.get('online')!=='1')return null;
 const wins=key=>{const value=Number(params.get(key));return Number.isSafeInteger(value)&&value>=0&&value<=999?value:0;};
 const name=(key,fallback)=>(params.get(key)?.trim()||fallback).slice(0,24);
 return name('name1','Host')+' '+wins('winHost')+' · '+name('name2','Guest')+' '+wins('winGuest');
}
export function bindGameScreenControls(host,{document:doc=globalThis.document}={}){
 const buttons=[...doc.querySelectorAll('[data-game-fullscreen]')];
 function sync(){const full=host.isFullscreen;for(const button of buttons){button.textContent=full?'Exit fullscreen':'Fullscreen';button.setAttribute('aria-pressed',String(full));}}
 async function toggle(){await host.displayMode();sync();}
 for(const button of buttons)button.addEventListener('click',toggle);
 doc.addEventListener('fullscreenchange',sync);sync();
 return {sync,destroy(){for(const button of buttons)button.removeEventListener('click',toggle);doc.removeEventListener('fullscreenchange',sync);}};
}
