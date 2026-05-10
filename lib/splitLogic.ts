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

  friends.forEach((name) => {
    balance[name] = 0;
  });

  expenses.forEach((expense) => {
    if (expense.expenseType === 'transfer') {
      if (!expense.transferTo) return;
      if (!(expense.payer in balance) || !(expense.transferTo in balance)) return;
      if (!Number.isFinite(expense.amount) || expense.amount <= 0) return;

      // A transfer is a settlement: payer paid `amount` to transferTo.
      // That reduces the receiver's receivable and reduces the payer's payable.
      // In the balance map positive means the person should receive money.
      // Before transfer: receiver has positive balance, payer negative. After transfer,
      // receiver should decrease by amount, payer should increase by amount.
      balance[expense.payer] += expense.amount;
      balance[expense.transferTo] -= expense.amount;
      return;
    }

    if (!expense.participants.length) return;

    if (expense.splitType === 'individual') {
      expense.participants.forEach((person) => {
        const share = Number(expense.participantAmounts?.[person] || 0);
        if (!Number.isFinite(share) || share <= 0) return;
        balance[person] -= share;
      });
    } else if (expense.splitType === 'shares') {
      const weights = expense.participants.map(
        (person) => Number(expense.participantWeights?.[person] || 1)
      );

      const totalWeight = weights.reduce(
        (sum, value) => sum + (value > 0 ? value : 1),
        0
      );

      expense.participants.forEach((person, index) => {
        const safeWeight = weights[index] > 0 ? weights[index] : 1;
        const share = (expense.amount * safeWeight) / totalWeight;
        balance[person] -= share;
      });
    } else {
      const share = expense.amount / expense.participants.length;

      expense.participants.forEach((person) => {
        balance[person] -= share;
      });
    }

    balance[expense.payer] += expense.amount;
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