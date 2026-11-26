import { NextRequest } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminApiError, adminErrorResponse, requireAdminEvent } from "@/lib/admin/server";
import { dispatchAudiovisualEvent } from "@/lib/audiovisual/dispatch";

const id=z.uuid();
const discipline=z.enum(["epic-minigames","natural-disaster-survival","speed-run-4","super-golf"]);
const requestSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("roster"),eventId:id,activityId:id,discipline:z.enum(["main",...discipline.options]),participantIds:z.array(id).max(64)}),
  z.object({action:z.literal("tournament"),eventId:id,activityId:id,name:z.string().trim().min(1).max(120),orderedIds:z.array(id).min(2).max(64)}),
  z.object({action:z.literal("callMatch"),eventId:id,matchId:id}),
  z.object({action:z.literal("announceMatch"),eventId:id,matchId:id}),
  z.object({action:z.literal("startMatch"),eventId:id,matchId:id}),
  z.object({action:z.literal("finishMatch"),eventId:id,matchId:id,winnerEntryId:id,homeScore:z.number().int().min(0).max(99),awayScore:z.number().int().min(0).max(99),expectedVersion:z.number().int().positive()}),
  z.object({action:z.literal("announceDraw"),eventId:id,tournamentId:id}),
  z.object({action:z.literal("startRoblox"),eventId:id,activityId:id,discipline,participantIds:z.array(id).min(1).max(3),comparisonKey:z.string().trim().max(80).default("standard"),allowRepeat:z.boolean().default(false)}),
  z.object({action:z.literal("finishRoblox"),eventId:id,groupId:id,scores:z.array(z.object({participantId:id,score:z.number().min(0).max(999999)})).min(1).max(3)}),
  z.object({action:z.literal("scoreScale"),eventId:id,activityId:id,points:z.array(z.number().int().min(0).max(1000)).min(1).max(64)}),
]);

async function lineup(supabase:SupabaseClient,eventId:string,matchId:string) {
  const {data:match}=await supabase.from("matches").select("id,tournament_id,status,version,match_number,station_id,tournament_rounds(name),tournaments!inner(event_id,activity_id,name,entry_kind)").eq("id",matchId).eq("tournaments.event_id",eventId).maybeSingle();
  if(!match)throw new AdminApiError(404,"NOT_FOUND","Enfrentamiento inexistente");
  const {data:slots}=await supabase.from("match_participants").select("slot,entry_id").eq("match_id",matchId).order("slot");
  const entryIds=(slots??[]).map(item=>item.entry_id).filter((value):value is string=>Boolean(value));
  const {data:entries}=entryIds.length?await supabase.from("tournament_entries").select("id,participant_id,team_id").in("id",entryIds):{data:[]};
  const teamIds=(entries??[]).map(item=>item.team_id).filter((value):value is string=>Boolean(value));
  const {data:members}=teamIds.length?await supabase.from("team_members").select("team_id,participant_id,position").in("team_id",teamIds).order("position"):{data:[]};
  const sides=(slots??[]).map(slot=>{
    const entry=(entries??[]).find(item=>item.id===slot.entry_id);
    return {entryId:slot.entry_id,participantIds:entry?.team_id?(members??[]).filter(item=>item.team_id===entry.team_id).map(item=>item.participant_id):entry?.participant_id?[entry.participant_id]:[]};
  });
  const participantIds=sides.flatMap(side=>side.participantIds);
  const {data:players}=participantIds.length?await supabase.from("participants").select("id,first_name,gamer_tag,player_number,photo_path").eq("event_id",eventId).in("id",participantIds):{data:[]};
  const names=sides.map(side=>side.participantIds.map(playerId=>{
    const player=(players??[]).find(item=>item.id===playerId);
    return player?.gamer_tag||player?.first_name||"Por definir";
  }).join(" + "));
  return {match,sides,participantIds,names};
}

export async function GET(request:NextRequest){
  try{
    const {supabase,event}=await requireAdminEvent(request.nextUrl.searchParams.get("eventId")??undefined);
    const requests=await Promise.all([
      supabase.from("activities").select("id,name,activity_type,rules").eq("event_id",event.id).in("activity_type",["fifa","foosball","roblox"]).eq("enabled",true),
      supabase.from("participants").select("id,first_name,gamer_tag,player_number,administrative_status,operational_status,registration_status").eq("event_id",event.id).order("player_number"),
      supabase.from("competition_rosters").select("activity_id,discipline,participant_id").eq("event_id",event.id),
      supabase.from("stations").select("id,name,code,station_type,status,capacity").eq("event_id",event.id),
      supabase.from("station_assignments").select("station_id,participant_id,context_type,context_id,status").eq("event_id",event.id).in("status",["reserved","active"]),
      supabase.from("tournaments").select("id,activity_id,name,status,entry_kind,rules,champion_entry_id,runner_up_entry_id").eq("event_id",event.id).order("created_at",{ascending:false}),
      supabase.from("challenges").select("id,activity_id,name,status,rules,scoring_method,starts_at").eq("event_id",event.id).not("rules->>discipline","is",null).order("created_at",{ascending:false}),
    ]);
    const failure=requests.find(result=>result.error)?.error;
    if(failure)throw new AdminApiError(500,"READ_FAILED",failure.message);
    const activities=requests[0].data??[],players=requests[1].data??[],rosters=requests[2].data??[];
    const stations=requests[3].data??[],assignments=requests[4].data??[],tournaments=requests[5].data??[],groups=requests[6].data??[];
    const tournamentIds=tournaments.map(item=>item.id),groupIds=groups.map(item=>item.id);
    const [entries,rounds,matches,groupPlayers,groupResults]=await Promise.all([
      tournamentIds.length?supabase.from("tournament_entries").select("id,tournament_id,participant_id,team_id,seed,status").in("tournament_id",tournamentIds):Promise.resolve({data:[],error:null}),
      tournamentIds.length?supabase.from("tournament_rounds").select("id,tournament_id,name,round_number").in("tournament_id",tournamentIds):Promise.resolve({data:[],error:null}),
      tournamentIds.length?supabase.from("matches").select("id,tournament_id,round_id,match_number,status,version,station_id").in("tournament_id",tournamentIds):Promise.resolve({data:[],error:null}),
      groupIds.length?supabase.from("challenge_participants").select("challenge_id,participant_id,station_id").in("challenge_id",groupIds):Promise.resolve({data:[],error:null}),
      groupIds.length?supabase.from("challenge_results").select("challenge_id,participant_id,score,position,payload").in("challenge_id",groupIds):Promise.resolve({data:[],error:null}),
    ]);
    const teamIds=(entries.data??[]).map(item=>item.team_id).filter((value):value is string=>Boolean(value));
    const matchIds=(matches.data??[]).map(item=>item.id);
    const [slots,members]=await Promise.all([
      matchIds.length?supabase.from("match_participants").select("match_id,slot,entry_id").in("match_id",matchIds):Promise.resolve({data:[],error:null}),
      teamIds.length?supabase.from("team_members").select("team_id,participant_id,position").in("team_id",teamIds):Promise.resolve({data:[],error:null}),
    ]);
    if([entries,rounds,matches,groupPlayers,groupResults,slots,members].some(result=>result.error))throw new AdminApiError(500,"READ_FAILED","No se pudieron cargar las competencias");
    return Response.json({event,activities,players,rosters,stations,assignments,tournaments,entries:entries.data??[],rounds:rounds.data??[],matches:matches.data??[],slots:slots.data??[],members:members.data??[],groups,groupPlayers:groupPlayers.data??[],groupResults:groupResults.data??[]},{headers:{"cache-control":"no-store"}});
  }catch(error){return adminErrorResponse(error)}
}

export async function POST(request:Request){
  try{
    const parsed=requestSchema.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message??"Datos inválidos"},{status:400});
    const input=parsed.data;
    const {supabase,event,userId}=await requireAdminEvent(input.eventId);
    if(input.action==="roster"){
      const {error}=await supabase.rpc("set_competition_roster",{p_event_id:event.id,p_activity_id:input.activityId,p_discipline:input.discipline,p_participant_ids:input.participantIds});
      if(error)throw new AdminApiError(409,"ROSTER_REJECTED",error.message);
      return Response.json({ok:true});
    }
    if(input.action==="tournament"){
      const {data,error}=await supabase.rpc("create_competition_tournament",{p_event_id:event.id,p_activity_id:input.activityId,p_name:input.name,p_ordered_ids:input.orderedIds});
      if(error)throw new AdminApiError(409,"DRAW_REJECTED",error.message);
      return Response.json({tournamentId:data},{status:201});
    }
    if(input.action==="callMatch"){
      const {data:stationId,error}=await supabase.rpc("call_competition_match",{p_event_id:event.id,p_match_id:input.matchId});
      if(error)throw new AdminApiError(409,"MATCH_UNAVAILABLE",error.message);
      const game=await lineup(supabase,event.id,input.matchId);
      const tournament=game.match.tournaments as unknown as {name:string;entry_kind:string};
      let announcementFailed=false;
      try{await dispatchAudiovisualEvent(supabase,{eventId:event.id,eventKey:tournament.entry_kind==="team"?"METEGOL_NEXT_MATCH":"MATCH_CALLED",context:{participantIds:game.participantIds,activity:tournament.name,station:stationId,title:game.names.join(" VS ")},rehearsal:false,confirm:true,idempotencyKey:`match:${input.matchId}:call`,userId})}catch(error){announcementFailed=true;console.error("Match announcement failed",error)}
      return Response.json({stationId,announcementFailed});
    }
    if(input.action==="announceMatch"){
      const game=await lineup(supabase,event.id,input.matchId);
      const tournament=game.match.tournaments as unknown as {name:string;entry_kind:string};
      if((game.match.status!=="called"&&game.match.status!=="live")||!game.match.station_id)throw new AdminApiError(409,"NOT_CALLED","Convocá primero este enfrentamiento");
      await dispatchAudiovisualEvent(supabase,{eventId:event.id,eventKey:tournament.entry_kind==="team"?"METEGOL_NEXT_MATCH":"MATCH_CALLED",context:{participantIds:game.participantIds,activity:tournament.name,title:game.names.join(" VS ")},rehearsal:false,confirm:true,idempotencyKey:`match:${input.matchId}:announce:${crypto.randomUUID()}`,userId});
      return Response.json({ok:true});
    }
    if(input.action==="startMatch"){
      const {error}=await supabase.rpc("start_competition_match",{p_event_id:event.id,p_match_id:input.matchId});
      if(error)throw new AdminApiError(409,"START_REJECTED",error.message);
      return Response.json({ok:true});
    }
    if(input.action==="finishMatch"){
      const {error}=await supabase.rpc("finish_competition_match",{p_event_id:event.id,p_match_id:input.matchId,p_winner_entry_id:input.winnerEntryId,p_home_score:input.homeScore,p_away_score:input.awayScore,p_expected_version:input.expectedVersion});
      if(error)throw new AdminApiError(409,"RESULT_REJECTED",error.message);
      const {data:winnerEntry}=await supabase.from("tournament_entries").select("participant_id,team_id").eq("id",input.winnerEntryId).maybeSingle();
      const {data:teamMembers}=winnerEntry?.team_id?await supabase.from("team_members").select("participant_id").eq("team_id",winnerEntry.team_id):{data:[]};
      const winnerIds=winnerEntry?.participant_id?[winnerEntry.participant_id]:(teamMembers??[]).map(item=>item.participant_id);
      let announcementFailed=false;
      try{await dispatchAudiovisualEvent(supabase,{eventId:event.id,eventKey:"MATCH_FINISHED",context:{participantIds:winnerIds,activity:"Resultado",score:`${input.homeScore} - ${input.awayScore}`},rehearsal:false,confirm:true,idempotencyKey:`match:${input.matchId}:finished`,userId})}catch(error){announcementFailed=true;console.error("Match result announcement failed",error)}
      return Response.json({ok:true,announcementFailed});
    }
    if(input.action==="announceDraw"){
      const {data:tournament}=await supabase.from("tournaments").select("id,name,activity_id,status").eq("id",input.tournamentId).eq("event_id",event.id).maybeSingle();
      if(!tournament)throw new AdminApiError(404,"NOT_FOUND","Torneo inexistente");
      const {data:matches}=await supabase.from("matches").select("id,round_id").eq("tournament_id",tournament.id);
      const {data:rounds}=await supabase.from("tournament_rounds").select("id,round_number").eq("tournament_id",tournament.id);
      const firstIds=(matches??[]).filter(match=>rounds?.find(round=>round.id===match.round_id)?.round_number===1).map(match=>match.id);
      const items:string[]=[];
      for(const matchId of firstIds){const game=await lineup(supabase,event.id,matchId);items.push(game.names.join(" VS "))}
      const {data:allEntries}=await supabase.from("tournament_entries").select("id,participant_id,team_id,seed").eq("tournament_id",tournament.id).order("seed");
      const {data:initialSlots}=firstIds.length?await supabase.from("match_participants").select("entry_id").in("match_id",firstIds):{data:[]};
      const playingIds=new Set((initialSlots??[]).map(slot=>slot.entry_id));
      const teamIds=(allEntries??[]).map(entry=>entry.team_id).filter((value):value is string=>Boolean(value));
      const {data:members}=teamIds.length?await supabase.from("team_members").select("team_id,participant_id,position").in("team_id",teamIds).order("position"):{data:[]};
      const orderedIds=(allEntries??[]).flatMap(entry=>entry.participant_id?[entry.participant_id]:(members??[]).filter(member=>member.team_id===entry.team_id).map(member=>member.participant_id));
      const {data:players}=orderedIds.length?await supabase.from("participants").select("id,first_name,gamer_tag,player_number,photo_path").eq("event_id",event.id).in("id",orderedIds):{data:[]};
      for(const entry of (allEntries??[]).filter(entry=>!playingIds.has(entry.id))){
        const ids=entry.participant_id?[entry.participant_id]:(members??[]).filter(member=>member.team_id===entry.team_id).map(member=>member.participant_id);
        items.push(ids.map(id=>{const player=(players??[]).find(item=>item.id===id);return player?.gamer_tag||player?.first_name||"Jugador"}).join(" + ")+" · PASE DIRECTO");
      }
      const displayPlayers=orderedIds.map(id=>(players??[]).find(player=>player.id===id)).filter((player):player is NonNullable<typeof player>=>Boolean(player)).map(player=>({name:player.first_name,gamerTag:player.gamer_tag,number:player.player_number,photoPath:player.photo_path}));
      const {error}=await supabase.from("scene_events").insert({event_id:event.id,scene_type:"TOURNAMENT_BRACKET",payload:{title:tournament.name,items,players:displayPlayers},priority:65,duration_ms:Math.max(12000,items.length*2500),sound:{name:"roulette-loop",volume:.55},animation:{preset:"nexus"},interrupt_policy:"force",status:"queued",idempotency_key:`draw:${tournament.id}:${crypto.randomUUID()}`,created_by:userId});
      if(error)throw new AdminApiError(409,"SCENE_FAILED","No se pudo presentar el sorteo en TV");
      return Response.json({ok:true});
    }
    if(input.action==="startRoblox"){
      const {data,error}=await supabase.rpc("start_roblox_group",{p_event_id:event.id,p_activity_id:input.activityId,p_discipline:input.discipline,p_participant_ids:input.participantIds,p_comparison_key:input.comparisonKey,p_allow_repeat:input.allowRepeat});
      if(error)throw new AdminApiError(409,"GROUP_REJECTED",error.message);
      const {data:groupPlayers}=await supabase.from("challenge_participants").select("participant_id,station_id").eq("challenge_id",data);
      const stationIds=(groupPlayers??[]).map(item=>item.station_id).filter((value):value is string=>Boolean(value));
      const {data:stations}=stationIds.length?await supabase.from("stations").select("id,name").in("id",stationIds):{data:[]};
      const {data:players}=await supabase.from("participants").select("id,first_name,gamer_tag").in("id",input.participantIds);
      const items=input.participantIds.map(id=>{const gp=(groupPlayers??[]).find(item=>item.participant_id===id);const player=(players??[]).find(item=>item.id===id);const station=(stations??[]).find(item=>item.id===gp?.station_id);return `${player?.gamer_tag||player?.first_name||"Jugador"} · ${station?.name||"PC"}`});
      let announcementFailed=false;
      try{await dispatchAudiovisualEvent(supabase,{eventId:event.id,eventKey:"ROBLOX_PLAYERS_CALLED",context:{participantIds:input.participantIds,activity:input.discipline,title:"JUGADORES ROBLOX",items},rehearsal:false,confirm:true,idempotencyKey:`roblox:${data}:called`,userId})}catch(error){announcementFailed=true;console.error("Roblox announcement failed",error)}
      return Response.json({groupId:data,announcementFailed},{status:201});
    }
    if(input.action==="scoreScale"){
      const {data:activity}=await supabase.from("activities").select("id,rules").eq("id",input.activityId).eq("event_id",event.id).eq("activity_type","roblox").maybeSingle();
      if(!activity)throw new AdminApiError(404,"NOT_FOUND","Actividad Roblox inexistente");
      const {error}=await supabase.from("activities").update({rules:{...(activity.rules??{}),robloxPoints:input.points}}).eq("id",activity.id).eq("event_id",event.id);
      if(error)throw new AdminApiError(409,"SCALE_REJECTED","No se pudo guardar la escala");
      return Response.json({ok:true});
    }
    const {data:group}=await supabase.from("challenges").select("id,activity_id,name,scoring_method").eq("id",input.groupId).eq("event_id",event.id).maybeSingle();
    if(!group)throw new AdminApiError(404,"NOT_FOUND","Grupo inexistente");
    const {error}=await supabase.rpc("finish_roblox_group",{p_event_id:event.id,p_group_id:input.groupId,p_scores:input.scores});
    if(error)throw new AdminApiError(409,"SCORE_REJECTED",error.message);
    const ordered=[...input.scores].sort((a,b)=>group.scoring_method==="lowest"?a.score-b.score:b.score-a.score);
    let announcementFailed=false;
    try{await dispatchAudiovisualEvent(supabase,{eventId:event.id,eventKey:"ROBLOX_CHALLENGE_FINISHED",context:{participantIds:[ordered[0].participantId],activity:group.name,score:String(ordered[0].score)},rehearsal:false,confirm:true,idempotencyKey:`roblox:${input.groupId}:finished`,userId})}catch(error){announcementFailed=true;console.error("Roblox result announcement failed",error)}
    return Response.json({ok:true,announcementFailed});
  }catch(error){return adminErrorResponse(error)}
}
