import {packetBytes} from './online-protocol.mjs';
export const TOURNAMENT_BROADCAST_MAX_BYTES=4096;
/** Keep fight poses and gameplay intact; dense cosmetic wear is reduced for the live view. */
export function compactTournamentBroadcast(value){
 try{
  const snapshot=JSON.parse(JSON.stringify(value));if(!snapshot.state||!Array.isArray(snapshot.views)||!Array.isArray(snapshot.state.fighters))return null;
  if(packetBytes(snapshot)<=TOURNAMENT_BROADCAST_MAX_BYTES)return snapshot;
  const actors=[...snapshot.state.fighters,...snapshot.views];
  for(const actor of actors){actor.damageMarks=actor.damageMarks.slice(-2);actor.embeddedWeapons=actor.embeddedWeapons.slice(-1);}
  delete snapshot.state.stage.wallRooms;
  if(packetBytes(snapshot)<=TOURNAMENT_BROADCAST_MAX_BYTES)return snapshot;
  for(const actor of actors){actor.damageMarks=[];actor.embeddedWeapons=[];}
  if(packetBytes(snapshot)<=TOURNAMENT_BROADCAST_MAX_BYTES)return snapshot;
  return null;
 }catch{return null;}
}
