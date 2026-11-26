import { getAdminPageContext } from "@/lib/admin/page-context";
import { DisplayConsole } from "../display/DisplayConsole";

export const instant=false;
export default async function ShowControlPage(){const context=await getAdminPageContext("/admin/show-control");return <DisplayConsole eventId={context.eventId} eventName={context.eventName}/>}
