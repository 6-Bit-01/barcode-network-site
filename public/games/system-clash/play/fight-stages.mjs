/** One selected room owns its clock, hazard and reciprocal wall connections. */
export const STAGE_WIDTH=2560;
const specs=[
 {id:'radio-studio',name:'BARCODE Radio Studio',description:'Broadcast desks, monitor banks and a feedback blast.',ambientCycleMs:48000,color:'#d87b54',interaction:{x:650,y:600,reach:125,cooldownMs:12000,label:'FEEDBACK SWITCH'},hazard:{type:'feedback',name:'FEEDBACK BLAST',warningMs:1000,impactDelayMs:180,activeMs:850,damage:15,kind:'scorch',zone:{left:840,right:1830,top:450,bottom:620}}},
 {id:'sheila-office',name:"Sheila's Office",description:'Records, quiet monitors and a descending security shutter.',ambientCycleMs:56000,color:'#dfb274',interaction:{x:1900,y:600,reach:125,cooldownMs:14000,label:'SECURITY RELEASE'},hazard:{type:'shutter',name:'SECURITY SHUTTER',warningMs:1000,impactDelayMs:420,activeMs:1100,damage:18,kind:'bruise',zone:{left:1040,right:1510,top:160,bottom:620}}},
 {id:'studio-rat-lair',name:'Studio Rat Lair',description:'The Studio Rats are cats: amplifier stacks and curious eyes occupy their lair.',ambientCycleMs:42000,color:'#ab8ddd',interaction:{x:650,y:600,reach:125,cooldownMs:12000,label:'AMPLIFIER DRIVE'},hazard:{type:'amplifier',name:'AMPLIFIER OVERLOAD',warningMs:1000,impactDelayMs:180,activeMs:850,damage:16,kind:'scorch',zone:{left:860,right:1800,top:485,bottom:620}}},
 {id:'containment',name:'Containment',description:'Observation glass, moving machinery and a marked purge beam.',ambientCycleMs:60000,color:'#83d9e6',interaction:{x:1900,y:600,reach:125,cooldownMs:14000,label:'PURGE CONTROL'},hazard:{type:'beam',name:'PURGE BEAM',warningMs:1000,impactDelayMs:260,activeMs:900,damage:16,kind:'scorch',zone:{left:600,right:1840,top:325,bottom:400}}},
 {id:'nature-simulation',name:'Nature Simulation',description:'Layered simulated foliage and a rising holographic thorn trap.',ambientCycleMs:54000,color:'#9dd9a6',interaction:{x:650,y:600,reach:125,cooldownMs:13000,label:'THORN PROGRAM'},hazard:{type:'thorns',name:'HOLOGRAPHIC THORNS',warningMs:1000,impactDelayMs:300,activeMs:1000,damage:17,kind:'cut',zone:{left:1000,right:1660,top:505,bottom:620}}},
 {id:'witty-wasteland',name:'Witty Wasteland',description:'Ruined exterior, salvage machinery and an explosive rolling barrel.',ambientCycleMs:46000,color:'#deb16f',interaction:{x:1880,y:600,reach:125,cooldownMs:15000,label:'SALVAGE RELEASE'},hazard:{type:'barrel',name:'EXPLOSIVE SALVAGE',warningMs:1000,impactDelayMs:550,activeMs:1200,damage:18,kind:'cut',zone:{left:900,right:1710,top:455,bottom:620}}},
 {id:'interdimensional-station',name:'Interdimensional Station',description:'Transit portals, watching commuters and a warned signal arc.',ambientCycleMs:58000,color:'#be8deb',interaction:{x:1880,y:600,reach:125,cooldownMs:14500,label:'TRANSIT RESET'},hazard:{type:'beam',name:'SIGNAL ARC',warningMs:1100,impactDelayMs:280,activeMs:1050,damage:16,kind:'scorch',zone:{left:720,right:1800,top:340,bottom:430}}},
];
const chain=['studio-rat-lair','radio-studio','sheila-office','containment','nature-simulation','witty-wasteland','interdimensional-station'];
export const STAGES=Object.freeze(specs.map(spec=>{
 const index=chain.indexOf(spec.id);
 return Object.freeze({...spec,width:STAGE_WIDTH,walls:{left:{target:chain[index-1]??null},right:{target:chain[index+1]??null}}});
}));
export function stageById(id){return STAGES.find(stage=>stage.id===(typeof id==='object'?id?.id:id))??STAGES[0];}
const freshWalls=()=>({left:{damage:0,broken:false},right:{damage:0,broken:false}});
export function createStageState(id){const spec=stageById(id);const walls=freshWalls();return {id:spec.id,width:spec.width,clock:0,fightClock:0,cooldownUntil:0,interaction:null,activation:null,activationSerial:0,transitionSerial:0,cinematicOrigin:null,walls,wallRooms:{[spec.id]:walls},lastWallImpact:null};}
export function stageInteractionReady(state,x){const spec=stageById(state.id);return !state.interaction&&!state.activation&&state.fightClock>=state.cooldownUntil&&Math.abs(x-spec.interaction.x)<=spec.interaction.reach;}
export function startStageWarning(state,actor){
 const spec=stageById(state.id);if(state.activation||state.fightClock<state.cooldownUntil)return null;
 const at=state.fightClock,warningEnd=at+spec.hazard.warningMs;
 const activation={serial:++state.activationSerial,actor,at,warningEnd,impactAt:warningEnd+spec.hazard.impactDelayMs,endAt:warningEnd+spec.hazard.activeMs,active:false,impacted:false};
 state.activation=activation;state.interaction=null;state.cooldownUntil=activation.endAt+spec.interaction.cooldownMs;return activation;
}
export function advanceStageState(state,dt,{fighting=false}={}){
 if(!Number.isFinite(dt)||dt<=0)return [];state.clock+=dt;if(!fighting)return [];state.fightClock+=dt;
 const activation=state.activation,events=[];if(!activation)return events;
 if(!activation.active&&state.fightClock>=activation.warningEnd){activation.active=true;events.push({type:'stage-activate',activation:{...activation}});}
 if(!activation.impacted&&state.fightClock>=activation.impactAt){activation.impacted=true;events.push({type:'stage-impact',activation:{...activation}});}
 if(state.fightClock>=activation.endAt){events.push({type:'stage-complete',activation:{...activation}});state.activation=null;}
 return events;
}
export function stagePhase(state){
 if(state.activation){const activation=state.activation,warning=state.fightClock<activation.warningEnd;return {phase:warning?'warning':'active',progress:Math.max(0,Math.min(1,(state.fightClock-(warning?activation.at:activation.warningEnd))/(warning?activation.warningEnd-activation.at:activation.endAt-activation.warningEnd))),activation};}
 return {phase:state.fightClock<state.cooldownUntil?'cooldown':state.interaction?'interacting':'ready',remaining:Math.max(0,state.cooldownUntil-state.fightClock),progress:0};
}
export function damageStageWall(state,side,strength){
 const wall=state.walls[side],connection=stageById(state.id).walls[side];if(!wall||!connection)return null;
 state.lastWallImpact={side,at:state.clock,strength};
 if(connection.target&&strength>=1.1)wall.damage=Math.min(80,wall.damage+Math.round(strength*20));
 const broke=!wall.broken&&connection.target&&wall.damage>=80;
 if(broke)wall.broken=true;
 return {side,damage:wall.damage,broke,broken:wall.broken,target:wall.broken?connection.target:null};
}
export function enterStage(state,id,exitSide){
 const previous=state.id,spec=stageById(id);state.wallRooms[previous]=state.walls;
 state.id=spec.id;state.width=spec.width;state.walls=state.wallRooms[spec.id]??freshWalls();state.wallRooms[spec.id]=state.walls;
 const entrySide=exitSide==='left'?'right':'left';if(spec.walls[entrySide].target===previous)state.walls[entrySide].broken=true;
 state.activation=null;state.interaction=null;state.cooldownUntil=state.fightClock;state.lastWallImpact=null;state.cinematicOrigin=null;state.transitionSerial++;
 return {fromStage:previous,toStage:spec.id,side:exitSide,entrySide,serial:state.transitionSerial};
}
