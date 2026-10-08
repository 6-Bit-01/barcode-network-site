const ACTOR_LIMIT=4,ECHO_LIMIT=3,LINE_LIMIT=2,ECHO_LIFE=90,LINE_LIFE=80;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const point=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y)?{x:value.x,y:value.y}:null;

/** Presentation only. The renderer supplies its resolved native crop and world points.
 * Call beginFrame once, then drawBody immediately before each intact whole-body draw.
 * Exclude masked, erased, split or rotated bodies unless their identical transform is applied.
 */
export function createFightMotionFX(options={}) {
  const actors=new Map();
  const fallSpeed=clamp(finite(options.fallSpeed,360),300,1200);
  const echoOpacity=clamp(finite(options.echoOpacity,.1),0,.12);
  let time=null,resetKey,enabled=false;
  let paused=false,reducedMotion=Boolean(options.reducedMotion),review=false,peaceful=false;

  function clear(){actors.clear();time=null;enabled=false;}
  function beginFrame(state={}) {
    const next=finite(state.timeMs,null);
    paused=Boolean(state.paused);review=Boolean(state.review);peaceful=Boolean(state.peaceful);
    reducedMotion=Boolean(state.reducedMotion??options.reducedMotion);
    const discontinuity=time!==null&&(next<time||next-time>120||state.resetKey!==resetKey);
    enabled=next!==null&&!paused&&!reducedMotion&&!review&&!peaceful;
    if(!enabled||discontinuity)actors.clear();
    time=next;resetKey=state.resetKey;
    if(!enabled)return;
    for(const [key,actor]of actors) {
      if(time-actor.previous.time>240){actors.delete(key);continue;}
      actor.echoes=actor.echoes.filter(echo=>time-echo.at<ECHO_LIFE);
      actor.lines=actor.lines.filter(line=>time-line.at<LINE_LIFE);
    }
  }

  function observation(body) {
    const {image,source,destination}=body,position=point(body.position);
    if(!image||!position||!Array.isArray(source)||source.length!==4||!source.every(Number.isFinite)
      ||!Array.isArray(destination)||destination.length!==4||!destination.every(Number.isFinite))return null;
    const [sx,sy,sw,sh]=source,[dx,dy,dw,dh]=destination;
    const scale=dw/sw;
    if(sx<0||sy<0||sw<=0||sh<=0||dw<=0||dh<=0||scale>8
      ||Math.abs(scale-dh/sh)>1e-6||!Number.isFinite(image.width)||!Number.isFinite(image.height)
      ||sx+sw>image.width||sy+sh>image.height||sw>4096||sh>4096)return null;
    return {image,source:source.slice(),destination:destination.slice(),position,
      fighterId:body.fighterId,facing:body.facing,time,airborne:Boolean(body.airborne),
      opacity:clamp(finite(body.opacity,1),0,1),attackKey:body.attackKey??null,
      strike:point(body.strike),strikeStart:point(body.strikeStart)};
  }

  function drawBody(ctx,body={}) {
    const key=body.key;
    if(!enabled)return false;
    if((typeof key!=='string'&&typeof key!=='number')||body.eligible===false||body.peaceful){actors.delete(key);return false;}
    const current=observation(body);
    if(!current||current.opacity<=0){actors.delete(key);return false;}
    let actor=actors.get(key),previous=actor?.previous;
    if(previous&&(previous.image!==current.image||previous.fighterId!==current.fighterId||previous.facing!==current.facing)) {
      actors.delete(key);actor=null;previous=null;
    }
    if(previous?.time===time)return false;
    if(!actor) {
      if(actors.size>=ACTOR_LIMIT)return false;
      actor={previous:current,echoes:[],lines:[]};actors.set(key,actor);return false;
    }
    const dt=time-previous.time,travel={x:current.position.x-previous.position.x,y:current.position.y-previous.position.y};
    const landed=previous.airborne&&!current.airborne;
    const continuous=dt>0&&dt<=100&&Math.hypot(travel.x,travel.y)<=160;
    if(!continuous||landed){actor.echoes.length=0;actor.lines.length=0;}
    if(continuous&&!landed) {
      if(current.airborne&&previous.airborne&&body.falling!==false&&travel.y>=3&&travel.y*1000/dt>=fallSpeed) {
        actor.echoes.push({...previous,at:time});
        if(actor.echoes.length>ECHO_LIMIT)actor.echoes.shift();
      } else actor.echoes.length=0;
      if(current.attackKey===null||current.attackKey!==previous.attackKey||!current.strike||!current.strikeStart)actor.lines.length=0;
      else if(current.strike&&current.strikeStart&&previous.strike&&previous.strikeStart) {
        // Remove whole-body translation: only native limb-tip travel draws a line.
        const from={x:previous.strike.x+travel.x,y:previous.strike.y+travel.y},to=current.strike;
        const vx=to.x-from.x,vy=to.y-from.y,length=Math.hypot(vx,vy);
        const limbLength=Math.hypot(to.x-current.strikeStart.x,to.y-current.strikeStart.y);
        if(length>=4&&length*1000/dt>=180&&limbLength>=4&&limbLength<=400) {
          const limited=Math.min(length,130)/length;
          actor.lines.push({from:{x:to.x-vx*limited,y:to.y-vy*limited},to:{...to},at:time});
          if(actor.lines.length>LINE_LIMIT)actor.lines.shift();
        }
      }
    }
    actor.previous=current;
    let drawn=false;
    ctx.save();
    for(const echo of actor.echoes) {
      const age=time-echo.at,fade=clamp(1-age/ECHO_LIFE,0,1);
      ctx.globalAlpha=echoOpacity*fade*Math.min(current.opacity,echo.opacity);
      ctx.drawImage(echo.image,...echo.source,...echo.destination);drawn=true;
    }
    ctx.strokeStyle='#dbe5ef';ctx.lineWidth=1.5;ctx.lineCap='round';
    for(const line of actor.lines) {
      ctx.globalAlpha=.26*clamp(1-(time-line.at)/LINE_LIFE,0,1)*current.opacity;
      ctx.beginPath();ctx.moveTo(line.from.x,line.from.y);ctx.lineTo(line.to.x,line.to.y);ctx.stroke();drawn=true;
    }
    ctx.restore();return drawn;
  }

  return {beginFrame,drawBody,clear,getStats(){return {
    actors:actors.size,echoes:[...actors.values()].reduce((sum,actor)=>sum+actor.echoes.length,0),
    windlines:[...actors.values()].reduce((sum,actor)=>sum+actor.lines.length,0),paused,reducedMotion,review,peaceful,
  };}};
}
