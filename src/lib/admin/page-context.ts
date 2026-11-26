import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Membership={event_id:string;role:string;events:{name:string;subtitle:string|null}|{name:string;subtitle:string|null}[]};

export async function getAdminPageContext(nextPath:string){
  const supabase=await createClient();const {data:auth}=await supabase.auth.getUser();if(!auth.user)redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const {data}=await supabase.from("event_users").select("event_id,role,events!inner(name,subtitle)").eq("user_id",auth.user.id).in("role",["owner","admin","operator"]).limit(1).maybeSingle();
  const membership=data as unknown as Membership|null;if(!membership)redirect("/admin");
  const event=Array.isArray(membership.events)?membership.events[0]:membership.events;
  return{eventId:membership.event_id,eventName:event?.name??"Level 9",eventSubtitle:event?.subtitle??null,role:membership.role};
}
