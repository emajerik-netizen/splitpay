function roundToCents(n){return Math.round((n+Number.EPSILON)*100)/100}
function computeBalances(friends, expenses){
  const balance = {};
  const norm = (s)=> (s||'').trim().toLowerCase();
  const friendMap = new Map();
  // Support friends as either strings (display names) or objects { name, email }
  friends.forEach((f)=>{
    if(typeof f === 'string'){
      balance[f]=0; friendMap.set(norm(f), f);
    } else if(f && typeof f === 'object'){
      const name = String(f.name || '').trim() || String(f.email || '').trim();
      balance[name]=0;
      if(name) friendMap.set(norm(name), name);
      if(f.email) friendMap.set(norm(f.email), name);
    }
  });
  const findFriend = (nameOrEmail)=>{ if(!nameOrEmail) return null; return friendMap.get(norm(nameOrEmail)) ?? null };
  for(const expense of expenses){
    const amount = Number(expense.amount)||0;
    if(expense.expenseType === 'transfer'){
      if(!expense.transferTo) continue;
      const payer = findFriend(expense.payer);
      const transferTo = findFriend(expense.transferTo);
      if(!payer||!transferTo) continue;
      if(!Number.isFinite(amount) || amount<=0) continue;
      balance[payer] = (balance[payer]||0) + amount;
      balance[transferTo] = (balance[transferTo]||0) - amount;
      continue;
    }
    const participantsRaw = expense.participants && expense.participants.length ? expense.participants : friends;
    const participants = participantsRaw.map(findFriend).filter(Boolean);
    if(!participants.length) continue;
    if(expense.splitType === 'individual'){
      participantsRaw.forEach((raw)=>{
        const p = findFriend(raw);
        if(!p) return;
        const share = Number((expense.participantAmounts && (expense.participantAmounts[raw] ?? expense.participantAmounts[p])) || 0) || 0;
        if(!Number.isFinite(share) || share===0) return;
        balance[p] = (balance[p]||0) - share;
      });
      const payer = findFriend(expense.payer) || friends[0] || null;
      if(payer) balance[payer] = (balance[payer]||0) + amount;
      continue;
    }
    if(expense.splitType === 'shares'){
      const weights = participants.map((p)=>Number(expense.participantWeights && (expense.participantWeights[p] ?? 1))||1);
      const totalWeight = weights.reduce((s,v)=>s+(v>0?v:1),0) || participants.length;
      participants.forEach((p,i)=>{
        const safeWeight = weights[i]>0?weights[i]:1;
        const share = (amount*safeWeight)/totalWeight;
        balance[p] = (balance[p]||0) - share;
      });
      const payer = findFriend(expense.payer) || friends[0] || null;
      if(payer) balance[payer] = (balance[payer]||0) + amount;
      continue;
    }
    // equal
    const share = amount/participants.length;
    participants.forEach((p)=>{ balance[p] = (balance[p]||0) - share });
    const payer = findFriend(expense.payer) || friends[0] || null;
    if(payer) balance[payer] = (balance[payer]||0) + amount;
  }
  // round
  Object.keys(balance).forEach(k=>balance[k]=roundToCents(balance[k]||0));
  return balance;
}

const friends = ['Eugen Majerik','Admin'];
const expenses = [
  {id:'e1', payer:'Eugen Majerik', amount:25, participants:['Eugen Majerik','Admin'], splitType:'equal', expenseType:'expense'},
  {id:'e2', payer:'Admin', amount:20, participants:['Eugen Majerik','Admin'], splitType:'equal', expenseType:'expense'}
];

console.log('friends:', friends);
console.log('expenses:', expenses);
console.log('balances:', computeBalances(friends, expenses));

const { settleDebts } = (function(){
  function settleDebts(balanceMap){
    const debtors = []; const creditors = [];
    Object.entries(balanceMap).forEach(([name,value])=>{
      const rounded = Math.round(value*100)/100;
      if(rounded < -0.01) debtors.push({name, amount: -rounded});
      if(rounded > 0.01) creditors.push({name, amount: rounded});
    });
    debtors.sort((a,b)=>b.amount-a.amount); creditors.sort((a,b)=>b.amount-a.amount);
    const transfers =[]; let i=0,j=0; while(i<debtors.length && j<creditors.length){
      const pay = Math.min(debtors[i].amount, creditors[j].amount);
      const roundedPay = Math.round(pay*100)/100;
      if(roundedPay>0) transfers.push({from:debtors[i].name, to:creditors[j].name, amount:roundedPay});
      debtors[i].amount = Math.round((debtors[i].amount - roundedPay)*100)/100;
      creditors[j].amount = Math.round((creditors[j].amount - roundedPay)*100)/100;
      if(debtors[i].amount <= 0.01) i++; if(creditors[j].amount <= 0.01) j++; }
    return transfers;
  }
  return { settleDebts };
})();

console.log('settlements:', settleDebts(computeBalances(friends, expenses)));
