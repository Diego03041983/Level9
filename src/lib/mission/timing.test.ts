import {describe,expect,it} from "vitest";
import {missionRemainingSeconds,type MissionTiming} from "./timing";

const base:MissionTiming={status:"ready",duration_seconds:1800,extension_seconds:0,started_at:null,paused_at:null,paused_seconds:0,unlocked_at:null,completed_at:null};
const started="2026-11-27T12:00:00.000Z";
const at=(seconds:number)=>Date.parse(started)+seconds*1000;

describe("mission clock",()=>{
  it("shows the configured duration without starting a fake countdown",()=>{
    expect(missionRemainingSeconds(base,at(500))).toBe(1800);
  });
  it("counts only elapsed active time and includes an extension",()=>{
    expect(missionRemainingSeconds({...base,status:"live",started_at:started,extension_seconds:300,paused_seconds:120},at(600))).toBe(1620);
  });
  it("freezes on pause and after the last fragment",()=>{
    const paused={...base,status:"paused",started_at:started,paused_at:new Date(at(500)).toISOString()};
    expect(missionRemainingSeconds(paused,at(1000))).toBe(1300);
    const unlocked={...base,status:"unlocked",started_at:started,unlocked_at:new Date(at(700)).toISOString()};
    expect(missionRemainingSeconds(unlocked,at(1000))).toBe(1100);
  });
});
