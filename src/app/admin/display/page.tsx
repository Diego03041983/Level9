import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {DisplayConsole} from "./DisplayConsole";

export const instant = false;

type Membership={event_id:string;role:string;events:{name:string}|{name:string}[]};
export default async function DisplayAdminPage(){const supabase=await createClient();const {data:auth}=await supabase.auth.getUser();if(!auth.user)redirect("/login?next=/admin/display");const {data}=await supabase.from("event_users").select("event_id,role,events!inner(name)").eq("user_id",auth.user.id).in("role",["owner","admin","operator"]).limit(1).maybeSingle();const membership=data as unknown as Membership|null;if(!membership)redirect("/admin");const event=Array.isArray(membership.events)?membership.events[0]:membership.events;return <DisplayConsole eventId={membership.event_id} eventName={event?.name??"Level 9"}/>}

