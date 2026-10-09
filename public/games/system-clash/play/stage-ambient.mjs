import {stageById} from './fight-stages.mjs';
const TAU=Math.PI*2;
// Furniture has authored physical size. Only its light/inside movement changes over time.
export const STAGE_FIXTURE_SIZES=Object.freeze({
 'radio-studio':Object.freeze({controlHeight:310,emitterHeight:190}),
 'sheila-office':Object.freeze({controlHeight:180,emitterHeight:210}),
 'studio-rat-lair':Object.freeze({controlHeight:185,emitterHeight:220}),
 'containment':Object.freeze({controlHeight:190,emitterHeight:210}),
 'nature-simulation':Object.freeze({controlHeight:175,emitterHeight:190}),
 'witty-wasteland':Object.freeze({controlHeight:190,emitterHeight:190}),
 'interdimensional-station':Object.freeze({controlHeight:310,emitterHeight:420}),
});
// These source windows stay attached to the actual monitor, foliage, lamp or portal pixels.
const windows={
 'radio-studio':[[.02,.32,.20,.14],[.70,.05,.27,.30],[.32,.10,.35,.30]],
 'sheila-office':[[.05,.07,.27,.27],[.69,.08,.23,.34]],
 'studio-rat-lair':[[.14,.08,.20,.35],[.65,.08,.21,.35]],
 'containment':[[.25,.04,.18,.54],[.62,.04,.16,.54]],
 'nature-simulation':[[.03,.08,.34,.46],[.67,.12,.28,.44]],
 'witty-wasteland':[[.10,.08,.21,.43],[.72,.08,.23,.43]],
 'interdimensional-station':[[.01,.06,.19,.52],[.80,.04,.19,.54],[.27,.02,.18,.13],[.61,.02,.20,.13]],
};
export function stageAmbientPlan(state,{reducedMotion=false,fighterPositions=[]}={}){
 const spec=stageById(state.id),time=reducedMotion?0:Math.max(0,state.clock??0),phase=(time%spec.ambientCycleMs)/spec.ambientCycleMs;
 const lights=(windows[spec.id]??[]).map((rect,index)=>({rect,opacity:reducedMotion?.13:.08+.10*(.5+.5*Math.sin(phase*TAU*(index+2)+index)),dx:spec.id==='nature-simulation'&&!reducedMotion?Math.sin(phase*TAU+index)*1.6:0}));
 const target=fighterPositions.filter(Number.isFinite).reduce((a,b)=>a+b,0)/(fighterPositions.filter(Number.isFinite).length||1)||1280;
 // The rear edge of the foreground platform starts at world y417 in the
 // native plate. Feet belong on that walkway, below its railing.
 const observers=spec.id==='interdimensional-station'?[960,1590].map((x,index)=>({x,y:436,height:184,facing:target<x?'left':'right',frame:index*2,gesture:reducedMotion?0:.5-.5*Math.cos((time+index*4700)%18000/18000*TAU)})):[];
 const returnTrip=!reducedMotion&&Math.floor(time/36000)%2===1,leg=reducedMotion?.5:(time%36000)/36000,travel=returnTrip?1-leg:leg;
 const pedestrian=spec.id==='interdimensional-station'?{x:850+travel*900,y:442,height:196,facing:returnTrip?'left':'right',frame:reducedMotion?0:Math.floor(time/180)%4,opacity:reducedMotion?.85:Math.min(1,leg*12,(1-leg)*12)*.9}:null;
 return {time,phase,fixtures:STAGE_FIXTURE_SIZES[spec.id]??{controlHeight:150,emitterHeight:190},lights,observers,pedestrian};
}
