import {loadFightArt,loadArcadeArt,loadDeletionArt,loadWeaponArt,loadStageArt,combatMetadata} from './fight-assets.mjs';
import {loadRemainsArt} from './fight-remains.mjs';
import {loadInterfaceArt} from './interface-art.mjs';
import {createFightRenderer} from './fight-renderer.mjs';
import {createDeletionReview} from './fight-review.mjs';
import {advanceMatch,consumeEvents,getFighterView} from './fight-engine.mjs';
import {deletionDefinition} from './deletion-library.mjs';

const STEP=1000/60;
const CACHE_LIMIT=5;
const fighterCache=new Map();
const sharedCache=new Map();

function trimFighterCache(){
  while(fighterCache.size>CACHE_LIMIT){
    const unused=[...fighterCache].find(([,entry])=>entry.references===0);
    if(!unused)break; // Visible scenes retain their art until dispose().
    fighterCache.delete(unused[0]);
  }
}
function release(entry){
  entry.references=Math.max(0,entry.references-1);
  // Move released entries to the end so the oldest unused art goes first.
  if(fighterCache.get(entry.key)===entry){
    fighterCache.delete(entry.key);
    fighterCache.set(entry.key,entry);
  }
  trimFighterCache();
}
function acquireFighter(fighterId,baseURL){
  const key=baseURL+'|'+fighterId;
  let entry=fighterCache.get(key);
  if(!entry){
    entry={key,references:0,promise:null};
    entry.promise=(async()=>{
      const [fighter]=await loadFightArt({baseURL,ids:[fighterId]});
      await loadArcadeArt({baseURL,art:[fighter]});
      // This loader scopes signature props to the supplied fighter, rather than
      // fetching the whole roster's cinematics.
      const deletionProp=await loadDeletionArt({baseURL,art:[fighter]});
      return {fighter,deletionProp};
    })().catch(error=>{
      if(fighterCache.get(key)===entry)fighterCache.delete(key);
      throw error;
    });
    fighterCache.set(key,entry);
  }else{
    fighterCache.delete(key);
    fighterCache.set(key,entry);
  }
  entry.references++;
  trimFighterCache();
  return entry;
}
function sharedArt(baseURL){
  let promise=sharedCache.get(baseURL);
  if(!promise){
    promise=Promise.all([
      loadWeaponArt({baseURL}),
      loadStageArt({baseURL,id:'radio-studio'}),
      loadRemainsArt({baseURL}),
      loadInterfaceArt({baseURL})
    ]).then(([weaponArt,stageArt,remains,interfaceArt])=>({weaponArt,stageArt,remains,interfaceArt}))
      .catch(error=>{if(sharedCache.get(baseURL)===promise)sharedCache.delete(baseURL);throw error;});
    sharedCache.set(baseURL,promise);
  }
  return promise;
}

/** Isolated, muted complete deletion. No game controls, audio start or sessions. */
export async function loadReviewScene(item,baseURL){
  const fighterId=item?.fighterId;
  const definition=deletionDefinition(fighterId);
  if(!fighterId||!definition||!Number.isFinite(definition.duration)||definition.duration<=0){
    throw new Error('This fighter has no complete deletion review.');
  }
  const opponentId=item.opponentId??(fighterId==='9-bit'?'6-bit':'9-bit');
  if(!deletionDefinition(opponentId))throw new Error('The review opponent is unavailable.');
  const base=new URL('.',baseURL??import.meta.url).href;
  let leases=[acquireFighter(fighterId,base),acquireFighter(opponentId,base)];
  const results=await Promise.allSettled([...leases.map(entry=>entry.promise),sharedArt(base)]);
  const failure=results.find(result=>result.status==='rejected');
  if(failure){leases.forEach(release);throw failure.reason;}
  const attacker=results[0].value,victim=results[1].value,shared=results[2].value;
  let art=[attacker.fighter,victim.fighter];
  let deletionProp={
    ...attacker.deletionProp,
    additional:{...victim.deletionProp.additional,...attacker.deletionProp.additional},
    remains:shared.remains
  };
  const duration=definition.duration;
  let renderer=null,canvas=null,metadata=null,review=null,disposed=false;
  let direction='right',epoch=0,simulationTime=0,stepIndex=0,remainder=0;
  let previousTarget=-1,previousInput=-1,previousCycle=-1;

  function reset(facing){
    review?.effects.clear();
    direction=facing;
    review=createDeletionReview({
      time:0,metadata,art,deletionProp,renderer,
      direction,stage:'radio-studio',reducedMotion:false,getRemainsArt:()=>shared.remains
    });
    simulationTime=0;
    stepIndex=0;
    remainder=0;
    epoch++;
  }
  function dispatch(){
    const views=review.match.fighters.map((_,index)=>getFighterView(review.match,index));
    for(const event of consumeEvents(review.match)){
      review.effects.emit(renderer.resolveEvent(event,{match:review.match,views,art,deletionProp}));
    }
  }

  return {
    duration,
    draw(targetCanvas,time=0,facing='right'){
      if(disposed)return;
      if(!targetCanvas?.getContext)throw new Error('A review canvas is required.');
      const input=Math.max(0,Number.isFinite(Number(time))?Number(time):0);
      const cycle=Math.floor(input/duration),target=input-cycle*duration;
      const face=facing==='left'?'left':'right';
      const newCanvas=canvas!==targetCanvas;
      if(newCanvas){
        review?.effects.clear();
        renderer=createFightRenderer(targetCanvas); // Native 1280 × 720 stage.
        canvas=targetCanvas;
        renderer.prepareInterface(shared.interfaceArt);
        renderer.prepareArt(art);
        metadata=combatMetadata(art,shared.weaponArt);
      }
      if(newCanvas||!review||face!==direction||target<previousTarget||
          input<previousInput||cycle!==previousCycle){
        reset(face);
      }

      // Keep the remainder between draws. Only complete globally anchored
      // 60 Hz steps enter physics; rendering never creates extra partial steps.
      // Subtract the actual scene clock, as the existing seek helper does.
      const desiredSteps=Math.floor((target+1e-8)/STEP);
      while(stepIndex<desiredSteps){
        const next=(stepIndex+1)*STEP;
        const clock=review.match.phase==='deletion'?review.match.deletionElapsed:simulationTime;
        const dt=next-clock;
        if(dt>0){
          advanceMatch(review.match,dt);
          dispatch();
          review.effects.update(dt);
        }
        simulationTime=next;
        stepIndex++;
      }
      remainder=Math.max(0,target-simulationTime);
      const views=review.match.fighters.map((_,index)=>getFighterView(review.match,index));
      renderer.draw({
        match:review.match,views,art,effects:review.effects,deletionProp,
        stageArt:shared.stageArt,weaponArt:shared.weaponArt,
        deletionReview:true,paused:false,reducedMotion:false,
        presentationTimeMs:target,motionResetKey:String(item.id??fighterId)+':'+epoch
      });
      previousTarget=target;
      previousInput=input;
      previousCycle=cycle;
      return {time:target,simulationTime,remainder};
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      review?.effects.clear();
      review=null;renderer=null;metadata=null;art=null;deletionProp=null;
      // Release the native render buffer. A future player restores its size.
      if(canvas){canvas.width=1;canvas.height=1;canvas=null;}
      leases.forEach(release);
      leases=null;
    }
  };
}
