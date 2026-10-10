import {createMatch,advanceMatch,performAction,getFighterView,consumeEvents} from './fight-engine.mjs';
import {createFightEffects} from './fight-effects.mjs';

// Replay the real events at the live physics cadence. Seeking never mutates the
// live match or starts audio, and now includes the same blood shown in a fight.
export function createDeletionReview({time=0,metadata,art,deletionProp,renderer,direction='right',reducedMotion=false,stage='radio-studio',getRemainsArt}) {
  const match=createMatch({mode:'practice',stage,clips:metadata,fighters:art.map(f=>({id:f.manifest.id,name:f.manifest.character,height:f.manifest.height})),start:true});
  const effects=createFightEffects({reducedMotion,muted:true,getRemainsArt});
  if(direction==='left')[match.fighters[0].x,match.fighters[1].x]=[match.fighters[1].x,match.fighters[0].x];
  performAction(match,0,'deletion');
  const dispatch=()=>{
    const views=match.fighters.map((_,index)=>getFighterView(match,index));
    for(const event of consumeEvents(match))effects.emit(renderer.resolveEvent(event,{match,views,art,deletionProp}));
  };
  dispatch();
  let elapsed=0;
  const steps=Math.ceil(time/(1000/60));
  for(let step=1;step<=steps;step++) {
    const next=Math.min(time,step*(1000/60));
    // Subtract the actual scene clock so floating-point drift cannot leave an
    // exact requested contact just before its native pose or impact cue.
    const dt=next-(match.phase==='deletion'?match.deletionElapsed:elapsed);
    if(dt>0){advanceMatch(match,dt);dispatch();effects.update(dt);}
    elapsed=next;
  }
  return {match,effects};
}
