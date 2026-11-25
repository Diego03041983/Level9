export interface BracketEntry {
  id: string;
  seed?: number;
}

export interface BracketSlot {
  entryId: string | null;
  sourceMatchId: string | null;
}

export interface BracketMatch {
  id: string;
  round: number;
  position: number;
  slots: readonly [BracketSlot, BracketSlot];
}

export interface SingleEliminationBracket {
  bracketSize: number;
  byeEntryIds: string[];
  rounds: BracketMatch[][];
  totalMatches: number;
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

export function buildSingleEliminationBracket(
  entries: readonly BracketEntry[],
): SingleEliminationBracket {
  if (entries.length < 2) throw new Error("At least two entries are required");
  const uniqueIds = new Set(entries.map(({ id }) => id));
  if (uniqueIds.size !== entries.length) throw new Error("Bracket entry IDs must be unique");

  const bracketSize = nextPowerOfTwo(entries.length);
  const byeCount = bracketSize - entries.length;
  const seeded = [...entries].sort(
    (left, right) => (left.seed ?? Number.MAX_SAFE_INTEGER) - (right.seed ?? Number.MAX_SAFE_INTEGER),
  );
  const byeEntries = seeded.slice(0, byeCount);
  const playingEntries = seeded.slice(byeCount);
  const rounds: BracketMatch[][] = [];

  const firstRound: BracketMatch[] = [];
  for (let position = 0; position < playingEntries.length / 2; position += 1) {
    firstRound.push({
      id: `r1-m${position + 1}`,
      round: 1,
      position: position + 1,
      slots: [
        { entryId: playingEntries[position * 2].id, sourceMatchId: null },
        { entryId: playingEntries[position * 2 + 1].id, sourceMatchId: null },
      ],
    });
  }
  rounds.push(firstRound);

  let sources: BracketSlot[] = [
    ...byeEntries.map(({ id }) => ({ entryId: id, sourceMatchId: null })),
    ...firstRound.map(({ id }) => ({ entryId: null, sourceMatchId: id })),
  ];
  let round = 2;
  while (sources.length > 1) {
    const matches: BracketMatch[] = [];
    for (let position = 0; position < sources.length / 2; position += 1) {
      matches.push({
        id: `r${round}-m${position + 1}`,
        round,
        position: position + 1,
        slots: [sources[position * 2], sources[position * 2 + 1]],
      });
    }
    rounds.push(matches);
    sources = matches.map(({ id }) => ({ entryId: null, sourceMatchId: id }));
    round += 1;
  }

  return {
    bracketSize,
    byeEntryIds: byeEntries.map(({ id }) => id),
    rounds,
    totalMatches: entries.length - 1,
  };
}
