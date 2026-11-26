import {describe,expect,it} from "vitest";
import {robloxStandings} from "./roblox-standings";

describe("Roblox competition standings",()=>{
  it("shares points for ties, treats golf as lower-is-better, and never counts a repeat twice",()=>{
    const table=robloxStandings([
      {participantId:"a",discipline:"epic-minigames",score:5,comparisonKey:"standard",playedAt:"2026-01-01"},
      {participantId:"b",discipline:"epic-minigames",score:5,comparisonKey:"standard",playedAt:"2026-01-02"},
      {participantId:"a",discipline:"epic-minigames",score:9,comparisonKey:"standard",playedAt:"2026-01-03"},
      {participantId:"a",discipline:"super-golf",score:20,comparisonKey:"standard",playedAt:"2026-01-04"},
      {participantId:"b",discipline:"super-golf",score:18,comparisonKey:"standard",playedAt:"2026-01-04"},
      {participantId:"c",discipline:"super-golf",score:12,comparisonKey:"different-course",playedAt:"2026-01-04"},
    ],[10,7,5]);
    expect(table.positions.find(row=>row.participantId==="a"&&row.discipline==="epic-minigames")).toMatchObject({score:5,position:1,points:10});
    expect(table.positions.find(row=>row.participantId==="b"&&row.discipline==="epic-minigames")).toMatchObject({position:1,points:10});
    expect(table.positions.find(row=>row.participantId==="b"&&row.discipline==="super-golf")).toMatchObject({position:1,points:10});
    expect(table.overall).toEqual([{participantId:"b",total:20},{participantId:"a",total:17}]);
  });
});
