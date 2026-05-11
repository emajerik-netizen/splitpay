export type Expense = {
  payer: string;
  amount: number;
  participants: string[];
  splitType?: 'equal' | 'shares' | 'individual';
  expenseType?: 'expense' | 'transfer';
  transferTo?: string;
  participantWeights?: Record<string, number>;
  participantAmounts?: Record<string, number>;
};

export type BalanceMap = Record<string, number>;

export function computeBalances(
  friends: string[],
  expenses: Expense[]
): BalanceMap {
  const balance: BalanceMap = {};

  const norm = (s?: string) => (s || '').trim().toLowerCase();
  const friendMap = new Map<string, string>();
  friends.forEach((name) => {
    balance[name] = 0;
    friendMap.set(norm(name), name);
  });

  const findFriend = (name?: string) => {
    if (!name) return null;
    return friendMap.get(norm(name)) ?? null;
  };

  expenses.forEach((expense) => {
    const amount = Number(expense.amount) || 0;

    if (expense.expenseType === 'transfer') {
      if (!expense.transferTo) return;
      const payer = findFriend(expense.payer);
      const transferTo = findFriend(expense.transferTo);
      if (!payer || !transferTo) return;
      if (!Number.isFinite(amount) || amount <= 0) return;

      // Treat transfer as settlement: payer increases, transferTo decreases
      balance[payer] = (balance[payer] || 0) + amount;
      balance[transferTo] = (balance[transferTo] || 0) - amount;
      return;
    }

    const participantsRaw = expense.participants && expense.participants.length ? expense.participants : friends;
    const participants = participantsRaw.map(findFriend).filter(Boolean) as string[];
    if (!participants.length) return;

    if (expense.splitType === 'individual') {
      participantsRaw.forEach((raw) => {
        const p = findFriend(raw);
        if (!p) return;
        const share = Number(expense.participantAmounts?.[raw] ?? expense.participantAmounts?.[p] ?? 0) || 0;
        if (!Number.isFinite(share) || share === 0) return;
        balance[p] = (balance[p] || 0) - share;
      });
      const payer = findFriend(expense.payer) || friends[0] || null;
      if (payer) balance[payer] = (balance[payer] || 0) + amount;
      return;
    }

    if (expense.splitType === 'shares') {
      const weights = participants.map((p) => Number(expense.participantWeights?.[p] ?? 1) || 1);
      const totalWeight = weights.reduce((sum, v) => sum + (v > 0 ? v : 1), 0) || participants.length;
      participants.forEach((p, i) => {
        const safeWeight = weights[i] > 0 ? weights[i] : 1;
        const share = (amount * safeWeight) / totalWeight;
        balance[p] = (balance[p] || 0) - share;
      });
      const payer = findFriend(expense.payer) || friends[0] || null;
      if (payer) balance[payer] = (balance[payer] || 0) + amount;
      return;
    }

    // equal
    const share = amount / participants.length;
    participants.forEach((p) => {
      balance[p] = (balance[p] || 0) - share;
    });
    const payer = findFriend(expense.payer) || friends[0] || null;
    if (payer) balance[payer] = (balance[payer] || 0) + amount;
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