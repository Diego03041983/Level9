export type DrawMode = "random" | "balanced";

export interface DrawCandidate {
  id: string;
  registered: boolean;
  active: boolean;
  occupied: boolean;
  enabledActivityIds: readonly string[];
  participationCount: number;
}

export interface DrawRequest {
  candidates: readonly DrawCandidate[];
  count: number;
  activityId: string;
  mode?: DrawMode;
  fixedIds?: readonly string[];
  allowOccupiedIds?: readonly string[];
  random?: () => number;
}

export interface DrawResult {
  selected: DrawCandidate[];
  eligible: DrawCandidate[];
  excluded: Array<{ id: string; reason: string }>;
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function eligibleForDraw(
  candidate: DrawCandidate,
  activityId: string,
  allowOccupiedIds: ReadonlySet<string> = new Set(),
): { eligible: true } | { eligible: false; reason: string } {
  if (!candidate.registered) return { eligible: false, reason: "not_registered" };
  if (!candidate.active) return { eligible: false, reason: "inactive" };
  if (!candidate.enabledActivityIds.includes(activityId)) {
    return { eligible: false, reason: "activity_disabled" };
  }
  if (candidate.occupied && !allowOccupiedIds.has(candidate.id)) {
    return { eligible: false, reason: "occupied" };
  }
  return { eligible: true };
}

export function drawParticipants(request: DrawRequest): DrawResult {
  if (!Number.isInteger(request.count) || request.count < 1) {
    throw new Error("Draw count must be a positive integer");
  }

  const random = request.random ?? Math.random;
  const fixedIds = [...new Set(request.fixedIds ?? [])];
  const allowOccupied = new Set(request.allowOccupiedIds ?? []);
  const candidateIds = new Set(request.candidates.map(({ id }) => id));
  const missingFixed = fixedIds.find((id) => !candidateIds.has(id));
  if (missingFixed) throw new Error(`Fixed participant ${missingFixed} does not exist`);

  const eligible: DrawCandidate[] = [];
  const excluded: Array<{ id: string; reason: string }> = [];
  for (const candidate of request.candidates) {
    const status = eligibleForDraw(candidate, request.activityId, allowOccupied);
    if (status.eligible) eligible.push(candidate);
    else excluded.push({ id: candidate.id, reason: status.reason });
  }

  const eligibleIds = new Set(eligible.map(({ id }) => id));
  const invalidFixed = fixedIds.find((id) => !eligibleIds.has(id));
  if (invalidFixed) throw new Error(`Fixed participant ${invalidFixed} is not eligible`);
  if (fixedIds.length > request.count) throw new Error("Fixed participants exceed draw size");
  if (eligible.length < request.count) {
    throw new Error(`Not enough eligible participants: requested ${request.count}, available ${eligible.length}`);
  }

  const fixed = fixedIds.map((id) => eligible.find((candidate) => candidate.id === id)!);
  const fixedSet = new Set(fixedIds);
  const remaining = eligible.filter(({ id }) => !fixedSet.has(id));
  let ordered: DrawCandidate[];
  if ((request.mode ?? "balanced") === "balanced") {
    ordered = shuffle(remaining, random).sort(
      (left, right) => left.participationCount - right.participationCount,
    );
  } else {
    ordered = shuffle(remaining, random);
  }

  return {
    selected: [...fixed, ...ordered.slice(0, request.count - fixed.length)],
    eligible,
    excluded,
  };
}

export function makePairs<T>(participants: readonly T[]): Array<readonly [T, T]> {
  if (participants.length % 2 !== 0) {
    throw new Error("An even number of participants is required to form pairs");
  }
  const pairs: Array<readonly [T, T]> = [];
  for (let index = 0; index < participants.length; index += 2) {
    pairs.push([participants[index], participants[index + 1]]);
  }
  return pairs;
}
