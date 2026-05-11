export type Expense = {
  // payer can be a display name or an id; prefer payerId when present
  payer?: string;
  payerId?: string | null;
  amount: number;
  // participants can be array of names or ids
  participants?: string[];
  participantIds?: string[];
  splitType?: 'equal' | 'shares' | 'individual';
  expenseType?: 'expense' | 'transfer';
  transferTo?: string;
  transferToId?: string | null;
  participantWeights?: Record<string, number>;
  participantAmounts?: Record<string, number>;
};

export type BalanceMap = Record<string, number>;

export function computeBalances(friends: Array<string | { id?: string; name: string }>, expenses: Expense[]): BalanceMap {
  const balance: BalanceMap = {};

  const norm = (s?: string) => (s || '').trim().toLowerCase();

  // Build mapping: name -> id (if provided), id -> display name
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  const friendKeys: string[] = [];

  friends.forEach((f) => {
    if (typeof f === 'string') {
      const key = f;
      friendKeys.push(key);
      balance[key] = 0;
      idByName.set(norm(f), key);
    } else {
      const name = f.name || '';
      const id = f.id || '';
      const key = id || name;
      friendKeys.push(key);
      balance[key] = 0;
      if (id) nameById.set(id, name);
      if (name) idByName.set(norm(name), id || name);
    }
  });

  const resolveParticipantKey = (raw?: string) => {
    if (!raw) return null;
    // If raw looks like an id present in nameById, prefer id
    if (nameById.has(raw)) return raw;
    // If raw matches a name, return associated id or name key
    const byName = idByName.get(norm(raw));
    if (byName) return byName;
    return raw;
  };

  const safeNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  expenses.forEach((expense) => {
    const amount = safeNumber(expense.amount);

    if (expense.expenseType === 'transfer') {
      const payerKey = expense.payerId ? expense.payerId : resolveParticipantKey(expense.payer);
      const transferToKey = expense.transferToId ? expense.transferToId : resolveParticipantKey(expense.transferTo);
      if (!payerKey || !transferToKey) return;
      if (amount <= 0) return;
      balance[payerKey] = (balance[payerKey] || 0) + amount;
      balance[transferToKey] = (balance[transferToKey] || 0) - amount;
      return;
    }

    const participantsRaw = (expense.participantIds && expense.participantIds.length)
      ? expense.participantIds
      : (expense.participants && expense.participants.length ? expense.participants : friendKeys.slice());

    const participants = participantsRaw.map(resolveParticipantKey).filter(Boolean) as string[];
    if (!participants.length) return;

    if (expense.splitType === 'individual') {
      participantsRaw.forEach((raw) => {
        const key = resolveParticipantKey(raw);
        if (!key) return;
        const share = safeNumber(expense.participantAmounts?.[raw] ?? expense.participantAmounts?.[key] ?? 0);
        if (share === 0) return;
        balance[key] = (balance[key] || 0) - share;
      });
      const payerKey = expense.payerId ? expense.payerId : resolveParticipantKey(expense.payer) || friendKeys[0] || null;
      if (payerKey) balance[payerKey] = (balance[payerKey] || 0) + amount;
      return;
    }

    if (expense.splitType === 'shares') {
      const weights = participants.map((p) => safeNumber(expense.participantWeights?.[p] ?? 1) || 1);
      const totalWeight = weights.reduce((sum, v) => sum + (v > 0 ? v : 1), 0) || participants.length;
      participants.forEach((p, i) => {
        const safeWeight = weights[i] > 0 ? weights[i] : 1;
        const share = (amount * safeWeight) / totalWeight;
        balance[p] = (balance[p] || 0) - share;
      });
      const payerKey = expense.payerId ? expense.payerId : resolveParticipantKey(expense.payer) || friendKeys[0] || null;
      if (payerKey) balance[payerKey] = (balance[payerKey] || 0) + amount;
      return;
    }

    // equal
    const share = amount / participants.length;
    participants.forEach((p) => {
      balance[p] = (balance[p] || 0) - share;
    });
    const payerKey = expense.payerId ? expense.payerId : resolveParticipantKey(expense.payer) || friendKeys[0] || null;
    if (payerKey) balance[payerKey] = (balance[payerKey] || 0) + amount;
  });

  return balance;
}

export function settleDebts(balanceMap: BalanceMap) {
  const debtors: { name: string; amount: number }[] = [];
  const creditors: { name: string; amount: number }[] = [];

  Object.entries(balanceMap).forEach(([name, value]) => {
    const rounded = Math.round(value * 100) / 100;

    if (rounded < -0.01) {
      debtors.push({ name, amount: -rounded });
    }

    if (rounded > 0.01) {
      creditors.push({ name, amount: rounded });
    }
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers: { from: string; to: string; amount: number }[] = [];

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    const roundedPay = Math.round(pay * 100) / 100;

    if (roundedPay > 0) {
      transfers.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amount: roundedPay,
      });
    }

    debtors[i].amount = Math.round(
      (debtors[i].amount - roundedPay) * 100
    ) / 100;

    creditors[j].amount = Math.round(
      (creditors[j].amount - roundedPay) * 100
    ) / 100;

    if (debtors[i].amount <= 0.01) i++;
    if (creditors[j].amount <= 0.01) j++;
  }

  return transfers;
}