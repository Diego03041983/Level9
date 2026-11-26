export type RobloxScore={participantId:string;discipline:string;score:number;comparisonKey:string;playedAt:string};
export type RobloxPosition={participantId:string;discipline:string;score:number;position:number;points:number};

export function robloxStandings(scores:readonly RobloxScore[],points:readonly number[],comparisonKey="standard"){
  const byDiscipline=new Map<string,RobloxScore[]>();
  for(const score of scores){
    if(score.comparisonKey!==comparisonKey||!Number.isFinite(score.score))continue;
    const list=byDiscipline.get(score.discipline)??[];
    list.push(score);byDiscipline.set(score.discipline,list);
  }
  const positions:RobloxPosition[]=[];
  for(const [discipline,records] of byDiscipline){
    const first=new Map<string,RobloxScore>();
    for(const record of [...records].sort((a,b)=>a.playedAt.localeCompare(b.playedAt))){
      if(!first.has(record.participantId))first.set(record.participantId,record);
    }
    const ordered=[...first.values()].sort((a,b)=>discipline==="super-golf"?a.score-b.score:b.score-a.score);
    for(const record of ordered){
      const position=ordered.findIndex(item=>item.score===record.score)+1;
      positions.push({participantId:record.participantId,discipline,score:record.score,position,points:points[position-1]??0});
    }
  }
  const totals=new Map<string,number>();
  for(const row of positions)totals.set(row.participantId,(totals.get(row.participantId)??0)+row.points);
  return {positions,overall:[...totals].map(([participantId,total])=>({participantId,total})).sort((a,b)=>b.total-a.total||a.participantId.localeCompare(b.participantId))};
}
