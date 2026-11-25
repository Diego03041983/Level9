export interface XpTransaction {
  id: string;
  participantId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface XpLedger {
  transactions: readonly XpTransaction[];
}

export function createXpLedger(): XpLedger {
  return { transactions: [] };
}

export function addXpTransaction(ledger: XpLedger, transaction: XpTransaction): XpLedger {
  if (!Number.isInteger(transaction.amount) || transaction.amount === 0) {
    throw new Error("XP amount must be a non-zero integer");
  }
  if (!transaction.reason.trim()) throw new Error("XP reason is required");
  if (!transaction.idempotencyKey.trim()) throw new Error("XP idempotency key is required");
  if (ledger.transactions.some(({ id }) => id === transaction.id)) {
    throw new Error(`XP transaction ${transaction.id} already exists`);
  }
  if (ledger.transactions.some(({ idempotencyKey }) => idempotencyKey === transaction.idempotencyKey)) {
    return ledger;
  }
  return { transactions: [...ledger.transactions, transaction] };
}

export function xpBalance(ledger: XpLedger, participantId: string): number {
  return ledger.transactions
    .filter((transaction) => transaction.participantId === participantId)
    .reduce((total, transaction) => total + transaction.amount, 0);
}
