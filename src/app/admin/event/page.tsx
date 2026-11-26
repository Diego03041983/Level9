import { getAdminPageContext } from "@/lib/admin/page-context";
import { EventControl } from "./EventControl";

export const instant=false;
export default async function EventPage(){const context=await getAdminPageContext("/admin/event");return <EventControl {...context}/>}
