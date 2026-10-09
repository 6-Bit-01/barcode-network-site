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
 'interdimensional-station':Object.freeze({controlHeight:230,emitterHeight:290}),
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
 const observers=spec.id==='interdimensional-station'?[1080,1530].map((x,index)=>({x,y:354,height:114,facing:target<x?'left':'right',frame:index*2,gesture:reducedMotion?0:.5-.5*Math.cos((time+index*4700)%18000/18000*TAU)})):[];
 const travel=reducedMotion?.5:(time%36000)/36000;
 const pedestrian=spec.id==='interdimensional-station'?{x:850+travel*900,y:362,height:108,facing:target<850+travel*900?'left':'right',frame:reducedMotion?0:Math.floor(time/200)%4,opacity:reducedMotion?.75:Math.min(1,travel*12,(1-travel)*12)*.8}:null;
 return {time,phase,fixtures:STAGE_FIXTURE_SIZES[spec.id]??{controlHeight:150,emitterHeight:190},lights,observers,pedestrian};
}
