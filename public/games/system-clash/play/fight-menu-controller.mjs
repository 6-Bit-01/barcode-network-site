/** Menu ownership and live DOM targets; screen actions remain with each caller. */
export function canControlMenu(player,players,{screen='title',mode,activePlayer=0}={}) {
 if(!Number.isInteger(player)||player<0||player>1||!['title','select','ready'].includes(screen))return false;
 const connected=[0,1].filter(index=>players?.[index]?.connected===true);
 if(!connected.includes(player))return false;
 if(connected.length===1)return true;
 if(screen==='select'&&mode==='local')return player===activePlayer;
 if(screen==='ready'&&mode==='local')return true;
 return player===0;
}

// Read each time focus or activation is requested: a cached target can become
// hidden, disabled or detached between polls or after a modal/screen transition.
export function availableControllerItems(items,{scope}={}) {
 return Array.from(items??[]).filter(item=>{
  if(!item||item.isConnected!==true||item.disabled||item.hidden||item.inert)return false;
  if(scope&&!scope.contains?.(item))return false;
  if(item.getAttribute?.('aria-disabled')==='true'||item.matches?.(':disabled'))return false;
  if(item.closest?.('[hidden], [inert], [aria-hidden="true"]'))return false;
  const style=item.ownerDocument?.defaultView?.getComputedStyle?.(item);
  if(style&&(style.display==='none'||['hidden','collapse'].includes(style.visibility)))return false;
  return !!item.getClientRects?.().length;
 });
}
