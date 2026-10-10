import {CORPORATE_FIGHTERS} from './demo-flow.mjs';
export const SEALED_FIGHTER_ART='assets/ui/sealed-fighter-wire.webp';
export function isSealedFighter(fighter){return CORPORATE_FIGHTERS.includes(fighter.id)&&fighter.enabled!==true;}
export function appendSealedFighterCard(document,button,{baseURL}={}){
 button.className+=' sealed-fighter';button.setAttribute('aria-label','Sealed fighter. Enter a broadcast code in Options to unlock.');
 const image=document.createElement('img');image.className='sealed-fighter-art';image.src=baseURL?new URL(SEALED_FIGHTER_ART,baseURL).href:SEALED_FIGHTER_ART;image.alt='';image.setAttribute('aria-hidden','true');image.width=384;image.height=480;
 const name=document.createElement('span');name.className='fighter-name';name.textContent='SEALED';button.append(image,name);
}
