import {getAdminPageContext} from "@/lib/admin/page-context";
import {MissionControl} from "./MissionControl";
export const instant=false;
export default async function MissionControlPage(){const context=await getAdminPageContext("/admin/mission-control");return <MissionControl {...context}/>}
