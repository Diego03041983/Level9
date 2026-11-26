import {getAdminPageContext} from "@/lib/admin/page-context";
import {TemplateEditor} from "./TemplateEditor";

export const instant=false;
export default async function TemplatesPage(){const context=await getAdminPageContext("/admin/audio-templates");return <TemplateEditor {...context}/>}
