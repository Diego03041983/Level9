import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {resolveMissionFinaleVideo} from "./mission-finale";

describe("mission finale media",()=>{
  it("resolves the uploaded Glitch film and its real duration",async()=>{
    const path="event/library/mission/glitch-defeat-video/finale.mp4";
    const client={from:(table:string)=>{
      expect(table).toBe("media_assets");
      const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{storage_path:path,metadata:{durationMs:70_933}}})};
      return query;
    }} as unknown as SupabaseClient;
    expect(await resolveMissionFinaleVideo(client,"20000000-0000-4000-8000-000000000001"))
      .toEqual({path,durationMs:70_933});
  });
});
