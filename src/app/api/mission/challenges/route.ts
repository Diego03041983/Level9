import {createHmac, randomInt, timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";

const noStore={"Cache-Control":"private, no-store"};
const schema=z.object({missionId:z.uuid(),slot:z.number().int().min(1).max(4),action:z.enum(["unlock","sequence","flip"]),answer:z.string().max(32).optional(),index:z.number().int().min(0).max(47).optional()});
const names=["Fuego","Agua","Viento","Tierra"];
const gates=["FIRE-782","9","7","4278"];
const sequences=[
  {prompt:"2, 4, 6, 8, ?",options:["9","10","12"]},
  {prompt:"5, 10, 15, 20, ?",options:["21","25","30"]},
  {prompt:"A, B, C, A, B, ?",options:["A","B","C"]},
  {prompt:"1, 2, 4, 8, ?",options:["10","12","16"]},
];
type State={slot:number;complete:boolean;digit:string|null;correct:boolean;sequenceStep:number;cards:{index:number;symbol:number|null;matched:boolean}[]|null;memoryAttempts:number;memoryMatched:number;memoryLockedUntil:string|null};

function tokenFor(missionId:string,slot:number,runId:string){
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret)throw new Error("Falta la clave privada del servidor");
  return createHmac("sha256",secret).update(`mission-challenge:v1:${missionId}:${slot}:${runId}`).digest("hex");
}
function validToken(missionId:string,slot:number,runId:string,token:string|null){
  if(!token||!/^[0-9a-f]{64}$/.test(token))return false;
  return timingSafeEqual(Buffer.from(token,"hex"),Buffer.from(tokenFor(missionId,slot,runId),"hex"));
}
function shuffled<T>(items:T[]){
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=randomInt(i+1);[result[i],result[j]]=[result[j],result[i]]}
  return result;
}
function present(state:State){
  const sequence=state.slot===2&&!state.complete?sequences[state.sequenceStep]:undefined;
  return {...state,sequence:sequence?{prompt:sequence.prompt,options:shuffled(sequence.options)}:null};
}
async function missionFor(id?:string){
  const db=createAdminClient();
  if(id){
    const {data:mission}=await db.from("missions").select("id,event_id,status,name,challenge_run_id").eq("id",id).maybeSingle();
    if(!mission)return null;
    const {data:event}=await db.from("events").select("id").eq("id",mission.event_id).eq("is_demo",false).maybeSingle();
    return event?mission:null;
  }
  const {data:event}=await db.from("events").select("id").eq("is_demo",false).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(!event)return null;
  const {data:mission}=await db.from("missions").select("id,event_id,status,name,challenge_run_id").eq("event_id",event.id)
    .in("status",["ready","live","paused","unlocked","finished"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
  return mission;
}
async function run(missionId:string,slot:number,action:string,answer?:string,index?:number){
  const {data,error}=await createAdminClient().rpc("run_mission_challenge",{p_mission_id:missionId,p_slot:slot,p_action:action,p_answer:answer??null,p_index:index??null});
  if(error)throw new Error(error.message);
  return data as State;
}
async function finalVideoReady(eventId:string){
  const db=createAdminClient();
  const {data:video}=await db.from("media_assets").select("storage_path").eq("event_id",eventId).eq("logical_key","glitch-defeat-video")
    .eq("asset_type","video").eq("status","active").maybeSingle();
  if(!video?.storage_path)return false;
  const {error}=await db.storage.from("event-media").info(video.storage_path);
  return !error;
}
async function settleFinale(missionId:string,eventId:string){
  const db=createAdminClient();
  const {data:mission}=await db.from("missions").select("status").eq("id",missionId).maybeSingle();
  if(mission?.status!=="unlocked")return;
  const {error}=await db.from("scene_events").update({status:"expired"}).eq("event_id",eventId)
    .in("status",["queued","delivered","playing"]).neq("scene_type","GLITCH_DEFEATED");
  if(error)console.error("Mission completed, but old scenes could not be expired",error);
}

export async function GET(request:Request){
  try{
    const url=new URL(request.url);
    const mission=await missionFor(url.searchParams.get("missionId")??undefined);
    if(!mission)return Response.json({error:"Misión no disponible"},{status:404,headers:noStore});
    const slot=Number(url.searchParams.get("slot"));
    if(Number.isInteger(slot)&&slot>=1&&slot<=4){
      if(!validToken(mission.id,slot,mission.challenge_run_id,request.headers.get("x-mission-team-token")))return Response.json({error:"Acceso al equipo no validado"},{status:403,headers:noStore});
      const state=await run(mission.id,slot,"state");
      return Response.json({mission:{id:mission.id,name:mission.name,status:mission.status},state:present(state)},{headers:noStore});
    }
    const {data:slots,error}=await createAdminClient().from("mission_digit_slots").select("slot,team_id,digit").eq("mission_id",mission.id).order("slot");
    if(error)throw error;
    return Response.json({mission:{id:mission.id,name:mission.name,status:mission.status},teams:names.map((name,index)=>({slot:index+1,name,assigned:Boolean(slots?.find(item=>item.slot===index+1)?.team_id),complete:Boolean(slots?.find(item=>item.slot===index+1)?.digit)}))},{headers:noStore});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Error del servidor"},{status:500,headers:noStore})}
}

export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"Solicitud inválida"},{status:400,headers:noStore});
  try{
    const {missionId,slot,action,index}=parsed.data;
    const mission=await missionFor(missionId);
    if(!mission)return Response.json({error:"Misión no disponible"},{status:404,headers:noStore});
    if(!["live","paused","unlocked"].includes(mission.status))return Response.json({error:"La misión todavía no está en curso"},{status:409,headers:noStore});
    if(action==="unlock"){
      const answer=(parsed.data.answer??"").trim().toUpperCase();
      if(answer!==gates[slot-1])return Response.json({accepted:false,message:"ACCESO DENEGADO"},{headers:noStore});
      if(["live","paused"].includes(mission.status)&&[1,4].includes(slot)){
        const {count}=await createAdminClient().from("mission_digit_slots").select("slot",{head:true,count:"exact"}).eq("mission_id",missionId).not("digit","is",null);
        if(count===3&&!(await finalVideoReady(mission.event_id)))return Response.json({error:"El video final de Glitch no está disponible"},{status:409,headers:noStore});
      }
      const state=await run(missionId,slot,"open");
      if(state.complete&&mission.status!=="unlocked")await settleFinale(missionId,mission.event_id);
      return Response.json({accepted:true,token:tokenFor(missionId,slot,mission.challenge_run_id),state:present(state)},{headers:noStore});
    }
    if(mission.status==="unlocked")return Response.json({error:"La misión ya terminó"},{status:409,headers:noStore});
    if(!validToken(missionId,slot,mission.challenge_run_id,request.headers.get("x-mission-team-token")))return Response.json({error:"Volvé a validar el acceso del equipo"},{status:403,headers:noStore});
    if(action==="sequence"&&slot!==2||action==="flip"&&slot!==3)return Response.json({error:"Desafío incorrecto"},{status:400,headers:noStore});
    if(action==="sequence"&&!parsed.data.answer||action==="flip"&&index===undefined)return Response.json({error:"Falta la respuesta"},{status:400,headers:noStore});
    const {count}=await createAdminClient().from("mission_digit_slots").select("slot",{head:true,count:"exact"}).eq("mission_id",missionId).not("digit","is",null);
    if(count===3&&!(await finalVideoReady(mission.event_id)))return Response.json({error:"El video final de Glitch no está disponible"},{status:409,headers:noStore});
    const state=await run(missionId,slot,action,parsed.data.answer?.trim().toUpperCase(),index);
    if(state.complete)await settleFinale(missionId,mission.event_id);
    return Response.json({accepted:true,state:present(state)},{headers:noStore});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"No se pudo guardar el progreso"},{status:409,headers:noStore})}
}
