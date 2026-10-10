import {createHash} from "node:crypto";
import {createSystemClashTournaments,TournamentError} from '@/lib/system-clash-tournament';
import {systemClashTournamentStore} from '@/lib/system-clash-tournament-store';
import {requireSystemClashMember,SystemClashMemberError} from '@/lib/system-clash-member';
import {getOnlineTournamentBroadcast,getOnlineMatchEvidence,OnlineRoomError} from '@/lib/system-clash-online';
import {onlineRoomStore} from '@/lib/system-clash-online-store';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers});
export async function GET(request:Request){
 try{
  const url=new URL(request.url);if([...url.searchParams.keys()].some(key=>key!=='code')||url.searchParams.getAll('code').length!==1)throw new TournamentError('Choose one tournament code.');
  const member=await requireSystemClashMember(request,{publicPoseStream:true}),store=systemClashTournamentStore();
  if(!await store.allow(member.id+':watch','read',650))throw new TournamentError('Please wait a moment before watching again.',429);
  const event=await createSystemClashTournaments({store,readMatch:value=>getOnlineMatchEvidence({...value,store:onlineRoomStore()})}).view(url.searchParams.get('code')!,{id:member.id,name:member.name,sessionExpiresAt:Date.parse(member.sessionExpiresAt)}),bout=event.bouts.find(value=>value.id===event.currentBoutId);
  const tournament={code:event.code,title:event.title,status:event.status,round:event.round,currentBoutId:event.currentBoutId,broadcastId:bout?.roomCode?createHash('sha256').update([event.code,bout.id,bout.replays??0,bout.roomCode,bout.roomMatchId].join(':')).digest('hex'):null,rules:{rounds:event.settings.rounds,time:event.settings.time}};
  if(!bout?.roomCode||!bout.roomMatchId||!['live','decision'].includes(bout.status))return reply({tournament,match:null});
  const match=await getOnlineTournamentBroadcast({store:onlineRoomStore(),code:bout.roomCode,eventCode:event.code,boutId:bout.id,matchId:bout.roomMatchId});
  return reply({tournament,match});
 }catch(error){if(error instanceof TournamentError||error instanceof OnlineRoomError||error instanceof SystemClashMemberError)return reply({error:error.message},error.status);return reply({error:'The featured match is temporarily unavailable.'},503);}
}
