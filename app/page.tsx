'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Expense, computeBalances, settleDebts } from '@/lib/splitLogic';
import { getSupabaseBrowserClient } from '@/lib/supabase';

function eur(value: number) {
  return `${value.toFixed(2)} EUR`;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const STORAGE_KEY = 'splitpay-web-v1';
const SESSION_CACHE_KEY = 'splitpay-web-session';

type Invite = {
  id: string;
  name: string;
  contact: string;
  status: 'Pozvany' | 'Prijate';
};

type TripExpense = Expense & {
  id: string;
  title: string;
};

type Trip = {
  id: string;
  name: string;
  date: string;
  inviteCode: string;
  members: string[];
  expenses: TripExpense[];
  pendingInvites: Invite[];
};

type ExpenseDraft = {
  title: string;
  amount: string;
  payer: string;
  participants: string[];
  splitType: 'equal' | 'shares';
  participantWeights: Record<string, number>;
};

type AppSession = {
  email: string;
  name: string;
  guest: boolean;
};

type AppScreen = 'trips' | 'trip-detail';
type TripDetailScreen = 'overview' | 'members' | 'invites' | 'expenses' | 'balances';

const DEFAULT_TRIP: Trip = {
  id: 'default-trip',
  name: 'Moj prvy vylet',
  date: 'Doplnis datum',
  inviteCode: 'DEMO01',
  members: ['Ty'],
  expenses: [],
  pendingInvites: [],
};

function createTrip(name: string, date: string): Trip {
  return {
    id: makeId(),
    name,
    date,
    inviteCode: makeInviteCode(),
    members: ['Ty'],
    expenses: [],
    pendingInvites: [],
  };
}

function readInitialState(): { trips: Trip[]; selectedTripId: string } {
  return { trips: [DEFAULT_TRIP], selectedTripId: DEFAULT_TRIP.id };
}

function friendlyAuthError(message: string) {
  const msg = message.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Nespravny email alebo heslo.';
  if (msg.includes('email not confirmed')) return 'Email este nie je potvrdeny.';
  if (msg.includes('already registered')) return 'Tento email uz je zaregistrovany.';
  if (msg.includes('network')) return 'Chyba siete. Skus to znova.';
  return message;
}

function readCachedSession() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AppSession>;
    if (!parsed.email || !parsed.name) return null;

    return {
      email: parsed.email,
      name: parsed.name,
      guest: Boolean(parsed.guest),
    } satisfies AppSession;
  } catch {
    return null;
  }
}

function makeUserSession(email: string, fullName?: string | null): AppSession {
  const normalizedEmail = email.trim().toLowerCase();
  const fallbackName = normalizedEmail.split('@')[0] || 'Pouzivatel';

  return {
    email: normalizedEmail,
    name: (fullName || '').trim() || fallbackName,
    guest: false,
  };
}

export default function SplitPayWebApp() {
  const [showStartup, setShowStartup] = useState(true);
  const [trips, setTrips] = useState<Trip[]>(() => readInitialState().trips);
  const [selectedTripId, setSelectedTripId] = useState<string>(() => readInitialState().selectedTripId);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [appSession, setAppSession] = useState<AppSession | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [appScreen, setAppScreen] = useState<AppScreen>('trips');
  const [detailScreen, setDetailScreen] = useState<TripDetailScreen>('overview');
  const [newTripName, setNewTripName] = useState('');
  const [newTripDate, setNewTripDate] = useState('');
  const [newMember, setNewMember] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteContact, setInviteContact] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [draft, setDraft] = useState<ExpenseDraft>({
    title: '',
    amount: '',
    payer: 'Ty',
    participants: ['Ty'],
    splitType: 'equal',
    participantWeights: { Ty: 1 },
  });

  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    const timer = window.setTimeout(() => setShowStartup(false), 3200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const cachedSession = readCachedSession();
        if (cachedSession) {
          setAppSession(cachedSession);
        }

        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as { trips?: Trip[]; selectedTripId?: string };
        if (Array.isArray(parsed.trips) && parsed.trips.length > 0) {
          setTrips(parsed.trips);
          setSelectedTripId(parsed.selectedTripId || parsed.trips[0].id);
        }
      } catch {
        // Ignore invalid local state and keep the deterministic fallback.
      }
    });
  }, []);

  useEffect(() => {
    if (!supabase) {
      queueMicrotask(() => setAuthResolved(true));
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const nextSession = data.session?.user?.email
        ? makeUserSession(
            data.session.user.email,
            typeof data.session.user.user_metadata?.full_name === 'string'
              ? data.session.user.user_metadata.full_name
              : null
          )
        : null;

      setAppSession(nextSession);
      setAuthResolved(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextSession = session?.user?.email
        ? makeUserSession(
            session.user.email,
            typeof session.user.user_metadata?.full_name === 'string'
              ? session.user.user_metadata.full_name
              : null
          )
        : null;

      setAppSession(nextSession);
      setAuthResolved(true);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const idForStorage = trips.some((trip) => trip.id === selectedTripId)
      ? selectedTripId
      : trips[0]?.id || '';

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ trips, selectedTripId: idForStorage })
    );
  }, [trips, selectedTripId]);

  useEffect(() => {
    if (appSession) {
      window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(appSession));
      return;
    }

    window.localStorage.removeItem(SESSION_CACHE_KEY);
  }, [appSession]);

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage('Supabase nie je nastavene. Doplnenie .env je povinne.');
      return;
    }

    if (!email.trim() || !password.trim()) {
      setAuthMessage('Zadaj email aj heslo.');
      return;
    }

    setAuthLoading(true);
    setAuthMessage('');

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          setAuthMessage(friendlyAuthError(error.message));
          return;
        }

        setAuthMessage('Prihlasenie uspesne.');
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: fullName.trim() || 'Pouzivatel',
            },
          },
        });

        if (error) {
          setAuthMessage(friendlyAuthError(error.message));
          return;
        }

        setAuthMessage('Registracia prebehla. Skontroluj email pre potvrdenie uctu.');
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (!supabase) {
      setAuthMessage('Supabase nie je nastavene. Doplnenie .env je povinne.');
      return;
    }

    setAuthLoading(true);
    setAuthMessage('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        setAuthMessage(friendlyAuthError(error.message));
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    setAppSession(null);
    setAppScreen('trips');
    setDetailScreen('overview');
    window.localStorage.removeItem(SESSION_CACHE_KEY);

    if (supabase) {
      await supabase.auth.signOut();
    }

    setAuthMessage('Odhlasene.');
  }

  async function handleResetPassword() {
    if (!supabase) {
      setAuthMessage('Supabase nie je nastavene.');
      return;
    }

    if (!email.trim()) {
      setAuthMessage('Najprv zadaj email.');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });

    if (error) {
      setAuthMessage(friendlyAuthError(error.message));
      return;
    }

    setAuthMessage('Poslali sme email na obnovu hesla.');
  }

  function toggleAuthMode() {
    setAuthMessage('');
    setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'));
  }

  const currentTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) || trips[0] || null,
    [trips, selectedTripId]
  );

  const members = useMemo(() => currentTrip?.members ?? [], [currentTrip]);
  const safePayer = members.includes(draft.payer) ? draft.payer : members[0] || 'Ty';
  const safeParticipantsRaw = draft.participants.filter((name) => members.includes(name));
  const safeParticipants = safeParticipantsRaw.length ? safeParticipantsRaw : safePayer ? [safePayer] : [];

  const normalizedExpenses = useMemo(() => {
    if (!currentTrip) return [];
    return currentTrip.expenses.map((expense) => ({
      ...expense,
      participants: expense.participants.length ? expense.participants : currentTrip.members,
    }));
  }, [currentTrip]);

  const balances = useMemo(() => computeBalances(members, normalizedExpenses), [members, normalizedExpenses]);
  const settlements = useMemo(() => settleDebts(balances), [balances]);
  const totalSpent = useMemo(
    () => normalizedExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    [normalizedExpenses]
  );
  const recentExpenses = useMemo(() => normalizedExpenses.slice(0, 3), [normalizedExpenses]);

  const canAddExpense =
    draft.title.trim().length > 0 &&
    Number(draft.amount) > 0 &&
    safePayer.trim().length > 0 &&
    safeParticipants.length > 0;

  function updateCurrentTrip(updater: (trip: Trip) => Trip) {
    if (!currentTrip) return;
    setTrips((prev) => prev.map((trip) => (trip.id === currentTrip.id ? updater(trip) : trip)));
  }

  function openTrip(tripId: string, nextScreen: TripDetailScreen = 'overview') {
    setSelectedTripId(tripId);
    setDetailScreen(nextScreen);
    setAppScreen('trip-detail');
  }

  function goToTripsHome() {
    setAppScreen('trips');
    setDetailScreen('overview');
  }

  function handleCreateTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedName = newTripName.trim();
    if (!cleanedName) return;

    const trip = createTrip(cleanedName, newTripDate.trim() || 'Bez datumu');
    setTrips((prev) => [trip, ...prev]);
    setSelectedTripId(trip.id);
    setAppScreen('trip-detail');
    setDetailScreen('overview');
    setNewTripName('');
    setNewTripDate('');
    setInfoMessage(`Vylet ${trip.name} bol vytvoreny.`);
  }

  function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentTrip) return;
    const cleaned = newMember.trim();

    if (!cleaned || currentTrip.members.includes(cleaned)) {
      return;
    }

    updateCurrentTrip((trip) => ({ ...trip, members: [...trip.members, cleaned] }));
    setDraft((prev) => ({
      ...prev,
      participants: [...new Set([...prev.participants, cleaned])],
      participantWeights: {
        ...prev.participantWeights,
        [cleaned]: 1,
      },
    }));
    setNewMember('');
  }

  function handleAddInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentTrip) return;
    const cleanedName = inviteName.trim();
    const cleanedContact = inviteContact.trim();
    if (!cleanedName) return;

    updateCurrentTrip((trip) => ({
      ...trip,
      pendingInvites: [
        {
          id: makeId(),
          name: cleanedName,
          contact: cleanedContact,
          status: 'Pozvany',
        },
        ...trip.pendingInvites,
      ],
    }));
    setInviteName('');
    setInviteContact('');
    setInfoMessage(`Pozvanka pre ${cleanedName} je pripravena. Kod: ${currentTrip.inviteCode}`);
  }

  function regenerateInviteCode() {
    if (!currentTrip) return;
    const nextCode = makeInviteCode();
    updateCurrentTrip((trip) => ({ ...trip, inviteCode: nextCode }));
    setInfoMessage(`Novy kod pre ${currentTrip.name}: ${nextCode}`);
  }

  function handleJoinByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedName = joinName.trim();
    const cleanedCode = joinCode.trim().toUpperCase();
    if (!cleanedName || !cleanedCode) return;

    let foundTripId = '';
    let duplicateMember = false;

    setTrips((prev) =>
      prev.map((trip) => {
        if (trip.inviteCode !== cleanedCode) return trip;
        foundTripId = trip.id;

        if (trip.members.includes(cleanedName)) {
          duplicateMember = true;
          return trip;
        }

        return {
          ...trip,
          members: [...trip.members, cleanedName],
          pendingInvites: trip.pendingInvites.map((invite) =>
            invite.name.toLowerCase() === cleanedName.toLowerCase()
              ? { ...invite, status: 'Prijate' }
              : invite
          ),
        };
      })
    );

    if (!foundTripId) {
      setInfoMessage('Kod neexistuje. Skontroluj ho a skus znova.');
      return;
    }

    if (duplicateMember) {
      setInfoMessage(`${cleanedName} uz je v tejto skupine.`);
      return;
    }

    setSelectedTripId(foundTripId);
    setAppScreen('trip-detail');
    setDetailScreen('overview');
    setJoinName('');
    setJoinCode('');
    setInfoMessage(`${cleanedName} sa pridal(a) do vyletu.`);
  }

  function toggleParticipant(name: string) {
    setDraft((prev) => {
      const exists = prev.participants.includes(name);
      const participants = exists
        ? prev.participants.filter((item) => item !== name)
        : [...prev.participants, name];

      return {
        ...prev,
        participants,
        participantWeights: {
          ...prev.participantWeights,
          [name]: prev.participantWeights[name] || 1,
        },
      };
    });
  }

  function handleAddExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentTrip || !canAddExpense) return;

    const amount = Number(draft.amount);
    const normalizedWeights: Record<string, number> = {};

    safeParticipants.forEach((name) => {
      const raw = Number(draft.participantWeights[name] || 1);
      normalizedWeights[name] = raw > 0 ? raw : 1;
    });

    const expense: TripExpense = {
      id: makeId(),
      title: draft.title.trim(),
      amount,
      payer: safePayer,
      participants: safeParticipants,
      splitType: draft.splitType,
      participantWeights: normalizedWeights,
    };

    updateCurrentTrip((trip) => ({ ...trip, expenses: [expense, ...trip.expenses] }));
    setDraft((prev) => ({
      ...prev,
      title: '',
      amount: '',
      splitType: 'equal',
      participants: safePayer ? [safePayer] : [],
    }));
  }

  function removeExpense(expenseId: string) {
    updateCurrentTrip((trip) => ({
      ...trip,
      expenses: trip.expenses.filter((expense) => expense.id !== expenseId),
    }));
  }

  const isAuthenticated = Boolean(appSession);
  const showTripDetail = appScreen === 'trip-detail' && currentTrip;

  return (
    <>
      {showStartup ? (
        <div className="startup-screen" role="status" aria-label="SplitPay startup screen">
          <Image
            src="/startup-hero.png"
            alt="Split Pay startup"
            className="startup-image"
            width={430}
            height={900}
            priority
          />
        </div>
      ) : null}

      {!authResolved ? (
        <main className="page-wrap">
          <section className="card">
            <h1>Obnovujeme session</h1>
            <p className="muted">Kontrolujeme ulozene prihlasenie.</p>
          </section>
        </main>
      ) : !isAuthenticated ? (
        <main className="auth-page">
          <section className="auth-brand">
            <div className="auth-logo-wrap">
              <Image src="/icon.png" alt="Split Pay" width={150} height={150} className="auth-logo" priority />
            </div>
            <h1>Split Pay</h1>
            <p>Jednoduche rozdelenie vydavkov medzi priatelov</p>
          </section>

          <section className="auth-card">
            <h2>{authMode === 'login' ? 'Prihlasenie' : 'Vytvorenie uctu'}</h2>
            <p className="auth-subtitle">
              {authMode === 'login'
                ? 'Vitaj spat! Prihlas sa do svojho uctu.'
                : 'Zaregistruj sa a zacni pouzivat Split Pay aj na webe.'}
            </p>

            <form className="auth-form" onSubmit={handleEmailAuth}>
              {authMode === 'register' ? (
                <label className="field-block">
                  <span>Meno</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Zadaj svoje meno"
                  />
                </label>
              ) : null}

              <label className="field-block">
                <span>Email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Zadaj svoj email"
                  type="email"
                />
              </label>

              <label className="field-block">
                <span>Heslo</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Zadaj svoje heslo"
                  type="password"
                />
              </label>

              {authMode === 'login' ? (
                <button type="button" className="link-button" onClick={handleResetPassword}>
                  Zabudli ste heslo?
                </button>
              ) : null}

              <button type="submit" className="primary-cta" disabled={authLoading}>
                {authMode === 'login' ? 'Prihlasit sa' : 'Vytvorit ucet'}
              </button>
            </form>

            <div className="auth-divider">
              <span />
              <p>alebo</p>
              <span />
            </div>

            <button type="button" className="google-btn auth-google" onClick={handleGoogleLogin} disabled={authLoading}>
              Pokracovat s Google
            </button>

            {authMessage ? <p className="auth-message">{authMessage}</p> : null}
          </section>

          <section className="auth-switch-card">
            <span>{authMode === 'login' ? 'Nemate ucet?' : 'Uz mate ucet?'}</span>
            <button type="button" className="link-button strong" onClick={toggleAuthMode}>
              {authMode === 'login' ? 'Vytvorit ucet' : 'Prihlasit sa'}
            </button>
          </section>
        </main>
      ) : (
        <main className="page-wrap app-shell">
          {!showTripDetail ? (
            <>
              <section className="hero hero-panel">
                <div>
                  <p className="eyebrow">Moje vylety</p>
                  <h1>Vyber si vylet alebo vytvor novy</h1>
                  <p>
                    Toto je uvodna obrazovka po prihlaseni. Tu mas samostatne okna pre vytvorenie
                    vyletu, pridanie sa do vyletu a prehlad vsetkych vyletov.
                  </p>
                </div>
                <div className="hero-actions">
                  <p className="muted">Prihlaseny email: {appSession?.email}</p>
                  <button type="button" className="ghost" onClick={handleLogout}>
                    Odhlasit
                  </button>
                </div>
                {infoMessage ? <p className="info-banner hero-info">{infoMessage}</p> : null}
              </section>

              <section className="screen-grid">
                <section className="screen-window section-card">
                  <div className="section-head compact-head">
                    <p className="eyebrow">Novy vylet</p>
                    <h2>Zalozit vylet</h2>
                  </div>
                  <form className="stack" onSubmit={handleCreateTrip}>
                    <input
                      value={newTripName}
                      onChange={(event) => setNewTripName(event.target.value)}
                      placeholder="Nazov vyletu"
                    />
                    <input
                      value={newTripDate}
                      onChange={(event) => setNewTripDate(event.target.value)}
                      placeholder="Datum (volitelne)"
                    />
                    <button type="submit">Vytvorit vylet</button>
                  </form>
                </section>

                <section className="screen-window section-card">
                  <div className="section-head compact-head">
                    <p className="eyebrow">Join</p>
                    <h2>Pridat sa do vyletu</h2>
                  </div>
                  <form className="stack" onSubmit={handleJoinByCode}>
                    <input
                      value={joinName}
                      onChange={(event) => setJoinName(event.target.value)}
                      placeholder="Tvoje meno"
                    />
                    <input
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      placeholder="Kod od organizatora"
                    />
                    <button type="submit">Pripojit sa</button>
                  </form>
                </section>
              </section>

              <section className="app-section">
                <div className="section-head">
                  <p className="eyebrow">Prehlad</p>
                  <h2>Moje vylety</h2>
                </div>
                <div className="trip-overview-list">
                  {trips.map((trip) => {
                    const tripBalances = computeBalances(trip.members, trip.expenses);
                    const tripTotal = trip.expenses.reduce((sum, expense) => sum + expense.amount, 0);
                    const userBalance = tripBalances[appSession?.name || 'Ty'] ?? 0;

                    return (
                      <button
                        key={trip.id}
                        type="button"
                        className="trip-card-large"
                        onClick={() => openTrip(trip.id)}
                      >
                        <div className="trip-card-cover" />
                        <div className="trip-card-body">
                          <div className="trip-card-top">
                            <div>
                              <strong>{trip.name}</strong>
                              <p>{trip.date}</p>
                            </div>
                            <span className={userBalance >= 0 ? 'positive trip-balance' : 'negative trip-balance'}>
                              {eur(userBalance)}
                            </span>
                          </div>
                          <div className="trip-card-meta">
                            <span>{trip.members.length} clenov</span>
                            <span>{trip.expenses.length} vydavkov</span>
                            <span>Spolu {eur(tripTotal)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="hero hero-panel">
                <div>
                  <button type="button" className="back-link" onClick={goToTripsHome}>
                    ← Spat na moje vylety
                  </button>
                  <p className="eyebrow">Detail vyletu</p>
                  <h1>{currentTrip.name}</h1>
                  <p>
                    {currentTrip.date} · {members.length} clenov · {eur(totalSpent)} spolu
                  </p>
                </div>
                <div className="hero-actions hero-actions-end">
                  <p className="muted">Kod vyletu: {currentTrip.inviteCode}</p>
                  <button type="button" className="ghost" onClick={handleLogout}>
                    Odhlasit
                  </button>
                </div>
                {infoMessage ? <p className="info-banner hero-info">{infoMessage}</p> : null}
              </section>

              <section className="screen-nav">
                <button
                  type="button"
                  className={detailScreen === 'overview' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => setDetailScreen('overview')}
                >
                  Prehlad
                </button>
                <button
                  type="button"
                  className={detailScreen === 'members' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => setDetailScreen('members')}
                >
                  Clenovia
                </button>
                <button
                  type="button"
                  className={detailScreen === 'invites' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => setDetailScreen('invites')}
                >
                  Pozvanky
                </button>
                <button
                  type="button"
                  className={detailScreen === 'expenses' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => setDetailScreen('expenses')}
                >
                  Vydavky
                </button>
                <button
                  type="button"
                  className={detailScreen === 'balances' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => setDetailScreen('balances')}
                >
                  Bilancia
                </button>
              </section>

              {detailScreen === 'overview' ? (
                <section className="screen-window section-card screen-single">
                  <div className="section-head compact-head">
                    <p className="eyebrow">Prehlad vyletu</p>
                    <h2>Zakladne informacie</h2>
                  </div>
                  <div className="stat-grid">
                    <div className="stat-card">
                      <span>Clenovia</span>
                      <strong>{members.length}</strong>
                    </div>
                    <div className="stat-card">
                      <span>Vydavky</span>
                      <strong>{normalizedExpenses.length}</strong>
                    </div>
                    <div className="stat-card">
                      <span>Pozvanky</span>
                      <strong>{currentTrip.pendingInvites.length}</strong>
                    </div>
                    <div className="stat-card">
                      <span>Spolu minuté</span>
                      <strong>{eur(totalSpent)}</strong>
                    </div>
                  </div>
                  <div className="screen-grid compact-grid">
                    <div className="mini-panel">
                      <h3>Clenovia vyletu</h3>
                      <div className="pill-list">
                        {members.map((name) => (
                          <div key={name} className="pill">
                            <span>{name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mini-panel">
                      <h3>Posledne vydavky</h3>
                      <div className="stack-list">
                        {recentExpenses.length === 0 ? <p className="muted">Zatial ziadne zaznamy.</p> : null}
                        {recentExpenses.map((expense) => (
                          <div className="row" key={expense.id}>
                            <div>
                              <strong>{expense.title}</strong>
                              <p>Platil {expense.payer}</p>
                            </div>
                            <strong>{eur(expense.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {detailScreen === 'members' ? (
                <section className="screen-window section-card screen-single">
                  <div className="section-head compact-head">
                    <p className="eyebrow">Tim</p>
                    <h2>Clenovia vyletu</h2>
                  </div>
                  <form className="inline-form" onSubmit={handleAddMember}>
                    <input
                      value={newMember}
                      onChange={(event) => setNewMember(event.target.value)}
                      placeholder="Meno noveho clena"
                    />
                    <button type="submit">Pridat clena</button>
                  </form>
                  <div className="member-list">
                    {members.map((name) => (
                      <div key={name} className="member-row">
                        <div className="member-avatar">{name.slice(0, 1)}</div>
                        <div>
                          <strong>{name}</strong>
                          <p>{name === appSession?.name ? 'Tvoje aktivne meno v aplikacii' : 'Clen vyletu'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {detailScreen === 'invites' ? (
                <section className="screen-window section-card screen-single">
                  <div className="section-head compact-head">
                    <p className="eyebrow">Pozvanie</p>
                    <h2>Pozvanky a pristupy</h2>
                  </div>
                  <div className="invite-code-box">
                    <span>Aktivny kod</span>
                    <strong>{currentTrip.inviteCode}</strong>
                    <button type="button" className="ghost" onClick={regenerateInviteCode}>
                      Vygenerovat novy kod
                    </button>
                  </div>
                  <form className="stack" onSubmit={handleAddInvite}>
                    <input
                      value={inviteName}
                      onChange={(event) => setInviteName(event.target.value)}
                      placeholder="Meno spolucestujuceho"
                    />
                    <input
                      value={inviteContact}
                      onChange={(event) => setInviteContact(event.target.value)}
                      placeholder="Kontakt (volitelne)"
                    />
                    <button type="submit">Pridat pozvanku</button>
                  </form>
                  <div className="stack-list">
                    {currentTrip.pendingInvites.length === 0 ? <p className="muted">Zatial ziadne pozvanky.</p> : null}
                    {currentTrip.pendingInvites.map((invite) => (
                      <div key={invite.id} className="row">
                        <div>
                          <strong>{invite.name}</strong>
                          <p>{invite.contact || 'Bez kontaktu'}</p>
                        </div>
                        <strong>{invite.status}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {detailScreen === 'expenses' ? (
                <section className="screen-window section-card screen-single">
                  <div className="section-head compact-head">
                    <p className="eyebrow">Vydavky</p>
                    <h2>Pridat a spravovat vydavky</h2>
                  </div>
                  <div className="screen-grid compact-grid">
                    <div className="mini-panel">
                      <h3>Novy vydavok</h3>
                      <form className="stack" onSubmit={handleAddExpense}>
                        <input
                          value={draft.title}
                          onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                          placeholder="Nazov vydavku"
                        />
                        <input
                          value={draft.amount}
                          onChange={(event) => setDraft((prev) => ({ ...prev, amount: event.target.value }))}
                          inputMode="decimal"
                          placeholder="Suma"
                        />
                        <select
                          value={safePayer}
                          onChange={(event) => setDraft((prev) => ({ ...prev, payer: event.target.value }))}
                        >
                          {members.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>

                        <div className="participants">
                          {members.map((name) => {
                            const selected = safeParticipants.includes(name);
                            return (
                              <label key={name} className={selected ? 'participant active' : 'participant'}>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleParticipant(name)}
                                />
                                <span>{name}</span>
                                {draft.splitType === 'shares' && selected ? (
                                  <input
                                    className="weight"
                                    inputMode="numeric"
                                    value={String(draft.participantWeights[name] || 1)}
                                    onChange={(event) => {
                                      const next = Number(event.target.value);
                                      setDraft((prev) => ({
                                        ...prev,
                                        participantWeights: {
                                          ...prev.participantWeights,
                                          [name]: Number.isFinite(next) && next > 0 ? next : 1,
                                        },
                                      }));
                                    }}
                                  />
                                ) : null}
                              </label>
                            );
                          })}
                        </div>

                        <div className="split-switch">
                          <button
                            type="button"
                            className={draft.splitType === 'equal' ? 'active' : ''}
                            onClick={() => setDraft((prev) => ({ ...prev, splitType: 'equal' }))}
                          >
                            Rovnomerne
                          </button>
                          <button
                            type="button"
                            className={draft.splitType === 'shares' ? 'active' : ''}
                            onClick={() => setDraft((prev) => ({ ...prev, splitType: 'shares' }))}
                          >
                            Podla podielov
                          </button>
                        </div>

                        <button type="submit" disabled={!canAddExpense}>
                          Pridat vydavok
                        </button>
                      </form>
                    </div>

                    <div className="mini-panel">
                      <h3>Historia vydavkov</h3>
                      <div className="stack-list">
                        {currentTrip.expenses.length === 0 ? <p className="muted">Zatial ziadne zaznamy.</p> : null}
                        {currentTrip.expenses.map((expense) => (
                          <div className="row" key={expense.id}>
                            <div>
                              <strong>{expense.title}</strong>
                              <p>
                                Platil {expense.payer}, ucastnici: {expense.participants.join(', ')}
                              </p>
                            </div>
                            <button type="button" className="ghost" onClick={() => removeExpense(expense.id)}>
                              {eur(expense.amount)}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {detailScreen === 'balances' ? (
                <section className="screen-window section-card screen-single">
                  <div className="section-head compact-head">
                    <p className="eyebrow">Bilancia</p>
                    <h2>Kto komu kolko dlzi</h2>
                  </div>
                  <div className="screen-grid compact-grid">
                    <div className="mini-panel">
                      <h3>Aktualna bilancia</h3>
                      <div className="stack-list">
                        {Object.entries(balances).map(([name, value]) => (
                          <div className="row" key={name}>
                            <span>{name}</span>
                            <strong className={value >= 0 ? 'positive' : 'negative'}>{eur(value)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mini-panel">
                      <h3>Navrh vyrovnania</h3>
                      {settlements.length === 0 ? <p className="muted">Vsetko je vyrovnane.</p> : null}
                      <div className="stack-list">
                        {settlements.map((transfer, index) => (
                          <div className="row" key={`${transfer.from}-${transfer.to}-${index}`}>
                            <span>
                              {transfer.from} zaplati {transfer.to}
                            </span>
                            <strong>{eur(transfer.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </main>
      )}
    </>
  );
}