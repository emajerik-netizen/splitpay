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

  // Build mapping: name -> balance-key, id -> display name
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

  // Resolve a raw string (id or name) to the balance-map key for that member.
  const resolveParticipantKey = (raw?: string): string | null => {
    if (!raw) return null;
    if (nameById.has(raw)) return raw;                  // raw is a recognised UUID
    const byName = idByName.get(norm(raw));
    if (byName) return byName;                          // raw matched a member name
    return raw;                                         // last resort
  };

  // Like resolveParticipantKey but guarantees the returned key exists in balance.
  // When an expense stores a UUID from a session that is not present in the current
  // friends list (e.g. member entry has no id stored), fall back to the name-based
  // key so the balance is always attributed to a recognised friend.
  const resolveKnownKey = (idHint?: string | null, nameHint?: string): string | null => {
    if (idHint) {
      const k = resolveParticipantKey(idHint);
      if (k && Object.prototype.hasOwnProperty.call(balance, k)) return k;
    }
    if (nameHint) {
      const k = resolveParticipantKey(nameHint);
      if (k && Object.prototype.hasOwnProperty.call(balance, k)) return k;
    }
    return null;
  };

  const safeNumber = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  expenses.forEach((expense) => {
    const amount = safeNumber(expense.amount);

    // ── Transfer (settlement payment) ──────────────────────────────────────
    if (expense.expenseType === 'transfer') {
      const payerKey = resolveKnownKey(expense.payerId, expense.payer);
      const transferToKey = resolveKnownKey(expense.transferToId, expense.transferTo);
      if (!payerKey || !transferToKey) return;
      if (amount <= 0) return;
      // Debtor (payer) clears debt → balance moves toward 0 (positive delta)
      // Creditor (transferTo) is owed less → balance moves toward 0 (negative delta)
      balance[payerKey] = (balance[payerKey] || 0) + amount;
      balance[transferToKey] = (balance[transferToKey] || 0) - amount;
      return;
    }

    // ── Resolve participants list ───────────────────────────────────────────
    // Prefer participantIds when present; fall back to participants names; fall back to all friends.
    const participantsRaw = (expense.participantIds && expense.participantIds.length)
      ? expense.participantIds
      : (expense.participants && expense.participants.length ? expense.participants : friendKeys.slice());

    // Resolve each raw value to a known balance key; skip any that can't be resolved.
    const participants: string[] = participantsRaw
      .map((raw) => {
        const k = resolveParticipantKey(raw);
        if (!k) return null;
        if (Object.prototype.hasOwnProperty.call(balance, k)) return k;
        // raw was not a recognised key — try the display-name lookup as a final fallback
        const displayName = nameById.get(raw);
        if (displayName) {
          const byDisplay = resolveParticipantKey(displayName);
          if (byDisplay && Object.prototype.hasOwnProperty.call(balance, byDisplay)) return byDisplay;
        }
        return null;
      })
      .filter((k): k is string => k !== null);

    if (!participants.length) return;

    // ── Individual split ────────────────────────────────────────────────────
    if (expense.splitType === 'individual') {
      participantsRaw.forEach((raw) => {
        const key = resolveParticipantKey(raw);
        if (!key) return;
        // Resolve to a known key with the same fallback used above
        let knownKey = Object.prototype.hasOwnProperty.call(balance, key) ? key : null;
        if (!knownKey) {
          const displayName = nameById.get(raw);
          if (displayName) {
            const byDisplay = resolveParticipantKey(displayName);
            if (byDisplay && Object.prototype.hasOwnProperty.call(balance, byDisplay)) knownKey = byDisplay;
          }
        }
        if (!knownKey) return;

        // participantAmounts may be keyed by name even when participantsRaw are IDs
        const displayName = nameById.get(raw) || nameById.get(key);
        const share = safeNumber(
          expense.participantAmounts?.[raw] ??
          expense.participantAmounts?.[key] ??
          (displayName !== undefined ? expense.participantAmounts?.[displayName] : undefined) ??
          0
        );
        if (share === 0) return;
        balance[knownKey] = (balance[knownKey] || 0) - share;
      });

      const payerKey = resolveKnownKey(expense.payerId, expense.payer) ?? friendKeys[0] ?? null;
      if (payerKey) balance[payerKey] = (balance[payerKey] || 0) + amount;
      return;
    }

    // ── Shares split ────────────────────────────────────────────────────────
    if (expense.splitType === 'shares') {
      // participantWeights may be keyed by name even when participants are IDs
      const weights = participants.map((p) => {
        const displayName = nameById.get(p);
        return safeNumber(
          expense.participantWeights?.[p] ??
          (displayName !== undefined ? expense.participantWeights?.[displayName] : undefined) ??
          1
        ) || 1;
      });
      const totalWeight = weights.reduce((sum, v) => sum + (v > 0 ? v : 1), 0) || participants.length;
      participants.forEach((p, i) => {
        const safeWeight = weights[i] > 0 ? weights[i] : 1;
        const share = (amount * safeWeight) / totalWeight;
        balance[p] = (balance[p] || 0) - share;
      });
      const payerKey = resolveKnownKey(expense.payerId, expense.payer) ?? friendKeys[0] ?? null;
      if (payerKey) balance[payerKey] = (balance[payerKey] || 0) + amount;
      return;
    }

    // ── Equal split (default) ───────────────────────────────────────────────
    const share = amount / participants.length;
    participants.forEach((p) => {
      balance[p] = (balance[p] || 0) - share;
    });
    const payerKey = resolveKnownKey(expense.payerId, expense.payer) ?? friendKeys[0] ?? null;
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

    debtors[i].amount = Math.round((debtors[i].amount - roundedPay) * 100) / 100;
    creditors[j].amount = Math.round((creditors[j].amount - roundedPay) * 100) / 100;

    if (debtors[i].amount <= 0.01) i++;
    if (creditors[j].amount <= 0.01) j++;
  }

  return transfers;
}
