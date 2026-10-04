// Crew comms are transient feedback owned by the road's existing update.
// Contacts still belong to CacheRoadCrosswalks; this painter owns no economy,
// input, audio, timer, save or animation loop.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/game/cache-road-crew-callouts.js',
  exports:['BARCODE.CacheRoadCrewCallouts'],dependencies:['BARCODE.PresentationAssets']});
(function(B) {
  'use strict';
  const DURATION_MS=3200, MAX_CONTACTS=8;
  const BOUNDS=Object.freeze({x:514,y:177,w:892,h:126});
  const CREW=Object.freeze([
    Object.freeze({speaker:'6 BIT',frame:0,color:'#e6e5ee'}),
    Object.freeze({speaker:'DJ FLOPPYDISC',frame:1,color:'#83e9ff'}),
    Object.freeze({speaker:'MAC MODEM',frame:2,color:'#ff929c'})
  ]);
  const LINES=Object.freeze([
    'Cache! The road. Drive on the fucking road.',
    'That thump was not in the mix, Cache.',
    'Brake pedal. Try plugging your fucking foot into it.',
    'That was a person, you absolute loading screen.',
    'Stop adding pedestrians to the percussion.',
    'Your driving needs a firmware patch.',
    "Cache, that's a crosswalk, not a combo lane.",
    "You're clipping the audience. Literally.",
    'I opened the road, not a fucking bowling alley.',
    'Cache, those are people, not bonus targets.',
    'Nobody asked for a crosswalk drum solo.',
    'Pedestrian detection: apparently uninstalled.'
  ]);
  const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
  function lineFor(hitCount) {
    const ordinal=Math.max(0,Math.floor(finite(hitCount,1))-1);
    return {...CREW[ordinal%CREW.length],message:LINES[ordinal%LINES.length]};
  }
  function begin(state) {
    if(!state.crosswalkToast&&state.crosswalkMessages?.length)
      state.crosswalkToast={...state.crosswalkMessages.shift(),remainingMs:DURATION_MS};
  }
  function enqueue(state,event) {
    if(!state||event?.type!=='pedestrian-hit'||typeof event.id!=='string'||
        !Number.isInteger(event.hitCount)||event.hitCount<1||event.hitCount>MAX_CONTACTS)return false;
    const seen=state.crosswalkCalloutIds||(state.crosswalkCalloutIds=[]);
    if(seen.includes(event.id)||seen.length>=MAX_CONTACTS)return false;
    seen.push(event.id);
    (state.crosswalkMessages||(state.crosswalkMessages=[])).push({id:event.id,...lineFor(event.hitCount)});
    begin(state);return true;
  }
  function step(state,delta) {
    if(!state)return;
    let remaining=Math.max(0,Math.min(250,finite(delta)));
    if(!remaining)return;
    begin(state);
    // Carry a frame's leftover time across one expiry. Every queued contact
    // receives its own readable hold, including two bodies hit in one frame.
    for(let count=0;state.crosswalkToast&&remaining>0&&count<=MAX_CONTACTS;count++) {
      const toast=state.crosswalkToast,used=Math.min(remaining,Math.max(0,finite(toast.remainingMs)));
      toast.remainingMs=Math.max(0,finite(toast.remainingMs)-used);remaining-=used;
      if(toast.remainingMs)break;
      state.crosswalkToast=null;begin(state);
    }
  }
  function wrap(ctx,message,width) {
    const lines=[];let line='';
    for(const word of message.split(/\s+/)) {
      const next=line?`${line} ${word}`:word;
      if(line&&ctx.measureText(next).width>width) {lines.push(line);line=word;}
      else line=next;
    }
    if(line)lines.push(line);return lines;
  }
  function draw(ctx,state) {
    const toast=state?.crosswalkToast;
    if(!toast||!toast.speaker||toast.remainingMs<=0)return null;
    const {x,y,w,h}=BOUNDS,portrait=104,px=x+12,py=y+11,textX=x+135,textWidth=w-151;
    ctx.save();ctx.globalAlpha=1;
    // The panel stays between the left earned receipt and right pad/rig
    // diagrams, below the mirror. It never enters the road-camera transform.
    ctx.fillStyle='#090f1ae8';ctx.fillRect(x+5,y+5,w,h);
    ctx.fillStyle='#efe4c9';ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='#131722';ctx.lineWidth=4;ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='#171e2d';ctx.fillRect(px,py,portrait,portrait);
    ctx.save();ctx.beginPath();ctx.rect(px,py,portrait,portrait);ctx.clip();
    const painted=B.PresentationAssets?.draw?.('cacheCrewCallouts',ctx,
      {x:px+portrait/2,y:py+portrait/2,width:portrait,height:portrait,frame:toast.frame});
    if(!painted) {
      ctx.fillStyle=toast.color;ctx.font='bold 25px Oxanium, monospace';ctx.textAlign='center';
      ctx.textBaseline='middle';ctx.fillText(toast.speaker==='6 BIT'?'6B':toast.speaker==='MAC MODEM'?'MM':'DJ',
        px+portrait/2,py+portrait/2,portrait-10);
    }
    ctx.restore();ctx.strokeStyle=toast.color;ctx.lineWidth=3;ctx.strokeRect(px,py,portrait,portrait);
    ctx.fillStyle='#171e2d';ctx.fillRect(textX-5,y+10,textWidth+1,25);
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.fillStyle=toast.color;ctx.font='bold 18px Oxanium, monospace';
    ctx.fillText(toast.speaker,textX,y+29);
    ctx.textAlign='right';ctx.fillStyle='#d6ccb8';ctx.font='bold 11px Oxanium, monospace';
    ctx.fillText('CREW COMMS',x+w-17,y+27);
    ctx.textAlign='left';ctx.fillStyle='#171e2d';ctx.font='bold 27px Oxanium, monospace';
    let lines=wrap(ctx,toast.message,textWidth-6);
    if(lines.length>2) {ctx.font='bold 23px Oxanium, monospace';lines=wrap(ctx,toast.message,textWidth-6);}
    const startY=lines.length===1?y+81:y+67;
    for(let index=0;index<lines.length;index++)ctx.fillText(lines[index],textX,startY+index*31);
    ctx.restore();return BOUNDS;
  }
  B.CacheRoadCrewCallouts=Object.freeze({durationMs:DURATION_MS,bounds:BOUNDS,
    crew:CREW,lines:LINES,lineFor,enqueue,step,draw});
})(window.BARCODE=window.BARCODE||{});
