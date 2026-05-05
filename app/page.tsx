'use client';

import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  Clipboard,
  Coins,
  Link2,
  Mail,
  MessageSquare,
  Plus,
  QrCode,
  Receipt,
  Settings2,
  Share2,
  Users,
} from 'lucide-react';
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

function makeUniqueInviteCode(existingTrips: Trip[]) {
  let code = makeInviteCode();
  while (existingTrips.some((trip) => trip.inviteCode === code)) {
    code = makeInviteCode();
  }
  return code;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat('sk-SK', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.trim().replace('#', '');
  const safeAlpha = Math.max(0, Math.min(alpha, 1));

  if (normalized.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(44, 121, 246, ${safeAlpha})`;
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

const STORAGE_KEY = 'splitpay-web-v1';
const SESSION_CACHE_KEY = 'splitpay-web-session';
const STARTUP_SEEN_KEY = 'splitpay-web-startup-seen-v1';

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
  owner: string;
  currency: 'EUR' | 'USD' | 'CZK';
  color: string;
  archived: boolean;
  inviteCode: string;
  members: string[];
  expenses: TripExpense[];
  pendingInvites: Invite[];
};

type ExpenseDraft = {
  title: string;
  amount: string;
  expenseType: 'expense' | 'transfer';
  payer: string;
  transferTo: string;
  participants: string[];
  splitType: 'equal' | 'individual' | 'shares';
  participantWeights: Record<string, number>;
  participantAmounts: Record<string, number>;
};

type AppSession = {
  userId: string;
  email: string;
  name: string;
  guest: boolean;
};

type AdminRole = 'admin' | 'user';

type AdminPresenceRow = {
  user_id: string;
  user_email: string;
  user_name: string;
  last_seen: string;
  role?: AdminRole;
};

type AdminVisitRow = {
  id: number;
  user_email: string;
  visited_at: string;
};

type TopUser = {
  email: string;
  visits: number;
};

type AppScreen = 'trips' | 'trip-detail' | 'admin';
type TripDetailScreen = 'overview' | 'members' | 'invites' | 'expenses' | 'balances';

function detailScreenFromPath(value?: string): TripDetailScreen {
  if (value === 'members') return 'members';
  if (value === 'invites') return 'invites';
  if (value === 'expenses') return 'expenses';
  if (value === 'balances') return 'balances';
  return 'overview';
}

function tripPath(tripKey: string, detailScreen: TripDetailScreen = 'overview') {
  const safeTripKey = encodeURIComponent(tripKey);
  if (detailScreen === 'overview') return `/trip/${safeTripKey}`;
  return `/trip/${safeTripKey}/${detailScreen}`;
}

function createTrip(name: string, date: string, inviteCode: string, owner: string = 'Ty'): Trip {
  return {
    id: makeId(),
    name,
    date,
    owner,
    currency: 'EUR',
    color: '#2c79f6',
    archived: false,
    inviteCode,
    members: ['Ty'],
    expenses: [],
    pendingInvites: [],
  };
}

function normalizeTrip(trip: Trip): Trip {
  return {
    ...trip,
    owner: trip.owner || 'Ty',
    currency: trip.currency || 'EUR',
    color: trip.color || '#2c79f6',
    inviteCode: (trip.inviteCode || makeInviteCode()).toUpperCase(),
    archived: Boolean(trip.archived),
  };
}

function sanitizeLoadedState(state: { trips?: Trip[]; selectedTripId?: string }) {
  const trips = (state.trips || [])
    .map((trip) => normalizeTrip(trip))
    .filter((trip) => trip.id !== 'default-trip');

  const selectedTripId =
    state.selectedTripId && trips.some((trip) => trip.id === state.selectedTripId)
      ? state.selectedTripId
      : trips[0]?.id || '';

  return { trips, selectedTripId };
}

function readInitialState(): { trips: Trip[]; selectedTripId: string } {
  return { trips: [], selectedTripId: '' };
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
    if (!parsed.userId || !parsed.email || !parsed.name) return null;

    return {
      userId: parsed.userId,
      email: parsed.email,
      name: parsed.name,
      guest: Boolean(parsed.guest),
    } satisfies AppSession;
  } catch {
    return null;
  }
}

function makeUserSession(userId: string, email: string, fullName?: string | null): AppSession {
  const normalizedEmail = email.trim().toLowerCase();
  const fallbackName = normalizedEmail.split('@')[0] || 'Pouzivatel';

  return {
    userId,
    email: normalizedEmail,
    name: (fullName || '').trim() || fallbackName,
    guest: false,
  };
}

export default function SplitPayWebApp() {
  const router = useRouter();
  const pathname = usePathname();
  const [showStartup, setShowStartup] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(STARTUP_SEEN_KEY) !== '1';
  });
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
  const [newTripName, setNewTripName] = useState('');
  const [newTripDate, setNewTripDate] = useState('');
  const [newMember, setNewMember] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteContact, setInviteContact] = useState('');
  const [showInviteQr, setShowInviteQr] = useState(false);
  const [showCreateTripModal, setShowCreateTripModal] = useState(false);
  const [showJoinTripModal, setShowJoinTripModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showTripSettingsModal, setShowTripSettingsModal] = useState(false);
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof Notification === 'undefined') return false;
    return Notification.permission === 'granted';
  });
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [balanceTab, setBalanceTab] = useState<'all' | 'settlements'>('settlements');
  const [visitsCount, setVisitsCount] = useState(0);
  const [visits24hCount, setVisits24hCount] = useState(0);
  const [activeUsersCount, setActiveUsersCount] = useState(0);
  const [totalUsersSeen, setTotalUsersSeen] = useState(0);
  const [totalTripsStored, setTotalTripsStored] = useState(0);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminPresence, setAdminPresence] = useState<AdminPresenceRow[]>([]);
  const [recentVisits, setRecentVisits] = useState<AdminVisitRow[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [globalAnnouncement, setGlobalAnnouncement] = useState('');
  const [localStateHydrated, setLocalStateHydrated] = useState(false);
  const [dbLoadTick, setDbLoadTick] = useState(0);
  const [draft, setDraft] = useState<ExpenseDraft>({
    title: '',
    amount: '',
    expenseType: 'expense',
    payer: 'Ty',
    transferTo: '',
    participants: ['Ty'],
    splitType: 'equal',
    participantWeights: { Ty: 1 },
    participantAmounts: { Ty: 0 },
  });

  const supabase = getSupabaseBrowserClient();
  const dbLoadedRef = useRef(false);
  const skipFirstSaveRef = useRef(true);
  const expenseCountRef = useRef<Record<string, number>>({});
  const appliedJoinCodeRef = useRef('');

  useEffect(() => {
    if (!showStartup) return;

    const timer = window.setTimeout(() => setShowStartup(false), 3200);
    return () => window.clearTimeout(timer);
  }, [showStartup]);

  useEffect(() => {
    if (!showStartup) {
      window.sessionStorage.setItem(STARTUP_SEEN_KEY, '1');
    }
  }, [showStartup]);

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
          const sanitized = sanitizeLoadedState(parsed);
          setTrips(sanitized.trips);
          setSelectedTripId(sanitized.selectedTripId);
        }
      } catch {
        // Ignore invalid local state and keep the deterministic fallback.
      } finally {
        setLocalStateHydrated(true);
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
            data.session.user.id,
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
            session.user.id,
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

  useEffect(() => {
    if (!supabase || !authResolved || !appSession?.userId || dbLoadedRef.current) return;

    const supabaseClient = supabase;
    const userId = appSession.userId;

    let cancelled = false;

    async function loadStateFromDb() {
      const { data, error } = await supabaseClient
        .from('trip_states')
        .select('state_json')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        dbLoadedRef.current = true;
        setDbLoadTick((prev) => prev + 1);
        return;
      }

      const remote = data?.state_json as { trips?: Trip[]; selectedTripId?: string } | null;
      if (remote?.trips?.length) {
        const sanitized = sanitizeLoadedState(remote);
        setTrips(sanitized.trips);
        setSelectedTripId(sanitized.selectedTripId);
      }

      dbLoadedRef.current = true;
      setDbLoadTick((prev) => prev + 1);
    }

    loadStateFromDb();

    return () => {
      cancelled = true;
    };
  }, [authResolved, appSession?.userId, supabase]);

  useEffect(() => {
    if (!supabase || !appSession?.userId || !dbLoadedRef.current) return;
    const supabaseClient = supabase;
    const userId = appSession.userId;
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }

    const payload = { trips, selectedTripId };
    const timeoutId = window.setTimeout(async () => {
      await supabaseClient.from('trip_states').upsert({
        user_id: userId,
        state_json: payload,
      });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [appSession?.userId, selectedTripId, supabase, trips]);

  useEffect(() => {
    if (!supabase || !appSession?.userId) return;
    const supabaseClient = supabase;
    const userId = appSession.userId;
    const userEmail = appSession.email;
    const userName = appSession.name;

    let cancelled = false;

    async function trackUsageAndPresence() {
      await supabaseClient.from('app_visits').insert({
        user_id: userId,
        user_email: userEmail,
      });

      await supabaseClient.from('user_presence').upsert({
        user_id: userId,
        user_email: userEmail,
        user_name: userName,
        last_seen: new Date().toISOString(),
      });

      if (cancelled) return;
    }

    trackUsageAndPresence();

    const interval = window.setInterval(async () => {
      await supabaseClient.from('user_presence').upsert({
        user_id: userId,
        user_email: userEmail,
        user_name: userName,
        last_seen: new Date().toISOString(),
      });
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [appSession?.email, appSession?.name, appSession?.userId, supabase]);

  const isEnvAdmin = Boolean(
    appSession?.email && process.env.NEXT_PUBLIC_ADMIN_EMAIL && appSession.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  );
  const isAdmin = isEnvAdmin || adminRole === 'admin';

  useEffect(() => {
    if (!supabase || !appSession?.userId) return;
    const supabaseClient = supabase;
    const userId = appSession.userId;

    async function loadAdminRole() {
      const { data } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      setAdminRole((data?.role as AdminRole | undefined) || null);
    }

    loadAdminRole();
  }, [appSession?.userId, supabase]);

  useEffect(() => {
    if (!supabase) return;
    const supabaseClient = supabase;

    async function loadAnnouncement() {
      const { data } = await supabaseClient
        .from('admin_announcements')
        .select('message, enabled')
        .eq('id', 1)
        .maybeSingle();

      if (!data) return;

      setGlobalAnnouncement(data.enabled ? data.message : '');
      if (isAdmin) {
        setAnnouncementText(data.message || '');
        setAnnouncementEnabled(Boolean(data.enabled));
      }
    }

    loadAnnouncement();
  }, [isAdmin, supabase]);

  useEffect(() => {
    if (!supabase || !isAdmin) return;
    const supabaseClient = supabase;
    let cancelled = false;

    async function refreshAdminStats() {
      setAdminLoading(true);

      const nowIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [
        visitsRes,
        visits24Res,
        presenceRes,
        rolesRes,
        tripsRes,
        recentRes,
        recentForTopRes,
      ] = await Promise.all([
        supabaseClient.from('app_visits').select('id', { count: 'exact', head: true }),
        supabaseClient.from('app_visits').select('id', { count: 'exact', head: true }).gte('visited_at', nowIso),
        supabaseClient.from('user_presence').select('user_id, user_email, user_name, last_seen').order('last_seen', { ascending: false }).limit(100),
        supabaseClient.from('user_roles').select('user_id, role'),
        supabaseClient.from('trip_states').select('user_id', { count: 'exact', head: true }),
        supabaseClient.from('app_visits').select('id, user_email, visited_at').order('visited_at', { ascending: false }).limit(250),
        supabaseClient.from('app_visits').select('user_email, visited_at').order('visited_at', { ascending: false }).limit(500),
      ]);

      if (cancelled) return;

      setVisitsCount(visitsRes.count || 0);
      setVisits24hCount(visits24Res.count || 0);
      setTotalTripsStored(tripsRes.count || 0);

      const rawPresenceRows = (presenceRes.data || []) as AdminPresenceRow[];
      const roleMap = new Map((rolesRes.data || []).map((role) => [role.user_id, role.role as AdminRole]));
      const presenceRows = rawPresenceRows.map((row) => ({
        ...row,
        role: roleMap.get(row.user_id) || 'user',
      }));

      setAdminPresence(presenceRows);
      setTotalUsersSeen(new Set(presenceRows.map((row) => row.user_id)).size);

      const now = Date.now();
      const active = presenceRows.filter((row) => {
        const timestamp = new Date(row.last_seen).getTime();
        return Number.isFinite(timestamp) && now - timestamp < 5 * 60 * 1000;
      }).length;
      setActiveUsersCount(active);

      const uniqueRecentVisits = ((recentRes.data || []) as AdminVisitRow[])
        .reduce<AdminVisitRow[]>((acc, row) => {
          if (acc.some((item) => item.user_email === row.user_email)) return acc;
          acc.push(row);
          return acc;
        }, [])
        .slice(0, 30);
      setRecentVisits(uniqueRecentVisits);

      const visits = recentForTopRes.data || [];
      const totals = visits.reduce<Record<string, number>>((acc, row) => {
        const emailKey = row.user_email || 'neznamy';
        acc[emailKey] = (acc[emailKey] || 0) + 1;
        return acc;
      }, {});

      const top = Object.entries(totals)
        .map(([email, count]) => ({ email, visits: count }))
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 8);
      setTopUsers(top);

      setAdminLoading(false);
    }

    refreshAdminStats();
    const interval = window.setInterval(refreshAdminStats, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isAdmin, supabase]);

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
    window.localStorage.removeItem(SESSION_CACHE_KEY);
    router.push('/');

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

  const pathSegments = pathname.split('/').filter(Boolean);
  const routeTripKey =
    pathSegments[0] === 'trip' && pathSegments[1]
      ? decodeURIComponent(pathSegments[1])
      : '';
  const routeTrip = useMemo(
    () =>
      trips.find(
        (trip) =>
          trip.id === routeTripKey || trip.inviteCode.toUpperCase() === routeTripKey.toUpperCase()
      ) || null,
    [routeTripKey, trips]
  );
  const activeAppScreen: AppScreen =
    pathname === '/admin' ? 'admin' : routeTripKey ? 'trip-detail' : 'trips';
  const activeDetailScreen = routeTripKey
    ? detailScreenFromPath(pathSegments[2])
    : 'overview';
  const activeTripId = routeTrip?.id || selectedTripId;

  const currentTrip = useMemo(() => {
    if (activeTripId) {
      return trips.find((trip) => trip.id === activeTripId) || null;
    }
    return trips[0] || null;
  }, [activeTripId, trips]);

  useEffect(() => {
    const shouldWaitForDbLoad = Boolean(
      supabase && authResolved && appSession?.userId && !dbLoadedRef.current
    );

    if (!routeTripKey) return;
    if (!localStateHydrated) return;
    if (!authResolved) return;
    if (shouldWaitForDbLoad) return;
    if (routeTrip) return;
    router.replace('/');
  }, [
    appSession?.userId,
    authResolved,
    dbLoadTick,
    localStateHydrated,
    routeTrip,
    routeTripKey,
    router,
    supabase,
    trips,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = (params.get('joinCode') || '').trim().toUpperCase();
    if (!codeFromUrl) return;
    if (appliedJoinCodeRef.current === codeFromUrl) return;

    appliedJoinCodeRef.current = codeFromUrl;
    setJoinCode(codeFromUrl);
    setShowJoinTripModal(true);
    setInfoMessage(`Kód ${codeFromUrl} bol načítaný z QR. Zadaj meno a pripoj sa.`);
  }, [pathname]);

  useEffect(() => {
    if (!showCreateTripModal && !showJoinTripModal && !showExpenseModal && !showTripSettingsModal) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowCreateTripModal(false);
      setShowJoinTripModal(false);
      setShowExpenseModal(false);
      setShowTripSettingsModal(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showCreateTripModal, showJoinTripModal, showExpenseModal, showTripSettingsModal]);

  const members = useMemo(() => currentTrip?.members ?? [], [currentTrip]);
  const isTransferDraft = draft.expenseType === 'transfer';
  const safePayer = members.includes(draft.payer) ? draft.payer : members[0] || 'Ty';
  const safeTransferTo =
    members.find((name) => name === draft.transferTo && name !== safePayer) ||
    members.find((name) => name !== safePayer) ||
    '';
  const safeParticipantsRaw = draft.participants.filter((name) => members.includes(name));
  const safeParticipants = safeParticipantsRaw.length ? safeParticipantsRaw : safePayer ? [safePayer] : [];
  const amountNumber = Number(draft.amount);
  const individualTotal = safeParticipants.reduce((sum, name) => {
    const value = Number(draft.participantAmounts[name] || 0);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
  const validIndividualSplit =
    draft.splitType !== 'individual' || Math.abs(individualTotal - amountNumber) < 0.01;

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
    () =>
      normalizedExpenses.reduce(
        (sum, expense) => (expense.expenseType === 'transfer' ? sum : sum + expense.amount),
        0
      ),
    [normalizedExpenses]
  );
  const recentExpenses = useMemo(() => normalizedExpenses.slice(0, 3), [normalizedExpenses]);

  const canAddExpense =
    !currentTrip?.archived &&
    (isTransferDraft || draft.title.trim().length > 0) &&
    amountNumber > 0 &&
    safePayer.trim().length > 0 &&
    (isTransferDraft
      ? safeTransferTo.trim().length > 0 && safeTransferTo !== safePayer
      : safeParticipants.length > 0 && validIndividualSplit);

  const normalizedCurrentUser = (appSession?.name || '').trim().toLowerCase();
  const displayCurrentUserName = (appSession?.name || '').trim() || 'Používateľ';
  const isSelfName = (name: string) => {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) return false;
    if (normalizedName === 'ty') return true;
    return Boolean(normalizedCurrentUser) && normalizedName === normalizedCurrentUser;
  };
  const isSameMember = (left: string, right: string) => {
    const leftNormalized = left.trim().toLowerCase();
    const rightNormalized = right.trim().toLowerCase();
    if (!leftNormalized || !rightNormalized) return false;
    if (leftNormalized === rightNormalized) return true;
    return isSelfName(left) && isSelfName(right);
  };
  const formatMemberName = (name: string) => (isSelfName(name) ? displayCurrentUserName : name);
  const currentTripOwnerIsSelf = currentTrip ? isSelfName(currentTrip.owner) : false;
  const selfBalance = appSession?.name
    ? (balances[appSession.name] ?? balances.Ty ?? 0)
    : (balances.Ty ?? 0);

  function updateCurrentTrip(updater: (trip: Trip) => Trip) {
    if (!currentTrip) return;
    setTrips((prev) => prev.map((trip) => (trip.id === currentTrip.id ? updater(trip) : trip)));
  }

  function openTrip(
    tripId: string,
    nextScreen: TripDetailScreen = 'overview',
    tripKeyOverride?: string
  ) {
    const selectedTrip = trips.find((trip) => trip.id === tripId);
    const tripKey = tripKeyOverride || selectedTrip?.inviteCode;
    if (!tripKey) return;

    setSelectedTripId(tripId);
    router.push(tripPath(tripKey, nextScreen));
  }

  function goToTripsHome() {
    router.push('/');
  }

  function goToAdmin() {
    router.push('/admin');
  }

  async function saveAdminAnnouncement() {
    if (!supabase || !isAdmin) return;

    const { error } = await supabase.from('admin_announcements').upsert({
      id: 1,
      message: announcementText,
      enabled: announcementEnabled,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setInfoMessage('Uloženie admin oznamu zlyhalo.');
      return;
    }

    setGlobalAnnouncement(announcementEnabled ? announcementText : '');
    setInfoMessage('Admin oznam bol uložený.');
  }

  async function toggleUserRole(targetUserId: string, nextRole: AdminRole) {
    if (!supabase || !isAdmin) return;

    if (nextRole === 'admin') {
      const { error } = await supabase.from('user_roles').upsert({
        user_id: targetUserId,
        role: 'admin',
        updated_at: new Date().toISOString(),
      });

      if (error) {
        setInfoMessage('Nepodarilo sa pridať admin rolu.');
        return;
      }
    } else {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', targetUserId);
      if (error) {
        setInfoMessage('Nepodarilo sa odobrať admin rolu.');
        return;
      }
    }

    setAdminPresence((prev) =>
      prev.map((row) => (row.user_id === targetUserId ? { ...row, role: nextRole } : row))
    );
    setInfoMessage('Rola používateľa bola upravená.');
  }

  async function purgeStalePresence() {
    if (!supabase || !isAdmin) return;
    const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('user_presence').delete().lt('last_seen', threshold);

    if (error) {
      setInfoMessage('Čistenie prítomnosti zlyhalo.');
      return;
    }

    setInfoMessage('Staré záznamy prítomnosti boli vyčistené.');
  }

  function exportVisitsCsv() {
    if (!recentVisits.length) {
      setInfoMessage('Nie sú dáta na export návštev.');
      return;
    }

    const lines = ['id,email,visited_at'];
    recentVisits.forEach((visit) => {
      lines.push(`${visit.id},${visit.user_email},${visit.visited_at}`);
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'admin-visits.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleCreateTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedName = newTripName.trim();
    if (!cleanedName) return;

    const inviteCode = makeUniqueInviteCode(trips);
    const trip = createTrip(
      cleanedName,
      newTripDate.trim() || 'Bez dátumu',
      inviteCode,
      appSession?.name || 'Ty'
    );
    setTrips((prev) => [trip, ...prev]);
    openTrip(trip.id, 'overview', trip.inviteCode);
    setNewTripName('');
    setNewTripDate('');
    setShowCreateTripModal(false);
    setInfoMessage(`Výlet ${trip.name} bol vytvorený.`);
  }

  function updateTripSettings(partial: Partial<Pick<Trip, 'name' | 'currency' | 'color' | 'archived'>>) {
    if (!currentTrip) return;
    updateCurrentTrip((trip) => ({ ...trip, ...partial }));
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
      participantAmounts: {
        ...prev.participantAmounts,
        [cleaned]: 0,
      },
    }));
    setNewMember('');
  }

  function removeMember(memberName: string) {
    if (!currentTrip) return;
    const isOwner = isSelfName(currentTrip.owner);
    if (!isOwner) return;

    const isOwnerRemoving = isSameMember(memberName, currentTrip.owner);
    const otherMembers = currentTrip.members.filter((name) => !isSameMember(name, memberName));

    if (isOwnerRemoving && otherMembers.length === 0) {
      // If owner removes themselves and they're alone, delete trip
      deleteTrip(currentTrip.id);
      setInfoMessage('Si jediný člen výletu. Vylet bol vymazaný.');
      return;
    }

    if (isOwnerRemoving && otherMembers.length > 0) {
      // If owner removes themselves, transfer ownership to first remaining member
      const newOwner = otherMembers[0];
      updateCurrentTrip((trip) => ({
        ...trip,
        owner: newOwner,
        members: otherMembers,
        expenses: trip.expenses.map((expense) => ({
          ...expense,
          payer: isSameMember(expense.payer, memberName) ? newOwner : expense.payer,
          participants: expense.participants.filter((name) => !isSameMember(name, memberName)),
        })),
      }));
      setInfoMessage(`Vlastníctvo výletu prebrala osoba ${formatMemberName(newOwner)}. Si odstránený(á) z výletu.`);
      return;
    }

    // Regular member removal
    updateCurrentTrip((trip) => ({
      ...trip,
      members: otherMembers,
      expenses: trip.expenses.map((expense) => ({
        ...expense,
        payer: isSameMember(expense.payer, memberName) ? trip.members[0] || 'Ty' : expense.payer,
        participants: expense.participants.filter((name) => !isSameMember(name, memberName)),
      })),
    }));
    setInfoMessage(`${formatMemberName(memberName)} bol(a) odstránený(á) z výletu.`);
  }

  function deleteTrip(tripId: string) {
    const tripToDelete = trips.find((t) => t.id === tripId);
    if (!tripToDelete) return;
    const isOwner = isSelfName(tripToDelete.owner);
    if (!isOwner) return;

    setTrips((prev) => prev.filter((trip) => trip.id !== tripId));
    goToTripsHome();
    setInfoMessage(`Výlet ${tripToDelete.name} bol vymazaný.`);
  }

  function handleGuestClaimIdentity(invitedName: string) {
    if (!currentTrip) return;
    const userName = appSession?.name || 'Ty';

    updateCurrentTrip((trip) => ({
      ...trip,
      members: trip.members.map((name) => (name === userName ? invitedName : name)),
      expenses: trip.expenses.map((expense) => ({
        ...expense,
        payer: expense.payer === userName ? invitedName : expense.payer,
        participants: expense.participants.map((name) => (name === userName ? invitedName : name)),
      })),
      pendingInvites: trip.pendingInvites.map((invite) =>
        invite.name === invitedName ? { ...invite, status: 'Prijate' } : invite
      ),
    }));

    if (appSession) {
      const updatedSession = { ...appSession, name: invitedName };
      setAppSession(updatedSession);
      window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(updatedSession));
    }

    setInfoMessage(`Tvoja identita v tomto výlete je teraz ${invitedName}.`);
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
    setInfoMessage(`Pozvánka pre ${cleanedName} je pripravená. Kód: ${currentTrip.inviteCode}`);
  }

  function copyInviteCodeToClipboard() {
    if (!currentTrip || !inviteJoinUrl) return;
    navigator.clipboard.writeText(inviteJoinUrl).then(() => {
      setInfoMessage('Pozvánka skopírovaná do schránky!');
    });
  }

  function shareViaEmail() {
    if (!currentTrip || !inviteJoinUrl) return;
    const subject = encodeURIComponent(`Pozvánka na výlet: ${currentTrip.name}`);
    const body = encodeURIComponent(
      `Ahoj!\n\nChcem ťa pozvať na môj výlet "${currentTrip.name}".\n\nKlikni na odkaz nižšie:\n${inviteJoinUrl}\n\nTeším sa na teba!`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }

  function shareViaWhatsApp() {
    if (!currentTrip || !inviteJoinUrl) return;
    const text = encodeURIComponent(
      `Ahoj!\n\nChcem ťa pozvať na môj výlet "${currentTrip.name}".\n\nKlikni na odkaz:\n${inviteJoinUrl}`
    );
    window.open(`https://wa.me/?text=${text}`);
  }

  function shareViaSMS() {
    if (!currentTrip || !inviteJoinUrl) return;
    const text = encodeURIComponent(
      `Výlet ${currentTrip.name}: ${inviteJoinUrl}`
    );
    window.open(`sms:?body=${text}`);
  }

  function handleJoinByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedName = joinName.trim();
    const cleanedCode = joinCode.trim().toUpperCase();
    if (!cleanedName || !cleanedCode) return;

    let foundTripId = '';
    let duplicateMember = false;
    let hasMatchingInvite = false;

    setTrips((prev) =>
      prev.map((trip) => {
        if (trip.inviteCode !== cleanedCode) return trip;
        foundTripId = trip.id;

        if (trip.members.includes(cleanedName)) {
          // Check if there's a pending invite for this name
          const matchingInvite = trip.pendingInvites.find(
            (invite) => invite.name.toLowerCase() === cleanedName.toLowerCase()
          );
          
          if (matchingInvite) {
            // They're claiming an existing fictional member slot
            hasMatchingInvite = true;
            return {
              ...trip,
              pendingInvites: trip.pendingInvites.map((invite) =>
                invite.name.toLowerCase() === cleanedName.toLowerCase()
                  ? { ...invite, status: 'Prijate' }
                  : invite
              ),
            };
          }
          
          // Name exists but no matching invite
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
      setInfoMessage('Kód neexistuje. Skontroluj ho a skús znova.');
      return;
    }

    if (duplicateMember) {
      setInfoMessage(`${cleanedName} už je v tejto skupine. Skús iné meno.`);
      return;
    }

    openTrip(foundTripId, 'overview');
    setJoinName('');
    setJoinCode('');
    setShowJoinTripModal(false);
    setInfoMessage(
      hasMatchingInvite
        ? `${cleanedName} prijal(a) pozvánku do výletu.`
        : `${cleanedName} sa pridal(a) do výletu.`
    );
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
        participantAmounts: {
          ...prev.participantAmounts,
          [name]: prev.participantAmounts[name] || 0,
        },
      };
    });
  }

  function handleAddExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentTrip || !canAddExpense) return;

    const amount = Number(draft.amount);
    const expense: TripExpense =
      draft.expenseType === 'transfer'
        ? {
            id: makeId(),
            title: draft.title.trim() || `Transfer ${safePayer} -> ${safeTransferTo}`,
            amount,
            payer: safePayer,
            participants: [safeTransferTo],
            expenseType: 'transfer',
            transferTo: safeTransferTo,
            splitType: 'equal',
          }
        : {
            id: makeId(),
            title: draft.title.trim(),
            amount,
            payer: safePayer,
            participants: safeParticipants,
            splitType: draft.splitType,
            participantWeights:
              draft.splitType === 'shares'
                ? safeParticipants.reduce<Record<string, number>>((acc, name) => {
                    const raw = Number(draft.participantWeights[name] || 1);
                    acc[name] = raw > 0 ? raw : 1;
                    return acc;
                  }, {})
                : undefined,
            participantAmounts:
              draft.splitType === 'individual'
                ? safeParticipants.reduce<Record<string, number>>((acc, name) => {
                    const raw = Number(draft.participantAmounts[name] || 0);
                    acc[name] = Number.isFinite(raw) && raw > 0 ? raw : 0;
                    return acc;
                  }, {})
                : undefined,
          };

    if (editingExpenseId) {
      updateCurrentTrip((trip) => ({
        ...trip,
        expenses: trip.expenses.map((item) => (item.id === editingExpenseId ? { ...expense, id: editingExpenseId } : item)),
      }));
      setEditingExpenseId(null);
      setInfoMessage('Transakcia bola upravená.');
      sendNotification(`${currentTrip?.name || 'Výlet'} - Transakcia upravená`, {
        body: `${expense.title} (${eur(expense.amount)})`,
      });
    } else {
      updateCurrentTrip((trip) => ({ ...trip, expenses: [expense, ...trip.expenses] }));
      sendNotification(`${currentTrip?.name || 'Výlet'} - Nová transakcia`, {
        body: `${expense.title} (${eur(expense.amount)})`,
      });
    }

    setDraft((prev) => ({
      ...prev,
      title: '',
      amount: '',
      expenseType: 'expense',
      transferTo: '',
      splitType: 'equal',
      participants: safePayer ? [safePayer] : [],
      participantAmounts: members.reduce<Record<string, number>>((acc, name) => {
        acc[name] = 0;
        return acc;
      }, {}),
    }));

    setShowExpenseModal(false);
  }

  function openExpenseModalForCreate() {
    setEditingExpenseId(null);
    setDraft({
      title: '',
      amount: '',
      expenseType: 'expense',
      payer: safePayer,
      transferTo: '',
      participants: members,
      splitType: 'equal',
      participantWeights: members.reduce<Record<string, number>>((acc, name) => {
        acc[name] = 1;
        return acc;
      }, {}),
      participantAmounts: members.reduce<Record<string, number>>((acc, name) => {
        acc[name] = 0;
        return acc;
      }, {}),
    });
    setShowExpenseModal(true);
  }

  function editExpense(expenseId: string) {
    if (!currentTrip) return;
    const found = currentTrip.expenses.find((item) => item.id === expenseId);
    if (!found) return;

    setEditingExpenseId(expenseId);
    setDraft({
      title: found.title,
      amount: String(found.amount),
      expenseType: found.expenseType === 'transfer' ? 'transfer' : 'expense',
      payer: found.payer,
      transferTo: found.transferTo || members.find((name) => name !== found.payer) || '',
      participants: found.participants,
      splitType: found.splitType || 'equal',
      participantWeights: found.participantWeights || {},
      participantAmounts: found.participantAmounts || {},
    });
    openTrip(currentTrip.id, 'expenses');
    setShowExpenseModal(true);
  }

  function removeExpense(expenseId: string) {
    updateCurrentTrip((trip) => ({
      ...trip,
      expenses: trip.expenses.filter((expense) => expense.id !== expenseId),
    }));
  }

  async function toggleNotifications() {
    if (typeof Notification === 'undefined') {
      setInfoMessage('Tento prehliadač nepodporuje notifikácie.');
      return;
    }

    if (!window.isSecureContext) {
      setInfoMessage('Notifikácie fungujú iba na HTTPS doméne.');
      return;
    }

    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      setInfoMessage('Notifikácie sú vypnuté.');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationsEnabled(true);
      setInfoMessage('Notifikácie sú zapnuté.');
      return;
    }

    if (Notification.permission === 'denied') {
      setInfoMessage('Notifikácie sú blokované v prehliadači. Povoľ ich v nastaveniach stránky.');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
    setInfoMessage(
      permission === 'granted'
        ? 'Notifikácie sú zapnuté.'
        : 'Notifikácie neboli povolené.'
    );
  }

  function sendNotification(title: string, options?: NotificationOptions) {
    if (typeof Notification === 'undefined' || !notificationsEnabled) return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(title, options);
    } catch (error) {
      console.error('Chyba pri posielaní notifikácie:', error);
    }
  }

  useEffect(() => {
    if (!notificationsEnabled || !appSession) return;

    const selfName = appSession.name;
    trips.forEach((trip) => {
      const previous = expenseCountRef.current[trip.id] ?? trip.expenses.length;
      if (trip.expenses.length > previous) {
        const newest = trip.expenses[0];
        if (newest && newest.payer !== selfName && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`Nová transakcia v ${trip.name}`, {
            body: `${newest.payer} pridal(a) výdavok ${newest.title} (${eur(newest.amount)})`,
          });
        }
      }
      expenseCountRef.current[trip.id] = trip.expenses.length;
    });
  }, [appSession, notificationsEnabled, trips]);

  const isAuthenticated = Boolean(appSession);
  const showTripDetail = activeAppScreen === 'trip-detail' && currentTrip;
  const visibleTrips = showArchived ? trips : trips.filter((trip) => !trip.archived);
  const tripThemeStyle = useMemo(() => {
    if (!currentTrip) return undefined;

    return {
      '--trip-accent': currentTrip.color,
      '--trip-accent-soft': `${currentTrip.color}1c`,
      '--trip-accent-border': `${currentTrip.color}66`,
      '--trip-accent-shadow': hexToRgba(currentTrip.color, 0.24),
    } as CSSProperties;
  }, [currentTrip]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const inviteJoinUrl = useMemo(() => {
    if (!currentTrip) return '';

    const configuredBase = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
    const runtimeBase =
      typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';
    const baseUrl = configuredBase || runtimeBase || 'https://splitpay.sk';

    return `${baseUrl}/?joinCode=${encodeURIComponent(currentTrip.inviteCode)}`;
  }, [currentTrip]);

  function money(value: number) {
    const currency = currentTrip?.currency || 'EUR';
    return new Intl.NumberFormat('sk-SK', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

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
          <div className="profile-fab-wrap">
            <button type="button" className="profile-fab" onClick={() => setProfileOpen((prev) => !prev)}>
              {(appSession?.name || 'U').slice(0, 1).toUpperCase()}
            </button>
            {profileOpen ? (
              <section className="profile-menu section-card">
                <h3>Môj profil</h3>
                <p className="muted">{appSession?.name}</p>
                <p className="muted">{appSession?.email}</p>
                <button type="button" className="ghost" onClick={goToTripsHome}>Moje výlety</button>
                {isAdmin ? <button type="button" className="ghost" onClick={goToAdmin}>Admin sekcia</button> : null}
                <button type="button" className="ghost" onClick={toggleNotifications}>
                  {notificationsEnabled ? 'Notifikácie: zapnuté' : 'Notifikácie: vypnuté'}
                </button>
                <button
                  type="button"
                  className="ghost danger-btn"
                  onClick={() => setInfoMessage('Vymazanie účtu vyžaduje serverovú funkciu (service role).')}
                >
                  Vymazať účet
                </button>
                <button type="button" className="ghost" onClick={handleLogout}>Odhlásiť sa</button>
              </section>
            ) : null}
          </div>

          {globalAnnouncement ? <p className="info-banner admin-announcement">{globalAnnouncement}</p> : null}

          {activeAppScreen === 'admin' ? (
            <section className="section-card full-window admin-panel">
              <div className="section-head compact-head">
                <p className="eyebrow">Administrácia</p>
                <h2>Riadiace centrum aplikácie</h2>
                <p className="muted">Rozšírený prehľad používania a správa oprávnení.</p>
              </div>

              <div className="stat-grid">
                <div className="stat-card">
                  <span>Počet návštev celkom</span>
                  <strong>{visitsCount}</strong>
                </div>
                <div className="stat-card">
                  <span>Návštevy za 24h</span>
                  <strong>{visits24hCount}</strong>
                </div>
                <div className="stat-card">
                  <span>Aktívni používatelia (5 min)</span>
                  <strong>{activeUsersCount}</strong>
                </div>
                <div className="stat-card">
                  <span>Používatelia v systéme</span>
                  <strong>{totalUsersSeen}</strong>
                </div>
                <div className="stat-card">
                  <span>Uložené stavy výletov</span>
                  <strong>{totalTripsStored}</strong>
                </div>
                <div className="stat-card">
                  <span>Načítanie panelu</span>
                  <strong>{adminLoading ? 'Načítavam' : 'Hotovo'}</strong>
                </div>
              </div>

              <div className="screen-grid compact-grid admin-grid">
                <div className="mini-panel">
                  <h3>Admin oznam pre všetkých</h3>
                  <textarea
                    className="admin-textarea"
                    value={announcementText}
                    onChange={(event) => setAnnouncementText(event.target.value)}
                    placeholder="Sem napíš oznam pre používateľov"
                  />
                  <label className="archived-toggle">
                    <input
                      type="checkbox"
                      checked={announcementEnabled}
                      onChange={(event) => setAnnouncementEnabled(event.target.checked)}
                    />
                    Zobraziť oznam v aplikácii
                  </label>
                  <button type="button" onClick={saveAdminAnnouncement}>Uložiť oznam</button>
                </div>

                <div className="mini-panel">
                  <h3>Top používatelia podľa návštev (500 posledných)</h3>
                  <div className="stack-list">
                    {topUsers.length === 0 ? <p className="muted">Zatiaľ žiadne dáta.</p> : null}
                    {topUsers.map((user) => (
                      <div className="row" key={user.email}>
                        <span>{user.email}</span>
                        <strong>{user.visits}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="screen-grid compact-grid admin-grid">
                <div className="mini-panel">
                  <h3>Aktívni používatelia a roly</h3>
                  <div className="stack-list">
                    {adminPresence.length === 0 ? <p className="muted">Zatiaľ žiadni používatelia.</p> : null}
                    {adminPresence.map((user) => (
                      <div className="row" key={user.user_id}>
                        <div>
                          <strong>{user.user_name}</strong>
                          <p>{user.user_email}</p>
                          <p>Naposledy: {formatDateTime(user.last_seen)}</p>
                        </div>
                        <div className="expense-actions">
                          <span className="pill">{user.role === 'admin' ? 'Admin' : 'User'}</span>
                          {user.user_id !== appSession?.userId ? (
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => toggleUserRole(user.user_id, user.role === 'admin' ? 'user' : 'admin')}
                            >
                              {user.role === 'admin' ? 'Znížiť na user' : 'Povýšiť na admin'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mini-panel">
                  <h3>Posledné návštevy</h3>
                  <div className="stack-list">
                    {recentVisits.length === 0 ? <p className="muted">Zatiaľ žiadne návštevy.</p> : null}
                    {recentVisits.map((visit) => (
                      <div className="row" key={visit.id}>
                        <span>{visit.user_email}</span>
                        <strong>{formatDateTime(visit.visited_at)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="screen-grid compact-grid admin-grid">
                <div className="mini-panel">
                  <h3>Aktívne výlety</h3>
                  <div className="stack-list">
                    {trips.filter((t) => !t.archived).length === 0 ? (
                      <p className="muted">Zatiaľ žiadne aktívne výlety.</p>
                    ) : null}
                    {trips
                      .filter((t) => !t.archived)
                      .map((trip) => (
                        <div className="row" key={trip.id}>
                          <div>
                            <strong>{trip.name}</strong>
                            <p className="muted">{trip.members.length} členov</p>
                          </div>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => openTrip(trip.id, 'overview')}
                          >
                            Otvoriť
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="mini-panel">
                  <h3>Archivované výlety</h3>
                  <div className="stack-list">
                    {trips.filter((t) => t.archived).length === 0 ? (
                      <p className="muted">Zatiaľ žiadne archivované výlety.</p>
                    ) : null}
                    {trips
                      .filter((t) => t.archived)
                      .map((trip) => (
                        <div className="row" key={trip.id}>
                          <div>
                            <strong>{trip.name}</strong>
                            <p className="muted">{trip.members.length} členov</p>
                          </div>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => openTrip(trip.id, 'overview')}
                          >
                            Otvoriť
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="admin-actions">
                <button type="button" className="ghost" onClick={exportVisitsCsv}>Export návštev do CSV</button>
                <button type="button" className="ghost danger-btn" onClick={purgeStalePresence}>
                  Vyčistiť prítomnosť staršiu ako 7 dní
                </button>
                <button type="button" className="ghost" onClick={goToTripsHome}>Späť do výletov</button>
              </div>
            </section>
          ) : null}

          {activeAppScreen !== 'admin' ? (
            activeAppScreen === 'trip-detail' && !showTripDetail ? null : !showTripDetail ? (
            <>
              <section className="hero hero-panel">
                <div>
                  <div className="hero-brand">
                    <Image src="/icon.png" alt="Split Pay" width={56} height={56} className="hero-app-icon" />
                    <div>
                      <p className="eyebrow">Split Pay</p>
                      <h1>Výlety, rozpočet a vyrovnanie bez chaosu</h1>
                    </div>
                  </div>
                  <p>
                    Vytvor výlet, pozvi ľudí cez kód a maj výdavky pod kontrolou od prvého nákupu
                    až po posledné vyrovnanie.
                  </p>
                  <div className="hero-metrics">
                    <span>Rýchle pozvánky</span>
                    <span>Spravodlivé rozdelenie</span>
                    <span>Okamžitá bilancia</span>
                  </div>
                </div>
                <div className="hero-actions">
                  <p className="muted">Prihlásený email: {appSession?.email}</p>
                  <label className="muted archived-toggle">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(event) => setShowArchived(event.target.checked)}
                    />
                    Zobraziť archivované výlety
                  </label>
                </div>
                {infoMessage ? <p className="info-banner hero-info">{infoMessage}</p> : null}
              </section>

              <section className="app-section">
                <div className="section-head">
                  <p className="eyebrow">Prehľad</p>
                  <h2>Moje výlety</h2>
                </div>
                <div className="trip-overview-list">
                  {visibleTrips.map((trip) => {
                    const tripBalances = computeBalances(trip.members, trip.expenses);
                    const tripTotal = trip.expenses.reduce(
                      (sum, expense) => (expense.expenseType === 'transfer' ? sum : sum + expense.amount),
                      0
                    );
                    const userBalance = appSession?.name
                      ? (tripBalances[appSession.name] ?? tripBalances.Ty ?? 0)
                      : (tripBalances.Ty ?? 0);

                    return (
                      <button
                        key={trip.id}
                        type="button"
                        className="trip-card-large"
                        style={
                          {
                            '--trip-card-accent': trip.color,
                            '--trip-card-accent-soft': `${trip.color}22`,
                            '--trip-card-shadow': hexToRgba(trip.color, 0.2),
                          } as CSSProperties
                        }
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
                              {money(userBalance)}
                            </span>
                          </div>
                          <div className="trip-card-meta">
                            <span>{trip.members.length} členov</span>
                            <span>{trip.expenses.length} výdavkov</span>
                            <span>Spolu {money(tripTotal)}</span>
                            <span>{trip.currency}</span>
                            {trip.archived ? <span>Archivované</span> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="screen-grid action-tiles-grid">
                <button
                  type="button"
                  className="section-card action-tile action-tile-create"
                  onClick={() => setShowCreateTripModal(true)}
                >
                  <p className="eyebrow">Nový výlet</p>
                  <h2>Založiť výlet</h2>
                  <p className="muted card-subtitle">Vytvor nový výlet a získaj kód na zdieľanie.</p>
                </button>

                <button
                  type="button"
                  className="section-card action-tile action-tile-join"
                  onClick={() => setShowJoinTripModal(true)}
                >
                  <p className="eyebrow">Pripojenie</p>
                  <h2>Pridať sa do výletu</h2>
                  <p className="muted card-subtitle">Máš kód? Otvor formulár a pridaj sa.</p>
                </button>
              </section>

              {showCreateTripModal ? (
                <div className="modal-overlay" role="presentation" onClick={() => setShowCreateTripModal(false)}>
                  <section className="section-card modal-card" role="dialog" aria-modal="true" aria-label="Založiť výlet" onClick={(event) => event.stopPropagation()}>
                    <div className="modal-head">
                      <div>
                        <p className="eyebrow">Nový výlet</p>
                        <h2>Založiť výlet</h2>
                      </div>
                      <button type="button" className="ghost" onClick={() => setShowCreateTripModal(false)}>Zavrieť</button>
                    </div>
                    <form className="stack onboarding-form" onSubmit={handleCreateTrip}>
                      <label className="field-block">
                        <span>Názov výletu</span>
                        <input
                          value={newTripName}
                          onChange={(event) => setNewTripName(event.target.value)}
                          placeholder="Napr. Tatry víkend"
                        />
                      </label>
                      <label className="field-block">
                        <span>Dátum</span>
                        <input
                          value={newTripDate}
                          onChange={(event) => setNewTripDate(event.target.value)}
                          placeholder="Voliteľné"
                        />
                      </label>
                      <button type="submit" className="primary-cta">Vytvoriť výlet</button>
                      <p className="muted field-hint">Po vytvorení dostaneš okamžite kód na pozvanie ostatných.</p>
                    </form>
                  </section>
                </div>
              ) : null}

              {showJoinTripModal ? (
                <div className="modal-overlay" role="presentation" onClick={() => setShowJoinTripModal(false)}>
                  <section className="section-card modal-card" role="dialog" aria-modal="true" aria-label="Pridať sa do výletu" onClick={(event) => event.stopPropagation()}>
                    <div className="modal-head">
                      <div>
                        <p className="eyebrow">Pripojenie</p>
                        <h2>Pridať sa do výletu</h2>
                      </div>
                      <button type="button" className="ghost" onClick={() => setShowJoinTripModal(false)}>Zavrieť</button>
                    </div>
                    <form className="stack onboarding-form" onSubmit={handleJoinByCode}>
                      <label className="field-block">
                        <span>Tvoje meno</span>
                        <input
                          value={joinName}
                          onChange={(event) => setJoinName(event.target.value)}
                          placeholder="Napr. Martin"
                        />
                      </label>
                      <label className="field-block">
                        <span>Kód od organizátora</span>
                        <input
                          value={joinCode}
                          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                          placeholder="Napr. A1B2C3"
                        />
                      </label>
                      <button type="submit" className="primary-cta">Pripojiť sa</button>
                      <p className="muted field-hint">Ak si otvoril QR link, kód sa vyplní automaticky. Môžeš sa pripojiť ako nový člen alebo ako existujúci člen, ak si bol pozvaný.</p>
                    </form>
                  </section>
                </div>
              ) : null}
            </>
          ) : (
            <div className="trip-theme" style={tripThemeStyle}>
              <section className="hero hero-panel">
                <div>
                  <button type="button" className="back-link" onClick={goToTripsHome}>
                    ← Späť na moje výlety
                  </button>
                  <div className="hero-brand compact-brand">
                    <Image src="/icon.png" alt="Split Pay" width={44} height={44} className="hero-app-icon" />
                    <div>
                      <p className="eyebrow">Detail výletu</p>
                      <h1>{currentTrip.name}</h1>
                    </div>
                  </div>
                  <p>
                    {currentTrip.date} · {members.length} členov · {eur(totalSpent)} spolu
                  </p>
                </div>
                <div className="hero-actions hero-actions-end">
                  <p className="muted">Kód výletu: {currentTrip.inviteCode}</p>
                  {currentTripOwnerIsSelf ? (
                    <button type="button" className="ghost trip-settings-open-btn" onClick={() => setShowTripSettingsModal(true)}>
                      <Settings2 size={15} aria-hidden="true" />
                      <span>Nastavenie</span>
                    </button>
                  ) : null}
                </div>
                {infoMessage ? <p className="info-banner hero-info">{infoMessage}</p> : null}
              </section>

              {showTripSettingsModal && currentTripOwnerIsSelf ? (
                <div className="modal-overlay modal-overlay-top-right" role="presentation" onClick={() => setShowTripSettingsModal(false)}>
                  <section className="section-card trip-settings-modal" role="dialog" aria-modal="true" aria-label="Nastavenia výletu" onClick={(event) => event.stopPropagation()}>
                    <div className="modal-head">
                      <div>
                        <p className="eyebrow">Nastavenie výletu</p>
                        <h2>{currentTrip.name}</h2>
                      </div>
                      <button type="button" className="ghost" onClick={() => setShowTripSettingsModal(false)}>Zavrieť</button>
                    </div>
                    <form className="stack trip-settings-form" onSubmit={(event) => event.preventDefault()}>
                      <label className="field-block">
                        <span>Názov výletu</span>
                        <input
                          type="text"
                          value={currentTrip.name}
                          onChange={(event) => updateTripSettings({ name: event.target.value })}
                          placeholder="Názov výletu"
                        />
                      </label>
                      <label className="field-block">
                        <span>Mena</span>
                        <select
                          value={currentTrip.currency}
                          onChange={(event) =>
                            updateTripSettings({ currency: event.target.value as Trip['currency'] })
                          }
                        >
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                          <option value="CZK">CZK</option>
                        </select>
                      </label>
                      <label className="field-block">
                        <span>Farba výletu</span>
                        <input
                          type="color"
                          value={currentTrip.color}
                          onChange={(event) => updateTripSettings({ color: event.target.value })}
                        />
                      </label>
                      <label className="archived-toggle">
                        <input
                          type="checkbox"
                          checked={currentTrip.archived}
                          onChange={(event) => updateTripSettings({ archived: event.target.checked })}
                        />
                        Archivovať výlet
                      </label>
                      <button
                        type="button"
                        className="ghost danger-btn"
                        onClick={() => {
                          deleteTrip(currentTrip.id);
                          setShowTripSettingsModal(false);
                        }}
                      >
                        Vymazať výlet
                      </button>
                    </form>
                  </section>
                </div>
              ) : null}

              <section className="screen-nav">
                <button
                  type="button"
                  className={activeDetailScreen === 'overview' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => openTrip(currentTrip.id, 'overview')}
                >
                  <span className="screen-pill-inner">
                    <Share2 size={15} aria-hidden="true" />
                    <span>Prehľad</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={activeDetailScreen === 'members' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => openTrip(currentTrip.id, 'members')}
                >
                  <span className="screen-pill-inner">
                    <Users size={15} aria-hidden="true" />
                    <span>Členovia</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={activeDetailScreen === 'invites' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => openTrip(currentTrip.id, 'invites')}
                >
                  <span className="screen-pill-inner">
                    <Link2 size={15} aria-hidden="true" />
                    <span>Pozvánky</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={activeDetailScreen === 'expenses' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => openTrip(currentTrip.id, 'expenses')}
                >
                  <span className="screen-pill-inner">
                    <Receipt size={15} aria-hidden="true" />
                    <span>Výdavky</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={activeDetailScreen === 'balances' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => openTrip(currentTrip.id, 'balances')}
                >
                  <span className="screen-pill-inner">
                    <Coins size={15} aria-hidden="true" />
                    <span>Bilancia</span>
                  </span>
                </button>
              </section>

              {activeDetailScreen === 'overview' ? (
                <section className="screen-window section-card screen-single full-window">
                  <div className="section-head compact-head overview-head">
                    <div>
                      <p className="eyebrow">Prehľad výletu</p>
                      <h2>Základné informácie</h2>
                    </div>
                    <button
                      type="button"
                      className="expense-open-modal-btn"
                      onClick={() => setShowExpenseModal(true)}
                      title="Pridať výdavok"
                    >
                      <Plus size={16} />
                      <span>Pridať výdavok</span>
                    </button>
                  </div>
                  <div className="stat-grid overview-stat-grid">
                    <div className="stat-card overview-stat-card">
                      <span>Členovia</span>
                      <strong>{members.length}</strong>
                    </div>
                    <div className="stat-card overview-stat-card">
                      <span>Výdavky</span>
                      <strong>{normalizedExpenses.length}</strong>
                    </div>
                    <div className="stat-card overview-stat-card">
                      <span>Pozvánky</span>
                      <strong>{currentTrip.pendingInvites.length}</strong>
                    </div>
                    <div className="stat-card overview-stat-card">
                      <span>Spolu minuté</span>
                      <strong>{money(totalSpent)}</strong>
                    </div>
                  </div>
                  <div className="screen-grid compact-grid overview-compact-grid">
                    <div className="mini-panel overview-mini-panel">
                      <h3>Členovia výletu</h3>
                      <div className="pill-list">
                        {members.map((name) => (
                          <div key={name} className="pill">
                            <span>{name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mini-panel overview-mini-panel">
                      <h3>Posledné výdavky</h3>
                      <div className="stack-list">
                        {recentExpenses.length === 0 ? <p className="muted">Zatiaľ žiadne záznamy.</p> : null}
                        {recentExpenses.map((expense) => (
                          <div className="row overview-row" key={expense.id}>
                            <div>
                              <strong>{expense.title}</strong>
                              <p>Platil {expense.payer}</p>
                            </div>
                            <strong>{money(expense.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {activeDetailScreen === 'members' ? (
                <section className="screen-window section-card screen-single full-window">
                  <div className="section-head compact-head">
                    <p className="eyebrow">Tím</p>
                    <h2>Členovia výletu</h2>
                  </div>
                  {currentTripOwnerIsSelf ? (
                    <form className="inline-form compact-form" onSubmit={handleAddMember}>
                      <input
                        value={newMember}
                        onChange={(event) => setNewMember(event.target.value)}
                        placeholder="Meno člena"
                      />
                      <button type="submit">Pridať</button>
                    </form>
                  ) : null}
                  {currentTripOwnerIsSelf && members.length === 1 ? (
                    <div className="mini-panel" style={{ background: '#fff8e7', borderColor: '#f59f00', color: '#9b5d00' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>
                        <strong>⚠️ Ak sa odstránite:</strong> Si jediný člen, výlet bude vymazaný.
                      </p>
                    </div>
                  ) : null}
                  {currentTripOwnerIsSelf && members.length > 1 ? (
                    <div className="mini-panel" style={{ background: '#e7f8ff', borderColor: '#2c79f6', color: '#1f3562' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>
                        <strong>ℹ️ Ak sa odstránite:</strong> Vlastníctvo preberá {formatMemberName(members.find((m) => !isSelfName(m)) || 'ďalší člen')}.
                      </p>
                    </div>
                  ) : null}
                  <div className="member-list">
                    {members.map((name) => (
                      <div key={name} className="member-row">
                        <div className="member-avatar">{formatMemberName(name).slice(0, 1)}</div>
                        <div>
                          <strong>{formatMemberName(name)}</strong>
                          {(isSelfName(name) || currentTrip.owner === name) && (
                            <p>
                              {currentTrip.owner === name ? 'Vlastník' : displayCurrentUserName}
                            </p>
                          )}
                        </div>
                        {currentTripOwnerIsSelf ? (
                          <button
                            type="button"
                            className="ghost danger-btn"
                            onClick={() => removeMember(name)}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {!isAuthenticated && currentTrip.pendingInvites.length > 0 ? (
                    <div className="mini-panel">
                      <h3>Potvrď svoju identitu</h3>
                      <p className="muted">Ak si hosť, vyber si jednu z pozvánok:</p>
                      <div className="stack-list">
                        {currentTrip.pendingInvites
                          .filter((invite) => invite.status === 'Pozvany')
                          .map((invite) => (
                            <button
                              key={invite.id}
                              type="button"
                              className="row guest-claim-btn"
                              onClick={() => handleGuestClaimIdentity(invite.name)}
                            >
                              <span>{invite.name}</span>
                              <strong>Toto som ja</strong>
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {activeDetailScreen === 'invites' ? (
                <section className="screen-window section-card screen-single full-window">
                  <div className="section-head compact-head">
                    <p className="eyebrow">Pozvanie</p>
                    <h2>Pozvánky a prístupy</h2>
                  </div>
                  {currentTripOwnerIsSelf ? (
                    <>
                      <div className="invite-code-box">
                        <span>Kód</span>
                        <strong>{currentTrip.inviteCode}</strong>
                        <div className="share-buttons">
                          <button type="button" className="ghost share-action-btn" onClick={copyInviteCodeToClipboard}>
                            <Clipboard size={14} aria-hidden="true" />
                            <span>Kopírovať</span>
                          </button>
                          <button type="button" className="ghost share-action-btn" onClick={shareViaEmail}>
                            <Mail size={14} aria-hidden="true" />
                            <span>Email</span>
                          </button>
                          <button type="button" className="ghost share-action-btn" onClick={shareViaWhatsApp}>
                            <Share2 size={14} aria-hidden="true" />
                            <span>WhatsApp</span>
                          </button>
                          <button type="button" className="ghost share-action-btn" onClick={shareViaSMS}>
                            <MessageSquare size={14} aria-hidden="true" />
                            <span>SMS</span>
                          </button>
                          <button
                            type="button"
                            className="ghost share-action-btn"
                            onClick={() => setShowInviteQr((prev) => !prev)}
                          >
                            <QrCode size={14} aria-hidden="true" />
                            <span>{showInviteQr ? 'Skryť QR' : 'QR kód'}</span>
                          </button>
                        </div>
                        {showInviteQr ? (
                          <div className="qr-share-box">
                            <QRCodeSVG value={inviteJoinUrl || currentTrip.inviteCode} size={160} includeMargin />
                            <div>
                              <p className="muted">Naskenuj QR na pripojenie</p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <form className="stack compact-form" onSubmit={handleAddInvite}>
                        <input
                          value={inviteName}
                          onChange={(event) => setInviteName(event.target.value)}
                          placeholder="Meno"
                        />
                        <input
                          value={inviteContact}
                          onChange={(event) => setInviteContact(event.target.value)}
                          placeholder="Kontakt (voliteľné)"
                        />
                        <button type="submit">Pridať</button>
                      </form>
                    </>
                  ) : (
                    <p className="muted">Kód výletu: {currentTrip.inviteCode}</p>
                  )}
                  <div className="stack-list">
                    {currentTrip.pendingInvites.map((invite) => (
                      <div key={invite.id} className="row">
                        <div>
                          <strong>{invite.name}</strong>
                          {invite.contact && <p>{invite.contact}</p>}
                        </div>
                        <p className="muted">{invite.status}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeDetailScreen === 'expenses' ? (
                <section className="screen-window section-card screen-single full-window">
                  <div className="section-head compact-head expenses-head">
                    <div>
                      <p className="eyebrow">Výdavky</p>
                      <h2>Prehľad a história výdavkov</h2>
                    </div>
                    <button type="button" className="expense-open-modal-btn" onClick={openExpenseModalForCreate}>
                      + Pridať výdavok
                    </button>
                  </div>

                  <div className="mini-panel expenses-list-panel">
                    <h3>História výdavkov</h3>
                    <div className="stack-list">
                      {currentTrip.expenses.length === 0 ? <p className="muted">Zatiaľ žiadne záznamy.</p> : null}
                      {currentTrip.expenses.map((expense) => (
                        <div className="row" key={expense.id}>
                          <div>
                            <strong>{expense.title}</strong>
                            <p>
                              {expense.expenseType === 'transfer'
                                ? `${expense.payer} poslal(a) ${expense.transferTo || expense.participants[0] || '-'}.`
                                : `Platil ${expense.payer}, účastníci: ${expense.participants.join(', ')}`}
                            </p>
                          </div>
                          <div className="expense-actions">
                            <button type="button" className="ghost" onClick={() => editExpense(expense.id)}>
                              Upraviť
                            </button>
                            <button type="button" className="ghost danger-btn" onClick={() => removeExpense(expense.id)}>
                              Vymazať
                            </button>
                            <strong>{money(expense.amount)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>


                </section>
              ) : null}

              {activeDetailScreen === 'balances' ? (
                <section className="screen-window section-card screen-single full-window">
                  <div className="section-head compact-head">
                    <p className="eyebrow">Bilancia</p>
                    <h2>Kto komu koľko dlží</h2>
                  </div>
                  <div className="balance-shell">
                    <div className="balance-segmented" role="tablist" aria-label="Prepínač bilancie">
                      <button
                        type="button"
                        role="tab"
                        className={balanceTab === 'all' ? 'balance-tab active' : 'balance-tab'}
                        aria-selected={balanceTab === 'all'}
                        onClick={() => setBalanceTab('all')}
                      >
                        Všetky
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={balanceTab === 'settlements' ? 'balance-tab active' : 'balance-tab'}
                        aria-selected={balanceTab === 'settlements'}
                        onClick={() => setBalanceTab('settlements')}
                      >
                        Vyrovnania
                      </button>
                    </div>

                    {balanceTab === 'all' ? (
                      <div className="balance-main-card">
                        <h3>Kto komu koľko dlží</h3>
                        <p className="muted balance-subtitle">Aktuálne stavy bilancie</p>

                        {Object.entries(balances).length === 0 ? (
                          <p className="muted">Žiadni členkovia.</p>
                        ) : null}

                        <div className="stack-list balance-transfer-list">
                          {Object.entries(balances).map(([name, value]) => {
                            if (Math.abs(value) < 0.01) return null;
                            const displayName = formatMemberName(name);
                            return (
                              <div className="balance-transfer-row" key={name}>
                                <span className="balance-person">{displayName}</span>
                                <span className="balance-arrow" aria-hidden="true">{value >= 0 ? '←' : '→'}</span>
                                <span className="balance-target">
                                  <span className="balance-avatar">€</span>
                                  {value >= 0 ? 'dostane' : 'zaplatí'}
                                </span>
                                <strong className={`balance-amount ${value >= 0 ? 'positive' : 'negative'}`}>
                                  {eur(Math.abs(value))}
                                </strong>
                              </div>
                            );
                          })}
                        </div>

                        <div className="balance-total-card">
                          <p>
                            {selfBalance >= 0 ? `${displayCurrentUserName} dostane spolu` : `${displayCurrentUserName} zaplatí spolu`}
                          </p>
                          <strong className={selfBalance >= 0 ? 'positive' : 'negative'}>
                            {eur(Math.abs(selfBalance))}
                          </strong>
                        </div>
                      </div>
                    ) : null}

                    {balanceTab === 'settlements' ? (
                      <div className="balance-main-card">
                        <h3>Kto komu koľko dlží</h3>
                        <p className="muted balance-subtitle">Najmenej prevodov na vyrovnanie</p>

                        {settlements.length === 0 ? <p className="muted">Všetko je vyrovnané.</p> : null}

                        <div className="stack-list balance-transfer-list">
                          {settlements.map((transfer, index) => {
                            const fromName = formatMemberName(transfer.from);
                            const toName = formatMemberName(transfer.to);

                            return (
                              <div className="balance-transfer-row" key={`${transfer.from}-${transfer.to}-${index}`}>
                                <span className="balance-person">{fromName}</span>
                                <span className="balance-arrow" aria-hidden="true">→</span>
                                <span className="balance-target">
                                  <span className="balance-avatar">{toName.slice(0, 1).toUpperCase()}</span>
                                  {toName}
                                </span>
                                <strong className="balance-amount">{money(transfer.amount)}</strong>
                              </div>
                            );
                          })}
                        </div>

                        <div className="balance-total-card">
                          <p>
                            {selfBalance >= 0 ? `${displayCurrentUserName} dostane spolu` : `${displayCurrentUserName} zaplatí spolu`}
                          </p>
                          <strong className={selfBalance >= 0 ? 'positive' : 'negative'}>
                            {eur(Math.abs(selfBalance))}
                          </strong>
                        </div>
                      </div>
                    ) : null}

                    <div className="balance-tip muted">
                      Pošli kamarátom svoje číslo účtu alebo vyrovnajte v hotovosti.
                    </div>
                  </div>
                </section>
              ) : null}

              {showExpenseModal ? (
                <div className="modal-overlay" role="presentation" onClick={() => setShowExpenseModal(false)}>
                  <section className="section-card modal-card expense-modal-card" role="dialog" aria-modal="true" aria-label="Pridať výdavok" onClick={(event) => event.stopPropagation()}>
                    <div className="modal-head">
                      <div>
                        <p className="eyebrow">Výdavok</p>
                        <h2>{editingExpenseId ? 'Upraviť výdavok' : 'Pridať výdavok'}</h2>
                      </div>
                      <button type="button" className="ghost" onClick={() => setShowExpenseModal(false)}>Zavrieť</button>
                    </div>
                    <form className="stack" onSubmit={handleAddExpense}>
                      <select
                        value={draft.expenseType}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            expenseType: event.target.value as ExpenseDraft['expenseType'],
                          }))
                        }
                      >
                        <option value="expense">Nový výdavok</option>
                        <option value="transfer">Transfer (vyrovnanie)</option>
                      </select>
                      <input
                        value={draft.title}
                        onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder={
                          draft.expenseType === 'transfer'
                            ? 'Názov transferu (voliteľné)'
                            : 'Názov výdavku'
                        }
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

                      {draft.expenseType === 'transfer' ? (
                        <select
                          value={safeTransferTo}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, transferTo: event.target.value }))
                          }
                        >
                          <option value="">Komu posielam</option>
                          {members
                            .filter((name) => name !== safePayer)
                            .map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <>
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
                                  {draft.splitType === 'individual' && selected ? (
                                    <input
                                      className="weight"
                                      inputMode="decimal"
                                      value={String(draft.participantAmounts[name] || 0)}
                                      onChange={(event) => {
                                        const next = Number(event.target.value);
                                        setDraft((prev) => ({
                                          ...prev,
                                          participantAmounts: {
                                            ...prev.participantAmounts,
                                            [name]: Number.isFinite(next) && next >= 0 ? next : 0,
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
                              onClick={() => setDraft((prev) => ({ ...prev, splitType: 'equal', participants: members }))}
                            >
                              Rovnomerne
                            </button>
                            <button
                              type="button"
                              className={draft.splitType === 'individual' ? 'active' : ''}
                              onClick={() => setDraft((prev) => ({ ...prev, splitType: 'individual' }))}
                            >
                              Individuálne
                            </button>
                          </div>

                          {draft.splitType === 'individual' ? (
                            <p className="muted">
                              Súčet individuálnych súm: {money(individualTotal)} / Celkom: {money(amountNumber || 0)}
                            </p>
                          ) : null}
                        </>
                      )}

                      <button type="submit" disabled={!canAddExpense}>
                        {editingExpenseId ? 'Uložiť zmeny transakcie' : 'Pridať výdavok'}
                      </button>
                      {editingExpenseId ? (
                        <button type="button" className="ghost" onClick={() => setEditingExpenseId(null)}>
                          Zrušiť úpravu
                        </button>
                      ) : null}
                    </form>
                  </section>
                </div>
              ) : null}
            </div>
          )
        ) : null}
        </main>
      )}
    </>
  );
}