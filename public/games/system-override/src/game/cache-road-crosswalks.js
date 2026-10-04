// Four song-addressed crosswalks share the road's committed world trajectory.
// Pedestrian contacts are cosmetic: this owner never changes driving rewards,
// integrity, synchronization, abilities or the music clock.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name:'src/game/cache-road-crosswalks.js',
  exports:['BARCODE.CacheRoadCrosswalks'], dependencies:[] });
(function(B) {
  'use strict';
  const VERSION=1, SITES=Object.freeze([10,30,50,70]), CROSSING_MS=9000;
  const DELAYS=Object.freeze([0,600]), CURBS=Object.freeze([-.6,3.6]);
  const MAX_AGE=30000, BODY_REACH=12, LANE_REACH=.38;
  const MESSAGES=Object.freeze([
    'THAT WAS A CROSSWALK.',
    'PEDESTRIANS HAVE RIGHT OF WAY.',
    'BRAKES. YOU HAVE THEM.',
    'EYES ON THE ROAD, PLEASE.',
    'THE STRIPES WERE A CLUE.',
    'A LITTLE CARE WOULD HELP.',
    'THE SIDEWALK IS NOT A TARGET.',
    'NEXT TIME, LET THEM CROSS.'
  ]);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const finite=(n,f=0)=>Number.isFinite(n)?n:f;
  const number=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
  const integer=(n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b;
  const object=n=>!!n&&typeof n==='object'&&!Array.isArray(n);
  const copy=n=>JSON.parse(JSON.stringify(n));
  const idFor=bar=>`crosswalk-${bar}`;
  const personId=(bar,index)=>`cw-${bar}-${index?'right':'left'}`;
  const hits=mask=>(mask&1)+((mask>>1)&1);
  function create({progress=0,bar=0}={}) {
    const initialBar=Math.floor(clamp(finite(bar),0,100));
    return {version:VERSION,initialBar,lastBar:initialBar,
      lastProgress:clamp(finite(progress),0,24000),
      committedBars:SITES.filter(site=>site<=initialBar),crossings:[],hitCount:0};
  }
  function commit(state,section) {
    if(state?.version!==VERSION||!object(section)||!integer(section.beat,0,396)||section.beat%4||
      !number(section.from,0,24000))return null;
    const bar=section.beat/4;
    if(!SITES.includes(bar)||state.committedBars.includes(bar))return null;
    const crossing={id:idFor(bar),bar,at:section.from+300,started:false,ageMs:0,
      hitMask:0,hitTimes:[null,null],hitSides:[0,0]};
    state.crossings.push(crossing);state.crossings.sort((a,b)=>a.bar-b.bar);
    state.committedBars.push(bar);state.committedBars.sort((a,b)=>a-b);
    state.lastBar=Math.max(state.lastBar,bar);
    // Return a view so later callers cannot relocate the committed crossing.
    return {...crossing,hitTimes:[...crossing.hitTimes],hitSides:[...crossing.hitSides]};
  }
  function laneAt(age,index) {
    const fraction=clamp((age-DELAYS[index])/CROSSING_MS,0,1);
    return CURBS[index]+(CURBS[1-index]-CURBS[index])*fraction;
  }
  // Intersect a linear value with a closed physical footprint, retaining the
  // time interval. Longitudinal and lateral sweeps must overlap in time.
  function interval(value,rate,reach,low,high) {
    if(Math.abs(rate)<1e-12)return Math.abs(value)<=reach?[low,high]:null;
    const a=(-reach-value)/rate,b=(reach-value)/rate;
    low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));
    return low<=high?[low,high]:null;
  }
  function contact(crossing,index,frame) {
    const {dt,ageBase,startFraction,before,progress,previousLane,lane}=frame;
    const delay=DELAYS[index],begin=Math.max(startFraction,(delay-ageBase)/dt,0);
    const end=Math.min(1,(delay+CROSSING_MS-ageBase)/dt);
    if(begin>end)return null;
    const long=interval(crossing.at-before,-(progress-before),BODY_REACH,begin,end);
    if(!long)return null;
    const travel=(CURBS[1-index]-CURBS[index])/CROSSING_MS;
    const lateral=interval(CURBS[index]+travel*(ageBase-delay)-previousLane,
      travel*dt-(lane-previousLane),LANE_REACH,long[0],long[1]);
    return lateral?lateral[0]:null;
  }
  function step(state,dt,input={}) {
    if(state?.version!==VERSION)return [];
    dt=clamp(finite(dt),0,250);
    if(!dt)return [];
    const progress=clamp(finite(input.progress,state.lastProgress),0,24000);
    const before=clamp(finite(input.before,state.lastProgress),0,24000);
    const lane=clamp(finite(input.lanePos,1.5),0,3);
    const previousLane=clamp(finite(input.previousLanePos,lane),0,3);
    const speed=clamp(finite(input.speed,52),10,110),candidates=[];
    for(const crossing of state.crossings) {
      const previousAge=crossing.ageMs;
      let startFraction=0;
      if(!crossing.started) {
        const lead=speed*5.5,previousDistance=crossing.at-before;
        if(crossing.at-progress>lead)continue;
        startFraction=previousDistance<=lead||progress<=before?0:
          clamp((previousDistance-lead)/(progress-before),0,1);
        crossing.started=true;
      }
      const ageBase=previousAge-startFraction*dt;
      crossing.ageMs=Math.min(MAX_AGE,previousAge+(1-startFraction)*dt);
      if(progress<before)continue;
      for(let index=0;index<2;index++) {
        if(crossing.hitMask&(1<<index))continue;
        const time=contact(crossing,index,{dt,ageBase,startFraction,before,progress,previousLane,lane});
        if(time!==null)candidates.push({crossing,index,time,age:ageBase+time*dt,
          playerLane:previousLane+(lane-previousLane)*time});
      }
    }
    // A fast frame can touch two bodies. Give each contact a stable, distinct
    // message in physical order, never once per rendered frame.
    candidates.sort((a,b)=>a.time-b.time||a.crossing.bar-b.crossing.bar||a.index-b.index);
    const events=[];
    for(const {crossing,index,age,playerLane} of candidates) {
      const personLane=laneAt(age,index),side=playerLane>personLane?-1:1;
      crossing.hitMask|=1<<index;crossing.hitTimes[index]=age;crossing.hitSides[index]=side;
      state.hitCount++;
      events.push({type:'pedestrian-hit',id:personId(crossing.bar,index),crossingId:crossing.id,
        at:crossing.at,lane:personLane,hitSide:side,hitCount:state.hitCount,
        message:MESSAGES[state.hitCount-1]});
    }
    state.lastProgress=progress;
    state.lastBar=Math.max(state.lastBar,clamp(finite(input.bar,state.lastBar),0,100));
    return events;
  }
  function pose(state,{progress=state?.lastProgress}={}) {
    if(state?.version!==VERSION)return null;
    progress=clamp(finite(progress,state.lastProgress),0,24000);
    const crossings=state.crossings.filter(item=>item.at-progress>=-720&&item.at-progress<=440)
      .map(item=>({id:item.id,bar:item.bar,at:item.at,distance:item.at-progress,
        started:item.started,ageMs:item.ageMs,hitMask:item.hitMask}));
    const people=[];
    for(const item of crossings) {
      const crossing=state.crossings.find(candidate=>candidate.id===item.id);
      for(let index=0;index<2;index++) {
        const hit=!!(crossing.hitMask&(1<<index));
        // The contact ledger already records the fractional impact time.
        // Keep that walking cel through the throw, landing and later mirror
        // passage instead of cycling the legs under a grounded hit body.
        const walkingMs=clamp((hit?crossing.hitTimes[index]:crossing.ageMs)-DELAYS[index],0,CROSSING_MS);
        const phase=hit?'hit':!crossing.started||crossing.ageMs<DELAYS[index]?'waiting':
          walkingMs>=CROSSING_MS?'cleared':'walking';
        people.push({id:personId(item.bar,index),crossingId:item.id,bar:item.bar,at:item.at,
          distance:item.distance,lane:laneAt(hit?crossing.hitTimes[index]:crossing.ageMs,index),
          side:index?'right':'left',phase,walkingMs,
          hitAgeMs:hit?crossing.ageMs-crossing.hitTimes[index]:0,
          hitSide:crossing.hitSides[index]});
      }
    }
    return {version:VERSION,crossings,people,hitCount:state.hitCount};
  }
  function snapshot(state,{progress=state?.lastProgress}={}) {
    if(state?.version!==VERSION||!number(progress,0,24000)||Math.abs(progress-state.lastProgress)>220)return null;
    const saved=copy(state),shift=progress-state.lastProgress;
    for(const crossing of saved.crossings)crossing.at+=shift;
    saved.lastProgress=progress;
    return saved;
  }
  function restore(raw,{progress=raw?.lastProgress,bar=raw?.lastBar}={}) {
    if(!object(raw)||raw.version!==VERSION||!integer(raw.initialBar,0,100)||
      !number(raw.lastBar,raw.initialBar,100)||!number(raw.lastProgress,0,24000)||
      !number(progress,0,24000)||Math.abs(progress-raw.lastProgress)>.001||!number(bar,0,100)||
      bar<Math.floor(raw.lastBar)-.001||bar>raw.lastBar+.001||
      !Array.isArray(raw.crossings)||raw.crossings.length>4||!Array.isArray(raw.committedBars)||
      raw.committedBars.length>4||!integer(raw.hitCount,0,8))return null;
    const bars=new Set();let hitCount=0;
    for(const crossing of raw.crossings) {
      if(!object(crossing)||!SITES.includes(crossing.bar)||bars.has(crossing.bar)||
        crossing.bar<=raw.initialBar||crossing.bar>raw.lastBar||crossing.id!==idFor(crossing.bar)||
        !number(crossing.at,0,25000)||typeof crossing.started!=='boolean'||
        !number(crossing.ageMs,0,MAX_AGE)||(!crossing.started&&crossing.ageMs!==0)||
        !integer(crossing.hitMask,0,3)||(!crossing.started&&crossing.hitMask!==0)||
        !Array.isArray(crossing.hitTimes)||crossing.hitTimes.length!==2||
        !Array.isArray(crossing.hitSides)||crossing.hitSides.length!==2)return null;
      for(let index=0;index<2;index++) {
        const hit=!!(crossing.hitMask&(1<<index));
        if(hit?!number(crossing.hitTimes[index],DELAYS[index],DELAYS[index]+CROSSING_MS)||
            crossing.hitTimes[index]>crossing.ageMs||
            !number(laneAt(crossing.hitTimes[index],index),-LANE_REACH,3+LANE_REACH)||
            ![-1,1].includes(crossing.hitSides[index]):
            crossing.hitTimes[index]!==null||crossing.hitSides[index]!==0)return null;
      }
      bars.add(crossing.bar);hitCount+=hits(crossing.hitMask);
    }
    const expected=SITES.filter(site=>site<=raw.initialBar||bars.has(site));
    if(raw.hitCount!==hitCount||JSON.stringify(raw.committedBars)!==JSON.stringify(expected)||
      raw.crossings.some((item,index)=>index&&item.bar<=raw.crossings[index-1].bar))return null;
    return copy(raw);
  }
  B.CacheRoadCrosswalks={create,commit,step,pose,snapshot,restore,
    sites:SITES,messages:MESSAGES,
    limits:Object.freeze({crossings:4,people:8,crossingMs:CROSSING_MS,bodyReach:BODY_REACH,laneReach:LANE_REACH})};
})(window.BARCODE=window.BARCODE||{});
