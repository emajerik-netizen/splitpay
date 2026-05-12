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
  // Resolve a balance-map key using both a UUID hint and a display-name hint.
  // When both resolve to DIFFERENT valid keys, the name wins: names are human-readable
  // and can't be corrupted by the accidental session-UUID-as-fallback bug. UUIDs are
  // authoritative only when the name can't be resolved independently.
  const resolveKnownKey = (idHint?: string | null, nameHint?: string): string | null => {
    const idKey = idHint ? (() => {
      const k = resolveParticipantKey(idHint);
      return k && Object.prototype.hasOwnProperty.call(balance, k) ? k : null;
    })() : null;
    const nameKey = nameHint ? (() => {
      const k = resolveParticipantKey(nameHint);
      return k && Object.prototype.hasOwnProperty.call(balance, k) ? k : null;
    })() : null;
    // If both resolve to different keys, trust the name
    if (idKey && nameKey && idKey !== nameKey) return nameKey;
    return idKey ?? nameKey ?? null;
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
    // Merge participantIds AND participants names: IDs may be incomplete (member had no id when
    // the expense was created), so names serve as the safety net. Deduplication by resolved key
    // prevents any participant from being counted twice.
    const ids = expense.participantIds || [];
    const names = expense.participants || [];
    const participantsRaw = (ids.length || names.length)
      ? [...ids, ...names]
      : friendKeys.slice();

    // Resolve each raw value to a known balance key; deduplicate by resolved key.
    const seenKeys = new Set<string>();
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
      .filter((k): k is string => {
        if (k === null) return false;
        if (seenKeys.has(k)) return false;
        seenKeys.add(k);
        return true;
      });

    if (!participants.length) return;

    // ── Individual split ────────────────────────────────────────────────────
    if (expense.splitType === 'individual') {
      const seenIndividual = new Set<string>();
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
        if (seenIndividual.has(knownKey)) return;
        seenIndividual.add(knownKey);

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
