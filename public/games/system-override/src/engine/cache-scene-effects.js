// Local light and weather over the approved Cache paintings. This renderer
// owns no clock, audio, DOM, image, timer or frame loop. All coordinates are
// measured fractions of the supplied painted-image rectangle, not the frame.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/engine/cache-scene-effects.js',
  exports:['BARCODE.CacheSceneEffects'],dependencies:[]});
(function(B) {
  'use strict';
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
  const number=value=>Number.isFinite(value)?Math.max(0,value):0;
  const fract=value=>value-Math.floor(value);
  const smooth=value=>{const n=clamp(value,0,1);return n*n*(3-2*n);};
  const warm='255,190,88',mint='141,242,224',amber='255,210,112';
  // Face silhouettes, hands and the protected original remain untouched by
  // weather. Studio effects stay on practical lamps, glass and tape hardware.
  const scenes={
    bridge:[
      {rain:[[0,0,.20,1],[.45,0,.55,1]],
        lights:[[.457,.226,.052,.105,warm,.085],[.884,.184,.048,.09,warm,.085]],
        puddles:[[.58,.90],[.73,.85],[.88,.94]],reflections:[[.58,.82,.12,warm],[.85,.80,.14,mint]]},
      {lights:[[.124,.076,.087,.13,warm,.08],[.882,.071,.06,.10,warm,.06]],
        screens:[{quad:[[.898,.165],[1,.134],[1,.555],[.886,.504]],kind:'network',color:mint}],
        glows:[[.699,.724,.025,.021,amber],[.722,.865,.039,.02,amber]],
        reels:[[.461,.18,.026,.060],[.512,.178,.023,.056]]},
      {lights:[[.085,.120,.073,.13,warm,.07]],
        screens:[{quad:[[.510,.386],[.613,.374],[.613,.542],[.507,.548]],kind:'original',color:amber}],
        glows:[[.545,.838,.014,.017,amber]],
        reels:[[.564,.682,.009,.017],[.616,.682,.009,.017]]},
      {lights:[[.138,.105,.075,.13,warm,.07]],
        screens:[{quad:[[.063,.237],[.278,.379],[.284,.766],[.061,.687]],kind:'clean',color:mint}],
        glows:[[.537,.932,.014,.011,amber]],
        reels:[[.366,.758,.007,.015],[.415,.767,.007,.015]]},
      {lights:[[.123,.123,.074,.13,warm,.065]],
        screens:[{quad:[[.021,.389],[.099,.423],[.098,.585],[.020,.565]],kind:'paired',color:mint}],
        glows:[[.706,.539,.010,.011,'255,112,81'],[.894,.480,.035,.022,amber]],
        seal:[.58,.513,.146,.22]},
      {rain:[[.88,0,.12,1],[.365,0,.070,.27]],
        lights:[[.084,.092,.073,.13,warm,.085],[.964,.231,.036,.065,warm,.065]],
        glows:[[.482,.620,.048,.019,'255,122,75'],[.801,.619,.047,.018,'255,122,75']],
        puddles:[[.11,.88],[.25,.94],[.94,.89]],reflections:[[.20,.80,.16,warm],[.94,.72,.21,mint]]},
      {rain:[[.785,.018,.21,.39],[.395,.175,.13,.18]],
        lights:[[.914,.156,.026,.065,warm,.045]],
        screens:[{quad:[[.849,.632],[.999,.676],[.999,.819],[.846,.775]],kind:'network',color:mint}],
        glows:[[.457,.573,.037,.06,amber],[.684,.588,.046,.012,mint],[.759,.701,.010,.046,amber]]},
      {rain:[[0,0,1,.43],[0,.44,.35,.56],[.65,.44,.35,.56]],
        lights:[[.194,.061,.037,.073,warm,.055],[.869,.069,.038,.072,warm,.055]],
        glows:[[.417,.720,.026,.015,'255,124,76'],[.568,.720,.026,.015,'255,124,76']],
        reflections:[[.28,.57,.36,warm],[.77,.58,.36,warm]],
        puddles:[[.21,.85],[.78,.93],[.62,.91]],departure:true}
    ],
    ending:[
      {rain:[[0,0,.325,.267],[0,.60,.032,.29]],
        lights:[[.490,.044,.051,.084,warm,.065],[.835,.073,.032,.060,warm,.055]],
        glows:[[.705,.882,.038,.012,mint],[.602,.873,.027,.012,mint]],
        seal:[.589,.621,.216,.269],puddles:[[.11,.77],[.26,.82]]},
      {lights:[[.335,.083,.072,.13,warm,.06]],
        // The central portions of these actual screens belong to the
        // DELIVERED / UNVERIFIED labels. Only their top/bottom rims animate.
        screens:[{quad:[[.124,.228],[.271,.296],[.271,.553],[.123,.516]],kind:'status',color:mint},
          {quad:[[.338,.323],[.445,.380],[.445,.602],[.337,.566]],kind:'status',color:amber}],
        glows:[[.486,.400,.008,.012,amber],[.486,.776,.008,.011,amber]]},
      {lights:[[.094,.124,.070,.12,warm,.065],[.892,.112,.063,.11,warm,.065]],
        screens:[{quad:[[.410,.462],[.523,.460],[.523,.574],[.410,.575]],kind:'original',color:amber},
          {quad:[[.594,.468],[.700,.470],[.700,.579],[.594,.578]],kind:'clean',color:amber},
          {quad:[[.911,.188],[1,.139],[1,.441],[.906,.462]],kind:'network',color:mint}],
        glows:[[.549,.787,.016,.020,amber]]},
      {rain:[[.554,0,.446,.94]],
        lights:[[.565,.035,.035,.073,warm,.07],[.900,.211,.042,.082,warm,.07]],
        glows:[[.491,.491,.021,.009,'255,101,82'],[.922,.491,.027,.009,'255,101,82'],
          [.138,.622,.009,.049,mint]],
        puddles:[[.66,.84],[.79,.94],[.94,.76]],reflections:[[.69,.65,.28,warm],[.85,.66,.29,mint]]}
    ]
  };
  // Freeze authored geometry so successive readers cannot change the source
  // alignment or introduce frame-to-frame accumulation into this pure owner.
  function freeze(value) {
    if(value&&typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}
    return value;
  }
  freeze(scenes);
  function validRect(rect) {
    return rect&&[rect.x,rect.y,rect.w,rect.h].every(Number.isFinite)&&rect.w>0&&rect.h>0;
  }
  function polygon(ctx,points) {
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
  }
  function point(quad,u,v) {
    const top=[quad[0][0]+(quad[1][0]-quad[0][0])*u,quad[0][1]+(quad[1][1]-quad[0][1])*u];
    const bottom=[quad[3][0]+(quad[2][0]-quad[3][0])*u,quad[3][1]+(quad[2][1]-quad[3][1])*u];
    return [top[0]+(bottom[0]-top[0])*v,top[1]+(bottom[1]-top[1])*v];
  }
  function band(ctx,quad,top,bottom,color,alpha) {
    polygon(ctx,[point(quad,.015,top),point(quad,.985,top),point(quad,.985,bottom),point(quad,.015,bottom)]);
    ctx.fillStyle=`rgba(${color},${alpha})`;ctx.fill();
  }
  function glow(ctx,[x,y,rx,ry,color],alpha) {
    ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
    const gradient=ctx.createRadialGradient(0,0,0,0,0,1);
    gradient.addColorStop(0,`rgba(${color},${alpha})`);
    gradient.addColorStop(.32,`rgba(${color},${alpha*.62})`);
    gradient.addColorStop(1,`rgba(${color},0)`);
    ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  function rain(ctx,zones,time,still) {
    for(let zone=0;zone<zones.length;zone++) {
      const [x,y,w,h]=zones[zone],count=still?9:Math.min(30,12+Math.ceil(w*h*42));
      ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
      ctx.strokeStyle=`rgba(179,214,242,${still?.12:.18})`;ctx.lineWidth=.00065;
      ctx.beginPath();
      for(let i=0;i<count;i++) {
        const seed=i+zone*31,px=x+w*fract(seed*.61803398875+.19);
        const py=y+h*fract(seed*.41421356237+.12+(still?0:time*(.12+fract(seed*.37)*.06)));
        const length=.009+fract(seed*.27)*.012;
        ctx.moveTo(px,py);ctx.lineTo(px-.0026,py+length);
      }
      ctx.stroke();ctx.restore();
    }
  }
  function screen(ctx,screen,time,still) {
    const {quad,kind,color}=screen;
    ctx.save();polygon(ctx,quad);ctx.clip();
    if(kind==='status') {
      // Never tint, scan across, or occlude either receiver status word.
      const v=still?.095:.045+.11*(.5+.5*Math.sin(time*.5));
      band(ctx,quad,v,v+.017,color,.095);
      band(ctx,quad,.925,.942,color,.065);ctx.restore();return;
    }
    const scan=still?.24:fract(time*.065+.23);
    band(ctx,quad,scan,Math.min(1,scan+.014),color,.12);
    band(ctx,quad,Math.max(0,scan-.065),scan,color,.022);
    if(kind==='original'||kind==='clean'||kind==='paired') {
      const traces=kind==='paired'?[.30,.73]:[.52];
      for(const mid of traces) {
        ctx.beginPath();
        for(let i=0;i<=64;i++) {
          const u=.025+i/64*.95,phase=still?0:time*.72;
          // Quiet slots stay in fixed places on the clean-copy screen;
          // scrolling the detail cannot fill the removed passages back in.
          const retained=kind!=='clean'||u<.16||u>.35&&u<.56||u>.84;
          const harmonic=Math.sin(i*2.7+phase)*.065+Math.sin(i*.94-phase*.7)*.045+
            Math.sin(i*.33+phase*.35)*.07;
          const amplitude=retained?harmonic:0;
          const [x,y]=point(quad,u,mid+amplitude*(kind==='paired'?.42:.72));
          if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
        }
        ctx.strokeStyle=`rgba(${color},.38)`;ctx.lineWidth=.00072;ctx.stroke();
      }
    }
    ctx.restore();
  }
  function reel(ctx,[x,y,rx,ry],time,still) {
    ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
    const phase=still?.45:time*.8;
    ctx.strokeStyle='rgba(255,218,151,.18)';ctx.lineWidth=.08;ctx.beginPath();
    for(let i=0;i<3;i++) {
      const angle=phase+i*Math.PI*2/3;
      ctx.moveTo(Math.cos(angle)*.83,Math.sin(angle)*.83);
      ctx.arc(0,0,.83,angle,angle+.28);
    }
    ctx.stroke();ctx.restore();
  }
  function puddles(ctx,positions,time,still) {
    positions.forEach(([x,y],i)=>{
      const phase=still?.5:fract(time*.18+i*.337),radius=.004+phase*.013;
      ctx.strokeStyle=`rgba(164,213,234,${still?.13:(1-phase)*.20})`;ctx.lineWidth=.0005;
      ctx.beginPath();ctx.ellipse(x,y,radius,radius*.24,0,0,Math.PI*2);ctx.stroke();
    });
  }
  function reflection(ctx,[x,y,length,color],time,still,index) {
    const drift=still?0:Math.sin(time*.38+index)*.003;
    ctx.strokeStyle=`rgba(${color},.105)`;ctx.lineWidth=.0011;ctx.beginPath();
    for(let i=0;i<7;i++) {
      const yy=y+length*i/7,xx=x+drift+Math.sin(i*1.7+index)*.008;
      const width=.007+i*.0012;
      ctx.moveTo(xx-width,yy);ctx.lineTo(xx+width,yy+.001);
    }
    ctx.stroke();
  }
  function seal(ctx,[x,y,w,h],time,still,alpha) {
    // A travelling highlight stays on the clear lid's upper lip, away from
    // the tape identity, warning stripe, hands and receiver wording.
    const u=still?.50:.15+.68*(.5+.5*Math.sin(time*.43));
    const gradient=ctx.createLinearGradient(x+w*(u-.12),y,x+w*(u+.12),y);
    gradient.addColorStop(0,'rgba(200,246,250,0)');gradient.addColorStop(.5,`rgba(200,246,250,${alpha})`);
    gradient.addColorStop(1,'rgba(200,246,250,0)');ctx.strokeStyle=gradient;ctx.lineWidth=.0015;
    ctx.beginPath();ctx.moveTo(x+w*.08,y);ctx.lineTo(x+w*.93,y+h*.01);ctx.stroke();
  }
  function pose({chapter='bridge',page=0,elapsedMs=0,sceneElapsedMs,reduced=false,flashes=true,rect}={}) {
    if(!validRect(rect))return null;
    const still=reduced||flashes===false;
    const settle=still?1:smooth(number(sceneElapsedMs??elapsedMs)/6000);
    const scale=.988+.012*settle;
    const direction=((Math.floor(number(page))+(chapter==='ending'?1:0))%2?1:-1);
    const dx=still?0:direction*rect.w*.0012*(1-settle);
    const dy=still?0:rect.h*.0007*(1-settle);
    return {x:rect.x+rect.w*(1-scale)/2+dx,y:rect.y+rect.h*(1-scale)/2+dy,
      w:rect.w*scale,h:rect.h*scale,scale};
  }
  function draw(ctx,{chapter='bridge',page=0,rect,sceneElapsedMs=0,cue=0,cueElapsedMs=0,
    reduced=false,flashes=true}={}) {
    const scene=scenes[chapter]?.[page];
    if(!ctx||!scene||!validRect(rect))return false;
    const still=!!reduced||flashes===false,time=still?0:number(sceneElapsedMs)%60000/1000;
    const cueAccent=cue>0?(still?.75:1-.55*smooth(number(cueElapsedMs)/1100)):.4;
    ctx.save();
    try {
      ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();
      ctx.translate(rect.x,rect.y);ctx.scale(rect.w,rect.h);
      ctx.globalCompositeOperation='screen';ctx.shadowBlur=0;ctx.filter='none';
      if(scene.rain)rain(ctx,scene.rain,time,still);
      (scene.lights||[]).forEach((lamp,i)=>{
        const breathe=still?1:.88+.12*Math.sin(time*.45+i*1.7);
        glow(ctx,lamp,lamp[5]*breathe);
      });
      (scene.screens||[]).forEach(item=>screen(ctx,item,time,still));
      (scene.glows||[]).forEach((item,i)=>glow(ctx,item,
        .13+cueAccent*.11+(still?0:.02*Math.sin(time*.7+i))));
      // Tape/reel motion starts with a revealed line; the title stays calm.
      (scene.reels||[]).forEach(item=>reel(ctx,item,cue>0?time:0,still||cue===0));
      if(scene.puddles)puddles(ctx,scene.puddles,time,still);
      (scene.reflections||[]).forEach((item,i)=>reflection(ctx,item,time,still,i));
      if(scene.seal)seal(ctx,scene.seal,time,still,.16+cueAccent*.12);
      if(scene.departure) {
        // Very small wet-road glints flank the car; the car, lane geometry
        // and camera never receive a synthetic shake or a speed streak.
        reflection(ctx,[.401,.90,.08,'255,105,71'],time,still,2);
        reflection(ctx,[.589,.90,.08,'255,105,71'],time,still,3);
      }
    } finally {ctx.restore();}
    return true;
  }
  B.CacheSceneEffects=Object.freeze({draw,pose,scenes});
})(window.BARCODE=window.BARCODE||{});
