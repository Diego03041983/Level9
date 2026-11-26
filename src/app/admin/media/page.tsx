import {getAdminPageContext} from "@/lib/admin/page-context";
import {MediaLibrary} from "./MediaLibrary";

export const instant=false;
export default async function MediaPage(){const context=await getAdminPageContext("/admin/media");return <MediaLibrary {...context}/>}
