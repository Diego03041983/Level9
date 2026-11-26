import {getAdminPageContext} from "@/lib/admin/page-context";
import {AudiovisualSettings} from "./AudiovisualSettings";
export const instant=false;
export default async function SettingsPage(){const context=await getAdminPageContext("/admin/settings");return <AudiovisualSettings {...context}/>}
