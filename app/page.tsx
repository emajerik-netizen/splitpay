'use client';

import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  Bed,
  Car,
  Clipboard,
  Coins,
  Dumbbell,
  Heart,
  Link2,
  Mail,
  MessageSquare,
  Music,
  Package,
  PartyPopper,
  Plane,
  Plus,
  QrCode,
  Receipt,
  Settings2,
  Share2,
  ShoppingBag,
  Users,
  Utensils,
  Cpu,
  ArrowLeftRight,
  CheckCircle2,
  Sparkles,
  Clock,
  BarChart2,
} from 'lucide-react';
import { Expense, computeBalances, settleDebts } from '@/lib/splitLogic';
import { getSupabaseBrowserClient } from '@/lib/supabase';

function eur(value: number) {
  return `${value.toFixed(2)} EUR`;
}

function memberCountLabel(count: number, l: Lang = 'sk') {
  if (count === 1) return T[l].member1;
  if (l === 'sk' && count >= 2 && count <= 4) return `${count} ${T[l].members2to4suffix}`;
  return `${count} ${T[l].membersPlural}`;
}

function expenseCountLabel(count: number, l: Lang = 'sk') {
  if (l === 'sk') {
    if (count === 1) return `${count} výdavok`;
    if (count >= 2 && count <= 4) return `${count} výdavky`;
    return `${count} výdavkov`;
  }
  return `${count} ${count === 1 ? 'expense' : 'expenses'}`;
}

async function sha256hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const AVATAR_EMOJIS = ['🦊','🐱','🐶','🐻','🦁','🐼','🐨','🐯','🦋','🐸','🦄','🐺','🦉','🦅','🐬','🌊','🌵','🌺','⭐','🎸','🚀','🎯','🎮','💎','🔮','🍕','🍦','🏔️','🎭','🌈','🔥','❄️'];

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

function normalizeIban(value: string) {
  return value.replace(/\s+/g, '').toUpperCase();
}

function formatIbanForDisplay(value: string) {
  const normalized = normalizeIban(value);
  return normalized.replace(/(.{4})/g, '$1 ').trim();
}

function isValidIban(value: string) {
  const normalized = normalizeIban(value);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(normalized)) return false;

  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let remainder = 0;

  for (const ch of rearranged) {
    const expanded = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of expanded) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder === 1;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function expenseIdTimestamp(value: string) {
  const raw = value.split('-')[0];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function memberKey(value: string) {
  return value.trim().toLowerCase();
}

const STORAGE_KEY = 'splitpay-web-v1';
const SESSION_CACHE_KEY = 'splitpay-web-session';
const STARTUP_SEEN_KEY = 'splitpay-web-startup-seen-v1';
const INVITE_PENDING_KEY = 'splitpay-invite-pending';
const LANG_KEY = 'splitpay-lang';
const STALE_TRIP_WARNING_ACK_KEY = 'splitpay-stale-trip-warning-acks-v1';
const THEME_KEY = 'splitpay-theme';

type Lang = 'sk' | 'en';

const T = {
  sk: {
    resumingSession: 'Obnovujeme session',
    checkingSavedLogin: 'Kontrolujeme uložené prihlásenie.',
    appName: 'Split Pay',
    appTagline: 'Jednoduché rozdelenie výdavkov medzi priateľov',
    inviteBannerTitle: 'Boli ste pozvaní na výlet!',
    inviteBannerDesc: 'Po prihlásení alebo registrácii si vyberiete meno a vstúpite do výletu.',
    signIn: 'Prihlásenie',
    createAccount: 'Vytvorenie účtu',
    signInSubtitle: 'Vitaj späť! Prihláš sa do svojho účtu.',
    registerSubtitle: 'Zaregistruj sa a začni používať Split Pay aj na webe.',
    name: 'Meno',
    namePlaceholder: 'Zadaj svoje meno',
    email: 'Email',
    emailPlaceholder: 'Zadaj svoj email',
    password: 'Heslo',
    passwordPlaceholder: 'Zadaj svoje heslo',
    forgotPassword: 'Zabudli ste heslo?',
    resetPasswordTitle: 'Nastavenie nového hesla',
    resetPasswordSubtitle: 'Zadaj nové heslo pre svoj účet.',
    confirmPassword: 'Potvrď heslo',
    confirmPasswordPlaceholder: 'Zopakuj nové heslo',
    saveNewPasswordBtn: 'Uložiť nové heslo',
    passwordResetSuccess: 'Heslo bolo úspešne zmenené. Prihláš sa novým heslom.',
    passwordMismatch: 'Heslá sa nezhodujú.',
    passwordTooShort: 'Heslo musí mať aspoň 6 znakov.',
    resetLinkExpired: 'Link na obnovu hesla je neplatný alebo expiroval. Pošli si nový.',
    signInBtn: 'Prihlásiť sa',
    createAccountBtn: 'Vytvoriť účet',
    or: 'alebo',
    continueWithGoogle: 'Pokračovať s Google',
    noAccount: 'Nemáte účet?',
    alreadyHaveAccount: 'Už máte účet?',
    myProfile: 'Môj profil',
    myTrips: 'Moje výlety',
    adminSection: 'Admin sekcia',
    notificationsOn: 'Notifikácie: zapnuté',
    notificationsOff: 'Notifikácie: vypnuté',
    deleteAccount: 'Vymazať účet',
    signOut: 'Odhlásiť sa',
    language: 'Jazyk',
    ibanLabel: 'IBAN',
    ibanPlaceholder: 'SKxx xxxx xxxx xxxx xxxx xxxx',
    saveIbanBtn: 'Uložiť IBAN',
    ibanSaved: 'IBAN bol uložený.',
    ibanInvalid: 'Neplatný IBAN. Skontrolujte formát.',
    memberProfileTitle: 'Profil člena',
    profileNotFound: 'Profil člena zatiaľ neexistuje.',
    copyIbanBtn: 'Kopírovať IBAN',
    ibanNotSet: 'IBAN nie je zadaný.',
    ibanCopied: 'IBAN bol skopírovaný.',
    contactSupport: 'Kontaktovať podporu',
    supportAuthor: 'Podporiť autora',
    openRevolutProfile: 'Otvoriť Revolut profil',
    tutorialBtn: 'Ako začať',
    tutorialDesc: 'Interaktívny návod v 5 krokoch',
    guideBtn: 'Návod',
    guideTitle: 'Ako pridať aplikáciu na plochu',
    guideIntro: 'Vyber zariadenie a postupuj podľa krokov. Aplikácia sa potom otvorí ako samostatná appka.',
    guideIosBtn: 'iOS',
    guideAndroidBtn: 'Android',
    guideStep1Ios: 'V Safari otvor Split Pay.',
    guideStep2Ios: 'Ťukni na Zdieľať (ikona štvorca so šípkou nahor).',
    guideStep3Ios: 'Zvoľ Pridať na plochu.',
    guideStep4Ios: 'Potvrď názov a ťukni Pridať.',
    guideStep1Android: 'V Chrome otvor Split Pay.',
    guideStep2Android: 'Ťukni na menu (tri bodky vpravo hore).',
    guideStep3Android: 'Zvoľ Pridať na plochu alebo Inštalovať aplikáciu.',
    guideStep4Android: 'Potvrď voľbu Pridať/Inštalovať.',
    supportSubject: 'Predmet',
    supportMessage: 'Správa',
    supportMessagePlaceholder: 'Napíš, s čím potrebuješ pomôcť...',
    supportSend: 'Odoslať na podporu',
    supportSending: 'Odosielam...',
    supportSent: 'Správa bola odoslaná na podporu.',
    supportSendFailed: 'Správu sa nepodarilo odoslať. Skús to znova.',
    supportInvalidEmail: 'Zadaj platnú emailovú adresu.',
    supportSmtpMissing: 'Podpora nie je správne nakonfigurovaná (SMTP). Kontaktuj administrátora.',
    supportSmtpAuthFailed: 'Emailová schránka podpory odmietla prihlásenie. Skontroluj SMTP údaje.',
    supportSmtpUnreachable: 'SMTP server je dočasne nedostupný. Skús to znova neskôr.',
    supportEmailLabel: 'Tvoj email',
    heroTitle: 'Výlety, rozpočet a vyrovnanie bez chaosu',
    heroDesc: 'Vytvor výlet, pozvi ľudí cez kód a maj výdavky pod kontrolou od prvého nákupu až po posledné vyrovnanie.',
    quickInvites: 'Rýchle pozvánky',
    fairSplit: 'Spravodlivé rozdelenie',
    instantBalance: 'Okamžitá bilancia',
    loggedInEmail: 'Prihlásený:',
    showArchived: 'Zobraziť archivované výlety',
    expenses: 'výdavkov',
    totalMeta: 'Spolu',
    archived: 'Archivované',
    overviewTab: 'Prehľad',
    newTrip: 'Nový výlet',
    createTrip: 'Založiť výlet',
    createTripDesc: 'Vytvor nový výlet a získaj kód na zdieľanie.',
    joinTripEyebrow: 'Pripojenie',
    joinTripTitle: 'Pridať sa do výletu',
    joinTripDesc: 'Máš kód? Otvor formulár a pridaj sa.',
    tripName: 'Názov výletu',
    tripNamePlaceholder: 'Napr. Tatry víkend',
    date: 'Dátum',
    createTripBtn: 'Vytvoriť výlet',
    createTripHint: 'Po vytvorení dostaneš okamžite kód na pozvanie ostatných.',
    close: 'Zavrieť',
    yourName: 'Tvoje meno',
    yourNamePlaceholder: 'Napr. Martin',
    organizerCode: 'Kód od organizátora',
    codePlaceholder: 'Napr. A1B2C3',
    joinBtn: 'Pripojiť sa',
    joinHint: 'Ak si otvoril QR link, kód sa vyplní automaticky. Môžeš sa pripojiť ako nový člen alebo ako existujúci člen, ak si bol pozvaný.',
    tripDetail: 'Detail výletu',
    tripSettled: 'Výlet je vyrovnaný',
    backToTrips: '← Späť na moje výlety',
    tripCode: 'Kód výletu:',
    settings: 'Nastavenie',
    membersTab: 'Členovia',
    invitesTab: 'Pozvánky',
    expensesTab: 'Výdavky',
    balanceTab: 'Bilancia',
    activityTab: 'Aktivita',
    statsTab: 'Štatistiky',
    noExpensesYet: 'Zatiaľ žiadne výdavky.',
    tripOverview: 'Prehľad výletu',
    basicInfo: 'Základné informácie',
    addExpense: 'Pridať výdavok',
    membersLabel: 'Členovia',
    expensesLabel: 'Výdavky',
    invitesLabel: 'Pozvánky',
    totalSpent: 'Spolu minuté',
    tripMembers: 'Členovia výletu',
    recentExpenses: 'Posledné výdavky',
    noRecords: 'Zatiaľ žiadne záznamy.',
    paidBy: 'Platil',
    team: 'Tím',
    membersTitle: 'Členovia výletu',
    memberNamePlaceholder: 'Meno člena',
    addBtn: 'Pridať',
    leaveTripBtn: 'Opustiť výlet',
    leftTripInfo: 'Opustili ste výlet.',
    historyMembersTitle: 'Členovia z minulosti',
    historyMembersHint: 'Rýchlo pridaj člena, ktorého si už mal v inom výlete.',
    memberAddedInAppTitle: 'Boli ste pridaný do výletu',
    memberAddedInAppBody: 'pridal(a) vás do výletu',
    memberAddedAt: 'Kedy',
    notificationAcknowledge: 'Rozumiem',
    ownerLabel: 'Vlastník',
    confirmIdentity: 'Potvrď svoju identitu',
    guestPickInvite: 'Ak si hosť, vyber si jednu z pozvánok:',
    thatsMe: 'Toto som ja',
    invitation: 'Pozvanie',
    invitesTitle: 'Pozvánky a prístupy',
    code: 'Kód',
    copy: 'Kopírovať',
    shareEmail: 'Email',
    shareWhatsApp: 'WhatsApp',
    shareSms: 'SMS',
    hideQr: 'Skryť QR',
    showQr: 'QR kód',
    contactPlaceholder: 'Kontakt (voliteľné)',
    namePlaceholderInvite: 'Meno',
    scanQr: 'Naskenuj QR na pripojenie',
    expensesTitle: 'Prehľad a história výdavkov',
    addExpenseBtn: '+ Pridať výdavok',
    expenseHistory: 'História výdavkov',
    showMoreExpenses: 'Zobraziť viac',
    expenseDetailTitle: 'Detail výdavku',
    expenseHistoryTimeline: 'História zmien',
    noExpenseHistory: 'Zatiaľ žiadna história zmien.',
    eventCreated: 'Vytvorený',
    eventUpdated: 'Upravený',
    eventDeleted: 'Vymazaný',
    sent: 'poslal(a)',
    participantsLabel: 'účastníci:',
    editBtn: 'Upraviť',
    deleteBtn: 'Vymazať',
    balanceTitle: 'Kto komu koľko dlží',
    balanceSwitcher: 'Prepínač bilancie',
    allTab: 'Všetky',
    settlementsTab: 'Vyrovnania',
    currentBalances: 'Aktuálne stavy bilancie',
    noMembers: 'Žiadni členovia.',
    receives: 'dostane',
    pays: 'zaplatí',
    receivesTotal: 'dostane spolu',
    paysTotal: 'zaplatí spolu',
    fewestTransfers: 'Najmenej prevodov na vyrovnanie',
    settlementsTitle: 'Odporúčané vyrovnania',
    settlementAction: 'pošle',
    allSettled: 'Všetko je vyrovnané.',
    balanceTip: 'Pošli kamarátom IBAN alebo sa vyrovnajte v hotovosti.',
    markAsPaid: 'Zaplatené ✓',
    paymentRecorded: 'Platba zaznamenaná v histórii.',
    offlineBanner: 'Ste offline – zobrazujú sa uložené dáta.',
    copyRecipientIbanBtn: 'Kopírovať IBAN príjemcu',
    tripNeedsSettlementTitle: 'Výlet čaká na vyrovnanie',
    tripNeedsSettlementBody: 'Tento výlet skončil pred viac ako týždňom, ale financie ešte nie sú vyrovnané. Dokončite vyrovnania a až potom výlet archivujte.',
    understoodBtn: 'OK',
    expenseModalEyebrow: 'Výdavok',
    editExpenseTitle: 'Upraviť výdavok',
    addExpenseTitle: 'Pridať výdavok',
    newExpense: 'Nový výdavok',
    transferOption: 'Transfer (vyrovnanie)',
    transferNamePlaceholder: 'Názov transferu (voliteľné)',
    expenseNamePlaceholder: 'Názov výdavku',
    amountPlaceholder: 'Suma',
    sendTo: 'Komu posielam',
    equalSplit: 'Rovnomerne',
    individualSplit: 'Individuálne',
    individualSum: 'Súčet individuálnych súm:',
    totalLabel: 'Celkom:',
    saveChanges: 'Uložiť zmeny transakcie',
    cancelEdit: 'Zrušiť úpravu',
    inviteEyebrow: 'Pozvánka',
    joinTripModal: 'Vstup do výletu',
    invitedToTrip: 'Ste pozvaní na výlet',
    chooseNameDesc: 'Vyberte si meno, pod ktorým budete figurovať vo výlete.',
    availableSlots: 'Voľné sloty:',
    customName: '+ Vlastné meno',
    yourNameInTrip: 'Vaše meno vo výlete',
    yourNameInTripPlaceholder: 'Napr. Jano',
    adding: 'Pridávam...',
    joinTripConfirm: 'Vstúpiť do výletu',
    tripSettingsEyebrow: 'Nastavenie výletu',
    currency: 'Mena',
    tripColor: 'Farba výletu',
    archiveTrip: 'Archivovať výlet',
    deleteTrip: 'Vymazať výlet',
    adminTitle: 'Administrácia',
    adminCenterTitle: 'Riadiace centrum aplikácie',
    adminCenterDesc: 'Rozšírený prehľad používania a správa oprávnení.',
    visitsBtn: 'Návštevy',
    visitsModalTitle: 'Prehľad návštev',
    visitsDay: 'Dnes',
    visitsWeek: 'Týždeň',
    visitsMonth: 'Mesiac',
    visitsYear: 'Rok',
    totalVisits: 'Počet návštev celkom',
    visits24h: 'Návštevy za 24h',
    activeUsers5m: 'Aktívni používatelia (5 min)',
    usersInSystem: 'Používatelia v systéme',
    storedTripStates: 'Uložené stavy výletov',
    panelLoad: 'Načítanie panelu',
    loading: 'Načítavam',
    done: 'Hotovo',
    adminAnnouncementForAll: 'Admin oznam pre všetkých',
    adminAnnouncementPlaceholder: 'Sem napíš oznam pre používateľov',
    showAnnouncementInApp: 'Zobraziť oznam v aplikácii',
    saveAnnouncement: 'Uložiť oznam',
    topUsersVisits: 'Top používatelia podľa návštev (500 posledných)',
    noDataYet: 'Zatiaľ žiadne dáta.',
    activeUsersRoles: 'Aktívni používatelia a roly',
    noUsersYet: 'Zatiaľ žiadni používatelia.',
    lastSeen: 'Naposledy:',
    roleAdmin: 'Admin',
    roleUser: 'User',
    demoteToUser: 'Znížiť na user',
    promoteToAdmin: 'Povýšiť na admin',
    recentVisitsTitle: 'Posledné návštevy',
    noVisitsYet: 'Zatiaľ žiadne návštevy.',
    activeTrips: 'Aktívne výlety',
    noActiveTrips: 'Zatiaľ žiadne aktívne výlety.',
    archivedTrips: 'Archivované výlety',
    noArchivedTrips: 'Zatiaľ žiadne archivované výlety.',
    openBtn: 'Otvoriť',
    slovak: 'Slovenčina',
    english: 'English',
    mergeIdentityTitle: 'Zobrazujem sa dvakrát?',
    mergeIdentityDesc: 'Ak sa vidíš vo výlete pod starým fiktívnym menom, klikni na neho a zlúčime ho s tvojim skutočným menom.',
    thatsAlsoMe: 'To som ja',
    mergedFictionalMember: 'Zlúčené. Tvoje meno je teraz',
    exportVisitsCsv: 'Export návštev do CSV',
    purgePresence: 'Vyčistiť prítomnosť staršiu ako 7 dní',
    backToTripsAdmin: 'Späť do výletov',
    adminSpamLog: 'Spam pokusy',
    adminSpamLogEmpty: 'Žiadne spam pokusy.',
    adminSpamLogReason: 'Dôvod',
    adminSpamLogEmail: 'Email',
    adminSpamLogClose: 'Zavrieť',
    adminSpamLogClearAll: 'Vymazať všetky',
    adminSpamLogClearConfirm: 'Naozaj vymazať všetky spam záznamy?',
    adminSpamLogMessage: 'Správa',
    spamReasonInvalidFormat: 'Neplatný email',
    spamReasonNoMx: 'Neplatná doména',
    emailVerified: 'Overený',
    emailUnverified: 'Neoverený',
    adminUnverifiedTitle: 'Neoverené registrácie',
    adminUnverifiedEmpty: 'Všetci používatelia majú overený email.',
    adminUnverifiedRegistered: 'Registrovaný:',
    adminUnverifiedLastLogin: 'Posledné prihlásenie:',
    adminDeletedAccountsTitle: 'Vymazané účty',
    adminDeletedAccountsEmpty: 'Žiadne vymazané účty.',
    removeSelfWarningLead: '⚠️ Ak sa odstránite:',
    removeSelfWarningSolo: 'Si jediný člen, výlet bude vymazaný.',
    removeSelfInfoLead: 'ℹ️ Ak sa odstránite:',
    removeSelfInfoTransfer: 'Vlastníctvo preberá',
    anotherMember: 'ďalší člen',
    accountDeleteRequiresServer: 'Vymazanie účtu vyžaduje serverovú funkciu (service role).',
    accountDeleteConfirm: 'Naozaj chceš vymazať účet? Táto akcia je nenávratná.',
    accountDeleteSuccess: 'Účet bol vymazaný.',
    accountDeleteFailed: 'Vymazanie účtu zlyhalo. Skús znova.',
    supabaseNotConfigured: 'Supabase nie je nastavene. Doplnenie .env je povinne.',
    supabaseNotConfiguredShort: 'Supabase nie je nastavene.',
    enterEmailPassword: 'Zadaj email aj heslo.',
    loginSuccess: 'Prihlásenie úspešne.',
    registrationSuccess: 'Registrácia prebehla. Skontroluj email pre potvrdenie účtu.',
    registrationSuccessInstant: 'Registrácia prebehla a si prihlásený.',
    registrationPendingLocalAccess: 'Konto bolo vytvorené. Potvrzovací email bol odoslaný znova a do appky si vpustený dočasne. Po potvrdení emailu sa prihláš bez obmedzení.',
    registrationCreatedNotice: 'Užívateľ je vytvorený. Potvrzovací email príde do pár minút.',
    registrationCreatedAction: 'Po kliknutí na OK ťa pustíme do appky.',
    registrationNoticeLead: 'Môžeš pokračovať hneď teraz. Overenie emailu si dokončíš popri používaní aplikácie.',
    registrationNoticeEmailHint: 'Potvrdzovací email si nechaj otvorený. Ak ho nevidíš, skontroluj aj spam alebo promo priečinok.',
    registrationNoticeAccessTitle: 'Čo sa stane po kliknutí',
    registrationNoticeAccessBody: 'Otvorí sa tvoj pracovný priestor a môžeš hneď vytvárať alebo otvárať výlety.',
    registrationNoticeButton: 'Pokračovať do aplikácie',
    emailVerificationCompleted: 'Email bol overený. Prihlásenie je dokončené.',
    verificationEmailResent: 'Email ešte nie je potvrdený. Poslali sme nový verifikačný email.',
    verificationEmailResendFailed: 'Email ešte nie je potvrdený a nepodarilo sa poslať nový verifikačný email.',
    loggedOut: 'Odhlásené.',
    enterEmailFirst: 'Najprv zadaj email.',
    resetEmailSent: 'Poslali sme email na obnovu hesla.',
    inviteNameTaken: 'Meno je obsadené. Vyber iné meno.',
    genericTryAgain: 'Nastala chyba. Skúste znova.',
    welcomeAdded: 'Vitaj! Bol si pridaný do výletu',
    ownerNewMemberTitleSuffix: 'nový člen',
    ownerNewMemberBody: 'sa pridal(a) do výletu.',
    inviteAcceptedTitleSuffix: 'prijatá pozvánka',
    inviteAcceptedBody: 'prijal(a) pozvánku do výletu.',
    adminAnnouncementSaveFailed: 'Uloženie admin oznamu zlyhalo.',
    adminAnnouncementSaved: 'Admin oznam bol uložený.',
    chatExtensionRequest: 'Požiadať o rozšírenie',
    chatExtensionRequestSent: 'Žiadosť odoslaná. Čaká sa na schválenie.',
    chatExtensionApprove: 'Schváliť (+10)',
    chatExtensionReject: 'Zamietnuť',
    chatExtensionRequests: 'Žiadosti o rozšírenie chatu',
    chatExtensionNoRequests: 'Žiadne čakajúce žiadosti.',
    chatExtensionNotifTitle: 'Žiadosť o rozšírenie chatu',
    chatExtensionNotifBody: 'žiada o rozšírenie chatu AI asistenta',
    addAdminRoleFailed: 'Nepodarilo sa pridať admin rolu.',
    removeAdminRoleFailed: 'Nepodarilo sa odobrať admin rolu.',
    userRoleUpdated: 'Rola používateľa bola upravená.',
    purgePresenceFailed: 'Čistenie prítomnosti zlyhalo.',
    purgePresenceDone: 'Staré záznamy prítomnosti boli vyčistené.',
    noVisitsForExport: 'Nie sú dáta na export návštev.',
    tripCreated: 'Výlet bol vytvorený.',
    onlyMemberTripDeleted: 'Si jediný člen výletu. Výlet bol vymazaný.',
    ownershipTransferredAndRemoved: 'Vlastníctvo výletu prebrala osoba',
    removedFromTrip: 'Si odstránený(á) z výletu.',
    memberRemoved: 'bol(a) odstránený(á) z výletu.',
    tripDeleted: 'Výlet bol vymazaný.',
    tripDeletedByOwner: 'Výlet bol vymazaný vlastníkom.',
    tripAutoArchivedTitle: 'Výlet bol archivovaný',
    tripAutoArchivedBody: 'Výlet bol automaticky archivovaný po 7 dňoch bez nových výdavkov.',
    tripAutoArchivedInfo: 'bol automaticky archivovaný (7 dní bez výdavkov).',
    tripsAutoArchivedInfo: 'výlety boli automaticky archivované (7 dní bez výdavkov).',
    identityNow: 'Tvoja identita v tomto výlete je teraz',
    invitePreparedFor: 'Pozvánka pre',
    inviteCodeLabel: 'Kód:',
    inviteCopied: 'Pozvánka skopírovaná do schránky!',
    inviteSubject: 'Pozvánka na výlet:',
    inviteEmailText: 'Ahoj!\n\nChcem ťa pozvať na môj výlet',
    clickLinkBelow: 'Klikni na odkaz nižšie:',
    lookingForward: 'Teším sa na teba!',
    clickLink: 'Klikni na odkaz:',
    tripLabel: 'Výlet',
    invalidCode: 'Kód neexistuje. Skontroluj ho a skús znova.',
    nameAlreadyInGroup: 'už je v tejto skupine. Skús iné meno.',
    inviteAcceptedJoin: 'prijal(a) pozvánku do výletu.',
    joinedTripInfo: 'sa pridal(a) do výletu.',
    transactionUpdatedInfo: 'Transakcia bola upravená.',
    transactionUpdatedTitle: 'Transakcia upravená',
    newTransactionTitle: 'Nová transakcia',
    browserNoNotifications: 'Tento prehliadač nepodporuje notifikácie.',
    notificationsHttpsOnly: 'Notifikácie fungujú iba na HTTPS doméne.',
    notificationsBlocked: 'Notifikácie sú blokované v prehliadači. Povoľ ich v nastaveniach stránky.',
    notificationsDenied: 'Notifikácie neboli povolené.',
    notificationSendError: 'Chyba pri posielaní notifikácie:',
    newTransactionInTrip: 'Nová transakcia v',
    addedExpense: 'pridal(a) výdavok',
    transactionUpdatedInTrip: 'Upravená transakcia v',
    updatedExpense: 'upravil(a) výdavok',
    transactionDeletedInTrip: 'Vymazaná transakcia v',
    deletedExpense: 'vymazal(a) výdavok',
    old: 'Pôvodné',
    new: 'Nové',
    noDate: 'Bez dátumu',
    member1: '1 člen',
    membersPlural: 'členov',
    members2to4suffix: 'členovia',
    closeTripBtn: 'Uzavrieť výlet',
    reopenTripBtn: 'Znovu otvoriť',
    tripClosedLabel: 'Uzavretý',
    closeTripConfirm: 'Naozaj uzavrieť výlet? Výdavky budú read-only a nebude možné ich upravovať.',
    closingTripMsg: 'Uzatváram výlet...',
    aiSummaryTitle: 'AI súhrn výletu',
    aiSummaryGenerating: 'Generujem súhrn...',
    convertToEurBtn: 'Prepočítať na EUR',
    convertingMsg: 'Prepočítavam...',
    convertedMsg: 'Výdavky boli prepočítané na EUR.',
    categoryFood: 'Jedlo',
    categoryTransport: 'Doprava',
    categoryAccom: 'Ubytovanie',
    categoryFun: 'Zábava',
    categoryShopping: 'Nákupy',
    categoryHealth: 'Zdravie',
    categorySport: 'Šport',
    categoryKultura: 'Kultúra',
    categoryTech: 'Technika',
    categoryOther: 'Ostatné',
    categoryTransfer: 'Prevod',
    categoryBreakdown: 'Kategórie výdavkov',
  },
  en: {
    resumingSession: 'Resuming session',
    checkingSavedLogin: 'Checking saved login.',
    appName: 'Split Pay',
    appTagline: 'Simple expense splitting among friends',
    inviteBannerTitle: "You've been invited to a trip!",
    inviteBannerDesc: 'After signing in or registering, you will choose a name and join the trip.',
    signIn: 'Sign In',
    createAccount: 'Create Account',
    signInSubtitle: 'Welcome back! Sign in to your account.',
    registerSubtitle: 'Register and start using Split Pay on the web.',
    name: 'Name',
    namePlaceholder: 'Enter your name',
    email: 'Email',
    emailPlaceholder: 'Enter your email',
    password: 'Password',
    passwordPlaceholder: 'Enter your password',
    forgotPassword: 'Forgot password?',
    resetPasswordTitle: 'Set a new password',
    resetPasswordSubtitle: 'Enter a new password for your account.',
    confirmPassword: 'Confirm password',
    confirmPasswordPlaceholder: 'Repeat your new password',
    saveNewPasswordBtn: 'Save new password',
    passwordResetSuccess: 'Password was updated successfully. Sign in with your new password.',
    passwordMismatch: 'Passwords do not match.',
    passwordTooShort: 'Password must be at least 6 characters long.',
    resetLinkExpired: 'Recovery link is invalid or expired. Request a new one.',
    signInBtn: 'Sign in',
    createAccountBtn: 'Create account',
    or: 'or',
    continueWithGoogle: 'Continue with Google',
    noAccount: "Don't have an account?",
    alreadyHaveAccount: 'Already have an account?',
    myProfile: 'My Profile',
    myTrips: 'My Trips',
    adminSection: 'Admin Section',
    notificationsOn: 'Notifications: on',
    notificationsOff: 'Notifications: off',
    deleteAccount: 'Delete Account',
    signOut: 'Sign Out',
    language: 'Language',
    ibanLabel: 'IBAN',
    ibanPlaceholder: 'SKxx xxxx xxxx xxxx xxxx xxxx',
    saveIbanBtn: 'Save IBAN',
    ibanSaved: 'IBAN was saved.',
    ibanInvalid: 'Invalid IBAN. Please check the format.',
    memberProfileTitle: 'Member profile',
    profileNotFound: 'Member profile does not exist yet.',
    copyIbanBtn: 'Copy IBAN',
    ibanNotSet: 'IBAN is not set.',
    ibanCopied: 'IBAN copied.',
    contactSupport: 'Contact Support',
    supportAuthor: 'Support author',
    openRevolutProfile: 'Open Revolut profile',
    tutorialBtn: 'Get started',
    tutorialDesc: 'Interactive 5-step tutorial',
    guideBtn: 'Guide',
    guideTitle: 'How to add app to home screen',
    guideIntro: 'Choose your device and follow the steps. The app will then open like a standalone app.',
    guideIosBtn: 'iOS',
    guideAndroidBtn: 'Android',
    guideStep1Ios: 'Open Split Pay in Safari.',
    guideStep2Ios: 'Tap Share (square icon with arrow up).',
    guideStep3Ios: 'Choose Add to Home Screen.',
    guideStep4Ios: 'Confirm the name and tap Add.',
    guideStep1Android: 'Open Split Pay in Chrome.',
    guideStep2Android: 'Tap menu (three dots in the top-right).',
    guideStep3Android: 'Choose Add to Home screen or Install app.',
    guideStep4Android: 'Confirm Add/Install.',
    supportSubject: 'Subject',
    supportMessage: 'Message',
    supportMessagePlaceholder: 'Describe what you need help with...',
    supportSend: 'Send to support',
    supportSending: 'Sending...',
    supportSent: 'Message was sent to support.',
    supportSendFailed: 'Message could not be sent. Please try again.',
    supportInvalidEmail: 'Please enter a valid email address.',
    supportSmtpMissing: 'Support is not configured correctly (SMTP). Contact the administrator.',
    supportSmtpAuthFailed: 'Support mailbox login failed. Check SMTP credentials.',
    supportSmtpUnreachable: 'SMTP server is temporarily unreachable. Please try again later.',
    supportEmailLabel: 'Your email',
    heroTitle: 'Trips, budget and settlements without chaos',
    heroDesc: 'Create a trip, invite people via code and keep expenses under control from the first purchase to the last settlement.',
    quickInvites: 'Quick Invites',
    fairSplit: 'Fair Split',
    instantBalance: 'Instant Balance',
    loggedInEmail: 'Logged in:',
    showArchived: 'Show archived trips',
    expenses: 'expenses',
    totalMeta: 'Total',
    archived: 'Archived',
    overviewTab: 'Overview',
    newTrip: 'New Trip',
    createTrip: 'Create Trip',
    createTripDesc: 'Create a new trip and get a sharing code.',
    joinTripEyebrow: 'Join',
    joinTripTitle: 'Join a Trip',
    joinTripDesc: 'Have a code? Open the form and join.',
    tripName: 'Trip name',
    tripNamePlaceholder: 'E.g. Paris weekend',
    date: 'Date',
    createTripBtn: 'Create trip',
    createTripHint: 'After creating, you will immediately get an invite code to share.',
    close: 'Close',
    yourName: 'Your name',
    yourNamePlaceholder: 'E.g. Martin',
    organizerCode: "Organizer's code",
    codePlaceholder: 'E.g. A1B2C3',
    joinBtn: 'Join',
    joinHint: 'If you opened a QR link, the code is filled in automatically. You can join as a new member or as an existing member if you were invited.',
    tripDetail: 'Trip Detail',
    tripSettled: 'Trip is settled',
    backToTrips: '← Back to my trips',
    tripCode: 'Trip code:',
    settings: 'Settings',
    membersTab: 'Members',
    invitesTab: 'Invites',
    expensesTab: 'Expenses',
    balanceTab: 'Balance',
    activityTab: 'Activity',
    statsTab: 'Statistics',
    noExpensesYet: 'No expenses yet.',
    tripOverview: 'Trip Overview',
    basicInfo: 'Basic Information',
    addExpense: 'Add Expense',
    membersLabel: 'Members',
    expensesLabel: 'Expenses',
    invitesLabel: 'Invites',
    totalSpent: 'Total Spent',
    tripMembers: 'Trip Members',
    recentExpenses: 'Recent Expenses',
    noRecords: 'No records yet.',
    paidBy: 'Paid by',
    team: 'Team',
    membersTitle: 'Trip Members',
    memberNamePlaceholder: 'Member name',
    addBtn: 'Add',
    leaveTripBtn: 'Leave trip',
    leftTripInfo: 'You left the trip.',
    historyMembersTitle: 'Members from history',
    historyMembersHint: 'Quickly add someone who was already in another trip.',
    memberAddedInAppTitle: 'You were added to a trip',
    memberAddedInAppBody: 'added you to trip',
    memberAddedAt: 'When',
    notificationAcknowledge: 'Got it',
    ownerLabel: 'Owner',
    confirmIdentity: 'Confirm your identity',
    guestPickInvite: 'If you are a guest, pick one of the invites:',
    thatsMe: "That's me",
    invitation: 'Invite',
    invitesTitle: 'Invites & Access',
    code: 'Code',
    copy: 'Copy',
    shareEmail: 'Email',
    shareWhatsApp: 'WhatsApp',
    shareSms: 'SMS',
    hideQr: 'Hide QR',
    showQr: 'QR Code',
    contactPlaceholder: 'Contact (optional)',
    namePlaceholderInvite: 'Name',
    scanQr: 'Scan QR to join',
    expensesTitle: 'Expense Overview & History',
    addExpenseBtn: '+ Add Expense',
    expenseHistory: 'Expense History',
    showMoreExpenses: 'Show more',
    expenseDetailTitle: 'Expense detail',
    expenseHistoryTimeline: 'Change history',
    noExpenseHistory: 'No change history yet.',
    eventCreated: 'Created',
    eventUpdated: 'Updated',
    eventDeleted: 'Deleted',
    sent: 'sent',
    participantsLabel: 'participants:',
    editBtn: 'Edit',
    deleteBtn: 'Delete',
    balanceTitle: 'Who owes whom',
    balanceSwitcher: 'Balance switcher',
    allTab: 'All',
    settlementsTab: 'Settlements',
    currentBalances: 'Current balance states',
    noMembers: 'No members.',
    receives: 'receives',
    pays: 'pays',
    receivesTotal: 'receives in total',
    paysTotal: 'pays in total',
    fewestTransfers: 'Fewest transfers to settle',
    settlementsTitle: 'Recommended settlements',
    settlementAction: 'sends',
    allSettled: 'Everything is settled.',
    balanceTip: 'Share your IBAN or settle in cash.',
    markAsPaid: 'Mark as paid ✓',
    paymentRecorded: 'Payment recorded in history.',
    offlineBanner: 'You are offline – showing saved data.',
    copyRecipientIbanBtn: 'Copy recipient IBAN',
    tripNeedsSettlementTitle: 'Trip still needs settlement',
    tripNeedsSettlementBody: 'This trip ended more than a week ago, but finances are still not settled. Complete settlements first and archive the trip afterwards.',
    understoodBtn: 'OK',
    expenseModalEyebrow: 'Expense',
    editExpenseTitle: 'Edit Expense',
    addExpenseTitle: 'Add Expense',
    newExpense: 'New Expense',
    transferOption: 'Transfer (settlement)',
    transferNamePlaceholder: 'Transfer name (optional)',
    expenseNamePlaceholder: 'Expense name',
    amountPlaceholder: 'Amount',
    sendTo: 'Send to',
    equalSplit: 'Equal',
    individualSplit: 'Individual',
    individualSum: 'Sum of individual amounts:',
    totalLabel: 'Total:',
    saveChanges: 'Save transaction changes',
    cancelEdit: 'Cancel edit',
    inviteEyebrow: 'Invitation',
    joinTripModal: 'Join Trip',
    invitedToTrip: 'You are invited to the trip',
    chooseNameDesc: 'Choose the name you will appear under in the trip.',
    availableSlots: 'Available slots:',
    customName: '+ Custom name',
    yourNameInTrip: 'Your name in the trip',
    yourNameInTripPlaceholder: 'E.g. Jano',
    adding: 'Adding...',
    joinTripConfirm: 'Join Trip',
    tripSettingsEyebrow: 'Trip Settings',
    currency: 'Currency',
    tripColor: 'Trip Color',
    archiveTrip: 'Archive trip',
    deleteTrip: 'Delete trip',
    adminTitle: 'Administration',
    adminCenterTitle: 'Application Control Center',
    adminCenterDesc: 'Extended usage overview and permission management.',
    visitsBtn: 'Visits',
    visitsModalTitle: 'Visits overview',
    visitsDay: 'Today',
    visitsWeek: 'Week',
    visitsMonth: 'Month',
    visitsYear: 'Year',
    totalVisits: 'Total visits',
    visits24h: 'Visits in 24h',
    activeUsers5m: 'Active users (5 min)',
    usersInSystem: 'Users in system',
    storedTripStates: 'Stored trip states',
    panelLoad: 'Panel load',
    loading: 'Loading',
    done: 'Done',
    adminAnnouncementForAll: 'Admin announcement for everyone',
    adminAnnouncementPlaceholder: 'Write an announcement for users here',
    showAnnouncementInApp: 'Show announcement in app',
    saveAnnouncement: 'Save announcement',
    topUsersVisits: 'Top users by visits (last 500)',
    noDataYet: 'No data yet.',
    activeUsersRoles: 'Active users and roles',
    noUsersYet: 'No users yet.',
    lastSeen: 'Last seen:',
    roleAdmin: 'Admin',
    roleUser: 'User',
    demoteToUser: 'Demote to user',
    promoteToAdmin: 'Promote to admin',
    recentVisitsTitle: 'Recent visits',
    noVisitsYet: 'No visits yet.',
    activeTrips: 'Active trips',
    noActiveTrips: 'No active trips yet.',
    archivedTrips: 'Archived trips',
    noArchivedTrips: 'No archived trips yet.',
    openBtn: 'Open',
    slovak: 'Slovak',
    english: 'English',
    mergeIdentityTitle: 'Listed twice?',
    mergeIdentityDesc: 'If you see yourself under an old fictional name, click it to merge with your real name.',
    thatsAlsoMe: "That's also me",
    mergedFictionalMember: 'Merged. Your name is now',
    exportVisitsCsv: 'Export visits to CSV',
    purgePresence: 'Clean presence older than 7 days',
    backToTripsAdmin: 'Back to trips',
    adminSpamLog: 'Spam attempts',
    adminSpamLogEmpty: 'No spam attempts.',
    adminSpamLogReason: 'Reason',
    adminSpamLogEmail: 'Email',
    adminSpamLogClose: 'Close',
    adminSpamLogClearAll: 'Clear all',
    adminSpamLogClearConfirm: 'Really delete all spam log entries?',
    adminSpamLogMessage: 'Message',
    spamReasonInvalidFormat: 'Invalid email',
    spamReasonNoMx: 'Invalid domain',
    emailVerified: 'Verified',
    emailUnverified: 'Unverified',
    adminUnverifiedTitle: 'Unverified registrations',
    adminUnverifiedEmpty: 'All users have verified their email.',
    adminUnverifiedRegistered: 'Registered:',
    adminUnverifiedLastLogin: 'Last login:',
    adminDeletedAccountsTitle: 'Deleted accounts',
    adminDeletedAccountsEmpty: 'No deleted accounts.',
    removeSelfWarningLead: '⚠️ If you remove yourself:',
    removeSelfWarningSolo: 'You are the only member, the trip will be deleted.',
    removeSelfInfoLead: 'ℹ️ If you remove yourself:',
    removeSelfInfoTransfer: 'Ownership will transfer to',
    anotherMember: 'another member',
    accountDeleteRequiresServer: 'Deleting account requires a server function (service role).',
    accountDeleteConfirm: 'Really delete your account? This action is irreversible.',
    accountDeleteSuccess: 'Account deleted.',
    accountDeleteFailed: 'Account deletion failed. Please try again.',
    supabaseNotConfigured: 'Supabase is not configured. .env setup is required.',
    supabaseNotConfiguredShort: 'Supabase is not configured.',
    enterEmailPassword: 'Enter email and password.',
    loginSuccess: 'Sign in successful.',
    registrationSuccess: 'Registration completed. Check your email to confirm the account.',
    registrationSuccessInstant: 'Registration completed and you are signed in.',
    registrationPendingLocalAccess: 'Account was created. Verification email was resent and temporary app access is enabled. After email confirmation, sign in for full access.',
    registrationCreatedNotice: 'User account has been created. Verification email should arrive in a few minutes.',
    registrationCreatedAction: 'After clicking OK, you can enter the app.',
    registrationNoticeLead: 'You can continue right away. Email verification can be finished while you already use the app.',
    registrationNoticeEmailHint: 'Keep the verification email nearby. If you do not see it, check spam or promotions as well.',
    registrationNoticeAccessTitle: 'What happens next',
    registrationNoticeAccessBody: 'Your workspace opens immediately and you can start creating or joining trips.',
    registrationNoticeButton: 'Continue to the app',
    emailVerificationCompleted: 'Email has been verified. Sign-in is now complete.',
    verificationEmailResent: 'Email is not confirmed yet. We sent a new verification email.',
    verificationEmailResendFailed: 'Email is not confirmed and resending verification email failed.',
    loggedOut: 'Signed out.',
    enterEmailFirst: 'Enter email first.',
    resetEmailSent: 'We sent a password reset email.',
    inviteNameTaken: 'Name is already taken. Choose a different name.',
    genericTryAgain: 'An error occurred. Please try again.',
    welcomeAdded: 'Welcome! You were added to trip',
    ownerNewMemberTitleSuffix: 'new member',
    ownerNewMemberBody: 'joined the trip.',
    inviteAcceptedTitleSuffix: 'invite accepted',
    inviteAcceptedBody: 'accepted the trip invitation.',
    adminAnnouncementSaveFailed: 'Saving admin announcement failed.',
    adminAnnouncementSaved: 'Admin announcement was saved.',
    chatExtensionRequest: 'Request extension',
    chatExtensionRequestSent: 'Request sent. Waiting for admin approval.',
    chatExtensionApprove: 'Approve (+10)',
    chatExtensionReject: 'Reject',
    chatExtensionRequests: 'Chat extension requests',
    chatExtensionNoRequests: 'No pending requests.',
    chatExtensionNotifTitle: 'Chat extension request',
    chatExtensionNotifBody: 'requested a chat AI extension',
    addAdminRoleFailed: 'Failed to add admin role.',
    removeAdminRoleFailed: 'Failed to remove admin role.',
    userRoleUpdated: 'User role has been updated.',
    purgePresenceFailed: 'Presence cleanup failed.',
    purgePresenceDone: 'Old presence records were cleaned.',
    noVisitsForExport: 'No visit data to export.',
    tripCreated: 'Trip was created.',
    onlyMemberTripDeleted: 'You are the only trip member. The trip was deleted.',
    ownershipTransferredAndRemoved: 'Trip ownership was transferred to',
    removedFromTrip: 'You were removed from the trip.',
    memberRemoved: 'was removed from the trip.',
    tripDeleted: 'Trip was deleted.',
    tripDeletedByOwner: 'The trip was deleted by the owner.',
    tripAutoArchivedTitle: 'Trip archived',
    tripAutoArchivedBody: 'The trip was automatically archived after 7 days without new expenses.',
    tripAutoArchivedInfo: 'was automatically archived (7 days without expenses).',
    tripsAutoArchivedInfo: 'trips were automatically archived (7 days without expenses).',
    identityNow: 'Your identity in this trip is now',
    invitePreparedFor: 'Invite for',
    inviteCodeLabel: 'Code:',
    inviteCopied: 'Invite copied to clipboard!',
    inviteSubject: 'Trip invitation:',
    inviteEmailText: 'Hi!\n\nI want to invite you to my trip',
    clickLinkBelow: 'Click the link below:',
    lookingForward: 'Looking forward to it!',
    clickLink: 'Click the link:',
    tripLabel: 'Trip',
    invalidCode: 'Code does not exist. Check it and try again.',
    nameAlreadyInGroup: 'is already in this group. Try another name.',
    inviteAcceptedJoin: 'accepted the invitation to the trip.',
    joinedTripInfo: 'joined the trip.',
    transactionUpdatedInfo: 'Transaction was updated.',
    transactionUpdatedTitle: 'Transaction updated',
    newTransactionTitle: 'New transaction',
    browserNoNotifications: 'This browser does not support notifications.',
    notificationsHttpsOnly: 'Notifications work only on HTTPS.',
    notificationsBlocked: 'Notifications are blocked in the browser. Enable them in site settings.',
    notificationsDenied: 'Notifications were not allowed.',
    notificationSendError: 'Error sending notification:',
    newTransactionInTrip: 'New transaction in',
    addedExpense: 'added expense',
    transactionUpdatedInTrip: 'Updated transaction in',
    updatedExpense: 'updated expense',
    transactionDeletedInTrip: 'Deleted transaction in',
    deletedExpense: 'deleted expense',
    old: 'Old',
    new: 'New',
    noDate: 'No date',
    member1: '1 member',
    membersPlural: 'members',
    members2to4suffix: 'members',
    closeTripBtn: 'Close trip',
    reopenTripBtn: 'Reopen',
    tripClosedLabel: 'Closed',
    closeTripConfirm: 'Really close the trip? Expenses will be read-only.',
    closingTripMsg: 'Closing trip...',
    aiSummaryTitle: 'AI trip summary',
    aiSummaryGenerating: 'Generating summary...',
    convertToEurBtn: 'Convert to EUR',
    convertingMsg: 'Converting...',
    convertedMsg: 'Expenses converted to EUR.',
    categoryFood: 'Food',
    categoryTransport: 'Transport',
    categoryAccom: 'Accommodation',
    categoryFun: 'Entertainment',
    categoryShopping: 'Shopping',
    categoryHealth: 'Health',
    categorySport: 'Sport',
    categoryKultura: 'Culture',
    categoryTech: 'Tech',
    categoryOther: 'Other',
    categoryTransfer: 'Transfer',
    categoryBreakdown: 'Expense categories',
  },
} as const;

function formatTripDate(value: string, lang: Lang) {
  const trimmed = value.trim();
  if (!trimmed) return T[lang].noDate;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00`);
    if (Number.isFinite(date.getTime())) {
      const locale = lang === 'en' ? 'en-GB' : 'sk-SK';
      return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    }
  }

  return trimmed;
}

function tripDateToInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

type Invite = {
  id: string;
  name: string;
  contact: string;
  status: 'Pozvany' | 'Prijate';
};

type Member = {
  id?: string;
  name: string;
  email?: string;
};

type TripExpense = Expense & {
  id: string;
  title: string;
  date?: string | null;
  deletedAt?: string | null;
  category?: string | null;
  originalCurrency?: string | null;
  originalAmount?: number | null;
};

type TripExpenseRow = {
  trip_id: string;
  expense_id: string;
  payload: TripExpense;
  updated_at: string;
};

type ExpenseHistoryPayload = TripExpense | { old?: TripExpense | null; new?: TripExpense | null } | null;

type ExpenseHistoryEvent = {
  id: number;
  trip_id: string;
  expense_id: string;
  event_type: 'created' | 'updated' | 'deleted';
  payload: ExpenseHistoryPayload;
  created_at: string;
};

type Trip = {
  id: string;
  name: string;
  date: string;
  owner: string;
  ownerId?: string | null;
  currency: 'EUR' | 'USD' | 'CZK' | string;
  color: string;
  archived: boolean;
  inviteCode: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  status?: 'active' | 'closed';
  aiSummary?: string | null;
  closedAt?: string | null;
  members: (Member | string)[];
  expenses: TripExpense[];
  pendingInvites: Invite[];
  chatHistory?: { role: 'user' | 'assistant'; content: string; author?: string }[];
  chatLimit?: number;
  chatExtensionRequested?: boolean;
};

type ExpenseDraft = {
  title: string;
  amount: string;
  date: string;
  expenseType: 'expense' | 'transfer';
  payer: string;
  transferTo: string;
  participants: string[];
  splitType: 'equal' | 'individual' | 'shares';
  participantWeights: Record<string, number>;
  participantAmounts: Record<string, string | number>;
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

type AdminTripStateRow = {
  user_id: string;
  state_json: { trips?: Trip[]; selectedTripId?: string } | null;
  updated_at?: string;
};

type AdminTripSummary = Trip & {
  sourceUserId: string;
  updatedAt: string;
};

type MemberAddNotification = {
  id: string;
  target_user_id: string;
  trip_id: string;
  trip_name: string;
  member_name: string;
  actor_name: string;
  created_at: string;
  acknowledged_at: string | null;
};

type SpamLogEntry = {
  id: string;
  email: string;
  subject: string;
  message: string;
  reason: string;
  created_at: string;
};

type AdminAuthUser = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  provider?: string;
  is_oauth?: boolean;
};

type DeletedAccountEntry = {
  id: string;
  email: string;
  deleted_at: string;
};

type MemberProfileView = {
  userId: string;
  name: string;
  email: string;
  iban: string;
};

type PendingVerification = {
  email: string;
  password: string;
  fullName: string;
};

type AppScreen = 'trips' | 'trip-detail' | 'admin';
type TripDetailScreen = 'overview' | 'members' | 'invites' | 'expenses' | 'balances' | 'activity' | 'stats';

type StaleTripWarning = {
  tripId: string;
  tripName: string;
};

function detailScreenFromPath(value?: string): TripDetailScreen {
  if (value === 'members') return 'members';
  if (value === 'invites') return 'invites';
  if (value === 'expenses') return 'expenses';
  if (value === 'balances') return 'balances';
  if (value === 'activity') return 'activity';
  if (value === 'stats') return 'stats';
  return 'overview';
}

function tripPath(tripKey: string, detailScreen: TripDetailScreen = 'overview') {
  const safeTripKey = encodeURIComponent(tripKey);
  if (detailScreen === 'overview') return `/trip/${safeTripKey}`;
  return `/trip/${safeTripKey}/${detailScreen}`;
}

function createTrip(name: string, date: string, inviteCode: string, owner: string = 'Ty', ownerId?: string | null): Trip {
  return {
    id: makeId(),
    name,
    date,
    owner,
    ownerId: ownerId || null,
    currency: 'EUR',
    color: '#2c79f6',
    archived: false,
    inviteCode,
    deletedAt: null,
    deletedBy: null,
    members: [ownerId ? { id: ownerId, name: owner === 'Ty' ? 'Ty' : owner } : { name: owner === 'Ty' ? 'Ty' : owner }],
    expenses: [],
    pendingInvites: [],
  };
}

function normalizeTrip(trip: Trip): Trip {
  const owner = trip.owner || 'Ty';
  const ownerKey = owner.trim().toLowerCase();
  const rawMembers = Array.isArray(trip.members) ? trip.members : [];
  const dedupedMembers: (Member | string)[] = [];
  const seen = new Set<string>();

  for (const member of rawMembers) {
    const cleaned = typeof member === 'string' ? (member || '').trim() : (member?.name || '').trim();
    if (!cleaned) continue;
    const mapped = cleaned.toLowerCase() === 'ty' && ownerKey && ownerKey !== 'ty' ? owner : cleaned;
    const key = mapped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Preserve Member objects (with id/email) when only the name needs remapping
    if (typeof member === 'string') {
      dedupedMembers.push(mapped);
    } else {
      dedupedMembers.push(mapped !== cleaned ? { ...member, name: mapped } : member);
    }
  }

  if (ownerKey && ownerKey !== 'ty' && !seen.has(ownerKey)) {
    dedupedMembers.unshift(owner);
  }

  // When "Ty" was renamed to the real owner name, update expenses that still reference "Ty"
  const remapName = (name: string) =>
    ownerKey && ownerKey !== 'ty' && name.trim().toLowerCase() === 'ty' ? owner : name;
  const remapParticipant = (p: any): string => remapName(memberNameOf(p));

  const normalizedExpenses = ownerKey && ownerKey !== 'ty'
    ? (trip.expenses || []).map((expense) => ({
        ...expense,
        payer: remapName(expense.payer || ''),
        participants: (expense.participants || []).map(remapParticipant),
        ...(expense.participantAmounts
          ? {
              participantAmounts: Object.fromEntries(
                Object.entries(expense.participantAmounts).map(([k, v]) => [remapName(k), v])
              ),
            }
          : {}),
        ...(expense.participantWeights
          ? {
              participantWeights: Object.fromEntries(
                Object.entries(expense.participantWeights).map(([k, v]) => [remapName(k), v])
              ),
            }
          : {}),
      }))
    : trip.expenses;

  return {
    ...trip,
    date: trip.date || '',
    owner,
    currency: trip.currency || 'EUR',
    color: trip.color || '#2c79f6',
    inviteCode: (trip.inviteCode || makeInviteCode()).toUpperCase(),
    archived: Boolean(trip.archived),
    deletedAt: trip.deletedAt || null,
    deletedBy: trip.deletedBy || null,
    members: dedupedMembers,
    expenses: normalizedExpenses,
  };
}

function memberNameOf(m: Member | string) {
  return typeof m === 'string' ? m : (m?.name || '');
}

// Rename the current user's real name to "Ty" placeholder in a trip's members and expenses
// so that balance computation always uses a consistent key.
function canonicalizeSelfName(trip: Trip, selfKey: string): Trip {
  if (!selfKey || selfKey === 'ty') return trip;

  // Only remap self→"Ty" when the current user IS the trip owner.
  // For non-owner members viewing a shared trip, "Ty" already refers to the owner —
  // converting the viewer's name to "Ty" would collapse both slots into one.
  const ownerKey = (trip.owner || '').trim().toLowerCase();
  if (ownerKey !== selfKey) return trip;

  const toTy = (name: string) => {
    const k = (name || '').trim().toLowerCase();
    return k === selfKey || k === 'ty' ? 'Ty' : name;
  };

  const needsRemap =
    trip.members.some((m) => memberNameOf(m).trim().toLowerCase() === selfKey) ||
    (trip.expenses || []).some(
      (exp) =>
        (exp.payer || '').trim().toLowerCase() === selfKey ||
        (exp.participants || []).some((p) => memberNameOf(p).trim().toLowerCase() === selfKey)
    );

  if (!needsRemap) return trip;

  const seen = new Set<string>();
  const canonicalMembers: (Member | string)[] = [];
  for (const m of trip.members || []) {
    const origName = memberNameOf(m).trim();
    const canonical = toTy(origName);
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Preserve Member objects (with id/email); only remap the name if needed
    if (typeof m === 'string') {
      canonicalMembers.push(canonical);
    } else {
      canonicalMembers.push(canonical !== origName ? { ...m, name: canonical } : m);
    }
  }
  if (ownerKey && ownerKey !== 'ty' && ownerKey !== selfKey && !seen.has(ownerKey)) {
    canonicalMembers.unshift(trip.owner);
    seen.add(ownerKey);
  }
  if ((ownerKey === selfKey || ownerKey === 'ty') && !seen.has('ty')) {
    canonicalMembers.unshift('Ty');
  }

  return {
    ...trip,
    members: canonicalMembers,
    expenses: trip.expenses.map((exp) => ({
      ...exp,
      payer: toTy(exp.payer || ''),
      participants: (exp.participants || []).map((p) => toTy(memberNameOf(p as any))),
      ...(exp.participantAmounts
        ? {
            participantAmounts: Object.fromEntries(
              Object.entries(exp.participantAmounts).map(([k, v]) => [toTy(k), v])
            ),
          }
        : {}),
      ...(exp.participantWeights
        ? {
            participantWeights: Object.fromEntries(
              Object.entries(exp.participantWeights).map(([k, v]) => [toTy(k), v])
            ),
          }
        : {}),
    })),
  };
}

// Expand participants for expenses where only the payer was listed (created before others joined).
// Only expands when the trip now has more members than just the payer — if there are 2+ members
// and only the payer is listed, it was almost certainly created before others joined.
// Does NOT expand for solo trips (1 member) or individual-split expenses (explicit per-person amounts).
function withExpandedParticipants(expenses: TripExpense[], members: string[]): TripExpense[] {
  return expenses.map((expense) => {
    if (expense.splitType === 'individual') return expense;
    const raw = expense.participants && expense.participants.length ? expense.participants : members;
    const onlyPayerListed =
      members.length > 1 &&
      raw.length === 1 &&
      raw[0] &&
      (expense.payer || '').trim().toLowerCase() === memberNameOf(raw[0]).trim().toLowerCase();
    return onlyPayerListed ? { ...expense, participants: members, participantIds: [] } : expense;
  });
}

function inferCategory(title: string): string {
  // strip diacritics so "večera" == "vecera", "šalát" == "salat", etc.
  const t = (title || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/jedl|restaur|pizza|burger|salat|obed|raňajk|snidan|vecer|kaviar|kaviaren|\bbar\b|\bpub\b|pivo|vino|wine|food|restaurant|lunch|dinner|breakfast|cafe|coffee|drink|fast.?food|kfc|mcdo|sushi|grill|bistro|bufet|canteen/.test(t)) return 'jedlo';
  if (/taxi|uber|vlak|bus\b|autobus|benzin|parkov|letisk|\blet\b|flight|train|transport|metro|mhd|bolt\b|doprava|autodialna|toll|diaľnic/.test(t)) return 'doprava';
  if (/hotel|hostel|airbnb|ubytov|apartm|\bizba\b|room\b|noclah|nocl|pension|chatka|\bchata\b|resort|motel/.test(t)) return 'ubytovanie';
  if (/kino|bowling|paintball|escape|aquapark|bazen|aqua|lunapark|vodny|atrakci|trampolin|laser/.test(t)) return 'zabava';
  if (/nakup|supermarket|lidl|tesco|billa|kaufland|shopping|market|grocery|obchod|\bdm\b|rossmann|albert|cba/.test(t)) return 'nakupy';
  if (/lekar|lekaren|nemocnic|ambulanci|pharmacy|hospital|zdravi|lieky|zubár|zubar|doktor|doctor|medical|health|optika/.test(t)) return 'zdravie';
  if (/posilovna|gym|fitness|futbal|tenis|plavan|swimming|ski|snowboard|cykl|bike|hike|turistik|sport|workout|trening/.test(t)) return 'sport';
  if (/muzeum|galeria|divadlo|opera|concert|vystava|theater|gallery|kultura|festival|film|kinoteka/.test(t)) return 'kultura';
  if (/telefon|laptop|pocitac|tablet|nabijac|elektronik|tech|phone|cable|gadget|apple|samsung|alza|notino/.test(t)) return 'technika';
  return 'ostatne';
}

function sortTripExpensesByNewest(expenses: TripExpense[]) {
  return [...expenses].sort((left, right) => {
    const leftTs = expenseIdTimestamp(left.id) || 0;
    const rightTs = expenseIdTimestamp(right.id) || 0;
    return rightTs - leftTs;
  });
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
  if (msg.includes('provider is not enabled')) {
    return 'Google provider nie je zapnuty v Supabase Authentication -> Providers.';
  }
  if (msg.includes('redirect') && msg.includes('not allowed')) {
    return 'OAuth redirect URL nie je povolena. Skontroluj Supabase URL Configuration a Google OAuth callback.';
  }
  if (msg.includes('invalid provider')) {
    return 'OAuth provider je nespravne nakonfigurovany.';
  }
  if (msg.includes('error sending confirmation email') || msg.includes('error sending email')) {
    return 'Konto sa vytvorilo, ale potvrdzovaci email sa nepodarilo odoslat.';
  }
  if (msg.includes('network')) return 'Chyba siete. Skus to znova.';
  return message;
}

function isSignupMailDeliveryError(message: string) {
  const msg = message.toLowerCase();
  return (
    msg.includes('error sending confirmation email') ||
    msg.includes('error sending email') ||
    msg.includes('smtp') ||
    msg.includes('mailer')
  );
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
  const pathname = usePathname();
  const [virtualPathname, setVirtualPathname] = useState(pathname || '/');
  const [showStartup, setShowStartup] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Skip startup screen if user is already logged in (cached session exists)
    if (readCachedSession()) return false;
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
  const [showPasswordResetForm, setShowPasswordResetForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [appSession, setAppSession] = useState<AppSession | null>(null);
  const [pendingVerification, setPendingVerification] = useState<PendingVerification | null>(null);
  const [showRegistrationNotice, setShowRegistrationNotice] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [newTripDate, setNewTripDate] = useState('');
  const [newMember, setNewMember] = useState('');
  const [showInviteQr, setShowInviteQr] = useState(false);
  const [showCreateTripModal, setShowCreateTripModal] = useState(false);
  const [showJoinTripModal, setShowJoinTripModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showExpenseDetailModal, setShowExpenseDetailModal] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [selectedExpenseHistory, setSelectedExpenseHistory] = useState<ExpenseHistoryEvent[]>([]);
  const [expenseHistoryLoading, setExpenseHistoryLoading] = useState(false);
  const [showTripSettingsModal, setShowTripSettingsModal] = useState(false);
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [selfIban, setSelfIban] = useState('');
  const [savingIban, setSavingIban] = useState(false);
  const [gravatarHash, setGravatarHash] = useState<string | null>(null);
  const [gravatarFailed, setGravatarFailed] = useState(false);
  const [selfAvatarEmoji, setSelfAvatarEmoji] = useState<string | null>(null);
  const [savingEmoji, setSavingEmoji] = useState(false);
  const [memberProfile, setMemberProfile] = useState<MemberProfileView | null>(null);
  const [memberIbanByName, setMemberIbanByName] = useState<Record<string, string>>({});
  const [dismissedStaleTripWarnings, setDismissedStaleTripWarnings] = useState<Record<string, true>>({});
  const [staleTripWarning, setStaleTripWarning] = useState<StaleTripWarning | null>(null);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showVisitsModal, setShowVisitsModal] = useState(false);
  const [guidePlatform, setGuidePlatform] = useState<'ios' | 'android'>('ios');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof Notification === 'undefined') return false;
    return Notification.permission === 'granted';
  });
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [balanceTab, setBalanceTab] = useState<'all' | 'settlements'>('all');
  const [invitePendingCode, setInvitePendingCode] = useState<string | null>(null);
  const [inviteTrip, setInviteTrip] = useState<{ tripId: string; tripName: string; slots: string[] } | null>(null);
  const [inviteChosenSlot, setInviteChosenSlot] = useState('');
  const [inviteCustomName, setInviteCustomName] = useState('');
  const [inviteUseCustom, setInviteUseCustom] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [visitsCount, setVisitsCount] = useState(0);
  const [visits24hCount, setVisits24hCount] = useState(0);
  const [visitsDayCount, setVisitsDayCount] = useState(0);
  const [visitsWeekCount, setVisitsWeekCount] = useState(0);
  const [visitsMonthCount, setVisitsMonthCount] = useState(0);
  const [visitsYearCount, setVisitsYearCount] = useState(0);
  const [showAllMembersOverflow, setShowAllMembersOverflow] = useState(false);
  const memberAvatarListRef = useRef<HTMLDivElement>(null);
  const [activeUsersCount, setActiveUsersCount] = useState(0);
  const [totalUsersSeen, setTotalUsersSeen] = useState(0);
  const [totalTripsStored, setTotalTripsStored] = useState(0);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminPresence, setAdminPresence] = useState<AdminPresenceRow[]>([]);
  const [recentVisits, setRecentVisits] = useState<AdminVisitRow[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [adminTrips, setAdminTrips] = useState<AdminTripSummary[]>([]);
  const [spamLog, setSpamLog] = useState<SpamLogEntry[]>([]);
  const [spamLogModal, setSpamLogModal] = useState<SpamLogEntry | null>(null);
  const [adminAuthUsers, setAdminAuthUsers] = useState<AdminAuthUser[]>([]);
  const [deletedAccounts, setDeletedAccounts] = useState<DeletedAccountEntry[]>([]);
  const [adminSections, setAdminSections] = useState<Record<string, boolean>>({
    stats: false, announcement: false, users: false, chatExtensions: false,
    trips: false, unverified: false, deletedAccounts: false, spamLog: false,
  });
  const toggleAdminSection = (key: string) => setAdminSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [globalAnnouncement, setGlobalAnnouncement] = useState('');
  const [memberAddNotifications, setMemberAddNotifications] = useState<MemberAddNotification[]>([]);
  const [localStateHydrated, setLocalStateHydrated] = useState(false);
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState<string | null>(null);
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [expenseSortOrder, setExpenseSortOrder] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [isOffline, setIsOffline] = useState(false);
  type ReceiptItem = { name: string; price: number; assignedTo: string };
  const [receiptStep, setReceiptStep] = useState<'upload' | 'analyzing' | 'assign' | null>(null);
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [receiptCurrency, setReceiptCurrency] = useState('EUR');
  const [receiptError, setReceiptError] = useState('');
  const [receiptImagePreview, setReceiptImagePreview] = useState<string | null>(null);
  const [receiptMerchant, setReceiptMerchant] = useState('');
  const [receiptCategory, setReceiptCategory] = useState('');
  const [isClosingTrip, setIsClosingTrip] = useState(false);
  const [isCurrencyConverting, setIsCurrencyConverting] = useState(false);
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'auto';
    return (window.localStorage.getItem(THEME_KEY) as 'auto' | 'light' | 'dark') || 'auto';
  });
  const [editingCategoryExpenseId, setEditingCategoryExpenseId] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ title: string; amount: number; date: string } | null>(null);
    const [lang, setLang] = useState<Lang>(() => {
      if (typeof window === 'undefined') return 'sk';
      return (window.localStorage.getItem(LANG_KEY) as Lang) || 'sk';
    });
  const [dbLoadTick, setDbLoadTick] = useState(0);
  const [draft, setDraft] = useState<ExpenseDraft>({
    title: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
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
  const skipNextSaveRef = useRef(false);
  const expenseSnapshotRef = useRef<Record<string, Record<string, string>>>({});
  const memberSnapshotRef = useRef<Record<string, string[]>>({});
  const inviteStatusSnapshotRef = useRef<Record<string, Record<string, Invite['status']>>>({});
  const tripMetaSnapshotRef = useRef<Record<string, { name: string; owner: string }>>({});
  const notificationsPrimedForUserRef = useRef<string | null>(null);
  const syncRpcMissingWarnedRef = useRef(false);
  const tempSessionWarnedRef = useRef(false);
  const refreshFromDbRef = useRef<(() => Promise<void>) | null>(null);
  const lastPropagatedTripSnapshotRef = useRef<Record<string, string>>({});
  const lastPersistedExpenseSnapshotRef = useRef<Record<string, string>>({});
  const skipExpenseDbWriteRef = useRef(false);
  const deletedExpenseIdsRef = useRef<Set<string>>(new Set());
  const notifiedChatExtensionRef = useRef<Set<string>>(new Set());
  const lastErrorMessageTimeRef = useRef<Record<string, number>>({});
  const appliedJoinCodeRef = useRef('');
  const inviteProcessedRef = useRef(false);
  const profileMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const latestLocalStateRef = useRef('');
  const seenMemberAddNotificationIdsRef = useRef<string[]>([]);
  const seenDeletedTripNoticeIdsRef = useRef<Record<string, true>>({});

  const t = (key: keyof typeof T.sk) => T[lang][key];
  const canSyncWithDb = Boolean(appSession?.userId && isUuid(appSession.userId));

  useEffect(() => {
    setVirtualPathname(pathname || '/');
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onPopState = () => setVirtualPathname(window.location.pathname || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigateInApp(nextPath: string, mode: 'push' | 'replace' = 'push') {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === nextPath) return;

    if (mode === 'replace') {
      window.history.replaceState(null, '', nextPath);
    } else {
      window.history.pushState(null, '', nextPath);
    }
    setVirtualPathname(nextPath);
  }

  useEffect(() => {
    window.localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, theme);
    const root = document.documentElement;
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
  }, [theme]);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js');
    }
  }, []);

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
    if (!infoMessage) return;

    const timer = window.setTimeout(() => {
      setInfoMessage('');
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [infoMessage]);

  useEffect(() => {
    if (!authMessage) return;

    const timer = window.setTimeout(() => {
      setAuthMessage('');
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [authMessage]);

  useEffect(() => {
    if (!supabase || !appSession?.userId) {
      setMemberAddNotifications([]);
      return;
    }

    const supabaseClient = supabase;
    let cancelled = false;

    const loadNotifications = async () => {
      const { data, error } = await supabaseClient
        .from('member_add_notifications')
        .select('id, target_user_id, trip_id, trip_name, member_name, actor_name, created_at, acknowledged_at')
        .eq('target_user_id', appSession.userId)
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false })
        .limit(8);

      if (cancelled || error) return;
      const notifs = (data || []) as MemberAddNotification[];
      setMemberAddNotifications(notifs);

      // Try to auto-join trips for any fresh notifications: fetch inviteCode and call join RPC
      for (const n of notifs) {
        try {
          const memberName = n.member_name;
          const registrationName = appSession.name?.trim() || '';
          const effectiveName = registrationName || memberName;
          const selfKey = effectiveName.toLowerCase();

          // Remap the owner-assigned slot name to the user's real registration name,
          // matching the same logic as the manual invite-code join flow.
          const applyMemberRemap = (trip: Trip): Trip => {
            if (!memberName || memberName.toLowerCase() === selfKey) return trip;
            const ownerKey = (trip.owner || '').trim().toLowerCase();
            const ownerLabel = ownerKey && ownerKey !== 'ty' ? trip.owner : 'Ty';
            const selfEntry: Member | string = appSession.userId
              ? { id: appSession.userId, name: effectiveName }
              : effectiveName;
            // For member slots: preserve Member objects, tag the current user's slot with their ID
            const remapMemberEntry = (m: Member | string): Member | string | null => {
              const nameStr = memberNameOf(m);
              if (nameStr === memberName) return selfEntry;
              if (nameStr.toLowerCase() === 'ty') return ownerLabel;
              if (nameStr === effectiveName) return null; // remove pre-existing duplicate
              return m;
            };
            // For expense strings: same logic but always returns plain string
            const remapExpenseName = (name: string): string | null => {
              if (name === memberName) return effectiveName;
              if (name.toLowerCase() === 'ty') return ownerLabel;
              if (name === effectiveName) return null;
              return name;
            };
            const seenNames = new Set<string>();
            return {
              ...trip,
              members: trip.members
                .map(remapMemberEntry)
                .filter((m): m is Member | string => m !== null)
                .filter((m) => {
                  const n = memberNameOf(m).toLowerCase();
                  if (seenNames.has(n)) return false;
                  seenNames.add(n);
                  return true;
                }),
              expenses: trip.expenses.map((exp) => ({
                ...exp,
                payer: remapExpenseName(exp.payer || '') ?? effectiveName,
                participants: (exp.participants || [])
                  .map((p) => remapExpenseName(memberNameOf(p as any)))
                  .filter((p): p is string => p !== null)
                  .filter((p, i, arr) => arr.indexOf(p) === i),
              })),
            };
          };

          const acknowledge = async () => {
            await supabaseClient
              .from('member_add_notifications')
              .update({ acknowledged_at: new Date().toISOString() })
              .eq('id', n.id)
              .eq('target_user_id', appSession.userId);
          };

          // Check current trips state (inside setTrips to avoid stale closure)
          let alreadyHandled = false;
          setTrips((prev) => {
            const existing = prev.find((t) => t.id === n.trip_id);
            if (!existing) return prev;

            // Trip is in state — check if user is already visible.
            // "Ty" is the canonical placeholder for the current user.
            const userVisible = prev.find((t) => t.id === n.trip_id)
              ?.members.some((m) => {
                const k = memberNameOf(m).trim().toLowerCase();
                return k === selfKey || k === 'ty';
              });
            if (userVisible) {
              alreadyHandled = true;
              return prev; // visible, no change needed
            }

            // Trip exists but user isn't visible — remap the member name.
            // Do NOT re-normalize here; existing was already normalized on load.
            alreadyHandled = true;
            const remapped = applyMemberRemap(existing);
            return [...prev.filter((t) => t.id !== remapped.id), remapped];
          });

          if (alreadyHandled) {
            await acknowledge();
            continue;
          }

          const res = await fetch(`/api/get-invite-code?tripId=${encodeURIComponent(n.trip_id)}`);
          if (!res.ok) continue;
          const body = await res.json();
          const inviteCode = body?.inviteCode;
          if (!inviteCode) continue;

          // Attempt to join using RPC
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rpcRes = (await supabaseClient.rpc('join_trip_by_invite_code', {
            p_invite_code: inviteCode,
            p_member_name: memberName,
          })) as any;

          const rpcData = rpcRes?.data || rpcRes;
          if (rpcData?.trip) {
            const normalized = applyMemberRemap(normalizeTrip(rpcData.trip as Trip));
            setTrips((prev) => [...prev.filter((t) => t.id !== normalized.id), normalized]);
            await acknowledge();
          } else if (rpcData?.error === 'name_taken' || rpcData?.error === 'already_member') {
            // Member name is already in the owner's trip — user was added before they joined.
            // Fall back to lookup to get the current trip state and add it locally.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const lookupRes = (await supabaseClient.rpc('lookup_trip_by_invite_code', {
              p_invite_code: inviteCode,
            })) as any;
            const lookupData = lookupRes?.data || lookupRes;
            if (lookupData?.trip) {
              const normalized = applyMemberRemap(normalizeTrip(lookupData.trip as Trip));
              setTrips((prev) => [...prev.filter((t) => t.id !== normalized.id), normalized]);
              await acknowledge();
            }
          }
        } catch (e) {
          // ignore individual failures
        }
      }
    };

    loadNotifications();
    const timer = window.setInterval(loadNotifications, 20000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [appSession?.userId, supabase]);

  useEffect(() => {
    if (!supabase || !appSession?.userId) {
      setSelfIban('');
      return;
    }

    let cancelled = false;

    const loadSelfProfile = async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('iban')
        .eq('user_id', appSession.userId)
        .maybeSingle();

      if (cancelled) return;
      setSelfIban(formatIbanForDisplay((data?.iban as string | undefined) || ''));
    };

    loadSelfProfile();

    return () => {
      cancelled = true;
    };
  }, [appSession?.userId, supabase]);

  useEffect(() => {
    if (!appSession?.email) { setGravatarHash(null); return; }
    setGravatarFailed(false);
    sha256hex(appSession.email.trim().toLowerCase()).then(setGravatarHash);
  }, [appSession?.email]);

  useEffect(() => {
    if (!profileOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (profileMenuWrapRef.current?.contains(target)) return;
      setProfileOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [profileOpen]);

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
    if (typeof window === 'undefined') return;

    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const errorCode = params.get('error_code') || '';
    const error = params.get('error') || '';
    const flowType = params.get('type') || '';

    if (errorCode === 'otp_expired' || error === 'access_denied') {
      queueMicrotask(() => {
        setShowPasswordResetForm(false);
        setAuthMode('login');
        setAuthMessage(T[lang].resetLinkExpired);
      });
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      return;
    }

    if (flowType === 'recovery') {
      queueMicrotask(() => {
        setShowPasswordResetForm(true);
        setAuthMode('login');
        setAuthMessage('');
      });
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, [lang]);

  useEffect(() => {
    if (!supabase) {
      queueMicrotask(() => setAuthResolved(true));
      return;
    }

    let resolved = false;

    // Safety timeout — if Supabase never responds (offline / token refresh hangs),
    // unblock the app after 4 seconds so users aren't stuck on the loading screen.
    const safetyTimer = window.setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setAuthResolved(true);
      }
    }, 4000);

    supabase.auth.getSession().then(({ data }) => {
      if (!resolved) {
        resolved = true;
        window.clearTimeout(safetyTimer);
      }
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
      setSelfAvatarEmoji(typeof data.session?.user?.user_metadata?.avatar_emoji === 'string' ? data.session.user.user_metadata.avatar_emoji : null);
      setAuthResolved(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordResetForm(true);
        setAuthMode('login');
        setAuthMessage('');
      }

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
      setSelfAvatarEmoji(typeof session?.user?.user_metadata?.avatar_emoji === 'string' ? session.user.user_metadata.avatar_emoji : null);
      setAuthResolved(true);
    });

    return () => {
      window.clearTimeout(safetyTimer);
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
    latestLocalStateRef.current = JSON.stringify({ trips, selectedTripId });
  }, [trips, selectedTripId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STALE_TRIP_WARNING_ACK_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, true>;
      if (parsed && typeof parsed === 'object') {
        setDismissedStaleTripWarnings(parsed);
      }
    } catch {
      // Ignore malformed local storage payload.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STALE_TRIP_WARNING_ACK_KEY, JSON.stringify(dismissedStaleTripWarnings));
  }, [dismissedStaleTripWarnings]);

  useEffect(() => {
    if (!appSession?.name) return;

    const selfKey = appSession.name.trim().toLowerCase();
    if (!selfKey) return;

    setTrips((prev) => {
      let changed = false;
      const next = prev.map((trip) => {
        const canonical = canonicalizeSelfName(trip, selfKey);
        if (canonical === trip) return trip;
        changed = true;
        return canonical;
      });
      return changed ? next : prev;
    });
  }, [appSession?.name]);

  useEffect(() => {
    if (appSession) {
      window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(appSession));
      return;
    }

    window.localStorage.removeItem(SESSION_CACHE_KEY);
  }, [appSession]);

  useEffect(() => {
    // Reset sync flags whenever auth user changes so each account gets its own DB load/save cycle.
    dbLoadedRef.current = false;
    skipFirstSaveRef.current = true;
    skipNextSaveRef.current = false;
    syncRpcMissingWarnedRef.current = false;
    tempSessionWarnedRef.current = false;
    lastPropagatedTripSnapshotRef.current = {};
    lastPersistedExpenseSnapshotRef.current = {};
    skipExpenseDbWriteRef.current = false;
  }, [appSession?.userId]);

  useEffect(() => {
    if (!appSession?.userId) return;
    if (canSyncWithDb) return;
    if (tempSessionWarnedRef.current) return;

    tempSessionWarnedRef.current = true;
    setInfoMessage('Ste v dočasnom režime účtu. Zmeny sa nesynchronizujú medzi zariadeniami, kým nebude účet plne overený/prihlásený.');
  }, [appSession?.userId, canSyncWithDb]);

  useEffect(() => {
    if (!pendingVerification || !supabase) return;

    let cancelled = false;
    const langPack = T[lang];

    const checkVerifiedAndSignIn = async () => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: pendingVerification.email,
        password: pendingVerification.password,
      });

      if (cancelled) return;
      if (error || !data.session) return;

      setPendingVerification(null);
      setShowRegistrationNotice(false);
      setInfoMessage(langPack.emailVerificationCompleted);
    };

    const interval = window.setInterval(checkVerifiedAndSignIn, 15000);
    checkVerifiedAndSignIn();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pendingVerification, supabase, lang]);

  useEffect(() => {
    if (!supabase || !authResolved || !canSyncWithDb || dbLoadedRef.current) return;

    const supabaseClient = supabase;
    const userId = appSession?.userId;
    if (!userId) return;

    let cancelled = false;

    async function loadStateFromDb() {
      const { data, error } = await supabaseClient
        .from('trip_states')
        .select('state_json')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        const errorKey = 'trip-load';
        const now = Date.now();
        if (!lastErrorMessageTimeRef.current[errorKey] || now - lastErrorMessageTimeRef.current[errorKey] > 5000) {
          setInfoMessage('Cloud sync zlyhal pri nacitani vyletov. Skontrolujte prihlasenie alebo RLS politky.');
          lastErrorMessageTimeRef.current[errorKey] = now;
        }
        dbLoadedRef.current = true;
        setDbLoadTick((prev) => prev + 1);
        return;
      }

      const remote = data?.state_json as { trips?: Trip[]; selectedTripId?: string } | null;
      console.log('[LoadDB] loaded trips count:', remote?.trips?.length ?? 0,
        'names:', (remote?.trips || []).map((t) => t.name));
      try {
        if (remote?.trips?.length) {
          const sanitized = sanitizeLoadedState(remote);
          const selfKey = (appSession?.name || '').trim().toLowerCase();
          const canonicalTrips = selfKey
            ? sanitized.trips.map((trip) => canonicalizeSelfName(trip, selfKey))
            : sanitized.trips;
          setTrips(canonicalTrips);
          setSelectedTripId(sanitized.selectedTripId);
        }
      } catch (processingErr) {
        console.error('[LoadDB] error processing loaded state:', processingErr);
        // Fall through — still mark DB as loaded so saves are not permanently blocked
      } finally {
        dbLoadedRef.current = true;
        setDbLoadTick((prev) => prev + 1);
      }
    }

    loadStateFromDb();

    return () => {
      cancelled = true;
    };
  }, [authResolved, canSyncWithDb, appSession?.userId, supabase]);

  useEffect(() => {
    if (!supabase || !canSyncWithDb || !dbLoadedRef.current) return;
    const supabaseClient = supabase;
    const userId = appSession?.userId;
    if (!userId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }

    const payload = { trips, selectedTripId };
    const timeoutId = window.setTimeout(async () => {
      const { error } = await supabaseClient.from('trip_states').upsert({
        user_id: userId,
        state_json: payload,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error('[AutoSave] trip_states upsert failed:', error.message, error.code, error.details);
        const errorKey = 'trip-save';
        const now = Date.now();
        if (!lastErrorMessageTimeRef.current[errorKey] || now - lastErrorMessageTimeRef.current[errorKey] > 5000) {
          setInfoMessage('Cloud sync zlyhal pri ulozeni vyletu.');
          lastErrorMessageTimeRef.current[errorKey] = now;
        }
        return;
      }

      // Propagate only changed trips by inviteCode to avoid stale-copy overwrites.
      const syncableTrips = payload.trips.filter((trip) => {
        if (!trip.inviteCode) return false;
        const snapshot = JSON.stringify(trip);
        const previous = lastPropagatedTripSnapshotRef.current[trip.inviteCode];
        return snapshot !== previous;
      });

      if (!syncableTrips.length) return;

      await Promise.all(
        syncableTrips.map(async (trip) => {
          const { data: syncData2, error: syncError } = await supabaseClient.rpc('sync_trip_state_by_invite_code', {
            p_invite_code: trip.inviteCode,
            p_trip: trip,
          });

          if (syncError?.code === 'PGRST202') {
            if (!syncRpcMissingWarnedRef.current) {
              syncRpcMissingWarnedRef.current = true;
              setInfoMessage('Aktívna synchronizácia nie je zapnutá v databáze. Spusťte SQL súbor supabase/invite_functions.sql.');
            }
            return;
          }

          if (syncError) {
            console.error('Trip propagation sync failed:', syncError.message);
            return;
          }

          const rpcResult2 = syncData2 as { error?: string; success?: boolean } | null;
          if (rpcResult2?.error) {
            console.warn('Trip propagation RPC error:', rpcResult2.error);
            return;
          }

          lastPropagatedTripSnapshotRef.current[trip.inviteCode] = JSON.stringify(trip);
        })
      );
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [canSyncWithDb, appSession?.userId, dbLoadTick, selectedTripId, supabase, trips]);

  useEffect(() => {
    if (!supabase || !authResolved || !canSyncWithDb || !dbLoadedRef.current) return;

    const supabaseClient = supabase;
    const userId = appSession?.userId;
    if (!userId) return;
    let cancelled = false;

    const applyRemoteState = (remote: { trips?: Trip[]; selectedTripId?: string } | null) => {
      const sanitized = sanitizeLoadedState(remote || {});

      // Merge: keep remote trips + any local-only trips not yet synced to DB.
      // This prevents a racing refreshFromDb from clobbering a just-created trip
      // whose immediate save hasn't completed yet.
      setTrips((localTrips) => {
        const remoteIds = new Set(sanitized.trips.map((t) => t.id));
        const remoteCodes = new Set(sanitized.trips.map((t) => t.inviteCode));
        const localOnly = localTrips.filter((t) => !remoteIds.has(t.id) && !remoteCodes.has(t.inviteCode));
        const merged = [...sanitized.trips, ...localOnly];
        const mergedSerialized = JSON.stringify({ trips: merged, selectedTripId: sanitized.selectedTripId });
        if (mergedSerialized === latestLocalStateRef.current) return localTrips;
        // Only suppress the next auto-save when remote fully matches local state
        // (no local-only trips that still need to be persisted).
        if (localOnly.length === 0) skipNextSaveRef.current = true;
        return merged;
      });
      setSelectedTripId((prev) => prev || sanitized.selectedTripId || '');
    };

    const refreshFromDb = async () => {
      const { data, error } = await supabaseClient
        .from('trip_states')
        .select('state_json')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled || error) return;
      applyRemoteState((data?.state_json as { trips?: Trip[]; selectedTripId?: string } | null) || null);
    };

    // Store refreshFromDb in ref so deleteTrip can call it
    refreshFromDbRef.current = refreshFromDb;

    const channel = supabaseClient
      .channel(`trip-state-sync-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_states',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refreshFromDb();
        }
      )
      .subscribe();

    void refreshFromDb();

    const interval = window.setInterval(() => {
      void refreshFromDb();
    }, 30000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshFromDb();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      void supabaseClient.removeChannel(channel);
    };
  }, [canSyncWithDb, appSession?.userId, authResolved, supabase]);

  useEffect(() => {
    if (!supabase || !canSyncWithDb) return;
    const supabaseClient = supabase;
    const userId = appSession?.userId;
    if (!userId) return;
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
  }, [canSyncWithDb, appSession?.email, appSession?.name, appSession?.userId, supabase]);

  const isEnvAdmin = Boolean(
    appSession?.email && process.env.NEXT_PUBLIC_ADMIN_EMAIL && appSession.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  );
  const isAdmin = isEnvAdmin || adminRole === 'admin';

  useEffect(() => {
    if (!supabase || !canSyncWithDb) return;
    const supabaseClient = supabase;
    const userId = appSession?.userId;
    if (!userId) return;

    async function loadAdminRole() {
      const { data } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      setAdminRole((data?.role as AdminRole | undefined) || null);
    }

    loadAdminRole();
  }, [canSyncWithDb, appSession?.userId, supabase]);

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
      const weekIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const yearIso = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const [
        visitsRes,
        visits24Res,
        visitsWeekRes,
        visitsMonthRes,
        visitsYearRes,
        presenceRes,
        rolesRes,
        tripsRes,
        tripStatesRes,
        recentRes,
        recentForTopRes,
        spamLogRes,
      ] = await Promise.all([
        supabaseClient.from('app_visits').select('id', { count: 'exact', head: true }),
        supabaseClient.from('app_visits').select('id', { count: 'exact', head: true }).gte('visited_at', nowIso),
        supabaseClient.from('app_visits').select('id', { count: 'exact', head: true }).gte('visited_at', weekIso),
        supabaseClient.from('app_visits').select('id', { count: 'exact', head: true }).gte('visited_at', monthIso),
        supabaseClient.from('app_visits').select('id', { count: 'exact', head: true }).gte('visited_at', yearIso),
        supabaseClient.from('user_presence').select('user_id, user_email, user_name, last_seen').order('last_seen', { ascending: false }).limit(100),
        supabaseClient.from('user_roles').select('user_id, role'),
        supabaseClient.from('trip_states').select('user_id', { count: 'exact', head: true }),
        supabaseClient.from('trip_states').select('user_id, state_json, updated_at').order('updated_at', { ascending: false }).limit(1000),
        supabaseClient.from('app_visits').select('id, user_email, visited_at').order('visited_at', { ascending: false }).limit(250),
        supabaseClient.from('app_visits').select('user_email, visited_at').order('visited_at', { ascending: false }).limit(500),
        supabaseClient.from('support_spam_log').select('id, email, subject, message, reason, created_at').order('created_at', { ascending: false }).limit(200),
      ]);

      if (cancelled) return;

      setVisitsCount(visitsRes.count || 0);
      setVisits24hCount(visits24Res.count || 0);
      setVisitsDayCount(visits24Res?.count || 0);
      setVisitsWeekCount(visitsWeekRes?.count || 0);
      setVisitsMonthCount(visitsMonthRes?.count || 0);
      setVisitsYearCount(visitsYearRes?.count || 0);
      setTotalTripsStored(tripsRes.count || 0);

      const dedupedTrips = new Map<string, AdminTripSummary>();
      ((tripStatesRes.data || []) as AdminTripStateRow[]).forEach((row) => {
        const tripsInState = row.state_json?.trips || [];
        tripsInState.forEach((trip) => {
          // Skip deleted trips in admin view
          if (trip.deletedAt) return;
          
          const normalized = normalizeTrip(trip);
          const dedupeKey = (normalized.inviteCode || '').trim().toUpperCase() || normalized.id;
          if (!dedupeKey) return;

          const candidate: AdminTripSummary = {
            ...normalized,
            sourceUserId: row.user_id,
            updatedAt: row.updated_at || '',
          };

          const existing = dedupedTrips.get(dedupeKey);
          if (!existing) {
            dedupedTrips.set(dedupeKey, candidate);
            return;
          }

          const existingTs = new Date(existing.updatedAt || 0).getTime();
          const candidateTs = new Date(candidate.updatedAt || 0).getTime();
          if (candidateTs >= existingTs) {
            dedupedTrips.set(dedupeKey, candidate);
          }
        });
      });

      const sortedAdminTrips = [...dedupedTrips.values()].sort((left, right) => {
        const leftTs = new Date(left.updatedAt || 0).getTime();
        const rightTs = new Date(right.updatedAt || 0).getTime();
        return rightTs - leftTs;
      });
      setAdminTrips(sortedAdminTrips);

      // Notify admin of new chat extension requests
      const langPack = T[lang];
      sortedAdminTrips.filter((trip) => trip.chatExtensionRequested && !trip.archived).forEach((trip) => {
        if (!notifiedChatExtensionRef.current.has(trip.id)) {
          notifiedChatExtensionRef.current.add(trip.id);
          sendNotification(`${trip.name} — ${langPack.chatExtensionNotifTitle}`, { body: langPack.chatExtensionNotifBody });
        }
      });

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

      if (!cancelled) setSpamLog((spamLogRes.data || []) as SpamLogEntry[]);

      // Fetch auth users (verified status) via service-role API
      try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token && !cancelled) {
          const authUsersRes = await fetch('/api/admin/users', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (authUsersRes.ok) {
            const authUsersBody = await authUsersRes.json();
            if (!cancelled) setAdminAuthUsers(authUsersBody.users || []);
          }
        }
      } catch {
        // non-critical
      }

      // Fetch deleted accounts log
      const deletedRes = await supabaseClient
        .from('deleted_accounts_log')
        .select('id, email, deleted_at')
        .order('deleted_at', { ascending: false })
        .limit(200);
      if (!cancelled) setDeletedAccounts((deletedRes.data || []) as DeletedAccountEntry[]);

      setAdminLoading(false);
    }

    refreshAdminStats();
    const interval = window.setInterval(refreshAdminStats, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isAdmin, supabase]);

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage(t('supabaseNotConfigured'));
      return;
    }

    if (!email.trim() || !password.trim()) {
      setAuthMessage(t('enterEmailPassword'));
      return;
    }

    setAuthLoading(true);
    setAuthMessage('');

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedName = fullName.trim() || normalizedEmail.split('@')[0] || 'Pouzivatel';

      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) {
            const resendResult = await supabase.auth.resend({
              type: 'signup',
              email: normalizedEmail,
              options: {
                emailRedirectTo: window.location.origin,
              },
            });

            setPendingVerification({
              email: normalizedEmail,
              password,
              fullName: normalizedName,
            });
            setShowRegistrationNotice(true);
            setAuthMessage('');
            setInfoMessage(
              resendResult.error ? t('verificationEmailResendFailed') : t('verificationEmailResent')
            );
            return;
          }

          setAuthMessage(friendlyAuthError(error.message));
          return;
        }

        setPendingVerification(null);
        setShowRegistrationNotice(false);
        setAuthMessage(t('loginSuccess'));
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: normalizedName,
            },
          },
        });

        const signupHadMailError = Boolean(error && isSignupMailDeliveryError(error.message));

        if (error && !signupHadMailError) {
          setAuthMessage(friendlyAuthError(error.message));
          return;
        }

        if (!error && data.session) {
          setPendingVerification(null);
          setShowRegistrationNotice(false);
          setAuthMessage(t('registrationSuccessInstant'));
          return;
        }

        const { error: loginAfterSignupError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (!loginAfterSignupError) {
          setPendingVerification(null);
          setShowRegistrationNotice(false);
          setAuthMessage(t('registrationSuccessInstant'));
          return;
        }

        if (loginAfterSignupError.message.toLowerCase().includes('email not confirmed')) {
          await supabase.auth.resend({
            type: 'signup',
            email: normalizedEmail,
            options: {
              emailRedirectTo: window.location.origin,
            },
          });

          setPendingVerification({
            email: normalizedEmail,
            password,
            fullName: normalizedName,
          });
          setShowRegistrationNotice(true);
          setAuthMessage('');
          return;
        }

        if (signupHadMailError && loginAfterSignupError.message.toLowerCase().includes('invalid login credentials')) {
          setAuthMessage(friendlyAuthError(error?.message || t('genericTryAgain')));
          return;
        }

        setAuthMessage(friendlyAuthError(loginAfterSignupError.message));
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (!supabase) {
      setAuthMessage(t('supabaseNotConfigured'));
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
    setPendingVerification(null);
    setShowRegistrationNotice(false);
    window.localStorage.removeItem(SESSION_CACHE_KEY);
    navigateInApp('/');

    if (supabase) {
      await supabase.auth.signOut();
    }

    setAuthMessage(t('loggedOut'));
  }

  async function handleResetPassword() {
    if (!supabase) {
      setAuthMessage(t('supabaseNotConfiguredShort'));
      return;
    }

    if (!email.trim()) {
      setAuthMessage(t('enterEmailFirst'));
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });

    if (error) {
      setAuthMessage(friendlyAuthError(error.message));
      return;
    }

    setAuthMessage(t('resetEmailSent'));
  }

  async function handleSetNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setAuthMessage(t('supabaseNotConfiguredShort'));
      return;
    }

    if (newPassword.trim().length < 6) {
      setAuthMessage(t('passwordTooShort'));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setAuthMessage(t('passwordMismatch'));
      return;
    }

    setAuthLoading(true);
    setAuthMessage('');

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setAuthMessage(friendlyAuthError(error.message));
        return;
      }

      setShowPasswordResetForm(false);
      setNewPassword('');
      setConfirmNewPassword('');
      setAuthMode('login');
      setAuthMessage(t('passwordResetSuccess'));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSupportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const senderEmail = (appSession?.email || supportEmail).trim().toLowerCase();
    if (!senderEmail) return;

    // Client-side format check only - invalid emails are silently dropped server-side
    const isValidEmailFormat = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(senderEmail)
      && !/<[^>]+>/.test(senderEmail)
      && !senderEmail.includes(',');
    if (!isValidEmailFormat) {
      // Show success anyway - don't reveal validation to potential spammers
      setSupportSubject('');
      setSupportBody('');
      setSupportEmail('');
      setInfoMessage(t('supportSent'));
      setShowSupportModal(false);
      return;
    }

    const subject = supportSubject.trim();
    const message = supportBody.trim();
    if (!subject || !message) return;

    setSupportSending(true);
    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: senderEmail,
          name: appSession?.name || fullName.trim() || 'Guest',
          subject,
          message,
          lang,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        missing?: string[];
        code?: string | null;
        responseCode?: number | null;
      } | null;

      if (!response.ok) {
        if (payload?.error === 'smtp_not_configured') {
          const missing = Array.isArray(payload?.missing) && payload.missing.length > 0
            ? ` (${payload.missing.join(', ')})`
            : '';
          setInfoMessage(`${t('supportSmtpMissing')}${missing}`);
          return;
        }

        if (payload?.error === 'smtp_auth_failed') {
          setInfoMessage(t('supportSmtpAuthFailed'));
          return;
        }

        if (payload?.error === 'smtp_unreachable') {
          setInfoMessage(t('supportSmtpUnreachable'));
          return;
        }

        if (payload?.error === 'send_failed' && (payload?.code || payload?.responseCode)) {
          const errorSuffix = [payload.code, payload.responseCode].filter(Boolean).join('/');
          setInfoMessage(`${t('supportSendFailed')} (${errorSuffix})`);
          return;
        }

        setInfoMessage(t('supportSendFailed'));
        return;
      }

      setSupportSubject('');
      setSupportBody('');
      setSupportEmail('');
      setInfoMessage(t('supportSent'));
    } catch {
      setInfoMessage(t('supportSendFailed'));
    } finally {
      setSupportSending(false);
      setShowSupportModal(false);
    }
  }

  function toggleAuthMode() {
    setAuthMessage('');
    setShowRegistrationNotice(false);
    setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'));
  }

  function handleRegistrationNoticeConfirm() {
    if (!pendingVerification) {
      setShowRegistrationNotice(false);
      return;
    }

    setAppSession({
      ...makeUserSession(
        `pending:${pendingVerification.email}`,
        pendingVerification.email,
        pendingVerification.fullName
      ),
      guest: true,
    });
    setShowRegistrationNotice(false);
    setInfoMessage(t('registrationPendingLocalAccess'));
  }

  function clearInvite() {
    setInvitePendingCode(null);
    setInviteTrip(null);
    setInviteChosenSlot('');
    setInviteCustomName('');
    setInviteUseCustom(false);
    setInviteError('');
    setInviteLoading(false);
    inviteProcessedRef.current = false;
    window.localStorage.removeItem(INVITE_PENDING_KEY);
  }

  async function handleCompleteJoin() {
    if (!invitePendingCode || !inviteTrip || !supabase) return;

    const memberName = (inviteUseCustom || inviteTrip.slots.length === 0)
      ? inviteCustomName.trim()
      : inviteChosenSlot;

    if (!memberName) return;

    // If already in local trips, just navigate
    const localTrip = trips.find((t) => t.inviteCode === invitePendingCode);
    if (localTrip) {
      openTrip(localTrip.id, 'overview');
      clearInvite();
      return;
    }

    setInviteLoading(true);
    setInviteError('');

    const { data } = (await supabase.rpc('join_trip_by_invite_code', {
      p_invite_code: invitePendingCode,
      p_member_name: memberName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as unknown as { data: Record<string, any> };

    setInviteLoading(false);

    if (data?.error === 'name_taken') {
      setInviteError(`${memberName}: ${t('inviteNameTaken')}`);
      return;
    }

    if (!data?.success) {
      setInviteError(t('genericTryAgain'));
      return;
    }

    // If owner, just navigate
    if (data.alreadyOwner) {
      openTrip(data.tripId, 'overview');
      clearInvite();
      return;
    }

    // Add trip to local state
    if (data.trip) {
      let normalized = normalizeTrip(data.trip as Trip);

      // Keep owner visible (preserve legacy "Ty" owner placeholder as distinct member)
      // and rename the chosen slot to the user's real registration name.
      // to the user's real registration name. Handles both cases:
      // - memberName !== registrationName (e.g. slot "Janco", registered as "Ján Džurindák")
      // - memberName === registrationName (e.g. slot "Janco", registered as "Janco") — "Ty" still removed
      const registrationName = (appSession?.name || '').trim();
      const effectiveName = registrationName || memberName;
      const ownerKey = (normalized.owner || '').trim().toLowerCase();
      const ownerLabel = ownerKey && ownerKey !== 'ty' ? normalized.owner : 'Ty';
      const remapName = (n: Member | string) => {
        const nStr = memberNameOf(n);
        if (nStr === memberName) return effectiveName;
        if (nStr.toLowerCase() === 'ty') return ownerLabel;
        if (nStr === effectiveName) return null; // remove pre-existing duplicate
        return nStr;
      };

      const selfEntry: Member | string = appSession?.userId
        ? { id: appSession.userId, name: effectiveName }
        : effectiveName;
      const remapMembers = (members: (Member | string)[]) => {
        const result: (Member | string)[] = [];
        let addedSelf = false;
        for (const m of members) {
          const mapped = remapName(m);
          if (mapped === null) {
            if (!addedSelf && memberNameOf(m) === memberName) { result.push(selfEntry); addedSelf = true; }
            continue;
          }
          if (mapped === effectiveName) { if (!addedSelf) { result.push(selfEntry); addedSelf = true; } continue; }
          result.push(mapped);
        }
        if (!addedSelf) result.push(selfEntry);
        return result;
      };

      normalized = {
        ...normalized,
        members: remapMembers(normalized.members),
        expenses: normalized.expenses.map((exp) => ({
          ...exp,
          payer: remapName(exp.payer || '') ?? effectiveName,
          participants: (exp.participants || [])
            .map((p) => remapName(p))
            .filter((p): p is string => p !== null)
            .filter((p, i, arr) => arr.indexOf(p) === i),
        })),
        pendingInvites: normalized.pendingInvites.map((inv) => ({
          ...inv,
          name: inv.name === memberName ? effectiveName : inv.name,
        })),
      };

      setTrips((prev) => [...prev.filter((t) => t.id !== normalized.id), normalized]);
      void propagateTripStateImmediately(normalized);
    }

    clearInvite();
    openTrip(data.tripId, 'overview');
    setInfoMessage(`${t('welcomeAdded')} ${inviteTrip.tripName}.`);
  }

  const pathSegments = virtualPathname.split('/').filter(Boolean);
  const routeTripKey =
    pathSegments[0] === 'trip' && pathSegments[1]
      ? decodeURIComponent(pathSegments[1])
      : '';
  const routeTrip = useMemo(
    () =>
      trips.find(
        (trip) =>
          trip.id === routeTripKey || trip.inviteCode.toUpperCase() === routeTripKey.toUpperCase()
      ) ||
      (isAdmin
        ? adminTrips.find(
            (trip) =>
              trip.id === routeTripKey || trip.inviteCode.toUpperCase() === routeTripKey.toUpperCase()
          ) || null
        : null),
    [adminTrips, isAdmin, routeTripKey, trips]
  );
  const activeAppScreen: AppScreen =
    virtualPathname === '/admin' ? 'admin' : routeTripKey ? 'trip-detail' : 'trips';
  const activeDetailScreen = routeTripKey
    ? detailScreenFromPath(pathSegments[2])
    : 'overview';
  const activeTripId = routeTrip?.id || selectedTripId;

  const currentTrip = useMemo(() => {
    if (activeTripId) {
      return (
        trips.find((trip) => trip.id === activeTripId) ||
        (isAdmin ? adminTrips.find((trip) => trip.id === activeTripId) || null : null)
      );
    }
    return trips[0] || null;
  }, [activeTripId, adminTrips, isAdmin, trips]);

  useEffect(() => {
    const shouldWaitForDbLoad = Boolean(
      supabase && authResolved && canSyncWithDb && !dbLoadedRef.current
    );

    if (!routeTripKey) return;
    if (!localStateHydrated) return;
    if (!authResolved) return;
    if (shouldWaitForDbLoad) return;
    if (routeTrip) return;
    navigateInApp('/', 'replace');
  }, [
    canSyncWithDb,
    appSession?.userId,
    authResolved,
    dbLoadTick,
    localStateHydrated,
    routeTrip,
    routeTripKey,
    supabase,
    virtualPathname,
    trips,
  ]);

  useEffect(() => {
    if (!supabase || !canSyncWithDb || !dbLoadedRef.current) return;
    if (!currentTrip?.inviteCode) return;

    const supabaseClient = supabase;
    let cancelled = false;

    const refreshActiveTripFromShared = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcError } = (await supabaseClient.rpc('lookup_trip_by_invite_code', {
        p_invite_code: currentTrip.inviteCode,
      })) as unknown as { data: Record<string, any> | null; error: any };

      if (cancelled) return;

      if (!data?.found || !data.trip) {
        // If there was a network/DB error (not just "not found"), never remove — could be transient.
        if (rpcError || data === null) return;

        const ownerNormalized = (currentTrip.owner || '').trim().toLowerCase();
        const selfNormalized = (appSession?.name || '').trim().toLowerCase();
        const isCurrentUserOwner =
          ownerNormalized === 'ty' ||
          (Boolean(selfNormalized) && ownerNormalized === selfNormalized) ||
          Boolean(appSession?.userId && currentTrip.ownerId === appSession.userId) ||
          // Also check if current user appears as a member with matching userId (they're effectively owner-level)
          currentTrip.members.some((m) => typeof m !== 'string' && m.id === appSession?.userId);

        // New owner-created trip may not be in DB yet; do not remove it locally.
        if (isCurrentUserOwner) {
          return;
        }

        const removedTripId = currentTrip.id;
        const removedTripName = currentTrip.name;
        const removedInviteCode = currentTrip.inviteCode;

        setTrips((prev) =>
          prev.filter(
            (trip) => trip.id !== removedTripId && (removedInviteCode ? trip.inviteCode !== removedInviteCode : true)
          )
        );

        if (selectedTripId === removedTripId) {
          goToTripsHome();
        }

        setShowExpenseModal(false);
        setEditingExpenseId(null);

        if (!isSelfName(currentTrip.owner)) {
          setInfoMessage(`${removedTripName}: ${t('tripDeletedByOwner')}`);
          sendNotification(`${removedTripName} - ${t('tripDeleted')}`, {
            body: t('tripDeletedByOwner'),
            icon: '/icon.png',
          });
        }
        return;
      }

      const selfKey = (appSession?.name || '').trim().toLowerCase();
      const sharedTrip = canonicalizeSelfName(normalizeTrip(data.trip as Trip), selfKey);

      setTrips((prev) => {
        const idx = prev.findIndex((trip) => trip.id === currentTrip.id);
        if (idx < 0) return prev;

        const existing = prev[idx];
        const existingSerialized = JSON.stringify(existing);
        const sharedSerialized = JSON.stringify(sharedTrip);
        if (existingSerialized === sharedSerialized) return prev;

        // Merge: keep any locally-added expenses not yet propagated to Supabase.
        // Without this guard, a 2.5s poll arriving before the async write completes
        // silently discards a freshly-created expense.
        const sharedIds = new Set((sharedTrip.expenses || []).map((e) => e.id));
        const localOnlyActive = (existing.expenses || []).filter(
          (e) => !e.deletedAt && !sharedIds.has(e.id)
        );
        const mergedTrip: Trip =
          localOnlyActive.length > 0
            ? { ...sharedTrip, expenses: [...localOnlyActive, ...(sharedTrip.expenses || [])] }
            : sharedTrip;

        skipNextSaveRef.current = true;
        const next = [...prev];
        next[idx] = mergedTrip;
        return next;
      });
    };

    void refreshActiveTripFromShared();
    const interval = window.setInterval(() => {
      void refreshActiveTripFromShared();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [appSession?.name, canSyncWithDb, currentTrip?.id, currentTrip?.inviteCode, dbLoadTick, supabase]);

  useEffect(() => {
    if (!supabase || !canSyncWithDb || !dbLoadedRef.current) return;
    if (!currentTrip?.id) return;

    const supabaseClient = supabase;
    const tripId = currentTrip.id;
    let cancelled = false;

    const refreshTripExpensesFromDb = async () => {
      const { data, error } = await supabaseClient
        .from('trip_expenses')
        .select('trip_id, expense_id, payload, updated_at')
        .eq('trip_id', tripId)
        .order('updated_at', { ascending: false });

      if (cancelled || error) return;

      const rows = (data || []) as TripExpenseRow[];
      const dbExpenses = sortTripExpensesByNewest(
        rows
          .map((row) => {
            if (!row?.payload || typeof row.payload !== 'object') return null;
            return {
              ...row.payload,
              id: row.expense_id,
            } as TripExpense;
          })
          .filter((expense): expense is TripExpense => Boolean(expense))
      );

      setTrips((prev) => {
        const idx = prev.findIndex((trip) => trip.id === tripId);
        if (idx < 0) return prev;

        const existing = prev[idx];

        // Preserve soft-deleted state: if we deleted an expense locally but the DB write
        // hasn't landed yet, carry our deletedAt forward so the poll doesn't restore it.
        const locallyDeleted = deletedExpenseIdsRef.current;
        const mergedDbExpenses = dbExpenses.map((e) => {
          if (locallyDeleted.has(e.id) && !e.deletedAt) {
            const localE = (existing.expenses || []).find((le) => le.id === e.id);
            return { ...e, deletedAt: localE?.deletedAt || new Date().toISOString() };
          }
          return e;
        });
        // Also keep any locally-deleted expenses that DB no longer returns (already cleaned up)
        // by including them from local state.
        (existing.expenses || []).forEach((le) => {
          if (le.deletedAt && !mergedDbExpenses.find((e) => e.id === le.id)) {
            mergedDbExpenses.push(le);
          }
        });

        const existingSerialized = JSON.stringify(sortTripExpensesByNewest(existing.expenses || []));
        const mergedSerialized = JSON.stringify(sortTripExpensesByNewest(mergedDbExpenses));
        if (existingSerialized === mergedSerialized) {
          lastPersistedExpenseSnapshotRef.current[tripId] = mergedSerialized;
          return prev;
        }

        // Never replace local active expenses with fewer DB active expenses — write may be in-flight.
        const localActiveCount = (existing.expenses || []).filter((e) => !e.deletedAt).length;
        const dbActiveCount = mergedDbExpenses.filter((e) => !e.deletedAt).length;
        if (dbActiveCount < localActiveCount) return prev;

        skipNextSaveRef.current = true;
        skipExpenseDbWriteRef.current = true;
        lastPersistedExpenseSnapshotRef.current[tripId] = mergedSerialized;
        const next = [...prev];
        next[idx] = normalizeTrip({
          ...existing,
          expenses: mergedDbExpenses,
        });
        return next;
      });
    };

    void refreshTripExpensesFromDb();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshTripExpensesFromDb();
    }, 5000);

    const onVisible = () => { if (document.visibilityState === 'visible') void refreshTripExpensesFromDb(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [canSyncWithDb, currentTrip?.id, dbLoadTick, supabase]);

  useEffect(() => {
    if (!supabase || !canSyncWithDb || !dbLoadedRef.current) return;
    if (!currentTrip?.id) return;

    const tripId = currentTrip.id;
    const expenses = sortTripExpensesByNewest(currentTrip.expenses || []);
    const snapshot = JSON.stringify(expenses);

    if (skipExpenseDbWriteRef.current) {
      skipExpenseDbWriteRef.current = false;
      return;
    }

    if (lastPersistedExpenseSnapshotRef.current[tripId] === snapshot) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      if (cancelled) return;

      const rows = expenses.map((expense) => ({
        trip_id: tripId,
        expense_id: expense.id,
        payload: expense,
        created_by: appSession?.userId || null,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error: upsertError } = await supabase.from('trip_expenses').upsert(rows, {
          onConflict: 'trip_id,expense_id',
        });

        if (cancelled || upsertError) {
          if (upsertError) {
            console.error('[ExpenseSave] upsert failed:', upsertError.message, upsertError.code, upsertError.details);
            const errorKey = 'expense-upsert';
            const now = Date.now();
            if (!lastErrorMessageTimeRef.current[errorKey] || now - lastErrorMessageTimeRef.current[errorKey] > 5000) {
              setInfoMessage('Cloud sync zlyhal pri ulozeni vydavkov.');
              lastErrorMessageTimeRef.current[errorKey] = now;
            }
          }
          return;
        }
      }

      const { data: existingRows, error: existingError } = await supabase
        .from('trip_expenses')
        .select('expense_id, updated_at')
        .eq('trip_id', tripId);

      if (cancelled || existingError) {
        if (existingError) {
          const errorKey = 'expense-check';
          const now = Date.now();
          if (!lastErrorMessageTimeRef.current[errorKey] || now - lastErrorMessageTimeRef.current[errorKey] > 5000) {
            setInfoMessage('Cloud sync zlyhal pri kontrole vydavkov.');
            lastErrorMessageTimeRef.current[errorKey] = now;
          }
        }
        return;
      }

      const localIds = new Set(expenses.map((expense) => expense.id));
      const upsertedIds = rows.map((r) => r.expense_id);
      const upsertedSet = new Set(upsertedIds);

      // Only delete DB rows that are not present locally, not just upserted now,
      // and that are older than a small grace period to avoid race conditions.
      const nowTs = Date.now();
      const graceMs = 10000; // 10 seconds
      const toDelete = ((existingRows || []) as Array<{ expense_id: string; updated_at?: string }>)
        .filter((row) => {
          if (!row || !row.expense_id) return false;
          if (localIds.has(row.expense_id)) return false;
          if (upsertedSet.has(row.expense_id)) return false;
          if (!row.updated_at) return true;
          const updated = new Date(row.updated_at).getTime();
          return updated < nowTs - graceMs;
        })
        .map((r) => r.expense_id);

      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('trip_expenses')
          .delete()
          .eq('trip_id', tripId)
          .in('expense_id', toDelete);

        if (cancelled || deleteError) {
          if (deleteError) {
            const errorKey = 'expense-delete';
            const now = Date.now();
            if (!lastErrorMessageTimeRef.current[errorKey] || now - lastErrorMessageTimeRef.current[errorKey] > 5000) {
              setInfoMessage('Cloud sync zlyhal pri mazani vydavkov.');
              lastErrorMessageTimeRef.current[errorKey] = now;
            }
          }
          return;
        }
      }

      lastPersistedExpenseSnapshotRef.current[tripId] = snapshot;
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [appSession?.userId, canSyncWithDb, currentTrip?.id, currentTrip?.expenses, dbLoadTick, supabase]);

  // Offline indicator
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOffline(!navigator.onLine);
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  // Cleanup soft-deleted expenses older than 30 days
  useEffect(() => {
    if (!dbLoadedRef.current) return;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    setTrips((prev) => prev.map((trip) => {
      const cleaned = trip.expenses.filter((e) => {
        if (!e.deletedAt) return true;
        return new Date(e.deletedAt).getTime() > cutoff;
      });
      if (cleaned.length === trip.expenses.length) return trip;
      return { ...trip, expenses: cleaned };
    }));
  }, [dbLoadTick]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = (params.get('joinCode') || '').trim().toUpperCase();
    if (!codeFromUrl) return;
    if (appliedJoinCodeRef.current === codeFromUrl) return;

    appliedJoinCodeRef.current = codeFromUrl;
    window.localStorage.setItem(INVITE_PENDING_KEY, JSON.stringify({ code: codeFromUrl }));
    setInvitePendingCode(codeFromUrl);
    inviteProcessedRef.current = false;
  }, [virtualPathname]);

  // After auth + DB load, process pending invite
  useEffect(() => {
    if (!authResolved || !dbLoadTick || !appSession || !supabase) return;
    if (inviteProcessedRef.current) return;
    if (inviteTrip) return;

    const code = invitePendingCode || (() => {
      try {
        const s = window.localStorage.getItem(INVITE_PENDING_KEY);
        return s ? (JSON.parse(s) as { code?: string }).code || null : null;
      } catch { return null; }
    })();

    if (!code) return;
    inviteProcessedRef.current = true;

    const supabaseClient = supabase;

    queueMicrotask(() => {
      setInviteLoading(true);
      setInvitePendingCode(code);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseClient.rpc('lookup_trip_by_invite_code', { p_invite_code: code }) as unknown as Promise<{ data: any }>)
      .then(({ data }) => {
        setInviteLoading(false);
        if (data?.found) {
          const pendingSlots = (data.pendingSlots as string[]) || [];
          setInviteTrip({
            tripId: data.tripId,
            tripName: data.tripName,
            slots: pendingSlots,
          });
          setInviteCustomName(appSession.name || '');

          // Auto-select a slot that matches the user's registration name
          const matchingSlot = pendingSlots.find(
            (slot) => slot.toLowerCase() === (appSession.name || '').toLowerCase()
          );
          if (matchingSlot) {
            setInviteChosenSlot(matchingSlot);
            setInviteUseCustom(false);
          }
        } else {
          window.localStorage.removeItem(INVITE_PENDING_KEY);
          setInvitePendingCode(null);
        }
      })
      .catch(() => {
        setInviteLoading(false);
        window.localStorage.removeItem(INVITE_PENDING_KEY);
        setInvitePendingCode(null);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authResolved, dbLoadTick, appSession?.userId, invitePendingCode]);

  useEffect(() => {
    if (!showCreateTripModal && !showJoinTripModal && !showExpenseModal && !showExpenseDetailModal && !showTripSettingsModal && !showGuideModal) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowCreateTripModal(false);
      setShowJoinTripModal(false);
      setShowExpenseModal(false);
      closeExpenseDetail();
      setShowTripSettingsModal(false);
      setShowGuideModal(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showCreateTripModal, showJoinTripModal, showExpenseModal, showExpenseDetailModal, showTripSettingsModal, showGuideModal]);

  useEffect(() => {
    if (!showJoinTripModal) return;
    const sessionName = appSession?.name?.trim();
    if (!sessionName) return;
    setJoinName(sessionName);
  }, [showJoinTripModal, appSession?.name]);

  const members = useMemo(() => (currentTrip?.members || []).map(memberNameOf), [currentTrip]);
  // For computation we prefer an id-first representation so compute logic
  // can resolve participants by id when available.
  const membersForCompute = useMemo(
    () => (currentTrip?.members || []).map((m) => (typeof m === 'string' ? m : { id: m.id, name: memberNameOf(m) })),
    [currentTrip]
  );
  const isTransferDraft = draft.expenseType === 'transfer';
  const safePayer = members.includes(draft.payer) ? draft.payer : members[0] || 'Ty';
  const safeTransferTo =
    members.find((name) => name === draft.transferTo && name !== safePayer) ||
    members.find((name) => name !== safePayer) ||
    '';
  const safeParticipantsRaw = draft.participants.filter((name) => members.includes(name));
  const safeParticipants = safeParticipantsRaw.length ? safeParticipantsRaw : safePayer ? [safePayer] : [];
  const individualTotal = safeParticipants.reduce((sum, name) => {
    const value = parseMoneyInput(draft.participantAmounts[name] || 0);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
  const amountNumber = draft.splitType === 'individual' ? individualTotal : parseMoneyInput(draft.amount);
  // For individual split, accept when participant amounts sum to > 0
  const validIndividualSplit = draft.splitType !== 'individual' || individualTotal > 0;

  const normalizedExpenses = useMemo(() => {
    if (!currentTrip) return [];
    return currentTrip.expenses.filter((expense) => !expense.deletedAt).map((expense) => {
      // Use stored participants if present, but if only the payer is listed it means
      // the expense was created before others joined — expand to all current members.
      const rawParticipantsArr = (
        (expense.participants && expense.participants.length ? expense.participants : currentTrip.members) as (Member | string)[]
      ).map(memberNameOf);
      const onlyPayerListed =
        rawParticipantsArr.length === 1 &&
        rawParticipantsArr[0] &&
        (expense.payer || '').trim().toLowerCase() === rawParticipantsArr[0].trim().toLowerCase();
      const participants = onlyPayerListed ? (currentTrip.members || []).map(memberNameOf) : rawParticipantsArr;
      const amount = parseMoneyInput((expense as any).amount || 0);
      const participantAmounts = (expense.participantAmounts || {}) as Record<string, any>;
      const parsedParticipantAmounts: Record<string, number> = {};
      for (const k of Object.keys(participantAmounts)) {
        parsedParticipantAmounts[k] = parseMoneyInput(participantAmounts[k]);
      }
      const participantWeights = (expense.participantWeights || {}) as Record<string, any>;
      const parsedParticipantWeights: Record<string, number> = {};
      for (const k of Object.keys(participantWeights)) {
        parsedParticipantWeights[k] = Number(participantWeights[k]) || 0;
      }

      return {
        ...expense,
        amount,
        participants,
        // Clear participantIds when we expanded to all members so computeBalances
        // falls back to the name-based participants list instead of the stale ID list.
        participantIds: onlyPayerListed ? [] : expense.participantIds,
        participantAmounts: parsedParticipantAmounts,
        participantWeights: parsedParticipantWeights,
        expenseType: expense.expenseType || 'expense',
        splitType: expense.splitType || 'equal',
      } as TripExpense;
    });
  }, [currentTrip]);

  const balances = useMemo(() => computeBalances(membersForCompute, normalizedExpenses), [membersForCompute, normalizedExpenses]);
  const settlements = useMemo(() => settleDebts(balances), [balances]);

  useEffect(() => {
    if (!memberAvatarListRef.current) return;

    const detectOverflow = () => {
      const container = memberAvatarListRef.current;
      if (!container) return;

      const containerHeight = container.clientHeight;
      const hasOverflow = containerHeight > 50; // More than one line (avatar ~32px + gap)
      setShowAllMembersOverflow(hasOverflow && members.length > 0);
    };

    detectOverflow();
    const resizeObserver = new ResizeObserver(detectOverflow);
    resizeObserver.observe(memberAvatarListRef.current);

    return () => resizeObserver.disconnect();
  }, [members]);

  useEffect(() => {
    if (!currentTrip) {
      setMemberIbanByName({});
      return;
    }

    const membersToPrime = settlements
      .filter((transfer) => isSelfName(transfer.from))
      .map((transfer) => transfer.to)
      .filter((value, idx, arr) => arr.findIndex((it) => memberKey(it) === memberKey(value)) === idx);

    if (!membersToPrime.length) return;
    void Promise.all(membersToPrime.map((memberName) => primeSettlementRecipientIban(memberName)));
  }, [currentTrip?.id, settlements]);

  const totalSpent = useMemo(
    () =>
      normalizedExpenses.reduce((sum, expense) => (expense.expenseType === 'transfer' ? sum : sum + expense.amount), 0),
    [normalizedExpenses]
  );
  const recentExpenses = useMemo(() => normalizedExpenses.slice(0, 3), [normalizedExpenses]);

  const canAddExpense =
    !currentTrip?.archived &&
    !currentTrip?.deletedAt &&
    (isTransferDraft || draft.title.trim().length > 0) &&
    (amountNumber > 0 || (draft.splitType === 'individual' && individualTotal > 0)) &&
    safePayer.trim().length > 0 &&
    (isTransferDraft
      ? safeTransferTo.trim().length > 0 && safeTransferTo !== safePayer
      : safeParticipants.length > 0 && validIndividualSplit);

  const selectedExpense = useMemo(() => {
    if (!currentTrip || !selectedExpenseId) return null;
    return currentTrip.expenses.find((expense) => expense.id === selectedExpenseId) || null;
  }, [currentTrip, selectedExpenseId]);

  const normalizedCurrentUser = (appSession?.name || '').trim().toLowerCase();
  const displayCurrentUserName = (appSession?.name || '').trim() || 'Používateľ';

  function memberNameOf(m: Member | string) {
    return typeof m === 'string' ? m : m?.name || '';
  }

  const isSelfName = (input: Member | string) => {
    // Match by userId first (most reliable), then by name
    if (appSession?.userId && typeof input !== 'string' && input?.id === appSession.userId) return true;
    // Also match when input is the raw UUID string (e.g. balance-map key after sync overwrites member entry)
    if (appSession?.userId && typeof input === 'string' && input === appSession.userId) return true;
    const name = memberNameOf(input).trim();
    const normalizedName = name.toLowerCase();
    if (!normalizedName) return false;
    if (normalizedName === 'ty') return true;
    return Boolean(normalizedCurrentUser) && normalizedName === normalizedCurrentUser;
  };

  const isSameMember = (left: Member | string, right: Member | string) => {
    const leftNormalized = memberNameOf(left).trim().toLowerCase();
    const rightNormalized = memberNameOf(right).trim().toLowerCase();
    if (!leftNormalized || !rightNormalized) return false;
    if (leftNormalized === rightNormalized) return true;
    return isSelfName(left) && isSelfName(right);
  };
  useEffect(() => {
    const deletedTrips = trips.filter((trip) => Boolean(trip.deletedAt));
    if (!deletedTrips.length) return;

    const unseenDeletedTrips = deletedTrips.filter((trip) => !seenDeletedTripNoticeIdsRef.current[trip.id]);
    if (unseenDeletedTrips.length) {
      const deletedByOwner = unseenDeletedTrips.find((trip) => !isSelfName(trip.owner));
      if (deletedByOwner) {
        setInfoMessage(`${deletedByOwner.name}: ${t('tripDeletedByOwner')}`);
        sendNotification(`${deletedByOwner.name} - ${t('tripDeleted')}`, {
          body: t('tripDeletedByOwner'),
          icon: '/icon.png',
        });
      }
      unseenDeletedTrips.forEach((trip) => {
        seenDeletedTripNoticeIdsRef.current[trip.id] = true;
      });
    }

    if (deletedTrips.some((trip) => trip.id === selectedTripId)) {
      goToTripsHome();
    }

    setTrips((prev) => {
      const next = prev.filter((trip) => !trip.deletedAt);
      return next.length === prev.length ? prev : next;
    });

    // Redirect home if selectedTripId is completely removed from array (e.g., via remove_trip_by_invite_code RPC)
    if (selectedTripId && !trips.some((trip) => trip.id === selectedTripId)) {
      goToTripsHome();
    }
  }, [selectedTripId, trips]);

  const formatMemberName = (m: Member | string) => {
    const name = memberNameOf(m);
    return isSelfName(m) ? displayCurrentUserName : name;
  };
  
  // Close add/edit expense modal if currentTrip becomes unavailable
  useEffect(() => {
    if (!currentTrip && editingExpenseId) {
      setEditingExpenseId(null);
      // Reset draft to default state
      setDraft({
        title: '',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        expenseType: 'expense',
        payer: displayCurrentUserName || 'Ty',
        transferTo: '',
        participants: [displayCurrentUserName || 'Ty'],
        splitType: 'equal',
        participantWeights: { [displayCurrentUserName || 'Ty']: 1 },
        participantAmounts: { [displayCurrentUserName || 'Ty']: 0 },
      });
    }
  }, [currentTrip, editingExpenseId]);
  const getInitials = (name: string): string => {
    const displayName = formatMemberName(name);
    return displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  };
  const currentTripOwnerIsSelf = currentTrip ? isSelfName(currentTrip.owner) : false;
  const memberHistorySuggestions = useMemo(() => {
    if (!currentTrip) return [] as string[];
    if (!normalizedCurrentUser) return [] as string[];

    const currentMembers = new Set(currentTrip.members.map((m) => memberNameOf(m).trim().toLowerCase()));
    const seen = new Set<string>();
    const suggestions: string[] = [];

    for (const trip of trips) {
      if (trip.id === currentTrip.id) continue;

      const tripHasCurrentUser =
        trip.owner.trim().toLowerCase() === normalizedCurrentUser ||
        trip.members.some((member) => memberNameOf(member).trim().toLowerCase() === normalizedCurrentUser);
      if (!tripHasCurrentUser) continue;

      for (const member of trip.members) {
        const cleaned = memberNameOf(member).trim();
        const key = cleaned.toLowerCase();
        if (!cleaned || key === 'ty' || key === normalizedCurrentUser) continue;

        const isFictional = trip.pendingInvites.some(
          (invite) => invite.status === 'Pozvany' && invite.name.trim().toLowerCase() === key
        );
        if (isFictional) continue;

        if (currentMembers.has(key) || seen.has(key)) continue;
        seen.add(key);
        suggestions.push(cleaned);
      }
    }

    return suggestions.slice(0, 8);
  }, [currentTrip, trips]);
  const selfKey = appSession?.userId ?? appSession?.name;
  const appName = appSession?.name;
  const selfBalance = selfKey
    ? (balances[selfKey] ?? (appName ? balances[appName] : undefined) ?? balances['Ty'] ?? 0)
    : (balances['Ty'] ?? 0);
  const safeSelfBalance = Number.isFinite(selfBalance) ? selfBalance : 0;

  const displayNameForKey = (key: string) => {
    if (!currentTrip) return key;
    const found = (currentTrip.members || []).find((m) => typeof m !== 'string' && (m.id === key || (m?.name || '') === key));
    if (found) return memberNameOf(found);
    // key is a raw UUID — check if it belongs to the current session user
    if (appSession?.userId && key === appSession.userId) return appSession.name || key;
    return key;
  };

  const firstNameOf = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? parts[0] : name;
  };

  const stripMd = (text: string) =>
    text
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
      .replace(/\*([\s\S]+?)\*/g, '$1')
      .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
      .replace(/_{2}([\s\S]+?)_{2}/g, '$1')
      .replace(/_([\s\S]+?)_/g, '$1')
      .replace(/\[([\s\S]+?)\]\([\s\S]+?\)/g, '$1');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  function scrollChatToBottom() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      });
    });
  }

  useEffect(() => {
    if (showChatModal) scrollChatToBottom();
  }, [showChatModal]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleChatSend() {
    if (!chatInput.trim() || chatLoading || !currentTrip) return;
    const history = currentTrip.chatHistory || [];
    const userCount = history.filter((m) => m.role === 'user').length;
    if (userCount >= (currentTrip.chatLimit ?? 10)) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    const author = appSession?.name || appSession?.userId || 'Člen';
    const newMsg = { role: 'user' as const, content: userMsg, author };
    updateCurrentTrip((t) => ({ ...t, chatHistory: [...(t.chatHistory || []), newMsg] }));
    setChatLoading(true);
    scrollChatToBottom();

    // Build trip context for AI
    const expensesSummary = normalizedExpenses.slice(0, 30).map((e) => ({
      title: e.title,
      amount: e.amount,
      payer: e.payer || '',
      date: e.date || '',
      category: e.category || '',
    }));
    const memberNames = members;
    const balanceSummary = Object.entries(balances)
      .filter(([, v]) => Math.abs(v) > 0.01)
      .map(([k, v]) => ({ name: displayNameForKey(k), balance: Math.round(v * 100) / 100 }));

    try {
      const res = await fetch('/api/trip-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          tripName: currentTrip.name,
          history,
          tripContext: { members: memberNames, expenses: expensesSummary, balances: balanceSummary, currency: currentTrip.currency, totalSpent },
        }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      const reply = data.reply || (lang === 'sk' ? 'Chyba pri odpovedi.' : 'Reply error.');
      updateCurrentTrip((t) => ({ ...t, chatHistory: [...(t.chatHistory || []), { role: 'assistant' as const, content: reply }] }));
    } catch {
      updateCurrentTrip((t) => ({ ...t, chatHistory: [...(t.chatHistory || []), { role: 'assistant' as const, content: lang === 'sk' ? 'Chyba spojenia.' : 'Connection error.' }] }));
    } finally {
      setChatLoading(false);
      scrollChatToBottom();
    }
  }

  function handleChatExtensionRequest() {
    if (!currentTrip) return;
    updateCurrentTrip((t) => ({ ...t, chatExtensionRequested: true }));
  }

  function handleChatExtensionApprove(tripId: string) {
    const trip = adminTrips.find((t) => t.id === tripId);
    if (!trip) return;
    const updatedTrip: Trip = { ...trip, chatLimit: (trip.chatLimit ?? 10) + 10, chatExtensionRequested: false };
    setAdminTrips((prev) =>
      prev.map((t) => t.id === tripId ? { ...updatedTrip, sourceUserId: t.sourceUserId, updatedAt: t.updatedAt } : t)
    );
    void propagateTripStateImmediately(updatedTrip);
  }

  function handleChatExtensionReject(tripId: string) {
    const trip = adminTrips.find((t) => t.id === tripId);
    if (!trip) return;
    const updatedTrip: Trip = { ...trip, chatExtensionRequested: false };
    setAdminTrips((prev) =>
      prev.map((t) => t.id === tripId ? { ...updatedTrip, sourceUserId: t.sourceUserId, updatedAt: t.updatedAt } : t)
    );
    void propagateTripStateImmediately(updatedTrip);
  }

  function updateCurrentTrip(updater: (trip: Trip) => Trip) {
    if (!currentTrip) return;
    let updatedTripForSync: Trip | null = null;
     // Update in either normal trips or admin trips depending on current context
     const isCurrentTripAdmin = isAdmin && currentTrip.id === activeTripId && !trips.some((t) => t.id === currentTrip.id);
   
     if (isCurrentTripAdmin) {
       // Admin is viewing a trip from adminTrips
       setAdminTrips((prev) =>
         prev.map((trip) => {
           if (trip.id !== currentTrip.id) return trip;
           const nextTrip = updater(trip);
           updatedTripForSync = nextTrip;
          return { ...nextTrip, sourceUserId: trip.sourceUserId, updatedAt: trip.updatedAt };
         })
       );
     } else {
       // Normal user or admin viewing their own trip
       setTrips((prev) =>
         prev.map((trip) => {
           if (trip.id !== currentTrip.id) return trip;
           const nextTrip = updater(trip);
           updatedTripForSync = nextTrip;
           return nextTrip;
         })
       );
     }

    if (updatedTripForSync) {
      void propagateTripStateImmediately(updatedTripForSync);
    }
  }

  function openTrip(
    tripId: string,
    nextScreen: TripDetailScreen = 'overview',
    tripKeyOverride?: string
  ) {
    const selectedTrip =
      trips.find((trip) => trip.id === tripId) ||
      (isAdmin ? adminTrips.find((trip) => trip.id === tripId) : undefined);
    const tripKey = tripKeyOverride || selectedTrip?.inviteCode;
    if (!tripKey) return;

    setSelectedTripId(tripId);
    navigateInApp(tripPath(tripKey, nextScreen));
  }

  function goToTripsHome() {
    navigateInApp('/');
  }

  function goToAdmin() {
    setProfileOpen(false);
    navigateInApp('/admin');
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
      setInfoMessage(t('adminAnnouncementSaveFailed'));
      return;
    }

    setGlobalAnnouncement(announcementEnabled ? announcementText : '');
    setInfoMessage(t('adminAnnouncementSaved'));
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
        setInfoMessage(t('addAdminRoleFailed'));
        return;
      }
    } else {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', targetUserId);
      if (error) {
        setInfoMessage(t('removeAdminRoleFailed'));
        return;
      }
    }

    setAdminPresence((prev) =>
      prev.map((row) => (row.user_id === targetUserId ? { ...row, role: nextRole } : row))
    );
    setInfoMessage(t('userRoleUpdated'));
  }

  async function purgeStalePresence() {
    if (!supabase || !isAdmin) return;
    const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('user_presence').delete().lt('last_seen', threshold);

    if (error) {
      setInfoMessage(t('purgePresenceFailed'));
      return;
    }

    setInfoMessage(t('purgePresenceDone'));
  }

  async function clearSpamLog() {
    if (!supabase || !isAdmin) return;
    if (!window.confirm(t('adminSpamLogClearConfirm'))) return;
    await supabase.from('support_spam_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setSpamLog([]);
  }

  async function handleDeleteAccount() {
    if (!supabase) return;
    if (!window.confirm(t('accountDeleteConfirm'))) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      setInfoMessage(t('accountDeleteFailed'));
      return;
    }

    try {
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        console.error('[delete-account] error:', body?.error, 'status:', res.status);
        if (body?.error === 'server_not_configured') {
          setInfoMessage(t('accountDeleteRequiresServer'));
        } else {
          setInfoMessage(t('accountDeleteFailed'));
        }
        return;
      }
      // Sign out locally and reset state
      await supabase.auth.signOut();
      setAppSession(null);
      setTrips([]);
      setSelectedTripId('');
      goToTripsHome();
      setInfoMessage(t('accountDeleteSuccess'));
    } catch {
      setInfoMessage(t('accountDeleteFailed'));
    }
  }

  function exportVisitsCsv() {
    if (!recentVisits.length) {
      setInfoMessage(t('noVisitsForExport'));
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
      newTripDate.trim(),
      inviteCode,
      appSession?.name || 'Ty',
      appSession?.userId || null
    );
    const newTrips = [trip, ...trips];
    setTrips(newTrips);
    openTrip(trip.id, 'overview', trip.inviteCode);
    setNewTripName('');
    setNewTripDate('');
    setShowCreateTripModal(false);
    setInfoMessage(`${trip.name}: ${t('tripCreated')}`);

    // Save immediately so the invite code is findable via join RPC right away.
    // The debounced auto-save fires 500ms later which is too slow for instant sharing.
    if (supabase && canSyncWithDb && appSession?.userId && dbLoadedRef.current) {
      supabase.from('trip_states').upsert({
        user_id: appSession.userId,
        state_json: { trips: newTrips, selectedTripId: trip.id },
        updated_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.error('Trip create save failed:', error.message, error.code);
      });
    }
  }

  function updateTripSettings(partial: Partial<Pick<Trip, 'name' | 'date' | 'currency' | 'color' | 'archived'>>) {
    if (!currentTrip) return;
    if (partial.archived) {
      const tripMembersForCompute = (currentTrip.members || []).map((m) => (typeof m === 'string' ? m : { id: m.id, name: m.name }));
      const tripBalances = computeBalances(tripMembersForCompute, withExpandedParticipants(currentTrip.expenses.filter((e) => !e.deletedAt), (currentTrip.members || []).map(memberNameOf)));
      const tripSettlements = settleDebts(tripBalances);
      if (tripSettlements.length > 0) {
        setInfoMessage(t('tripNeedsSettlementBody'));
        setStaleTripWarning({ tripId: currentTrip.id, tripName: currentTrip.name });
        return;
      }
    }
    updateCurrentTrip((trip) => ({ ...trip, ...partial }));
  }

  function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentTripOwnerIsSelf) return;
    if (!currentTrip) return;
    const cleaned = newMember.trim();

    if (
      !cleaned ||
      currentTrip.members.some((m) => memberNameOf(m).trim().toLowerCase() === cleaned.toLowerCase())
    ) {
      return;
    }

    updateCurrentTrip((trip) => ({ ...trip, members: [...trip.members, { name: cleaned }] }));
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

    if (supabase && appSession?.userId) {
      void notifyMemberAdded(cleaned, currentTrip);
    }
  }

  async function notifyMemberAdded(memberName: string, trip: Trip) {
    if (!supabase || !appSession?.userId) return;

    // Use SECURITY DEFINER RPC to bypass user_presence RLS (non-admins can't query other rows directly)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lookupData } = (await (supabase.rpc as any)('lookup_users_by_name', {
      p_name: memberName,
    })) as { data: { users?: Array<{ user_id: string; user_name: string; user_email?: string }> } | null };

    const candidates = lookupData?.users || [];
    if (!candidates.length) return;

    const target = candidates[0];
    if (!target?.user_id) return;

    const targetEmail = target.user_email?.trim() || undefined;

    // Upgrade the member slot from { name } to { id, name } now that we have the user's ID
    updateCurrentTrip((t) => ({
      ...t,
      members: t.members.map((m) => {
        if (memberNameOf(m).trim().toLowerCase() !== memberName.trim().toLowerCase()) return m;
        if (typeof m !== 'string' && m.id) return m; // already has ID
        return { id: target.user_id, name: memberNameOf(m), ...(targetEmail ? { email: targetEmail } : {}) };
      }),
    }));

    await supabase.from('member_add_notifications').insert({
      target_user_id: target.user_id,
      trip_id: trip.id,
      trip_name: trip.name,
      member_name: memberName,
      actor_name: appSession.name,
    });

    // Copy the trip to the target user's account so it appears in their overview immediately
    if (targetEmail) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)('invite_user_by_email', {
          p_invite_code: trip.inviteCode,
          p_member_name: memberName,
          p_target_email: targetEmail,
        });
      } catch (e) {
        // ignore - notification still created, user can join manually via invite code
      }
    }
  }

  function handleAddMemberFromHistory(memberName: string) {
    if (!currentTripOwnerIsSelf || !currentTrip) return;

    const exists = currentTrip.members.some(
      (name) => memberNameOf(name).trim().toLowerCase() === memberName.trim().toLowerCase()
    );
    if (exists) return;

    updateCurrentTrip((trip) => ({ ...trip, members: [...trip.members, { name: memberName }] }));
    setDraft((prev) => ({
      ...prev,
      participants: [...new Set([...prev.participants, memberName])],
      participantWeights: {
        ...prev.participantWeights,
        [memberName]: 1,
      },
      participantAmounts: {
        ...prev.participantAmounts,
        [memberName]: 0,
      },
    }));

    if (supabase && appSession?.userId) {
      void notifyMemberAdded(memberName, currentTrip);
    }
  }

  async function acknowledgeMemberAddNotification(notificationId: string) {
    if (!supabase) return;

    await supabase
      .from('member_add_notifications')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('target_user_id', appSession?.userId || '');

    setMemberAddNotifications((prev) => prev.filter((item) => item.id !== notificationId));
  }

  function leaveCurrentTrip() {
    if (!currentTrip || currentTripOwnerIsSelf) return;

    setTrips((prev) => prev.filter((trip) => trip.id !== currentTrip.id));
    goToTripsHome();
    setInfoMessage(t('leftTripInfo'));
  }

  async function saveSelfIban() {
    if (!supabase || !appSession?.userId) return;

    const normalizedIban = normalizeIban(selfIban);
    if (normalizedIban && !isValidIban(normalizedIban)) {
      setInfoMessage(t('ibanInvalid'));
      return;
    }

    setSavingIban(true);
    try {
      await supabase.from('user_profiles').upsert({
        user_id: appSession.userId,
        user_name: appSession.name,
        user_email: appSession.email,
        iban: normalizedIban,
        updated_at: new Date().toISOString(),
      });
      setSelfIban(formatIbanForDisplay(normalizedIban));
      setInfoMessage(t('ibanSaved'));
    } finally {
      setSavingIban(false);
    }
  }

  async function saveAvatarEmoji(emoji: string | null) {
    if (!supabase) return;
    setSavingEmoji(true);
    try {
      await supabase.auth.updateUser({ data: { avatar_emoji: emoji } });
      setSelfAvatarEmoji(emoji);
    } finally {
      setSavingEmoji(false);
    }
  }

  async function resolveMemberProfile(memberName: string, options?: { silent?: boolean }) {
    if (!supabase) return null;

    const normalized = memberName.trim().toLowerCase();
    if (!normalized) return null;

    if (appSession && (normalized === appSession.name.trim().toLowerCase() || isSelfName(memberName))) {
      return {
        userId: appSession.userId,
        name: appSession.name,
        email: appSession.email,
        iban: selfIban.trim(),
      } satisfies MemberProfileView;
    }

    const inviteEmail = (currentTrip?.pendingInvites || [])
      .find((invite) => invite.name.trim().toLowerCase() === normalized)
      ?.contact
      ?.trim()
      .toLowerCase();

    if (inviteEmail && inviteEmail.includes('@')) {
      const { data: profileByEmail } = await supabase
        .from('user_profiles')
        .select('user_id, user_name, user_email, iban')
        .eq('user_email', inviteEmail)
        .limit(1)
        .maybeSingle();

      if (profileByEmail?.user_id) {
        return {
          userId: profileByEmail.user_id,
          name: profileByEmail.user_name || memberName,
          email: profileByEmail.user_email || inviteEmail,
          iban: (profileByEmail.iban as string | undefined) || '',
        } satisfies MemberProfileView;
      }

      const { data: presenceByEmail } = await supabase
        .from('user_presence')
        .select('user_id, user_name, user_email')
        .eq('user_email', inviteEmail)
        .limit(1)
        .maybeSingle();

      if (presenceByEmail?.user_id) {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('iban')
          .eq('user_id', presenceByEmail.user_id)
          .maybeSingle();

        return {
          userId: presenceByEmail.user_id,
          name: presenceByEmail.user_name || memberName,
          email: presenceByEmail.user_email || inviteEmail,
          iban: (profileData?.iban as string | undefined) || '',
        } satisfies MemberProfileView;
      }
    }

    const { data: presences } = await supabase
      .from('user_presence')
      .select('user_id, user_name, user_email, last_seen')
      .ilike('user_name', memberName)
      .order('last_seen', { ascending: false })
      .limit(5);

    const memberPresence = (presences || []).find((row) =>
      row.user_name?.trim().toLowerCase() === normalized
    ) || (presences || [])[0];

    if (!memberPresence?.user_id) {
      if (!options?.silent) setInfoMessage(t('profileNotFound'));
      return null;
    }

    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('iban')
      .eq('user_id', memberPresence.user_id)
      .maybeSingle();

    return {
      userId: memberPresence.user_id,
      name: memberPresence.user_name || memberName,
      email: memberPresence.user_email || '',
      iban: (profileData?.iban as string | undefined) || '',
    } satisfies MemberProfileView;
  }

  async function openMemberProfile(memberName: string) {
    const profile = await resolveMemberProfile(memberName);
    if (!profile) return;
    setMemberProfile(profile);
  }

  async function primeSettlementRecipientIban(memberName: string) {
    const key = memberKey(memberName);
    if (!key || memberIbanByName[key] !== undefined) return;

    const profile = await resolveMemberProfile(memberName, { silent: true });
    setMemberIbanByName((prev) => ({
      ...prev,
      [key]: (profile?.iban || '').trim(),
    }));
  }

  function copyIban(value: string) {
    if (!value.trim()) return;
    navigator.clipboard.writeText(value.trim()).then(() => {
      setInfoMessage(t('ibanCopied'));
    });
  }

  function acknowledgeStaleTripWarning() {
    if (!staleTripWarning) return;
    const userId = appSession?.userId || 'guest';
    setDismissedStaleTripWarnings((prev) => ({
      ...prev,
      [`${userId}:${staleTripWarning.tripId}`]: true,
    }));
    setStaleTripWarning(null);
  }

  function removeMember(memberName: string) {
    if (!currentTrip) return;
    const isOwner = isSelfName(currentTrip.owner);
    if (!isOwner) return;

    const isOwnerRemoving = isSameMember(memberName, currentTrip.owner);
    const otherMembers = currentTrip.members.filter((name) => !isSameMember(name, memberName));

    if (isOwnerRemoving && otherMembers.length === 0) {
      // If owner removes themselves and they're alone, delete trip
      void deleteTrip(currentTrip.id);
      setInfoMessage(t('onlyMemberTripDeleted'));
      return;
    }

    if (isOwnerRemoving && otherMembers.length > 0) {
      // If owner removes themselves, transfer ownership to first remaining member
      const newOwner = memberNameOf(otherMembers[0]);
      updateCurrentTrip((trip) => ({
        ...trip,
        owner: newOwner,
        members: otherMembers,
        expenses: trip.expenses.map((expense) => {
          const payerVal = isSameMember(expense.payer as any, memberName)
            ? (memberNameOf(trip.members[0]) || 'Ty')
            : (memberNameOf(expense.payer || '') || 'Ty');
          const participants = (expense.participants || [])
            .filter((name) => !isSameMember(name, memberName))
            .map(memberNameOf);
          return {
            ...expense,
            payer: payerVal,
            participants,
          } as TripExpense;
        }),
      }));
      setInfoMessage(`${t('ownershipTransferredAndRemoved')} ${formatMemberName(newOwner)}. ${t('removedFromTrip')}`);
      return;
    }

    // Regular member removal
    updateCurrentTrip((trip) => ({
      ...trip,
      members: otherMembers,
      expenses: trip.expenses.map((expense) => {
        const payerVal = isSameMember(expense.payer as any, memberName)
          ? (memberNameOf(trip.members[0]) || 'Ty')
          : (memberNameOf(expense.payer || '') || 'Ty');
        const participants = (expense.participants || [])
          .filter((name) => !isSameMember(name, memberName))
          .map(memberNameOf);
        return {
          ...expense,
          payer: payerVal,
          participants,
        } as TripExpense;
      }),
    }));
    setInfoMessage(`${formatMemberName(memberName)} ${t('memberRemoved')}`);
  }

  async function deleteTrip(tripId: string) {
    const tripToDelete = trips.find((t) => t.id === tripId);
    if (!tripToDelete) return;
    const isOwner = isSelfName(tripToDelete.owner);
    if (!isOwner) return;

    if (supabase && canSyncWithDb && tripToDelete.inviteCode) {
      let removedEverywhere = false;

      const { data: removeData, error: removeError } = (await supabase.rpc('remove_trip_by_invite_code', {
        p_invite_code: tripToDelete.inviteCode,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as unknown as { data: Record<string, any> | null; error: { code?: string } | null };

      if (!removeError && removeData?.success) {
        removedEverywhere = true;
      }

      if (!removedEverywhere) {
        const deletedPayload: Trip = {
          ...tripToDelete,
          archived: true,
          deletedAt: new Date().toISOString(),
          deletedBy: appSession?.userId || null,
        };

        const { error: syncError } = await supabase.rpc('sync_trip_state_by_invite_code', {
          p_invite_code: tripToDelete.inviteCode,
          p_trip: deletedPayload,
        });

        if ((syncError?.code === 'PGRST202' || removeError?.code === 'PGRST202') && !syncRpcMissingWarnedRef.current) {
          syncRpcMissingWarnedRef.current = true;
          setInfoMessage('Aktívna synchronizácia nie je zapnutá v databáze. Spusťte SQL súbor supabase/invite_functions.sql.');
        }
      }

      // Force refresh all clients to immediately apply the deletion (both remove and fallback sync)
      if (refreshFromDbRef.current) {
        await refreshFromDbRef.current();
      }
    }

    setTrips((prev) => prev.filter((trip) => trip.id !== tripId));
    goToTripsHome();
    setInfoMessage(`${tripToDelete.name}: ${t('tripDeleted')}`);
  }

  function handleGuestClaimIdentity(invitedName: string) {
    if (!currentTrip) return;
    const userName = appSession?.name || 'Ty';

    updateCurrentTrip((trip) => ({
      ...trip,
      members: trip.members.map((m) => (memberNameOf(m) === userName ? invitedName : memberNameOf(m))),
      expenses: trip.expenses.map((expense) => ({
        ...expense,
        payer: memberNameOf(expense.payer || '') === userName ? invitedName : (memberNameOf(expense.payer || '') || 'Ty'),
        participants: (expense.participants || []).map((p) => (memberNameOf(p) === userName ? invitedName : memberNameOf(p))),
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

    setInfoMessage(`${t('identityNow')} ${invitedName}.`);
  }

  function mergeFictionalMember(fictionalName: string) {
    if (!currentTrip || !appSession?.name) return;
    const realName = appSession.name;

    // Rename fictionalName → realName everywhere, remove duplicate realName entry if exists
    updateCurrentTrip((trip) => ({
      ...trip,
      members: trip.members
        .filter((m) => memberNameOf(m) !== realName || memberNameOf(m) === fictionalName) // remove existing realName duplicate
        .map((m) => (memberNameOf(m) === fictionalName ? realName : memberNameOf(m))),
      expenses: trip.expenses.map((expense) => ({
        ...expense,
        payer: memberNameOf(expense.payer || '') === fictionalName ? realName : (memberNameOf(expense.payer || '') || 'Ty'),
        participants: (expense.participants || [])
          .filter((p) => memberNameOf(p) !== realName || memberNameOf(p) === fictionalName)
          .map((p) => (memberNameOf(p) === fictionalName ? realName : memberNameOf(p))),
      })),
      pendingInvites: trip.pendingInvites.map((invite) =>
        invite.name === fictionalName ? { ...invite, name: realName, status: 'Prijate' } : invite
      ),
    }));

    setInfoMessage(`${t('mergedFictionalMember')} ${realName}.`);
  }

  function copyInviteCodeToClipboard() {
    if (!currentTrip || !inviteJoinUrl) return;
    navigator.clipboard.writeText(inviteJoinUrl).then(() => {
      setInfoMessage(t('inviteCopied'));
    });
  }

  function shareViaEmail() {
    if (!currentTrip || !inviteJoinUrl) return;
    const subject = encodeURIComponent(`${t('inviteSubject')} ${currentTrip.name}`);
    const body = encodeURIComponent(
      `${t('inviteEmailText')} "${currentTrip.name}".\n\n${t('clickLinkBelow')}\n${inviteJoinUrl}\n\n${t('lookingForward')}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }

  function shareViaWhatsApp() {
    if (!currentTrip || !inviteJoinUrl) return;
    const text = encodeURIComponent(
      `${t('inviteEmailText')} "${currentTrip.name}".\n\n${t('clickLink')}\n${inviteJoinUrl}`
    );
    window.open(`https://wa.me/?text=${text}`);
  }

  function shareViaSMS() {
    if (!currentTrip || !inviteJoinUrl) return;
    const text = encodeURIComponent(
      `${t('tripLabel')} ${currentTrip.name}: ${inviteJoinUrl}`
    );
    window.open(`sms:?body=${text}`);
  }

  async function propagateTripStateImmediately(trip: Trip) {
    if (!supabase || !canSyncWithDb || !trip.inviteCode) return;

    const { data: syncData, error: syncError } = await supabase.rpc('sync_trip_state_by_invite_code', {
      p_invite_code: trip.inviteCode,
      p_trip: trip,
    });

    if (syncError?.code === 'PGRST202') {
      if (!syncRpcMissingWarnedRef.current) {
        syncRpcMissingWarnedRef.current = true;
        setInfoMessage('Aktívna synchronizácia nie je zapnutá v databáze. Spusťte SQL súbor supabase/invite_functions.sql.');
      }
      return;
    }

    if (syncError) {
      console.error('Immediate trip propagation failed:', syncError.message);
      return;
    }

    // The RPC returns a JSON-level error (e.g. 'forbidden') on HTTP 200 when the
    // caller's trip_states row doesn't yet contain this trip. Don't mark as synced
    // in that case — the AutoSave will write it on the next cycle.
    const rpcResult = syncData as { error?: string; success?: boolean } | null;
    if (rpcResult?.error) {
      console.warn('Immediate trip propagation RPC error:', rpcResult.error);
      return;
    }

    lastPropagatedTripSnapshotRef.current[trip.inviteCode] = JSON.stringify(trip);
  }

  async function handleJoinByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedName = joinName.trim();
    const cleanedCode = joinCode.trim().toUpperCase();
    if (!cleanedName || !cleanedCode) return;

    let foundTripId = '';
    let duplicateMember = false;
    let hasMatchingInvite = false;
    let joinedTrip: Trip | null = null;

    setTrips((prev) =>
      prev.map((trip) => {
        if (trip.inviteCode !== cleanedCode) return trip;
        foundTripId = trip.id;

        if (trip.members.some((m) => memberNameOf(m).toLowerCase() === cleanedName.toLowerCase())) {
          // Check if there's a pending invite for this name
          const matchingInvite = trip.pendingInvites.find(
            (invite) => invite.name.toLowerCase() === cleanedName.toLowerCase()
          );
          
          if (matchingInvite) {
            // They're claiming an existing fictional member slot
            hasMatchingInvite = true;
            const updatedTrip = {
              ...trip,
              pendingInvites: trip.pendingInvites.map((invite) =>
                invite.name.toLowerCase() === cleanedName.toLowerCase()
                  ? { ...invite, status: 'Prijate' as const }
                  : invite
              ),
            } satisfies Trip;
            joinedTrip = updatedTrip;
            return updatedTrip;
          }
          
          // Name exists but no matching invite
          duplicateMember = true;
          return trip;
        }

        const updatedTrip = {
          ...trip,
          members: [...trip.members, { name: cleanedName }],
          pendingInvites: trip.pendingInvites.map((invite) =>
            invite.name.toLowerCase() === cleanedName.toLowerCase()
              ? { ...invite, status: 'Prijate' as const }
              : invite
          ),
        } satisfies Trip;
        joinedTrip = updatedTrip;
        return updatedTrip;
      })
    );

    if (!foundTripId) {
      if (!supabase || !appSession) {
        setInfoMessage(t('invalidCode'));
        return;
      }

      // Server-side join for trips owned by other users (not in local state).
      const { data } = (await supabase.rpc('join_trip_by_invite_code', {
        p_invite_code: cleanedCode,
        p_member_name: cleanedName,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as unknown as { data: Record<string, any> };

      if (data?.error === 'name_taken') {
        setInfoMessage(`${cleanedName} ${t('nameAlreadyInGroup')}`);
        return;
      }

      if (!data?.success || !data?.trip) {
        setInfoMessage(t('invalidCode'));
        return;
      }

      let normalized = normalizeTrip(data.trip as Trip);
      const registrationName = (appSession.name || '').trim();
      const effectiveName = registrationName || cleanedName;
      const ownerKey = (normalized.owner || '').trim().toLowerCase();
      const ownerLabel = ownerKey && ownerKey !== 'ty' ? normalized.owner : 'Ty';

      const remapName = (n: Member | string) => {
        const nStr = memberNameOf(n);
        if (nStr === cleanedName) return effectiveName;
        if (nStr.toLowerCase() === 'ty') return ownerLabel;
        if (nStr === effectiveName) return null;
        return nStr;
      };

      const selfEntry: Member | string = appSession?.userId
        ? { id: appSession.userId, name: effectiveName }
        : effectiveName;
      const remapMembers = (members: (Member | string)[]) => {
        const result: (Member | string)[] = [];
        let addedSelf = false;
        for (const m of members) {
          const mapped = remapName(m);
          if (mapped === null) {
            if (!addedSelf && memberNameOf(m) === cleanedName) {
              result.push(selfEntry);
              addedSelf = true;
            }
            continue;
          }
          if (mapped === effectiveName) {
            if (!addedSelf) {
              result.push(selfEntry);
              addedSelf = true;
            }
            continue;
          }
          result.push(mapped);
        }
        if (!addedSelf) result.push(selfEntry);
        return result;
      };

      normalized = {
        ...normalized,
        members: remapMembers(normalized.members),
        expenses: normalized.expenses.map((exp) => ({
          ...exp,
          payer: remapName(exp.payer || '') ?? effectiveName,
          participants: (exp.participants || [])
            .map((p) => remapName(p))
            .filter((p): p is string => p !== null)
            .filter((p, i, arr) => arr.indexOf(p) === i),
        })),
        pendingInvites: normalized.pendingInvites.map((inv) => ({
          ...inv,
          name: inv.name === cleanedName ? effectiveName : inv.name,
        })),
      };

      setTrips((prev) => [...prev.filter((trip) => trip.id !== normalized.id), normalized]);
      void propagateTripStateImmediately(normalized);
      openTrip(data.tripId, 'overview');
      setJoinName('');
      setJoinCode('');
      setShowJoinTripModal(false);
      setInfoMessage(`${effectiveName} ${t('joinedTripInfo')}`);
      return;
    }

    if (duplicateMember) {
      setInfoMessage(`${cleanedName} ${t('nameAlreadyInGroup')}`);
      return;
    }

    if (joinedTrip) {
      void propagateTripStateImmediately(joinedTrip);
    }

    openTrip(foundTripId, 'overview');
    setJoinName('');
    setJoinCode('');
    setShowJoinTripModal(false);
    setInfoMessage(
      hasMatchingInvite
        ? `${cleanedName} ${t('inviteAcceptedJoin')}`
        : `${cleanedName} ${t('joinedTripInfo')}`
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

  async function logExpenseEvent(expenseId: string, eventType: ExpenseHistoryEvent['event_type'], payload: ExpenseHistoryPayload) {
    if (!supabase || !canSyncWithDb || !currentTrip) return;

    const { error } = await supabase.from('trip_expense_events').insert({
      trip_id: currentTrip.id,
      expense_id: expenseId,
      event_type: eventType,
      payload,
      actor_user_id: appSession?.userId || null,
    });

    if (!error) return;
    // Ignore environments where migration has not been applied yet.
    if (error.code === 'PGRST205' || error.code === '42P01') return;
    console.error('Expense event logging failed:', error.message);
  }

  async function loadExpenseHistory(expenseId: string) {
    if (!supabase || !canSyncWithDb || !currentTrip) {
      setSelectedExpenseHistory([]);
      return;
    }

    setExpenseHistoryLoading(true);
    const { data, error } = await supabase
      .from('trip_expense_events')
      .select('id, trip_id, expense_id, event_type, payload, created_at')
      .eq('trip_id', currentTrip.id)
      .eq('expense_id', expenseId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      if (error.code !== 'PGRST205' && error.code !== '42P01') {
        console.error('Expense history load failed:', error.message);
      }
      setSelectedExpenseHistory([]);
      setExpenseHistoryLoading(false);
      return;
    }

    setSelectedExpenseHistory((data || []) as ExpenseHistoryEvent[]);
    setExpenseHistoryLoading(false);
  }

  function openExpenseDetail(expenseId: string) {
    setSelectedExpenseId(expenseId);
    setSelectedExpenseHistory([]);
    setShowExpenseDetailModal(true);
    void loadExpenseHistory(expenseId);
  }

  function closeExpenseDetail() {
    setShowExpenseDetailModal(false);
    setSelectedExpenseId(null);
    setSelectedExpenseHistory([]);
    setExpenseHistoryLoading(false);
  }

  async function handleAddExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentTrip || !canAddExpense) return;

    if (supabase && canSyncWithDb && appSession?.userId) {
      const tripIdAtSubmit = currentTrip.id;
      const tripNameAtSubmit = currentTrip.name;

      const { data: canAccessTrip, error: accessError } = await supabase.rpc('can_access_trip', {
        target_trip_id: tripIdAtSubmit,
      });

      if (accessError || canAccessTrip === false) {
        setTrips((prev) => prev.filter((trip) => trip.id !== tripIdAtSubmit));
        if (selectedTripId === tripIdAtSubmit) {
          goToTripsHome();
        }
        setShowExpenseModal(false);
        setEditingExpenseId(null);
        setInfoMessage(`${tripNameAtSubmit}: ${t('tripDeletedByOwner')}`);
        sendNotification(`${tripNameAtSubmit} - ${t('tripDeleted')}`, {
          body: t('tripDeletedByOwner'),
          icon: '/icon.png',
        });
        return;
      }
    }

    // Duplicate detection (skip when editing an existing expense)
    if (!editingExpenseId && draft.expenseType !== 'transfer') {
      const checkAmount = draft.splitType === 'individual'
        ? safeParticipants.reduce((s, n) => s + (parseMoneyInput(draft.participantAmounts?.[n] || 0) || 0), 0)
        : parseMoneyInput(draft.amount);
      const checkDate = draft.date || new Date().toISOString().slice(0, 10);
      const normTitle = (draft.title || '').trim().toLowerCase();
      const duplicate = normalizedExpenses.find((e) => {
        const sameAmount = Math.abs(e.amount - checkAmount) < 0.01;
        const sameDate = e.date === checkDate;
        const similarTitle = normTitle && e.title.toLowerCase() === normTitle;
        return (sameAmount && sameDate) || (similarTitle && sameAmount);
      });
      if (duplicate && !duplicateWarning) {
        setDuplicateWarning({ title: duplicate.title, amount: duplicate.amount, date: duplicate.date || '' });
        return;
      }
    }
    setDuplicateWarning(null);

    // For 'individual' split, compute total from participantAmounts instead of relying on draft.amount
    let amount = parseMoneyInput(draft.amount);
    if (draft.splitType === 'individual') {
      amount = safeParticipants.reduce((sum, name) => {
        const raw = parseMoneyInput(draft.participantAmounts?.[name] || 0);
        return sum + (Number.isFinite(raw) && raw > 0 ? raw : 0);
      }, 0);
    }
    // Resolve member ids preferring trip member ids, falling back to session id when appropriate
    const resolveMemberId = (raw?: string | null) => {
      if (!raw) return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;
      // treat 'Ty' as current session user
      if (trimmed.toLowerCase() === 'ty') return appSession?.userId ?? null;

      // first try to match by id in membersForCompute
      const byId = membersForCompute.find((m) => typeof m !== 'string' && m.id === trimmed);
      if (byId && typeof byId !== 'string') return byId.id;

      // then match by name
      const byName = membersForCompute.find((m) => (typeof m === 'string' ? m : m.name) === trimmed);
      if (byName && typeof byName !== 'string') return byName.id;

      // finally, if raw equals session name, use session id
      if (trimmed === (appSession?.name || '').trim()) return appSession?.userId ?? null;
      return null;
    };
    const expense: TripExpense = (() => {
      const expenseTitle = draft.title.trim() || (draft.expenseType === 'transfer' ? `Transfer ${safePayer} -> ${safeTransferTo}` : '');
      const base = {
        id: makeId(),
        title: expenseTitle,
        amount,
        date: draft.date || new Date().toISOString().slice(0, 10),
        payer: safePayer,
        participants: draft.expenseType === 'transfer' ? [safeTransferTo] : safeParticipants,
        expenseType: draft.expenseType,
        splitType: draft.expenseType === 'transfer' ? 'equal' : draft.splitType,
        category: receiptCategory || (draft.expenseType === 'transfer' ? 'prevod' : inferCategory(expenseTitle)),
      } as Partial<TripExpense>;

      // Only fall back to appSession.userId when the payer IS the current user.
      // Using the session UUID as a fallback for a different member would attribute
      // that member's payment to the current user in computeBalances.
      const payerId = resolveMemberId(safePayer) || (isSelfName(safePayer) ? appSession?.userId ?? null : null);

      if (draft.expenseType === 'transfer') {
        const transferToId = resolveMemberId(safeTransferTo);
        return {
          ...base,
          payerId,
          transferTo: safeTransferTo,
          transferToId: transferToId || null,
        } as TripExpense;
      }

      const participantIds = safeParticipants
        .map((s) => resolveMemberId(s))
        .filter((v): v is string => Boolean(v));

      return {
        ...base,
        payerId,
        participants: safeParticipants,
        participantIds,
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
                const raw = parseMoneyInput(draft.participantAmounts[name] || 0);
                acc[name] = Number.isFinite(raw) && raw > 0 ? raw : 0;
                return acc;
              }, {})
            : undefined,
      } as TripExpense;
    })();

    if (editingExpenseId) {
      // capture previous expense to include a concise diff in history
      const previous = currentTrip.expenses.find((item) => item.id === editingExpenseId) || null;

      updateCurrentTrip((trip) => ({
        ...trip,
        expenses: trip.expenses.map((item) => (item.id === editingExpenseId ? { ...expense, id: editingExpenseId } : item)),
      }));
      // store both old and new in payload so UI can render a small before/after
      void logExpenseEvent(editingExpenseId, 'updated', { old: previous, new: { ...expense, id: editingExpenseId } });
      setEditingExpenseId(null);
      setInfoMessage(t('transactionUpdatedInfo'));
      sendNotification(`${currentTrip?.name || t('tripLabel')} - ${t('transactionUpdatedTitle')}`, {
        body: `${expense.title} (${eur(expense.amount)})`,
      });
    } else {
      updateCurrentTrip((trip) => ({ ...trip, expenses: [expense, ...trip.expenses] }));
      void logExpenseEvent(expense.id, 'created', expense);
      sendNotification(`${currentTrip?.name || t('tripLabel')} - ${t('newTransactionTitle')}`, {
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
      participants: members,
      participantAmounts: members.reduce<Record<string, number>>((acc, name) => {
        acc[name] = 0;
        return acc;
      }, {}),
    }));

    setShowExpenseModal(false);
    setReceiptStep(null);
    setReceiptImagePreview(null);
    setReceiptItems([]);
    setReceiptMerchant('');
    setReceiptCategory('');
    closeExpenseDetail();
  }

  function openExpenseModalForCreate() {
    if (currentTrip?.status === 'closed') return;
    setEditingExpenseId(null);
    const currentUserInMembers = members.find((m) => isSelfName(m)) || 'Ty';
    setDraft({
      title: '',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      expenseType: 'expense',
      payer: currentUserInMembers,
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

    const tripMembers = currentTrip.members || [];
    const storedParticipants = (found.participants || []).map(memberNameOf);
    const storedIds = found.participantIds || [];

    // Resolve a stored participant name+id to the current member display name.
    // Handles: exact name match, ID match, "Ty" → current user mapping.
    const resolveToCurrentName = (storedName: string, storedId?: string): string | null => {
      const byName = tripMembers.find((m) => memberNameOf(m) === storedName);
      if (byName) return memberNameOf(byName);
      if (storedId) {
        const byId = tripMembers.find((m) => typeof m !== 'string' && m.id === storedId);
        if (byId) return memberNameOf(byId);
      }
      if (storedName.toLowerCase() === 'ty') {
        if (appSession?.userId) {
          const byUserId = tripMembers.find((m) => typeof m !== 'string' && m.id === appSession.userId);
          if (byUserId) return memberNameOf(byUserId);
        }
        return displayCurrentUserName || 'Ty';
      }
      return null;
    };

    // Build old-name → current-display-name mapping and collect normalized participant list.
    const oldToNew = new Map<string, string>();
    const normalizedParticipants: string[] = [];
    storedParticipants.forEach((storedName, i) => {
      const currentName = resolveToCurrentName(storedName, storedIds[i]);
      if (currentName && !normalizedParticipants.includes(currentName)) {
        normalizedParticipants.push(currentName);
        oldToNew.set(storedName, currentName);
        if (storedIds[i]) oldToNew.set(storedIds[i], currentName);
      }
    });

    // Re-key participantAmounts and participantWeights to current display names.
    const remapRecord = (rec: Record<string, any>) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(rec)) { out[oldToNew.get(k) ?? k] = v; }
      return out;
    };

    const storedPayerName = memberNameOf(found.payer || '');
    const normalizedPayer = resolveToCurrentName(storedPayerName, found.payerId ?? undefined) ?? storedPayerName;
    const validPayer = members.includes(normalizedPayer) ? normalizedPayer : members[0] || 'Ty';

    const storedTransferTo = memberNameOf(found.transferTo || '');
    const normalizedTransferTo = resolveToCurrentName(storedTransferTo, found.transferToId ?? undefined) ?? storedTransferTo;

    setEditingExpenseId(expenseId);
    setDraft({
      title: found.title,
      amount: String(found.amount),
      date: found.date || new Date().toISOString().slice(0, 10),
      expenseType: found.expenseType === 'transfer' ? 'transfer' : 'expense',
      payer: validPayer,
      transferTo: normalizedTransferTo || members.find((name) => name !== validPayer) || '',
      participants: normalizedParticipants.length > 0 ? normalizedParticipants : members,
      splitType: found.splitType || 'equal',
      participantWeights: remapRecord(found.participantWeights || {}),
      participantAmounts: remapRecord(found.participantAmounts || {}),
    });
    openTrip(currentTrip.id, 'expenses');
    closeExpenseDetail();
    setShowExpenseModal(true);
  }

  async function compressReceiptImage(file: File): Promise<{ b64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img') as HTMLImageElement;
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const b64 = dataUrl.split(',')[1];
        resolve({ b64, mimeType: 'image/jpeg' });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
      img.src = url;
    });
  }

  async function handleReceiptImage(file: File) {
    setReceiptError('');
    setReceiptStep('analyzing');
    // Show preview from original file
    const previewUrl = URL.createObjectURL(file);
    setReceiptImagePreview(previewUrl);
    try {
      const { b64, mimeType } = await compressReceiptImage(file);
      const res = await fetch('/api/analyze-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64, mimeType }),
      });
      let data: { items?: { name: string; price: number }[]; currency?: string; merchant?: string; category?: string; error?: string; detail?: string };
      try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}` }; }
      if (!res.ok || (data.error && !data.items?.length)) {
        setReceiptError(data.error || `Chyba ${res.status}`);
        setReceiptStep('upload');
        return;
      }
      const currentPayer = members.find((m) => isSelfName(m)) || members[0] || 'Ty';
      const items: ReceiptItem[] = (data.items || []).map((it) => ({
        name: it.name,
        price: Number(it.price) || 0,
        assignedTo: '__all__',
      }));
      setReceiptItems(items);
      setReceiptCurrency(data.currency || 'EUR');
      setReceiptMerchant(data.merchant || '');
      setReceiptCategory(data.category || '');
      setReceiptStep('assign');
      setDraft((prev) => ({
        ...prev,
        payer: currentPayer,
        title: prev.title || data.merchant || '',
      }));
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : (lang === 'sk' ? 'Analýza zlyhala' : 'Analysis failed'));
      setReceiptStep('upload');
    }
  }

  function applyReceiptToDraft() {
    if (!receiptItems.length) return;
    const participantAmounts: Record<string, number> = {};
    const allMembers = members.length > 0 ? members : ['Ty'];
    // Tally amounts per member
    receiptItems.forEach((item) => {
      if (item.assignedTo === '__all__') {
        const share = item.price / allMembers.length;
        allMembers.forEach((m) => { participantAmounts[m] = (participantAmounts[m] || 0) + share; });
      } else {
        participantAmounts[item.assignedTo] = (participantAmounts[item.assignedTo] || 0) + item.price;
      }
    });
    // Only keep members with amount > 0
    const participants = Object.keys(participantAmounts).filter((m) => participantAmounts[m] > 0.001);
    const total = participants.reduce((s, m) => s + participantAmounts[m], 0);
    const currentPayer = members.find((m) => isSelfName(m)) || members[0] || 'Ty';
    setDraft((prev) => ({
      ...prev,
      amount: String(Math.round(total * 100) / 100),
      splitType: 'individual',
      participants,
      participantAmounts: Object.fromEntries(
        participants.map((m) => [m, Math.round(participantAmounts[m] * 100) / 100])
      ),
      participantWeights: Object.fromEntries(participants.map((m) => [m, 1])),
      payer: participants.includes(currentPayer) ? currentPayer : participants[0] || currentPayer,
    }));
    setReceiptStep(null);
    setReceiptImagePreview(null);
    // category comes from receipt; keep it so expense save picks it up
  }

  function removeExpense(expenseId: string) {
    if (!currentTrip) return;
    const found = currentTrip.expenses.find((expense) => expense.id === expenseId) || null;
    if (found) void logExpenseEvent(expenseId, 'deleted', found);
    const now = new Date().toISOString();
    deletedExpenseIdsRef.current.add(expenseId);
    updateCurrentTrip((trip) => ({
      ...trip,
      expenses: trip.expenses.map((e) => e.id === expenseId ? { ...e, deletedAt: now } : e),
    }));
    closeExpenseDetail();
  }

  async function handleCloseTrip() {
    if (!currentTrip || !currentTripOwnerIsSelf) return;
    if (!window.confirm(t('closeTripConfirm'))) return;
    setIsClosingTrip(true);
    const activeExpenses = normalizedExpenses.filter((e) => !e.deletedAt);
    let aiSummary: string | null = null;
    try {
      const res = await fetch('/api/trip-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripName: currentTrip.name,
          members,
          expenses: activeExpenses.map((e) => ({ title: e.title, amount: e.amount, payer: e.payer || '', category: e.category || '' })),
          currency: currentTrip.currency,
          date: currentTrip.date,
        }),
      });
      if (res.ok) { const d = await res.json(); aiSummary = d.summary || null; }
    } catch { /* summary is optional */ }
    updateCurrentTrip((trip) => ({ ...trip, status: 'closed', closedAt: new Date().toISOString(), aiSummary }));
    setIsClosingTrip(false);
  }

  function handleReopenTrip() {
    if (!currentTrip || !currentTripOwnerIsSelf) return;
    updateCurrentTrip((trip) => ({ ...trip, status: 'active', aiSummary: null, closedAt: null }));
  }

  function handleMarkAsPaid(fromKey: string, toKey: string, amount: number) {
    if (!currentTrip) return;
    const fromName = displayNameForKey(fromKey);
    const toName = displayNameForKey(toKey);
    const findId = (key: string, name: string) => {
      const m = (currentTrip.members || []).find(
        (mb) => typeof mb !== 'string' && (mb.id === key || memberNameOf(mb) === name)
      );
      if (m && typeof m !== 'string') return m.id;
      if (name === (appSession?.name || '').trim()) return appSession?.userId ?? null;
      return null;
    };
    const expense: TripExpense = {
      id: makeId(),
      title: `${fromName} → ${toName}`,
      amount,
      date: new Date().toISOString().slice(0, 10),
      payer: fromName,
      payerId: findId(fromKey, fromName),
      participants: [toName],
      expenseType: 'transfer',
      splitType: 'equal',
      transferTo: toName,
      transferToId: findId(toKey, toName),
      category: 'prevod',
    };
    updateCurrentTrip((trip) => ({ ...trip, expenses: [expense, ...trip.expenses] }));
    setInfoMessage(t('paymentRecorded'));
  }

  function updateExpenseCategory(expenseId: string, category: string) {
    updateCurrentTrip((trip) => ({
      ...trip,
      expenses: trip.expenses.map((e) => e.id === expenseId ? { ...e, category } : e),
    }));
    setEditingCategoryExpenseId(null);
  }

  async function handleConvertToEur() {
    if (!currentTrip || currentTrip.currency === 'EUR') return;
    setIsCurrencyConverting(true);
    try {
      const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(currentTrip.currency)}&to=EUR`);
      const data = await res.json() as { rates?: Record<string, number> };
      const rate = data.rates?.EUR;
      if (!rate) { setInfoMessage(`Kurz pre ${currentTrip.currency} sa nepodarilo načítať.`); setIsCurrencyConverting(false); return; }
      updateCurrentTrip((trip) => ({
        ...trip,
        currency: 'EUR',
        expenses: trip.expenses.map((e) => ({
          ...e,
          originalCurrency: e.originalCurrency || trip.currency,
          originalAmount: e.originalAmount ?? e.amount,
          amount: Math.round(e.amount * rate * 100) / 100,
          ...(e.participantAmounts ? {
            participantAmounts: Object.fromEntries(
              Object.entries(e.participantAmounts).map(([k, v]) => [k, Math.round(Number(v) * rate * 100) / 100])
            ),
          } : {}),
        })),
      }));
      setInfoMessage(t('convertedMsg'));
    } catch { setInfoMessage('Prepočítanie zlyhalo.'); }
    setIsCurrencyConverting(false);
  }

  async function toggleNotifications() {
    if (typeof Notification === 'undefined') {
      setInfoMessage(t('browserNoNotifications'));
      return;
    }

    if (!window.isSecureContext) {
      setInfoMessage(t('notificationsHttpsOnly'));
      return;
    }

    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      setInfoMessage(t('notificationsOff'));
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationsEnabled(true);
      setInfoMessage(t('notificationsOn'));
      return;
    }

    if (Notification.permission === 'denied') {
      setInfoMessage(t('notificationsBlocked'));
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
    setInfoMessage(
      permission === 'granted'
        ? t('notificationsOn')
        : t('notificationsDenied')
    );
  }

  function sendNotification(title: string, options?: NotificationOptions) {
    if (typeof Notification === 'undefined' || !notificationsEnabled) return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(title, options);
    } catch (error) {
      console.error(t('notificationSendError'), error);
    }
  }

  useEffect(() => {
    if (!appSession) return;
    if (supabase && !dbLoadedRef.current) return;

    const archiveThresholdMs = 7 * 24 * 60 * 60 * 1000;
    const langPack = T[lang];

    const runAutoArchive = () => {
      const now = Date.now();
      const archivedTripNames: string[] = [];
      const staleUnsettled: StaleTripWarning[] = [];

      setTrips((prev) => {
        let changed = false;

        const next = prev.map((trip) => {
          if (trip.archived) return trip;
          if (!trip.expenses.length) return trip;

          let latestExpenseTs = 0;
          for (const expense of trip.expenses) {
            const ts = expenseIdTimestamp(expense.id);
            if (ts && ts > latestExpenseTs) latestExpenseTs = ts;
          }

          if (!latestExpenseTs) return trip;
          if (now - latestExpenseTs < archiveThresholdMs) return trip;

          const tripMembersForCompute = (trip.members || []).map((m) => (typeof m === 'string' ? m : { id: m.id, name: m.name }));
          const tripBalances = computeBalances(tripMembersForCompute, withExpandedParticipants(trip.expenses.filter((e) => !e.deletedAt), (trip.members || []).map(memberNameOf)));
          const tripSettlements = settleDebts(tripBalances);
          if (tripSettlements.length > 0) {
            staleUnsettled.push({ tripId: trip.id, tripName: trip.name });
            return trip;
          }

          changed = true;
          archivedTripNames.push(trip.name);
          return { ...trip, archived: true };
        });

        return changed ? next : prev;
      });

      const currentUserId = appSession.userId || 'guest';
      const nextWarning = staleUnsettled.find(
        (item) => !dismissedStaleTripWarnings[`${currentUserId}:${item.tripId}`]
      );
      setStaleTripWarning(nextWarning || null);

      if (!archivedTripNames.length) return;

      archivedTripNames.forEach((tripName) => {
        sendNotification(`${tripName} - ${langPack.tripAutoArchivedTitle}`, {
          body: langPack.tripAutoArchivedBody,
          icon: '/icon.png',
        });
      });

      if (archivedTripNames.length === 1) {
        setInfoMessage(`${archivedTripNames[0]} ${langPack.tripAutoArchivedInfo}`);
      } else {
        setInfoMessage(`${archivedTripNames.length} ${langPack.tripsAutoArchivedInfo}`);
      }
    };

    runAutoArchive();
    const interval = window.setInterval(runAutoArchive, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [appSession, dbLoadTick, dismissedStaleTripWarnings, lang, notificationsEnabled, supabase, trips]);

  useEffect(() => {
    if (!notificationsEnabled || !appSession) return;
    if (supabase && !dbLoadedRef.current) return;

    if (notificationsPrimedForUserRef.current !== appSession.userId) {
      expenseSnapshotRef.current = {};
      memberSnapshotRef.current = {};
      inviteStatusSnapshotRef.current = {};
      tripMetaSnapshotRef.current = {};
    }

    const selfName = appSession.name;
    const normalizedSelfName = selfName.trim().toLowerCase();
    const langPack = T[lang];
    const isSelf = (name: string, trip: Trip) => {
      const normalizedName = name.trim().toLowerCase();
      if (!normalizedName) return false;
      if (normalizedName === 'ty') {
        const ownerNormalized = trip.owner.trim().toLowerCase();
        return ownerNormalized === 'ty' || ownerNormalized === normalizedSelfName;
      }
      return Boolean(normalizedSelfName) && normalizedName === normalizedSelfName;
    };

    if (notificationsPrimedForUserRef.current !== appSession.userId) {
      trips.forEach((trip) => {
        const currentExpenseSnapshot: Record<string, string> = {};
        const currentInviteSnapshot: Record<string, Invite['status']> = {};
        trip.expenses.forEach((expense) => {
          currentExpenseSnapshot[expense.id] = JSON.stringify({
            title: expense.title,
            amount: expense.amount,
            payer: expense.payer,
            participants: expense.participants,
            expenseType: expense.expenseType,
            transferTo: expense.transferTo,
            splitType: expense.splitType,
          });
        });
        trip.pendingInvites.forEach((invite) => {
          currentInviteSnapshot[invite.name.trim().toLowerCase()] = invite.status;
        });

        expenseSnapshotRef.current[trip.id] = currentExpenseSnapshot;
        memberSnapshotRef.current[trip.id] = (trip.members || []).map(memberNameOf);
        inviteStatusSnapshotRef.current[trip.id] = currentInviteSnapshot;
        tripMetaSnapshotRef.current[trip.id] = { name: trip.name, owner: trip.owner };
      });

      notificationsPrimedForUserRef.current = appSession.userId;
      return;
    }

    const previousTripIds = Object.keys(tripMetaSnapshotRef.current);
    const currentTripIds = new Set(trips.map((trip) => trip.id));
    const removedTripIds = previousTripIds.filter((tripId) => !currentTripIds.has(tripId));

    removedTripIds.forEach((tripId) => {
      const meta = tripMetaSnapshotRef.current[tripId];
      if (!meta) return;

      const ownerNormalized = meta.owner.trim().toLowerCase();
      const selfIsOwner = ownerNormalized === 'ty' || ownerNormalized === normalizedSelfName;
      if (!selfIsOwner) {
        sendNotification(`${meta.name} - ${langPack.tripDeleted}`, {
          body: langPack.tripDeletedByOwner,
          icon: '/icon.png',
        });
        setInfoMessage(`${meta.name}: ${langPack.tripDeletedByOwner}`);
      }

      delete expenseSnapshotRef.current[tripId];
      delete memberSnapshotRef.current[tripId];
      delete inviteStatusSnapshotRef.current[tripId];
      delete tripMetaSnapshotRef.current[tripId];
    });

    trips.forEach((trip) => {
      const previousExpenseSnapshot = expenseSnapshotRef.current[trip.id] || {};
      const previousInviteSnapshot = inviteStatusSnapshotRef.current[trip.id] || {};
      const currentExpenseSnapshot: Record<string, string> = {};
      const currentInviteSnapshot: Record<string, Invite['status']> = {};
      trip.expenses.forEach((expense) => {
        currentExpenseSnapshot[expense.id] = JSON.stringify({
          title: expense.title,
          amount: expense.amount,
          payer: expense.payer,
          participants: expense.participants,
          expenseType: expense.expenseType,
          transferTo: expense.transferTo,
          splitType: expense.splitType,
        });
      });
      trip.pendingInvites.forEach((invite) => {
        currentInviteSnapshot[invite.name.trim().toLowerCase()] = invite.status;
      });

      const addedExpense = trip.expenses.find(
        (expense) => !Object.prototype.hasOwnProperty.call(previousExpenseSnapshot, expense.id)
      );
      const updatedExpense = trip.expenses.find(
        (expense) =>
          Object.prototype.hasOwnProperty.call(previousExpenseSnapshot, expense.id) &&
          previousExpenseSnapshot[expense.id] !== currentExpenseSnapshot[expense.id]
      );
      const deletedExpenseId = Object.keys(previousExpenseSnapshot).find(
        (expenseId) => !Object.prototype.hasOwnProperty.call(currentExpenseSnapshot, expenseId)
      );

      const deletedExpense = deletedExpenseId
        ? (() => {
            try {
              return JSON.parse(previousExpenseSnapshot[deletedExpenseId]) as {
                title?: string;
                amount?: number;
                payer?: string;
              };
            } catch {
              return null;
            }
          })()
        : null;

      // Prefer actor recorded in trip_expense_events; fallback to expense.payer
      if (addedExpense && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        (async () => {
          let actorName = memberNameOf(addedExpense.payer || '');
          if (supabase && canSyncWithDb) {
            try {
              const { data: ev } = await supabase
                .from('trip_expense_events')
                .select('actor_user_id')
                .eq('trip_id', trip.id)
                .eq('expense_id', addedExpense.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (ev?.actor_user_id) {
                const { data: profile } = await supabase
                  .from('user_profiles')
                  .select('user_name, user_email')
                  .eq('user_id', ev.actor_user_id)
                  .limit(1)
                  .maybeSingle();
                if (profile) actorName = profile.user_name || profile.user_email || actorName;
              }
            } catch {
              /* ignore and fallback */
            }
          }

          if (!isSelf(actorName, trip)) {
            sendNotification(`${langPack.newTransactionInTrip} ${trip.name}`, {
              body: `${actorName} ${langPack.addedExpense} ${addedExpense.title} (${eur(addedExpense.amount)})`,
            });
          }
        })();
      }

      if (updatedExpense && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        (async () => {
          let actorName = memberNameOf(updatedExpense.payer || '');
          if (supabase && canSyncWithDb) {
            try {
              const { data: ev } = await supabase
                .from('trip_expense_events')
                .select('actor_user_id')
                .eq('trip_id', trip.id)
                .eq('expense_id', updatedExpense.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (ev?.actor_user_id) {
                const { data: profile } = await supabase
                  .from('user_profiles')
                  .select('user_name, user_email')
                  .eq('user_id', ev.actor_user_id)
                  .limit(1)
                  .maybeSingle();
                if (profile) actorName = profile.user_name || profile.user_email || actorName;
              }
            } catch {
              /* ignore and fallback */
            }
          }

          if (!isSelf(actorName, trip)) {
            sendNotification(`${langPack.transactionUpdatedInTrip} ${trip.name}`, {
              body: `${actorName} ${langPack.updatedExpense} ${updatedExpense.title} (${eur(updatedExpense.amount)})`,
            });
          }
        })();
      }

      if (deletedExpense && deletedExpense.payer && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        (async () => {
          let actorName = deletedExpense.payer || '';
          if (supabase && canSyncWithDb && deletedExpenseId) {
            try {
              const { data: ev } = await supabase
                .from('trip_expense_events')
                .select('actor_user_id')
                .eq('trip_id', trip.id)
                .eq('expense_id', deletedExpenseId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (ev?.actor_user_id) {
                const { data: profile } = await supabase
                  .from('user_profiles')
                  .select('user_name, user_email')
                  .eq('user_id', ev.actor_user_id)
                  .limit(1)
                  .maybeSingle();
                if (profile) actorName = profile.user_name || profile.user_email || actorName;
              }
            } catch {
              /* ignore and fallback */
            }
          }

          if (!isSelf(actorName, trip)) {
            sendNotification(`${langPack.transactionDeletedInTrip} ${trip.name}`, {
              body: `${actorName} ${langPack.deletedExpense} ${deletedExpense.title || ''}`.trim(),
            });
          }
        })();
      }

      expenseSnapshotRef.current[trip.id] = currentExpenseSnapshot;

      const previousMembers = memberSnapshotRef.current[trip.id] ?? trip.members;
      if (isSelf(trip.owner, trip) && trip.members.length > previousMembers.length) {
        const previousSet = new Set(previousMembers.map((name) => memberNameOf(name).trim().toLowerCase()));
          const addedMembers = (trip.members || []).filter((name) => !previousSet.has(memberNameOf(name).trim().toLowerCase()));
        const newestMember = addedMembers[addedMembers.length - 1];

        if (
          newestMember &&
          !isSelf(memberNameOf(newestMember), trip) &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          sendNotification(`${trip.name} - ${langPack.ownerNewMemberTitleSuffix}`, {
            body: `${memberNameOf(newestMember)} ${langPack.ownerNewMemberBody}`,
            icon: '/icon.png',
          });
        }
      }

      memberSnapshotRef.current[trip.id] = (trip.members || []).map(memberNameOf);

      if (isSelf(trip.owner, trip)) {
        const acceptedInvite = trip.pendingInvites.find((invite) => {
          const key = invite.name.trim().toLowerCase();
          return previousInviteSnapshot[key] === 'Pozvany' && invite.status === 'Prijate';
        });

        if (acceptedInvite) {
          sendNotification(`${trip.name} - ${langPack.inviteAcceptedTitleSuffix}`, {
            body: `${acceptedInvite.name} ${langPack.inviteAcceptedBody}`,
            icon: '/icon.png',
          });
        }
      }

      // If we're the owner and we've just added pending invites with an email contact,
      // try to copy the trip to that registered user via RPC so the trip appears in their list.
      if (isSelf(trip.owner, trip) && supabase) {
        const addedInviteNames = Object.keys(currentInviteSnapshot).filter(
          (key) => !previousInviteSnapshot[key] && currentInviteSnapshot[key] === 'Pozvany'
        );

        for (const nameKey of addedInviteNames) {
          const inviteObj = trip.pendingInvites.find(
            (inv) => inv.name.trim().toLowerCase() === nameKey
          );
          if (inviteObj?.contact && inviteObj.contact.includes('@')) {
            void (async () => {
              try {
                await supabase.rpc('invite_user_by_email', {
                  p_invite_code: trip.inviteCode,
                  p_member_name: inviteObj.name,
                  p_target_email: inviteObj.contact,
                });
              } catch (err) {
                console.error('invite_user_by_email RPC error', err);
              }
            })();
          }
        }
      }

      inviteStatusSnapshotRef.current[trip.id] = currentInviteSnapshot;
      tripMetaSnapshotRef.current[trip.id] = { name: trip.name, owner: trip.owner };
    });
  }, [appSession, dbLoadTick, lang, notificationsEnabled, supabase, trips]);

  useEffect(() => {
    if (!appSession?.userId) {
      seenMemberAddNotificationIdsRef.current = [];
      return;
    }

    const langPack = T[lang];

    const currentIds = memberAddNotifications.map((item) => item.id);
    const seenIds = seenMemberAddNotificationIdsRef.current;

    const seenSet = new Set(seenIds);
    const freshItems = memberAddNotifications.filter((item) => !seenSet.has(item.id));

    if (freshItems.length > 0) {
      if (notificationsEnabled) {
        freshItems.forEach((item) => {
          sendNotification(langPack.memberAddedInAppTitle, {
            body: `${item.actor_name} ${langPack.memberAddedInAppBody} ${item.trip_name}.`,
            icon: '/icon.png',
          });
        });
      } else {
        const latest = freshItems[0];
        setInfoMessage(`${latest.actor_name} ${langPack.memberAddedInAppBody} ${latest.trip_name}.`);
      }
    }

    seenMemberAddNotificationIdsRef.current = currentIds;
  }, [appSession?.userId, memberAddNotifications, notificationsEnabled, lang]);

  const isAuthenticated = Boolean(appSession);
  const showTripDetail = activeAppScreen === 'trip-detail' && currentTrip;
  const baseVisibleTrips = showArchived ? trips : trips.filter((trip) => !trip.archived);
  const visibleTrips = activeAppScreen === 'admin'
    ? baseVisibleTrips
    : baseVisibleTrips.filter((trip) => {
        // Show only trips where the current user is owner or a member in the regular overview.
        // `isSelfName` handles the special "Ty" name and normalization.
        try {
          return isSelfName(trip.owner) || trip.members.some((m) => isSelfName(m));
        } catch (e) {
          return false;
        }
      });
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
    const moneyLocale = lang === 'en' ? 'en-GB' : 'sk-SK';
    return new Intl.NumberFormat(moneyLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function parseMoneyInput(raw: string | number): number {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
    const s = (raw || '').toString().trim();
    if (!s) return 0;
    // allow comma as decimal separator and strip non-numeric chars except dot/minus
    const normalized = s.replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
    const n = Number(normalized);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function expenseEventLabel(eventType: ExpenseHistoryEvent['event_type']) {
    if (eventType === 'created') return t('eventCreated');
    if (eventType === 'updated') return t('eventUpdated');
    return t('eventDeleted');
  }

  return (
    <>
      {isOffline ? (
        <div className="offline-banner" role="status">
          {lang === 'sk' ? 'Ste offline — zmeny sa uložia po obnovení spojenia.' : 'You are offline — changes will sync when reconnected.'}
        </div>
      ) : null}
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
              <h1>{t('resumingSession')}</h1>
              <p className="muted">{t('checkingSavedLogin')}</p>
          </section>
        </main>
      ) : !isAuthenticated || showPasswordResetForm ? (
        <main className="auth-page">
          <section className="auth-brand">
            <div className="auth-logo-wrap">
              <Image src="/icon.png" alt="Split Pay" width={150} height={150} className="auth-logo" priority />
            </div>
            <h1>{t('appName')}</h1>
              <p>{t('appTagline')}</p>
          </section>

          {invitePendingCode ? (
            <div className="invite-auth-banner">
              <span className="invite-auth-banner-icon">🎉</span>
              <div>
                  <strong>{t('inviteBannerTitle')}</strong>
                  <p>{t('inviteBannerDesc')}</p>
              </div>
            </div>
          ) : null}

          <section className="auth-card">
              <h2>
                {showPasswordResetForm
                  ? t('resetPasswordTitle')
                  : authMode === 'login'
                    ? t('signIn')
                    : t('createAccount')}
              </h2>
            <p className="auth-subtitle">
              {showPasswordResetForm
                ? t('resetPasswordSubtitle')
                : authMode === 'login'
                  ? t('signInSubtitle')
                  : t('registerSubtitle')}
            </p>

            {showPasswordResetForm ? (
              <form className="auth-form" onSubmit={handleSetNewPassword}>
                <label className="field-block">
                  <span>{t('password')}</span>
                  <input
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder={t('passwordPlaceholder')}
                    type="password"
                  />
                </label>

                <label className="field-block">
                  <span>{t('confirmPassword')}</span>
                  <input
                    value={confirmNewPassword}
                    onChange={(event) => setConfirmNewPassword(event.target.value)}
                    placeholder={t('confirmPasswordPlaceholder')}
                    type="password"
                  />
                </label>

                <button type="submit" className="primary-cta" disabled={authLoading}>
                  {t('saveNewPasswordBtn')}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleEmailAuth}>
                {authMode === 'register' ? (
                  <label className="field-block">
                      <span>{t('name')}</span>
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                        placeholder={t('namePlaceholder')}
                    />
                  </label>
                ) : null}

                <label className="field-block">
                    <span>{t('email')}</span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                      placeholder={t('emailPlaceholder')}
                    type="email"
                  />
                </label>

                <label className="field-block">
                    <span>{t('password')}</span>
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                      placeholder={t('passwordPlaceholder')}
                    type="password"
                  />
                </label>

                {authMode === 'login' ? (
                  <button type="button" className="link-button" onClick={handleResetPassword}>
                      {t('forgotPassword')}
                  </button>
                ) : null}

                <button type="submit" className="primary-cta" disabled={authLoading}>
                    {authMode === 'login' ? t('signInBtn') : t('createAccountBtn')}
                </button>
              </form>
            )}

            {!showPasswordResetForm ? (
              <>
                <div className="auth-divider">
                  <span />
                    <p>{t('or')}</p>
                  <span />
                </div>

                  <button type="button" className="google-btn auth-google" onClick={handleGoogleLogin} disabled={authLoading}>
                    <span className="google-mark" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.72-.06-1.42-.19-2.09H12z"/>
                        <path fill="#34A853" d="M12 21.8c2.73 0 5.02-.9 6.7-2.44l-3.3-2.56c-.91.61-2.08.98-3.4.98-2.62 0-4.84-1.77-5.64-4.14l-3.41 2.63C4.63 19.6 8.04 21.8 12 21.8z"/>
                        <path fill="#4A90E2" d="M6.36 13.64A5.96 5.96 0 0 1 6.04 12c0-.57.1-1.12.32-1.64L2.95 7.73A9.95 9.95 0 0 0 2 12c0 1.6.38 3.11 1.05 4.45l3.31-2.81z"/>
                        <path fill="#FBBC05" d="M12 6.22c1.49 0 2.83.51 3.88 1.5l2.91-2.91C17 3.16 14.71 2.2 12 2.2c-3.96 0-7.37 2.2-9.05 5.55l3.41 2.63C7.16 7.99 9.38 6.22 12 6.22z"/>
                      </svg>
                    </span>
                    <span>{t('continueWithGoogle')}</span>
                  </button>
              </>
            ) : null}

            {authMessage ? <p className="auth-message">{authMessage}</p> : null}
          </section>

          <section className="auth-switch-card">
            {showPasswordResetForm ? (
              <button
                type="button"
                className="link-button strong"
                onClick={() => {
                  setShowPasswordResetForm(false);
                  setAuthMode('login');
                  setAuthMessage('');
                }}
              >
                {t('signInBtn')}
              </button>
            ) : (
              <>
                  <span>{authMode === 'login' ? t('noAccount') : t('alreadyHaveAccount')}</span>
                <button type="button" className="link-button strong" onClick={toggleAuthMode}>
                    {authMode === 'login' ? t('createAccountBtn') : t('signInBtn')}
                </button>
              </>
            )}
          </section>
          <section className="auth-switch-card">
            <button type="button" className="link-button strong" onClick={() => setShowSupportModal(true)}>
              {t('contactSupport')}
            </button>
          </section>

          <section className="auth-switch-card lang-switcher-auth">
            <div className="lang-picker">
              <span className="lang-picker-label">{t('language')}</span>
              <div className="lang-picker-flags">
                <button
                  type="button"
                  className={`lang-flag-btn${lang === 'sk' ? ' active' : ''}`}
                  onClick={() => setLang('sk')}
                  title={t('slovak')}
                >
                  🇸🇰
                </button>
                <button
                  type="button"
                  className={`lang-flag-btn${lang === 'en' ? ' active' : ''}`}
                  onClick={() => setLang('en')}
                  title={t('english')}
                >
                  🇬🇧
                </button>
              </div>
            </div>
          </section>
        </main>
      ) : (
        <main className="page-wrap app-shell">
          {isOffline ? <div className="offline-banner">{t('offlineBanner')}</div> : null}
          <div className="profile-fab-wrap" ref={profileMenuWrapRef}>
            <button type="button" className="profile-fab" onClick={() => setProfileOpen((prev) => !prev)}>
              {selfAvatarEmoji ? (
                <span style={{fontSize:'1.25rem',lineHeight:1}}>{selfAvatarEmoji}</span>
              ) : gravatarHash && !gravatarFailed ? (
                <img
                  src={`https://gravatar.com/avatar/${gravatarHash}?d=404&s=80`}
                  className="profile-fab-gravatar"
                  onError={() => setGravatarFailed(true)}
                  alt=""
                />
              ) : (
                (appSession?.name || 'U').slice(0, 1).toUpperCase()
              )}
            </button>
            {profileOpen ? (
              <section className="profile-menu section-card">
                <h3>{t('myProfile')}</h3>
                <p className="muted">{appSession?.name}</p>
                <p className="muted">{appSession?.email}</p>
                <div className="emoji-picker-section">
                  <p className="emoji-picker-label">{lang === 'sk' ? 'Profilový avatar' : 'Profile avatar'}</p>
                  <div className="emoji-picker-grid">
                    {AVATAR_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={`emoji-btn${selfAvatarEmoji === emoji ? ' emoji-btn-active' : ''}`}
                        onClick={() => saveAvatarEmoji(selfAvatarEmoji === emoji ? null : emoji)}
                        disabled={savingEmoji}
                        aria-label={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {selfAvatarEmoji ? (
                    <button type="button" className="ghost" style={{marginTop:'0.35rem',fontSize:'0.8rem',minHeight:'1.8rem',padding:'0.2rem 0.55rem'}} onClick={() => saveAvatarEmoji(null)}>
                      {lang === 'sk' ? '✕ Odstrániť avatar' : '✕ Remove avatar'}
                    </button>
                  ) : null}
                </div>
                <div className="profile-iban-editor">
                  <label className="field-block">
                    <span>{t('ibanLabel')}</span>
                    <input
                      value={selfIban}
                      onChange={(event) => setSelfIban(event.target.value)}
                      placeholder={t('ibanPlaceholder')}
                    />
                  </label>
                  <button type="button" className="ghost" disabled={savingIban} onClick={saveSelfIban}>
                    {t('saveIbanBtn')}
                  </button>
                </div>
                <button type="button" className="ghost" onClick={goToTripsHome}>{t('myTrips')}</button>
                  {isAdmin ? <button type="button" className="ghost" onClick={goToAdmin}>{t('adminSection')}</button> : null}
                <button type="button" className="ghost" onClick={toggleNotifications}>
                    {notificationsEnabled ? t('notificationsOn') : t('notificationsOff')}
                </button>
                <button
                  type="button"
                  className="ghost danger-btn"
                  onClick={handleDeleteAccount}
                >
                    {t('deleteAccount')}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setShowSupportModal(true);
                    setProfileOpen(false);
                  }}
                >
                  {t('contactSupport')}
                </button>
                <a
                  href="/tutorial-navod.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ghost tutorial-profile-btn"
                >
                  🎯 {t('tutorialBtn')}
                </a>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setGuidePlatform('ios');
                    setShowGuideModal(true);
                    setProfileOpen(false);
                  }}
                >
                  {t('guideBtn')}
                </button>
                <button type="button" className="ghost" onClick={handleLogout}>{t('signOut')}</button>
                <div className="support-author-section profile-support-section">
                  <details className="support-details">
                    <summary className="support-summary">💙 {t('supportAuthor')}</summary>
                    <div className="support-details-content">
                      <a
                        href="https://revolut.me/eugen4w4e"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="support-qr-link"
                        title={t('openRevolutProfile')}
                      >
                        <QRCodeSVG
                          value="https://revolut.me/eugen4w4e"
                          size={140}
                          className="support-qr-image"
                          bgColor="#ffffff"
                          fgColor="#1a1a1a"
                          includeMargin
                        />
                      </a>
                      <a
                        href="https://revolut.me/eugen4w4e"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="support-link"
                      >
                        https://revolut.me/eugen4w4e
                      </a>
                    </div>
                  </details>
                </div>
                  <div className="lang-picker">
                    <span className="lang-picker-label">{t('language')}</span>
                    <div className="lang-picker-flags">
                      <button type="button" className={`lang-flag-btn${lang === 'sk' ? ' active' : ''}`} onClick={() => setLang('sk')} title={t('slovak')}>🇸🇰</button>
                      <button type="button" className={`lang-flag-btn${lang === 'en' ? ' active' : ''}`} onClick={() => setLang('en')} title={t('english')}>🇬🇧</button>
                    </div>
                    <div className="theme-toggle-row">
                      <button type="button" className={`theme-btn${theme === 'light' ? ' active' : ''}`} onClick={() => setTheme('light')} title="Svetlý">☀️</button>
                      <button type="button" className={`theme-btn${theme === 'auto' ? ' active' : ''}`} onClick={() => setTheme('auto')} title="Auto">⚙️</button>
                      <button type="button" className={`theme-btn${theme === 'dark' ? ' active' : ''}`} onClick={() => setTheme('dark')} title="Tmavý">🌙</button>
                    </div>
                  </div>
              </section>
            ) : null}
          </div>

          {globalAnnouncement ? <p className="info-banner admin-announcement">{globalAnnouncement}</p> : null}
          {memberAddNotifications.length > 0 ? (
            <section className="mini-panel member-add-notice">
              <h3>{t('memberAddedInAppTitle')}</h3>
              <p className="muted">
                <strong>{memberAddNotifications[0].actor_name}</strong> {t('memberAddedInAppBody')} <strong>{memberAddNotifications[0].trip_name}</strong>.
              </p>
              <p className="muted">{t('memberAddedAt')}: {formatDateTime(memberAddNotifications[0].created_at)}</p>
              <button
                type="button"
                className="ghost"
                onClick={() => acknowledgeMemberAddNotification(memberAddNotifications[0].id)}
              >
                {t('notificationAcknowledge')}
              </button>
            </section>
          ) : null}

          {staleTripWarning ? (
            <section className="mini-panel member-add-notice">
              <h3>{t('tripNeedsSettlementTitle')}</h3>
              <p className="muted">
                <strong>{staleTripWarning.tripName}</strong> - {t('tripNeedsSettlementBody')}
              </p>
              <button type="button" className="ghost" onClick={acknowledgeStaleTripWarning}>
                {t('understoodBtn')}
              </button>
            </section>
          ) : null}

          {activeAppScreen === 'admin' ? (
            <section className="section-card full-window admin-panel">
              <div className="section-head compact-head">
                <p className="eyebrow">{t('adminTitle')}</p>
                <h2>{t('adminCenterTitle')}</h2>
                <p className="muted">{t('adminCenterDesc')}</p>
              </div>

              {/* ── Stats ── */}
              <div className="admin-section">
                <button type="button" className="admin-section-hd" onClick={() => toggleAdminSection('stats')}>
                  <h3>{lang === 'sk' ? 'Štatistiky' : 'Statistics'}</h3>
                  <span className={`admin-section-chevron${adminSections.stats ? ' open' : ''}`}>›</span>
                </button>
                {adminSections.stats ? (
                  <div className="stat-grid">
                    <div className="stat-card">
                      <span>{t('totalVisits')}</span>
                      <strong>{visitsCount}</strong>
                    </div>
                    <div className="stat-card">
                      <span>{t('visits24h')}</span>
                      <strong>{visits24hCount}</strong>
                    </div>
                    <div className="stat-card">
                      <span>{t('activeUsers5m')}</span>
                      <strong>{activeUsersCount}</strong>
                    </div>
                    <div className="stat-card">
                      <span>{t('usersInSystem')}</span>
                      <strong>{totalUsersSeen}</strong>
                    </div>
                    <div className="stat-card">
                      <span>{t('storedTripStates')}</span>
                      <strong>{totalTripsStored}</strong>
                    </div>
                    <div className="stat-card">
                      <span>{t('panelLoad')}</span>
                      <strong>{adminLoading ? t('loading') : t('done')}</strong>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── Announcement & Top Users ── */}
              <div className="admin-section">
                <button type="button" className="admin-section-hd" onClick={() => toggleAdminSection('announcement')}>
                  <h3>{lang === 'sk' ? 'Oznámenie & aktivita' : 'Announcement & activity'}</h3>
                  <span className={`admin-section-chevron${adminSections.announcement ? ' open' : ''}`}>›</span>
                </button>
                {adminSections.announcement ? (
                  <div className="screen-grid compact-grid admin-grid">
                    <div className="mini-panel">
                      <h3>{t('adminAnnouncementForAll')}</h3>
                      <textarea
                        className="admin-textarea"
                        value={announcementText}
                        onChange={(event) => setAnnouncementText(event.target.value)}
                        placeholder={t('adminAnnouncementPlaceholder')}
                      />
                      <label className="archived-toggle">
                        <input
                          type="checkbox"
                          checked={announcementEnabled}
                          onChange={(event) => setAnnouncementEnabled(event.target.checked)}
                        />
                        {t('showAnnouncementInApp')}
                      </label>
                      <button type="button" onClick={saveAdminAnnouncement}>{t('saveAnnouncement')}</button>
                    </div>
                    <div className="mini-panel">
                      <h3>{t('topUsersVisits')}</h3>
                      <div className="stack-list">
                        {topUsers.length === 0 ? <p className="muted">{t('noDataYet')}</p> : null}
                        {topUsers.map((user) => (
                          <div className="row" key={user.email}>
                            <span>{user.email}</span>
                            <strong>{user.visits}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── Users ── */}
              <div className="admin-section">
                <button type="button" className="admin-section-hd" onClick={() => toggleAdminSection('users')}>
                  <h3>{lang === 'sk' ? `Používatelia (${adminPresence.length})` : `Users (${adminPresence.length})`}</h3>
                  <span className={`admin-section-chevron${adminSections.users ? ' open' : ''}`}>›</span>
                </button>
                {adminSections.users ? (
                  <div className="screen-grid compact-grid admin-grid">
                    <div className="mini-panel">
                      <h3>{t('activeUsersRoles')}</h3>
                      <div className="stack-list">
                        {adminPresence.length === 0 ? <p className="muted">{t('noUsersYet')}</p> : null}
                        {adminPresence.map((user) => {
                          const authUser = adminAuthUsers.find((u) => u.id === user.user_id);
                          const isVerified = authUser ? (!!authUser.email_confirmed_at || !!authUser.is_oauth) : null;
                          return (
                            <div className="row" key={user.user_id}>
                              <div>
                                <strong>{user.user_name}</strong>
                                <p>{user.user_email}</p>
                                <p className="muted" style={{ fontSize: '0.78rem' }}>{t('lastSeen')} {formatDateTime(user.last_seen)}</p>
                              </div>
                              <div className="expense-actions">
                                {isVerified === true ? (
                                  <span className="pill" style={{ background: 'var(--success-bg, #d4edda)', color: 'var(--success, #155724)', fontSize: '0.75rem' }}>✓ {t('emailVerified')}</span>
                                ) : isVerified === false ? (
                                  <span className="pill" style={{ background: 'var(--warn-bg, #fff3cd)', color: 'var(--warn, #856404)', fontSize: '0.75rem' }}>⚠ {t('emailUnverified')}</span>
                                ) : null}
                                <span className="pill">{user.role === 'admin' ? t('roleAdmin') : t('roleUser')}</span>
                                {user.user_id !== appSession?.userId ? (
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={() => toggleUserRole(user.user_id, user.role === 'admin' ? 'user' : 'admin')}
                                  >
                                    {user.role === 'admin' ? t('demoteToUser') : t('promoteToAdmin')}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mini-panel">
                      <h3>{t('recentVisitsTitle')}</h3>
                      <div className="stack-list">
                        {recentVisits.length === 0 ? <p className="muted">{t('noVisitsYet')}</p> : null}
                        {recentVisits.map((visit) => (
                          <div className="row" key={visit.id}>
                            <span>{visit.user_email}</span>
                            <strong>{formatDateTime(visit.visited_at)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── Chat Extension Requests ── */}
              {(() => {
                const extensionRequests = adminTrips.filter((trip) => trip.chatExtensionRequested && !trip.archived);
                if (extensionRequests.length === 0) return null;
                return (
                  <div className="admin-section">
                    <button type="button" className="admin-section-hd" onClick={() => toggleAdminSection('chatExtensions')}>
                      <h3>
                        {t('chatExtensionRequests')}
                        <span className="badge" style={{ background: 'var(--accent)', color: '#fff' }}>{extensionRequests.length}</span>
                      </h3>
                      <span className={`admin-section-chevron${adminSections.chatExtensions ? ' open' : ''}`}>›</span>
                    </button>
                    {adminSections.chatExtensions ? (
                      <div className="stack-list">
                        {extensionRequests.map((trip) => (
                          <div className="row" key={trip.id}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <strong>{trip.name}</strong>
                              <p className="muted" style={{ fontSize: '0.8rem', margin: '2px 0 0' }}>
                                {t('tripCode')} {trip.inviteCode} · {memberCountLabel(trip.members.length, lang)}
                                {trip.chatLimit ? ` · limit: ${trip.chatLimit}` : ''}
                              </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button type="button" className="ghost" style={{ color: 'var(--danger, #c0392b)' }} onClick={() => handleChatExtensionReject(trip.id)}>
                                {t('chatExtensionReject')}
                              </button>
                              <button type="button" className="ghost" style={{ color: 'var(--accent)' }} onClick={() => handleChatExtensionApprove(trip.id)}>
                                {t('chatExtensionApprove')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* ── Trips ── */}
              <div className="admin-section">
                <button type="button" className="admin-section-hd" onClick={() => toggleAdminSection('trips')}>
                  <h3>
                    {lang === 'sk' ? 'Výlety' : 'Trips'}
                    <span className="badge">{adminTrips.filter((tr) => !tr.archived).length}</span>
                  </h3>
                  <span className={`admin-section-chevron${adminSections.trips ? ' open' : ''}`}>›</span>
                </button>
                {adminSections.trips ? (
                  <div className="screen-grid compact-grid admin-grid">
                    <div className="mini-panel">
                      <h3>{t('activeTrips')}</h3>
                      <div className="stack-list">
                        {adminTrips.filter((t) => !t.archived).length === 0 ? (
                          <p className="muted">{t('noActiveTrips')}</p>
                        ) : null}
                        {adminTrips
                          .filter((t) => !t.archived)
                          .map((trip) => (
                            <div className="row" key={trip.id}>
                              <div>
                                <strong>{trip.name}</strong>
                                <p className="muted">{memberCountLabel(trip.members.length, lang)} · {t('tripCode')} {trip.inviteCode}</p>
                              </div>
                              <button type="button" className="ghost" onClick={() => openTrip(trip.id, 'overview', trip.inviteCode)}>
                                {t('openBtn')}
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                    <div className="mini-panel">
                      <h3>{t('archivedTrips')}</h3>
                      <div className="stack-list">
                        {adminTrips.filter((t) => t.archived).length === 0 ? (
                          <p className="muted">{t('noArchivedTrips')}</p>
                        ) : null}
                        {adminTrips
                          .filter((t) => t.archived)
                          .map((trip) => (
                            <div className="row" key={trip.id}>
                              <div>
                                <strong>{trip.name}</strong>
                                <p className="muted">{memberCountLabel(trip.members.length, lang)} · {t('tripCode')} {trip.inviteCode}</p>
                              </div>
                              <button type="button" className="ghost" onClick={() => openTrip(trip.id, 'overview', trip.inviteCode)}>
                                {t('openBtn')}
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── Unverified Registrations ── */}
              {(() => {
                const unverified = adminAuthUsers
                  .filter((u) => !u.email_confirmed_at && !u.is_oauth)
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                return (
                  <div className="admin-section">
                    <button type="button" className="admin-section-hd" onClick={() => toggleAdminSection('unverified')}>
                      <h3>
                        {t('adminUnverifiedTitle')}
                        {unverified.length > 0 ? <span className="badge" style={{ background: 'var(--warn-bg, #fff3cd)', color: 'var(--warn, #856404)' }}>{unverified.length}</span> : null}
                      </h3>
                      <span className={`admin-section-chevron${adminSections.unverified ? ' open' : ''}`}>›</span>
                    </button>
                    {adminSections.unverified ? (
                      unverified.length === 0 ? (
                        <p className="muted">{t('adminUnverifiedEmpty')}</p>
                      ) : (
                        <div className="stack-list">
                          {unverified.map((u) => (
                            <div className="row" key={u.id} style={{ padding: '6px 0' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '0.88rem' }}>{u.email}</span>
                                <p className="muted" style={{ fontSize: '0.75rem', margin: '2px 0 0' }}>
                                  {t('adminUnverifiedRegistered')} {new Date(u.created_at).toLocaleString(lang === 'sk' ? 'sk-SK' : 'en-GB')}
                                  {u.last_sign_in_at ? ` · ${t('adminUnverifiedLastLogin')} ${new Date(u.last_sign_in_at).toLocaleString(lang === 'sk' ? 'sk-SK' : 'en-GB')}` : ''}
                                </p>
                              </div>
                              <span className="pill" style={{ background: 'var(--warn-bg, #fff3cd)', color: 'var(--warn, #856404)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                ⚠ {t('emailUnverified')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    ) : null}
                  </div>
                );
              })()}

              {/* ── Deleted Accounts ── */}
              <div className="admin-section">
                <button type="button" className="admin-section-hd" onClick={() => toggleAdminSection('deletedAccounts')}>
                  <h3>
                    {t('adminDeletedAccountsTitle')}
                    {deletedAccounts.length > 0 ? <span className="badge">{deletedAccounts.length}</span> : null}
                  </h3>
                  <span className={`admin-section-chevron${adminSections.deletedAccounts ? ' open' : ''}`}>›</span>
                </button>
                {adminSections.deletedAccounts ? (
                  deletedAccounts.length === 0 ? (
                    <p className="muted">{t('adminDeletedAccountsEmpty')}</p>
                  ) : (
                    <div className="stack-list">
                      {deletedAccounts.map((entry) => (
                        <div className="row" key={entry.id} style={{ padding: '6px 0' }}>
                          <span style={{ fontSize: '0.88rem' }}>{entry.email}</span>
                          <span className="muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                            {new Date(entry.deleted_at).toLocaleString(lang === 'sk' ? 'sk-SK' : 'en-GB')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </div>

              {/* ── Spam Log ── */}
              <div className="admin-section">
                <button type="button" className="admin-section-hd" onClick={() => toggleAdminSection('spamLog')}>
                  <h3>
                    {t('adminSpamLog')}
                    {spamLog.length > 0 ? <span className="badge">{spamLog.length}</span> : null}
                  </h3>
                  <span className={`admin-section-chevron${adminSections.spamLog ? ' open' : ''}`}>›</span>
                </button>
                {adminSections.spamLog ? (
                  <>
                  {spamLog.length > 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" className="ghost danger-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={clearSpamLog}>
                        {t('adminSpamLogClearAll')}
                      </button>
                    </div>
                  ) : null}
                  {spamLog.length === 0 ? (
                    <p className="muted">{t('adminSpamLogEmpty')}</p>
                  ) : (
                  <div className="stack-list">
                    {spamLog.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="row"
                        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 8px', borderRadius: '8px', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #f5f5f5)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                        onClick={() => setSpamLogModal(entry)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{entry.email}</span>
                            <span className="pill" style={{
                              fontSize: '0.7rem',
                              padding: '1px 7px',
                              background: entry.reason === 'invalid_format' ? 'var(--danger-bg, #f8d7da)' : 'var(--warn-bg, #fff3cd)',
                              color: entry.reason === 'invalid_format' ? 'var(--danger, #842029)' : 'var(--warn, #856404)',
                            }}>
                              {entry.reason === 'invalid_format' ? t('spamReasonInvalidFormat') : t('spamReasonNoMx')}
                            </span>
                          </div>
                          <p className="muted" style={{ fontSize: '0.78rem', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.subject || '—'}
                          </p>
                        </div>
                        <span className="muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                          {new Date(entry.created_at).toLocaleString(lang === 'sk' ? 'sk-SK' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </button>
                    ))}
                  </div>
                  )}
                  </>
                ) : null}
              </div>

              <div className="admin-actions">
                <button type="button" className="ghost" onClick={() => setShowVisitsModal(true)}>{t('visitsBtn')}</button>
                
                <button type="button" className="ghost" onClick={exportVisitsCsv}>{t('exportVisitsCsv')}</button>
                <button type="button" className="ghost danger-btn" onClick={purgeStalePresence}>
                  {t('purgePresence')}
                </button>
                <button type="button" className="ghost" onClick={goToTripsHome}>{t('backToTripsAdmin')}</button>
              </div>
            </section>
          ) : null}

          {activeAppScreen !== 'admin' ? (
            activeAppScreen === 'trip-detail' && !showTripDetail ? null : !showTripDetail ? (
            <>
              <section className="hero hero-panel">
                <div className="hero-top-row">
                  <div className="hero-brand">
                    <Image src="/icon.png" alt="Split Pay" width={48} height={48} className="hero-app-icon" />
                    <span className="hero-app-name">Split Pay</span>
                  </div>
                  <label className="archived-toggle-compact">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(event) => setShowArchived(event.target.checked)}
                    />
                    <span>{t('showArchived')}</span>
                  </label>
                </div>
                <h1 className="hero-title">{t('heroTitle')}</h1>
                <p className="hero-desc">{t('heroDesc')}</p>
                <div className="hero-metrics">
                  <span><QrCode size={12} />{t('quickInvites')}</span>
                  <span><Users size={12} />{t('fairSplit')}</span>
                  <span><Coins size={12} />{t('instantBalance')}</span>
                </div>
                <div className="hero-user-row">
                  <span className="hero-user-avatar">{(appSession?.name || appSession?.email || '?')[0].toUpperCase()}</span>
                  <span className="hero-user-name">{appSession?.name || appSession?.email}</span>
                </div>
                {infoMessage ? <p className="info-banner hero-info">{infoMessage}</p> : null}
              </section>

              <section className="app-section">
                <div className="section-head trips-section-head">
                  <div>
                    <p className="eyebrow">{t('overviewTab')}</p>
                    <h2>{t('myTrips')}</h2>
                  </div>
                  <div className="trips-quick-actions">
                    <button type="button" className="trips-quick-btn trips-quick-create" onClick={() => setShowCreateTripModal(true)}>
                      <Plus size={14} />{t('newTrip')}
                    </button>
                    <button type="button" className="trips-quick-btn trips-quick-join" onClick={() => setShowJoinTripModal(true)}>
                      <Link2 size={14} />{t('joinTripEyebrow')}
                    </button>
                  </div>
                </div>
                <div className="trip-overview-list">
                  {visibleTrips.map((trip) => {
                    const tripMembersForCompute = (trip.members || []).map((m) => (typeof m === 'string' ? m : { id: m.id, name: m.name }));
                    const activeExpenses = trip.expenses.filter((e) => !e.deletedAt);
                    const tripBalances = computeBalances(tripMembersForCompute, withExpandedParticipants(activeExpenses, (trip.members || []).map(memberNameOf)));
                    const tripTotal = activeExpenses.reduce(
                      (sum, expense) => (expense.expenseType === 'transfer' ? sum : sum + expense.amount),
                      0
                    );
                    const lookupBalanceFor = (name?: string | null) => {
                      // Balance map keys are member IDs when the member has one — try userId first
                      if (appSession?.userId && Object.prototype.hasOwnProperty.call(tripBalances, appSession.userId)) {
                        return tripBalances[appSession.userId];
                      }
                      if (!name) return 0;
                      if (Object.prototype.hasOwnProperty.call(tripBalances, name)) return tripBalances[name];
                      const norm = memberKey(name);
                      for (const m of trip.members) {
                        const mName = memberNameOf(m);
                        if (memberKey(mName) === norm && Object.prototype.hasOwnProperty.call(tripBalances, mName)) return tripBalances[mName];
                        // also match by member id
                        if (typeof m !== 'string' && m.id && Object.prototype.hasOwnProperty.call(tripBalances, m.id) && memberKey(mName) === norm) return tripBalances[m.id];
                      }
                      // "Ty" is the canonical alias for the current user in their own trips (when member entry has no UUID)
                      if (isSelfName(trip.owner) && Object.prototype.hasOwnProperty.call(tripBalances, 'Ty')) return tripBalances['Ty'];
                      return 0;
                    };

                    const userBalance = lookupBalanceFor(appSession?.name ?? null);

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
                              <p>{formatTripDate(trip.date, lang)}</p>
                            </div>
                            {
                              // Show days-until-start only when the trip has no expenses yet
                              (trip.date && trip.expenses.length === 0) ? (() => {
                                const start = new Date(trip.date);
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const diffMs = start.getTime() - today.getTime();
                                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                                const daysLabel = diffDays <= 0 ? 'Dnes' : diffDays === 1 ? 'Za 1 deň' : `Za ${diffDays} dní`;
                                return <span className="trip-starts-in muted">{daysLabel}</span>;
                              })() : (() => {
                                const isSettled = Math.abs(Number(userBalance) || 0) < 0.005;
                                if (isSettled) {
                                  return <span className="settled trip-balance">{'Vyrovnané'}</span>;
                                }
                                return <span className={userBalance >= 0 ? 'positive trip-balance' : 'negative trip-balance'}>{money(userBalance)}</span>;
                              })()
                            }
                          </div>
                          <div className="trip-card-meta">
                            <span>{memberCountLabel(trip.members.length, lang)}</span>
                             <span>{expenseCountLabel(activeExpenses.length, lang)}</span>
                             <span>{t('totalMeta')} {money(tripTotal)}</span>
                            <span>{trip.currency}</span>
                             {trip.archived ? <span>{t('archived')}</span> : null}
                             {trip.status === 'closed' && !trip.archived ? <span className="trip-status-badge trip-status-closed-sm">{t('tripClosedLabel')}</span> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {showCreateTripModal ? (
                <div className="modal-overlay" role="presentation" onClick={() => setShowCreateTripModal(false)}>
                    <section className="section-card modal-card" role="dialog" aria-modal="true" aria-label={t('createTrip')} onClick={(event) => event.stopPropagation()}>
                    <div className="modal-head">
                      <div>
                          <p className="eyebrow">{t('newTrip')}</p>
                          <h2>{t('createTrip')}</h2>
                      </div>
                        <button type="button" className="ghost" onClick={() => setShowCreateTripModal(false)}>{t('close')}</button>
                    </div>
                    <form className="stack onboarding-form" onSubmit={handleCreateTrip}>
                      <label className="field-block">
                          <span>{t('tripName')}</span>
                        <input
                          value={newTripName}
                          onChange={(event) => setNewTripName(event.target.value)}
                            placeholder={t('tripNamePlaceholder')}
                        />
                      </label>
                      <label className="field-block">
                          <span>{t('date')}</span>
                        <input
                          type="date"
                          value={newTripDate}
                          onChange={(event) => setNewTripDate(event.target.value)}
                        />
                      </label>
                        <button type="submit" className="primary-cta">{t('createTripBtn')}</button>
                        <p className="muted field-hint">{t('createTripHint')}</p>
                    </form>
                  </section>
                </div>
              ) : null}

              {showJoinTripModal ? (
                <div className="modal-overlay" role="presentation" onClick={() => setShowJoinTripModal(false)}>
                    <section className="section-card modal-card" role="dialog" aria-modal="true" aria-label={t('joinTripTitle')} onClick={(event) => event.stopPropagation()}>
                    <div className="modal-head">
                      <div>
                          <p className="eyebrow">{t('joinTripEyebrow')}</p>
                          <h2>{t('joinTripTitle')}</h2>
                      </div>
                        <button type="button" className="ghost" onClick={() => setShowJoinTripModal(false)}>{t('close')}</button>
                    </div>
                    <form className="stack onboarding-form" onSubmit={handleJoinByCode}>
                      <label className="field-block">
                          <span>{t('yourName')}</span>
                        <input
                          value={joinName}
                          onChange={(event) => setJoinName(event.target.value)}
                            placeholder={t('yourNamePlaceholder')}
                        />
                      </label>
                      <label className="field-block">
                          <span>{t('organizerCode')}</span>
                        <input
                          value={joinCode}
                          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                            placeholder={t('codePlaceholder')}
                        />
                      </label>
                        <button type="submit" className="primary-cta">{t('joinBtn')}</button>
                        <p className="muted field-hint">{t('joinHint')}</p>
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
                      {t('backToTrips')}
                  </button>
                  <div className="hero-brand compact-brand">
                    <Image src="/icon.png" alt="Split Pay" width={44} height={44} className="hero-app-icon" />
                    <div>
                        <p className="eyebrow">{t('tripDetail')}</p>
                      <h1>{currentTrip.name}</h1>
                    </div>
                  </div>
                  <p>
                      {formatTripDate(currentTrip.date, lang)} · {memberCountLabel(members.length, lang)} · {eur(totalSpent)} {t('totalMeta').toLowerCase()}
                  </p>
                </div>
                <div className="hero-actions hero-actions-end">
                    <p className="muted">{t('tripCode')} {currentTrip.inviteCode}</p>
                  {currentTripOwnerIsSelf ? (
                    <button type="button" className="ghost trip-settings-open-btn" onClick={() => setShowTripSettingsModal(true)}>
                      <Settings2 size={15} aria-hidden="true" />
                        <span>{t('settings')}</span>
                    </button>
                  ) : null}
                </div>
                {normalizedExpenses.length > 0 ? (() => {
                  const anyNonZero = Object.values(balances).some((v) => Math.abs(Number(v) || 0) > 0.01);
                  if (!anyNonZero) {
                    return (
                      <div className="hero-settled-chip" role="status">
                        <div className="hero-settled-icon"><CheckCircle2 size={18} strokeWidth={2.2} /></div>
                        <span>{t('tripSettled')}</span>
                      </div>
                    );
                  }
                  if (Math.abs(safeSelfBalance) > 0.01) {
                    return (
                      <button
                        type="button"
                        className="hero-balance-chip"
                        onClick={() => openTrip(currentTrip.id, 'balances')}
                      >
                        <span className="hero-balance-label">
                          {safeSelfBalance >= 0
                            ? `${displayCurrentUserName} ${t('receivesTotal')}`
                            : `${displayCurrentUserName} ${t('paysTotal')}`}
                        </span>
                        <strong className={safeSelfBalance >= 0 ? 'positive' : 'negative'}>
                          {eur(Math.abs(safeSelfBalance))}
                        </strong>
                      </button>
                    );
                  }
                  return null;
                })() : null}
                {infoMessage ? <p className="info-banner hero-info">{infoMessage}</p> : null}
              </section>

              {showTripSettingsModal && currentTripOwnerIsSelf ? (
                <div className="modal-overlay modal-overlay-top-right" role="presentation" onClick={() => setShowTripSettingsModal(false)}>
                  <section className="section-card trip-settings-modal" role="dialog" aria-modal="true" aria-label={t('tripSettingsEyebrow')} onClick={(event) => event.stopPropagation()}>
                    <div className="modal-head">
                      <div>
                        <p className="eyebrow">{t('tripSettingsEyebrow')}</p>
                        <h2>{currentTrip.name}</h2>
                      </div>
                      <button type="button" className="ghost" onClick={() => setShowTripSettingsModal(false)}>{t('close')}</button>
                    </div>
                    <form className="stack trip-settings-form" onSubmit={(event) => event.preventDefault()}>
                      <label className="field-block">
                        <span>{t('tripName')}</span>
                        <input
                          type="text"
                          value={currentTrip.name}
                          onChange={(event) => updateTripSettings({ name: event.target.value })}
                          placeholder={t('tripName')}
                        />
                      </label>
                      <label className="field-block">
                        <span>{t('date')}</span>
                        <input
                          type="date"
                          value={tripDateToInput(currentTrip.date)}
                          onChange={(event) => updateTripSettings({ date: event.target.value })}
                        />
                      </label>
                      <label className="field-block">
                        <span>{t('currency')}</span>
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
                        <span>{t('tripColor')}</span>
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
                        {t('archiveTrip')}
                      </label>
                      {currentTrip.status !== 'closed' ? (
                        <button
                          type="button"
                          className="close-trip-btn"
                          disabled={isClosingTrip}
                          onClick={() => { setShowTripSettingsModal(false); void handleCloseTrip(); }}
                        >
                          {isClosingTrip ? t('closingTripMsg') : t('closeTripBtn')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="reopen-trip-btn"
                          onClick={() => { handleReopenTrip(); setShowTripSettingsModal(false); }}
                        >
                          {t('reopenTripBtn')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="ghost danger-btn"
                        onClick={() => {
                          void deleteTrip(currentTrip.id);
                          setShowTripSettingsModal(false);
                        }}
                      >
                        {t('deleteTrip')}
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
                      <span>{t('overviewTab')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={activeDetailScreen === 'members' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => openTrip(currentTrip.id, 'members')}
                >
                  <span className="screen-pill-inner">
                    <Users size={15} aria-hidden="true" />
                      <span>{t('membersTab')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={activeDetailScreen === 'invites' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => openTrip(currentTrip.id, 'invites')}
                >
                  <span className="screen-pill-inner">
                    <Link2 size={15} aria-hidden="true" />
                      <span>{t('invitesTab')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={activeDetailScreen === 'expenses' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => openTrip(currentTrip.id, 'expenses')}
                >
                  <span className="screen-pill-inner">
                    <Receipt size={15} aria-hidden="true" />
                      <span>{t('expensesTab')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={activeDetailScreen === 'balances' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => openTrip(currentTrip.id, 'balances')}
                >
                  <span className="screen-pill-inner">
                    <Coins size={15} aria-hidden="true" />
                      <span>{t('balanceTab')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={activeDetailScreen === 'activity' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => openTrip(currentTrip.id, 'activity')}
                >
                  <span className="screen-pill-inner">
                    <Clock size={15} aria-hidden="true" />
                    <span>{t('activityTab')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={activeDetailScreen === 'stats' ? 'screen-pill active' : 'screen-pill'}
                  onClick={() => openTrip(currentTrip.id, 'stats')}
                >
                  <span className="screen-pill-inner">
                    <BarChart2 size={15} aria-hidden="true" />
                    <span>{t('statsTab')}</span>
                  </span>
                </button>
              </section>

              {activeDetailScreen === 'overview' ? (
                <section className="screen-window section-card screen-single full-window">
                  <div className="section-head compact-head overview-head">
                    <div>
                        <p className="eyebrow">{t('tripOverview')}</p>
                        <h2 style={{display:'flex',alignItems:'center',gap:8}}>
                          {t('basicInfo')}
                          {currentTrip.status === 'closed' ? <span className="trip-status-badge trip-status-closed">{t('tripClosedLabel')}</span> : null}
                        </h2>
                    </div>
                    {currentTrip.status !== 'closed' ? (
                      <button type="button" className="expense-open-modal-btn" onClick={openExpenseModalForCreate} title={t('addExpense')}>
                        <Plus size={16} />
                        <span>{t('addExpense')}</span>
                      </button>
                    ) : null}
                  </div>
                  {(() => {
                    const hist = currentTrip.chatHistory || [];
                    const qCount = hist.filter((m) => m.role === 'user').length;
                    return (
                      <button type="button" className="trip-chat-open-btn" onClick={() => setShowChatModal(true)}>
                        <span className="trip-chat-open-icon">✦</span>
                        <span className="trip-chat-open-label">
                          {lang === 'sk' ? 'AI asistent výletu' : 'Trip AI assistant'}
                          {qCount > 0 ? <span className="trip-chat-open-count">{qCount}/{currentTrip.chatLimit ?? 10}</span> : null}
                        </span>
                        <span className="trip-chat-open-arrow">→</span>
                      </button>
                    );
                  })()}

                  <div className="stat-grid overview-stat-grid">
                    <div className="stat-card overview-stat-card">
                        <span>{t('expensesLabel')}</span>
                      <strong>{normalizedExpenses.length}</strong>
                    </div>
                    <div className="stat-card overview-stat-card">
                        <span>{t('totalSpent')}</span>
                      <strong>{money(totalSpent)}</strong>
                    </div>
                  </div>
                  {currentTripOwnerIsSelf && currentTrip.currency !== 'EUR' ? (
                    <div className="trip-actions-strip">
                      <button type="button" className="convert-eur-btn" onClick={() => void handleConvertToEur()} disabled={isCurrencyConverting}>
                        {isCurrencyConverting ? t('convertingMsg') : `${t('convertToEurBtn')} (${currentTrip.currency}→EUR)`}
                      </button>
                    </div>
                  ) : null}
                  {currentTrip.status === 'closed' && currentTrip.aiSummary ? (
                    <div className="ai-summary-card">
                      <p className="ai-summary-label">{t('aiSummaryTitle')}</p>
                      <p className="ai-summary-text">{currentTrip.aiSummary}</p>
                    </div>
                  ) : null}
                  {(() => {
                    const cats = normalizedExpenses.reduce<Record<string, number>>((acc, e) => {
                      const c = e.category || inferCategory(e.title);
                      acc[c] = (acc[c] || 0) + e.amount;
                      return acc;
                    }, {});
                    const catEntries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
                    if (catEntries.length < 1) return null;
                    const catMeta: Record<string, { label: string; icon: React.ReactNode }> = {
                      jedlo:     { label: t('categoryFood'),      icon: <Utensils size={13} /> },
                      doprava:   { label: t('categoryTransport'), icon: <Car size={13} /> },
                      ubytovanie:{ label: t('categoryAccom'),     icon: <Bed size={13} /> },
                      zabava:    { label: t('categoryFun'),       icon: <PartyPopper size={13} /> },
                      nakupy:    { label: t('categoryShopping'),  icon: <ShoppingBag size={13} /> },
                      zdravie:   { label: t('categoryHealth'),    icon: <Heart size={13} /> },
                      sport:     { label: t('categorySport'),     icon: <Dumbbell size={13} /> },
                      kultura:   { label: t('categoryKultura'),   icon: <Music size={13} /> },
                      technika:  { label: t('categoryTech'),      icon: <Cpu size={13} /> },
                      ostatne:   { label: t('categoryOther'),     icon: <Package size={13} /> },
                      prevod:    { label: t('categoryTransfer'),  icon: <ArrowLeftRight size={13} /> },
                    };
                    return (
                      <div className="category-breakdown">
                        <p className="category-breakdown-title">{t('categoryBreakdown')}</p>
                        {catEntries.map(([cat, amt]) => {
                          const meta = catMeta[cat] || { label: cat, icon: <Package size={13} /> };
                          return (
                            <div key={cat} className="category-row">
                              <span className={`category-badge category-${cat}`}>
                                {meta.icon}{meta.label}
                              </span>
                              <span className="category-amount">{money(amt)}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <div className="screen-grid compact-grid overview-compact-grid">
                    <div className="mini-panel overview-mini-panel">
                        <h3>{t('recentExpenses')}</h3>
                      <div className="stack-list">
                          {recentExpenses.length === 0 ? <p className="muted">{t('noRecords')}</p> : null}
                        {recentExpenses.map((expense) => (
                          <div
                            className="row overview-row expense-row"
                            key={expense.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openExpenseDetail(expense.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openExpenseDetail(expense.id);
                              }
                            }}
                          >
                            <div>
                              <strong>{expense.title}</strong>
                              <p>
                                {t('paidBy')}{' '}
                                <button
                                  type="button"
                                  className="member-link-inline"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openMemberProfile(memberNameOf(expense.payer || ''));
                                  }}
                                >
                                  {formatMemberName(memberNameOf(expense.payer || ''))}
                                </button>
                                {expense.category ? (() => {
                                  const iconMap: Record<string, React.ReactNode> = { jedlo:<Utensils size={11}/>, doprava:<Car size={11}/>, ubytovanie:<Bed size={11}/>, zabava:<PartyPopper size={11}/>, nakupy:<ShoppingBag size={11}/>, zdravie:<Heart size={11}/>, sport:<Dumbbell size={11}/>, kultura:<Music size={11}/>, technika:<Cpu size={11}/>, ostatne:<Package size={11}/>, prevod:<ArrowLeftRight size={11}/> };
                                  const labelMap: Record<string,string> = { jedlo:t('categoryFood'), doprava:t('categoryTransport'), ubytovanie:t('categoryAccom'), zabava:t('categoryFun'), nakupy:t('categoryShopping'), zdravie:t('categoryHealth'), sport:t('categorySport'), kultura:t('categoryKultura'), technika:t('categoryTech'), ostatne:t('categoryOther'), prevod:t('categoryTransfer') };
                                  return <span className={`category-badge category-${expense.category} category-inline`}>{iconMap[expense.category]}{labelMap[expense.category] || expense.category}</span>;
                                })() : null}
                              </p>
                            </div>
                            <strong>{money(expense.amount)}</strong>
                          </div>
                        ))}
                        {normalizedExpenses.length >= recentExpenses.length && recentExpenses.length > 0 ? (
                          <button
                            type="button"
                            className="ghost overview-more-expenses-btn"
                            onClick={() => openTrip(currentTrip.id, 'expenses')}
                          >
                            {t('showMoreExpenses')}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {activeDetailScreen === 'members' ? (
                <section className="screen-window section-card screen-single full-window">
                  <div className="section-head compact-head">
                      <p className="eyebrow">{t('team')}</p>
                      <h2>{t('membersTitle')}</h2>
                  </div>
                  {currentTripOwnerIsSelf ? (
                    <form className="inline-form compact-form" onSubmit={handleAddMember}>
                      <input
                        value={newMember}
                        onChange={(event) => setNewMember(event.target.value)}
                          placeholder={t('memberNamePlaceholder')}
                      />
                        <button type="submit">{t('addBtn')}</button>
                    </form>
                  ) : null}
                  {!currentTripOwnerIsSelf ? (
                    <div className="owner-actions leave-trip-box">
                      <button type="button" className="ghost danger-btn leave-trip-btn" onClick={leaveCurrentTrip}>
                        {t('leaveTripBtn')}
                      </button>
                    </div>
                  ) : null}
                  {currentTripOwnerIsSelf && memberHistorySuggestions.length > 0 ? (
                    <div className="mini-panel">
                      <h3>{t('historyMembersTitle')}</h3>
                      <p className="muted">{t('historyMembersHint')}</p>
                      <div className="member-history-list">
                        {memberHistorySuggestions.map((memberName) => (
                          <button
                            key={memberName}
                            type="button"
                            className="ghost member-history-chip"
                            onClick={() => handleAddMemberFromHistory(memberName)}
                          >
                            + {memberName}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {currentTripOwnerIsSelf && members.length === 1 ? (
                    <div className="mini-panel" style={{ background: '#fff8e7', borderColor: '#f59f00', color: '#9b5d00' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>
                        <strong>{t('removeSelfWarningLead')}</strong> {t('removeSelfWarningSolo')}
                      </p>
                    </div>
                  ) : null}
                  {currentTripOwnerIsSelf && members.length > 1 ? (
                    <div className="mini-panel" style={{ background: '#e7f8ff', borderColor: '#2c79f6', color: '#1f3562' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>
                        <strong>{t('removeSelfInfoLead')}</strong> {t('removeSelfInfoTransfer')} {formatMemberName(members.find((m) => !isSelfName(m)) || t('anotherMember'))}.
                      </p>
                    </div>
                  ) : null}
                  <div className="member-list">
                    {members.map((name) => (
                      <div key={name} className="member-row">
                        <div className="member-avatar">{formatMemberName(name).slice(0, 1)}</div>
                        <button
                          type="button"
                          className="member-profile-open"
                          onClick={() => openMemberProfile(name)}
                        >
                          <strong>{formatMemberName(name)}</strong>
                          {(isSelfName(name) || currentTrip.owner === name) && (
                            <p>
                              {currentTrip.owner === name ? t('ownerLabel') : displayCurrentUserName}
                            </p>
                          )}
                        </button>
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
                        <h3>{t('confirmIdentity')}</h3>
                        <p className="muted">{t('guestPickInvite')}</p>
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
                                <strong>{t('thatsMe')}</strong>
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : null}

                  {(() => {
                    // Show merge panel only when:
                    // 1. User is authenticated and not the trip owner
                    // 2. User's real name is NOT already a member (they are listed under a different/fictional name)
                    const realName = appSession?.name?.trim().toLowerCase() || '';
                    const realNameAlreadyMember = realName
                      ? currentTrip.members.some((m) => memberNameOf(m).trim().toLowerCase() === realName)
                      : false;
                    const shouldShow =
                      isAuthenticated &&
                      !currentTripOwnerIsSelf &&
                      appSession?.name &&
                      !realNameAlreadyMember &&
                      currentTrip.members.filter((m) => !isSelfName(m)).length > 0;
                    if (!shouldShow) return null;
                    // Show only ONE suggestion — the first non-self, non-owner member
                    const suggestion = currentTrip.members.find(
                      (m) => !isSelfName(m) && m !== currentTrip.owner
                    ) || currentTrip.members.find((m) => !isSelfName(m));
                    if (!suggestion) return null;
                    return (
                      <div className="mini-panel" style={{ background: '#f0f4ff', borderColor: '#667eea' }}>
                        <h3 style={{ marginBottom: '0.3rem' }}>{t('mergeIdentityTitle')}</h3>
                        <p className="muted" style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>{t('mergeIdentityDesc')}</p>
                        <div className="stack-list">
                          <button
                            type="button"
                            className="row guest-claim-btn"
                            onClick={() => mergeFictionalMember(memberNameOf(suggestion))}
                          >
                            <span>{memberNameOf(suggestion)}</span>
                            <strong>{t('thatsAlsoMe')}</strong>
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </section>
              ) : null}

              {activeDetailScreen === 'invites' ? (
                <section className="screen-window section-card screen-single full-window">
                  <div className="section-head compact-head">
                    <p className="eyebrow">{t('invitation')}</p>
                    <h2>{t('invitesTitle')}</h2>
                  </div>

                  <div className="invite-hero-card">
                    <div className="invite-hero-code-row">
                      <div>
                        <p className="muted" style={{fontSize:'0.72rem',margin:'0 0 0.2rem',fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase'}}>{t('code')}</p>
                        <span className="invite-hero-code">{currentTrip.inviteCode}</span>
                      </div>
                      <button type="button" className="invite-copy-btn" onClick={copyInviteCodeToClipboard}>
                        <Clipboard size={14} aria-hidden="true" />
                        <span>{t('copy')}</span>
                      </button>
                    </div>
                    {inviteJoinUrl ? (
                      <div className="invite-url-row">
                        <Link2 size={13} style={{flexShrink:0,color:'var(--accent)'}} aria-hidden="true" />
                        <span className="invite-url-text">{inviteJoinUrl}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="invite-share-grid">
                    <button type="button" className="invite-share-btn" onClick={shareViaEmail}>
                      <Mail size={20} aria-hidden="true" />
                      <span>{t('shareEmail')}</span>
                    </button>
                    <button type="button" className="invite-share-btn" onClick={shareViaWhatsApp}>
                      <Share2 size={20} aria-hidden="true" />
                      <span>{t('shareWhatsApp')}</span>
                    </button>
                    <button type="button" className="invite-share-btn" onClick={shareViaSMS}>
                      <MessageSquare size={20} aria-hidden="true" />
                      <span>{t('shareSms')}</span>
                    </button>
                    <button type="button" className="invite-share-btn" onClick={() => setShowInviteQr((prev) => !prev)}>
                      <QrCode size={20} aria-hidden="true" />
                      <span>{showInviteQr ? t('hideQr') : t('showQr')}</span>
                    </button>
                  </div>

                  {showInviteQr ? (
                    <div className="qr-share-box" style={{gridTemplateColumns:'1fr',textAlign:'center',gap:'0.55rem'}}>
                      <div style={{display:'flex',justifyContent:'center'}}>
                        <QRCodeSVG value={inviteJoinUrl || currentTrip.inviteCode} size={160} includeMargin />
                      </div>
                      <p className="muted" style={{margin:0,fontSize:'0.85rem'}}>{t('scanQr')}</p>
                    </div>
                  ) : null}

                  {currentTrip.pendingInvites && currentTrip.pendingInvites.length > 0 ? (
                    <div className="invite-pending-section">
                      <p className="eyebrow" style={{marginBottom:'0.55rem'}}>{lang === 'sk' ? 'Pozvané osoby' : 'Invited people'}</p>
                      {currentTrip.pendingInvites.map((inv) => {
                        const initials = inv.name ? inv.name.slice(0, 2).toUpperCase() : '?';
                        const isAccepted = inv.status === 'Prijate';
                        return (
                          <div className="invite-pending-row" key={inv.id}>
                            <div className="invite-pending-av">{initials}</div>
                            <div style={{flex:1,minWidth:0}}>
                              <strong style={{fontSize:'0.9rem'}}>{inv.name}</strong>
                              {inv.contact ? <p className="muted" style={{margin:0,fontSize:'0.78rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{inv.contact}</p> : null}
                            </div>
                            <div className={`invite-pending-status ${isAccepted ? 'invite-status-accepted' : 'invite-status-waiting'}`}>
                              {isAccepted ? <CheckCircle2 size={12} aria-hidden="true" /> : <Clock size={12} aria-hidden="true" />}
                              <span>{inv.status}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {activeDetailScreen === 'expenses' ? (
                <section className="screen-window section-card screen-single full-window">
                  <div className="section-head compact-head expenses-head">
                    <div>
                        <p className="eyebrow">{t('expensesTab')}</p>
                        <h2>{t('expensesTitle')}</h2>
                    </div>
                      <button type="button" className="expense-open-modal-btn" onClick={openExpenseModalForCreate}>
                        {t('addExpenseBtn')}
                    </button>
                  </div>

                  <div className="mini-panel expenses-list-panel">
                    <div className="expenses-toolbar">
                      <input
                        className="expenses-search"
                        type="search"
                        placeholder={lang === 'sk' ? 'Hľadať...' : 'Search...'}
                        value={expenseSearchQuery}
                        onChange={(e) => setExpenseSearchQuery(e.target.value)}
                      />
                      <select
                        className="expenses-sort"
                        value={expenseSortOrder}
                        onChange={(e) => setExpenseSortOrder(e.target.value as typeof expenseSortOrder)}
                      >
                        <option value="newest">{lang === 'sk' ? 'Najnovšie' : 'Newest'}</option>
                        <option value="oldest">{lang === 'sk' ? 'Najstaršie' : 'Oldest'}</option>
                        <option value="highest">{lang === 'sk' ? 'Najvyššia suma' : 'Highest amount'}</option>
                        <option value="lowest">{lang === 'sk' ? 'Najnižšia suma' : 'Lowest amount'}</option>
                      </select>
                    </div>
                    {(() => {
                      const q = expenseSearchQuery.trim().toLowerCase();
                      const sorted = [...normalizedExpenses].sort((a, b) => {
                        if (expenseSortOrder === 'highest') return b.amount - a.amount;
                        if (expenseSortOrder === 'lowest') return a.amount - b.amount;
                        const aDate = a.date || '';
                        const bDate = b.date || '';
                        if (expenseSortOrder === 'oldest') return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
                        return aDate > bDate ? -1 : aDate < bDate ? 1 : 0;
                      });
                      const filtered = q
                        ? sorted.filter((e) =>
                            e.title?.toLowerCase().includes(q) ||
                            memberNameOf(e.payer || '').toLowerCase().includes(q) ||
                            (e.participants || []).some((p) => memberNameOf(p).toLowerCase().includes(q))
                          )
                        : sorted;
                      if (filtered.length === 0) return <p className="muted">{t('noRecords')}</p>;
                      const expIconMap: Record<string, React.ReactNode> = {
                        jedlo: <Utensils size={14} />, doprava: <Car size={14} />, ubytovanie: <Bed size={14} />,
                        zabava: <PartyPopper size={14} />, nakupy: <ShoppingBag size={14} />, zdravie: <Heart size={14} />,
                        sport: <Dumbbell size={14} />, kultura: <Music size={14} />, technika: <Cpu size={14} />,
                        ostatne: <Package size={14} />, prevod: <ArrowLeftRight size={14} />,
                      };
                      const isDateSort = expenseSortOrder === 'newest' || expenseSortOrder === 'oldest';
                      const rows: React.ReactNode[] = [];
                      let prevDateLabel: string | null = null;
                      filtered.forEach((expense) => {
                        if (isDateSort && expense.date) {
                          const label = new Date(expense.date).toLocaleDateString(lang === 'sk' ? 'sk-SK' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                          if (label !== prevDateLabel) {
                            rows.push(<div className="date-group-header" key={`dh-${expense.date}-${expense.id}`}>{label}</div>);
                            prevDateLabel = label;
                          }
                        }
                        const cat = expense.expenseType === 'transfer' ? 'prevod' : (expense.category || 'ostatne');
                        const payerName = formatMemberName(memberNameOf(expense.payer || ''));
                        const participantCount = (expense.participants || []).length;
                        const perPerson = expense.splitType === 'equal' && participantCount > 1
                          ? `${money(expense.amount / participantCount)}/os`
                          : null;
                        rows.push(
                          <div
                            className="exp-row-v2"
                            key={expense.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openExpenseDetail(expense.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openExpenseDetail(expense.id);
                              }
                            }}
                          >
                            <div className={`exp-cat-icon category-${cat}`}>
                              {expIconMap[cat] || <Package size={14} />}
                            </div>
                            <div className="exp-info">
                              <div className="exp-row-title">{expense.title}</div>
                              <div className="exp-meta-row">
                                <span className="exp-payer-chip">{payerName}</span>
                                {participantCount > 1 ? (
                                  <span className="exp-split-count">· {participantCount} {lang === 'sk' ? 'ľudí' : 'people'}</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="exp-right">
                              <div className="exp-amount">{money(expense.amount)}</div>
                              {perPerson ? <div className="exp-per-person">{perPerson}</div> : null}
                            </div>
                          </div>
                        );
                      });
                      return <div className="stack-list">{rows}</div>;
                    })()}
                  </div>


                </section>
              ) : null}

              {activeDetailScreen === 'balances' ? (
                <section className="screen-window section-card screen-single full-window">
                  <div className="section-head compact-head">
                      <p className="eyebrow">{t('balanceTab')}</p>
                      <h2>{t('balanceTitle')}</h2>
                  </div>
                    <div className="balance-shell">
                      <div className="balance-segmented" role="tablist" aria-label={t('balanceSwitcher')}>
                      <button
                        type="button"
                        role="tab"
                        className={balanceTab === 'all' ? 'balance-tab active' : 'balance-tab'}
                        aria-selected={balanceTab === 'all'}
                        onClick={() => setBalanceTab('all')}
                      >
                          {t('allTab')}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={balanceTab === 'settlements' ? 'balance-tab active' : 'balance-tab'}
                        aria-selected={balanceTab === 'settlements'}
                        onClick={() => setBalanceTab('settlements')}
                      >
                          {t('settlementsTab')}
                      </button>
                    </div>

                    {balanceTab === 'all' ? (
                      <div className="balance-main-card">
                          <h3>{t('balanceTitle')}</h3>
                          <p className="muted balance-subtitle">{t('currentBalances')}</p>

                          {Object.entries(balances).length === 0 ? (
                            <p className="muted">{t('noMembers')}</p>
                          ) : null}

                        <div className="stack-list balance-transfer-list">
                          {Object.entries(balances).map(([name, value]) => {
                            if (!Number.isFinite(value)) return null;
                            if (Math.abs(value) < 0.01) return null;
                            const displayName = formatMemberName(displayNameForKey(name));
                            const isSelfDebtor = value < 0 && isSelfName(name);
                            const selfSettlement = isSelfDebtor
                              ? settlements.find((s) => s.from === name)
                              : null;
                            return (
                              <div className="balance-transfer-row" key={name}>
                                <button
                                  type="button"
                                  className="balance-person member-link-inline"
                                  onClick={() => openMemberProfile(displayNameForKey(name))}
                                >
                                  {firstNameOf(displayName)}
                                </button>
                                <span className="balance-arrow" aria-hidden="true">{value >= 0 ? '←' : '→'}</span>
                                <span className="balance-target">
                                  <span className="balance-avatar">€</span>
                                    {value >= 0 ? t('receives') : t('pays')}
                                </span>
                                <div className="settlement-actions">
                                  {selfSettlement ? (
                                    <button
                                      type="button"
                                      className="mark-paid-btn"
                                      onClick={() => handleMarkAsPaid(selfSettlement.from, selfSettlement.to, selfSettlement.amount)}
                                    >
                                      {t('markAsPaid')}
                                    </button>
                                  ) : null}
                                  <strong className={`balance-amount ${value >= 0 ? 'positive' : 'negative'}`}>
                                    {eur(Math.abs(value))}
                                  </strong>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="balance-total-card">
                          <p>
                              {safeSelfBalance >= 0 ? `${displayCurrentUserName} ${t('receivesTotal')}` : `${displayCurrentUserName} ${t('paysTotal')}`}
                          </p>
                          <strong className={safeSelfBalance >= 0 ? 'positive' : 'negative'}>
                            {eur(Math.abs(safeSelfBalance))}
                          </strong>
                        </div>
                      </div>
                    ) : null}

                    {balanceTab === 'settlements' ? (
                      <div className="balance-main-card">
                          <h3>{t('settlementsTitle')}</h3>
                          <p className="muted balance-subtitle">{t('fewestTransfers')}</p>

                          {settlements.length === 0 ? <p className="muted">{t('allSettled')}</p> : null}

                        <div className="stack-list balance-transfer-list">
                          {settlements.map((transfer, index) => {
                            const fromKey = displayNameForKey(transfer.from);
                            const toKey = displayNameForKey(transfer.to);
                            const fromName = formatMemberName(fromKey);
                            const toName = formatMemberName(toKey);
                            const recipientIban = memberIbanByName[memberKey(toKey)] || '';
                            const canCopyRecipientIban = isSelfName(fromKey) && Boolean(recipientIban.trim());

                            return (
                              <div className="balance-transfer-row" key={`${transfer.from}-${transfer.to}-${index}`}>
                                <button
                                  type="button"
                                  className="balance-person member-link-inline"
                                  onClick={() => openMemberProfile(fromKey)}
                                >
                                  {fromName}
                                </button>
                                <span className="balance-arrow" aria-hidden="true">→</span>
                                <span className="balance-target">
                                  <span className="balance-avatar">€</span>
                                  {t('settlementAction')}{' '}
                                  <button
                                    type="button"
                                    className="member-link-inline"
                                    onClick={() => openMemberProfile(toKey)}
                                  >
                                    {toName}
                                  </button>
                                  {recipientIban.trim() ? <span className="iban-available-chip">IBAN</span> : null}
                                </span>
                                <div className="settlement-actions">
                                  {canCopyRecipientIban ? (
                                    <button
                                      type="button"
                                      className="ghost"
                                      onClick={() => copyIban(recipientIban)}
                                    >
                                      {t('copyRecipientIbanBtn')}
                                    </button>
                                  ) : null}
                                  {isSelfName(fromKey) ? (
                                    <button
                                      type="button"
                                      className="mark-paid-btn"
                                      onClick={() => handleMarkAsPaid(transfer.from, transfer.to, transfer.amount)}
                                    >
                                      {t('markAsPaid')}
                                    </button>
                                  ) : null}
                                  <strong className="balance-amount">{money(transfer.amount)}</strong>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="balance-total-card">
                          <p>
                              {safeSelfBalance >= 0 ? `${displayCurrentUserName} ${t('receivesTotal')}` : `${displayCurrentUserName} ${t('paysTotal')}`}
                          </p>
                          <strong className={safeSelfBalance >= 0 ? 'positive' : 'negative'}>
                            {eur(Math.abs(safeSelfBalance))}
                          </strong>
                        </div>
                      </div>
                    ) : null}

                    <div className="balance-tip muted">
                        {t('balanceTip')}
                    </div>
                  </div>
                </section>
              ) : null}

              {activeDetailScreen === 'activity' ? (() => {
                const iconMap: Record<string, React.ReactNode> = {
                  jedlo: <Utensils size={14} />, doprava: <Car size={14} />, ubytovanie: <Bed size={14} />,
                  zabava: <PartyPopper size={14} />, nakupy: <ShoppingBag size={14} />, zdravie: <Heart size={14} />,
                  sport: <Dumbbell size={14} />, kultura: <Music size={14} />, technika: <Cpu size={14} />,
                  ostatne: <Package size={14} />, prevod: <ArrowLeftRight size={14} />,
                };
                const bgMap: Record<string, string> = {
                  jedlo: '#fff8e7', doprava: '#fef2f2', ubytovanie: '#eef5ff',
                  zabava: '#fef9c3', nakupy: '#f5f3ff', zdravie: '#fce7f3',
                  sport: '#f0fdf4', kultura: '#fff3e0', technika: '#e0f7fa',
                  ostatne: '#f4f4f5', prevod: '#ecfdf3',
                };
                const sorted = [...(currentTrip.expenses || [])]
                  .filter((e) => !e.deletedAt)
                  .sort((a, b) => {
                    const da = a.date ? new Date(a.date).getTime() : 0;
                    const db = b.date ? new Date(b.date).getTime() : 0;
                    return db - da;
                  });
                return (
                  <section className="screen-window section-card screen-single full-window">
                    <div className="section-head compact-head">
                      <p className="eyebrow">{t('activityTab')}</p>
                      <h2>{currentTrip.name}</h2>
                    </div>
                    {sorted.length === 0 ? (
                      <p className="muted">{t('noExpensesYet')}</p>
                    ) : (
                      <div className="stack-list">
                        {sorted.map((exp) => {
                          const isTransfer = exp.expenseType === 'transfer';
                          const cat = isTransfer ? 'prevod' : (exp.category || 'ostatne');
                          const payerDisplay = formatMemberName(exp.payer || '');
                          const toDisplay = exp.transferTo ? formatMemberName(exp.transferTo) : '';
                          const dateStr = exp.date
                            ? new Date(exp.date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' })
                            : '';
                          return (
                            <div className="activity-feed-row" key={exp.id}>
                              <div
                                className="activity-feed-icon"
                                style={{ background: bgMap[cat] || '#f4f4f5' }}
                              >
                                {iconMap[cat] || <Package size={14} />}
                              </div>
                              <div className="activity-feed-body">
                                <div className="activity-feed-title">
                                  <strong>{payerDisplay}</strong>
                                  {isTransfer
                                    ? <> → <strong>{toDisplay}</strong></>
                                    : <> pridal výdavok</>}
                                </div>
                                <div className="activity-feed-meta">
                                  <span className={isTransfer ? 'activity-chip activity-chip-paid' : 'activity-chip activity-chip-added'}>
                                    {exp.title}
                                  </span>
                                  <span className="activity-chip-amount">{eur(exp.amount)}</span>
                                </div>
                                {dateStr ? <div className="activity-feed-time">{dateStr}</div> : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })() : null}

              {activeDetailScreen === 'stats' ? (() => {
                const catLabelMap: Record<string, string> = {
                  jedlo: t('categoryFood'), doprava: t('categoryTransport'), ubytovanie: t('categoryAccom'),
                  zabava: t('categoryFun'), nakupy: t('categoryShopping'), zdravie: t('categoryHealth'),
                  sport: t('categorySport'), kultura: t('categoryKultura'), technika: t('categoryTech'),
                  ostatne: t('categoryOther'),
                };
                const catIconMap: Record<string, React.ReactNode> = {
                  jedlo: <Utensils size={12} />, doprava: <Car size={12} />, ubytovanie: <Bed size={12} />,
                  zabava: <PartyPopper size={12} />, nakupy: <ShoppingBag size={12} />, zdravie: <Heart size={12} />,
                  sport: <Dumbbell size={12} />, kultura: <Music size={12} />, technika: <Cpu size={12} />,
                  ostatne: <Package size={12} />,
                };
                const catColorMap: Record<string, string> = {
                  jedlo: '#f59e0b', doprava: '#ef4444', ubytovanie: '#2c79f6',
                  zabava: '#8b5cf6', nakupy: '#ec4899', zdravie: '#ef4444',
                  sport: '#16a34a', kultura: '#f97316', technika: '#06b6d4', ostatne: '#9ca3af',
                };
                const activeExps = normalizedExpenses.filter((e) => !e.deletedAt && e.expenseType !== 'transfer');
                const total = activeExps.reduce((s, e) => s + e.amount, 0);

                const catTotals: Record<string, number> = {};
                activeExps.forEach((e) => {
                  const c = e.category || 'ostatne';
                  catTotals[c] = (catTotals[c] || 0) + e.amount;
                });
                const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
                const maxCat = sortedCats[0]?.[1] || 1;

                const topExp = [...activeExps].sort((a, b) => b.amount - a.amount)[0] || null;

                const memberTotals: Record<string, number> = {};
                activeExps.forEach((e) => {
                  const key = e.payer || '';
                  if (key) memberTotals[key] = (memberTotals[key] || 0) + e.amount;
                });
                const sortedMembers = Object.entries(memberTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
                const maxMember = sortedMembers[0]?.[1] || 1;
                const memberColors = ['#2c79f6', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6'];

                return (
                  <section className="screen-window section-card screen-single full-window">
                    <div className="section-head compact-head">
                      <p className="eyebrow">{t('statsTab')}</p>
                      <h2>{currentTrip.name}</h2>
                    </div>

                    {/* Hero total */}
                    <div className="hero-panel" style={{ marginBottom: '0.5rem' }}>
                      <p className="eyebrow">{t('categoryBreakdown').replace('výdavkov', '').trim() || 'Celková útrata'}</p>
                      <div className="stats-hero-total">{eur(total)}</div>
                      <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                        {expenseCountLabel(activeExps.length, lang)} · {memberCountLabel(members.length, lang)}
                      </p>
                    </div>

                    {/* Category breakdown */}
                    {sortedCats.length > 0 ? (
                      <div className="section-card" style={{ padding: '0.7rem 0.9rem' }}>
                        <h3 style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: '0.55rem' }}>{t('categoryBreakdown')}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.42rem' }}>
                          {sortedCats.map(([cat, amt]) => (
                            <div className="cat-bar-row" key={cat}>
                              <span className="cat-bar-label">
                                {catIconMap[cat] || <Package size={12} />}
                                {catLabelMap[cat] || cat}
                              </span>
                              <div className="cat-bar-track">
                                <div
                                  className="cat-bar-fill"
                                  style={{ width: `${Math.round((amt / maxCat) * 100)}%`, background: catColorMap[cat] || '#9ca3af' }}
                                />
                              </div>
                              <span className="cat-bar-val">{eur(amt)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Top expense */}
                    {topExp ? (
                      <div className="section-card" style={{ padding: '0.7rem 0.9rem' }}>
                        <p className="muted" style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.45rem' }}>
                          Najvyšší výdavok
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <span className={`category-badge category-${topExp.category || 'ostatne'}`} style={{ width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.5rem', flexShrink: 0 }}>
                            {catIconMap[topExp.category || 'ostatne'] || <Package size={12} />}
                          </span>
                          <span style={{ flex: 1, fontWeight: 700, fontSize: '0.85rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {topExp.title}
                          </span>
                          <strong style={{ fontSize: '1rem', color: 'var(--accent)', flexShrink: 0 }}>{eur(topExp.amount)}</strong>
                        </div>
                      </div>
                    ) : null}

                    {/* Member ranking */}
                    {sortedMembers.length > 0 ? (
                      <div className="section-card" style={{ padding: '0.7rem 0.9rem' }}>
                        <h3 style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: '0.55rem' }}>Kto zaplatil najviac</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.38rem' }}>
                          {sortedMembers.map(([payer, amt], idx) => {
                            const displayName = formatMemberName(payer);
                            const initial = displayName.charAt(0).toUpperCase();
                            const pct = Math.round((amt / maxMember) * 100);
                            const color = memberColors[idx] || '#9ca3af';
                            return (
                              <div key={payer} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted)', width: '1rem', flexShrink: 0 }}>{idx + 1}.</span>
                                <span style={{ width: '1.55rem', height: '1.55rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, color: '#fff', background: `linear-gradient(135deg,${color},${color}bb)`, flexShrink: 0 }}>{initial}</span>
                                <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
                                <div style={{ width: '4rem', height: '0.4rem', background: 'var(--stroke)', borderRadius: '99px', overflow: 'hidden', flexShrink: 0 }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${color},${color}99)`, borderRadius: '99px' }} />
                                </div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent)', width: '3.8rem', textAlign: 'right', flexShrink: 0 }}>{eur(amt)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {activeExps.length === 0 ? <p className="muted">{t('noExpensesYet')}</p> : null}
                  </section>
                );
              })() : null}

              {showChatModal && currentTrip ? (() => {
                const hist = currentTrip.chatHistory || [];
                const qCount = hist.filter((m) => m.role === 'user').length;
                const chatLimit = currentTrip.chatLimit ?? 10;
                const limitReached = qCount >= chatLimit;
                return (
                  <div className="modal-overlay" role="presentation" onClick={() => setShowChatModal(false)}>
                    <section className="trip-chat-modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                      <div className="modal-head">
                        <div>
                          <p className="eyebrow">AI asistent</p>
                          <h2 className="trip-chat-modal-title">
                            <span className="trip-chat-icon">✦</span> {currentTrip.name}
                          </h2>
                        </div>
                        <button type="button" className="ghost" onClick={() => setShowChatModal(false)}>{t('close')}</button>
                      </div>
                      <p className="trip-chat-modal-limit">
                        {lang === 'sk' ? `Otázky: ${qCount} / ${chatLimit}` : `Questions: ${qCount} / ${chatLimit}`}
                      </p>
                      <div className="trip-chat-messages-modal" ref={chatScrollRef}>
                        {hist.length === 0 ? (
                          <p className="trip-chat-hint">
                            {lang === 'sk'
                              ? `Opýtaj sa na tipy pre „${currentTrip.name}" — pamiatky, reštaurácie, aktivity, počasie…`
                              : `Ask for tips about "${currentTrip.name}" — sights, food, activities, weather…`}
                          </p>
                        ) : null}
                        {hist.map((m, i) => (
                          <div key={i} className={`trip-chat-bubble trip-chat-bubble-${m.role}`}>
                            {m.role === 'user' && m.author ? (
                              <span className="trip-chat-author">{firstNameOf(m.author)}</span>
                            ) : null}
                            {m.role === 'assistant' ? stripMd(m.content) : m.content}
                          </div>
                        ))}
                        {chatLoading ? (
                          <div className="trip-chat-bubble trip-chat-bubble-assistant trip-chat-typing">
                            <span /><span /><span />
                          </div>
                        ) : null}
                        <div ref={chatEndRef} />
                      </div>
                      {limitReached ? (
                        <div className="trip-chat-limit-block">
                          <p className="trip-chat-limit-msg">
                            {lang === 'sk' ? `Limit ${chatLimit} otázok bol vyčerpaný.` : `${chatLimit}-question limit reached.`}
                          </p>
                          {currentTrip.chatExtensionRequested ? (
                            <p className="trip-chat-limit-sent">{t('chatExtensionRequestSent')}</p>
                          ) : (
                            <button type="button" className="trip-chat-extension-btn" onClick={handleChatExtensionRequest}>
                              {t('chatExtensionRequest')}
                            </button>
                          )}
                        </div>
                      ) : (
                        <form className="trip-chat-form" onSubmit={(e) => { e.preventDefault(); void handleChatSend(); }}>
                          <input
                            className="trip-chat-input"
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder={lang === 'sk' ? 'Napíš otázku…' : 'Ask anything…'}
                            disabled={chatLoading}
                            autoFocus
                          />
                          <button type="submit" className="trip-chat-send" disabled={chatLoading || !chatInput.trim()}>
                            {chatLoading ? '…' : '↑'}
                          </button>
                        </form>
                      )}
                    </section>
                  </div>
                );
              })() : null}

              {showExpenseModal ? (
                <div className="modal-overlay" role="presentation" onClick={() => { setShowExpenseModal(false); setReceiptStep(null); setReceiptImagePreview(null); setReceiptMerchant(''); setReceiptCategory(''); }}>
                  <section className="section-card modal-card expense-modal-card" role="dialog" aria-modal="true" aria-label={t('addExpenseTitle')} onClick={(event) => event.stopPropagation()}>
                    <div className="modal-head">
                      <div>
                        <p className="eyebrow">{t('expenseModalEyebrow')}</p>
                        <h2>{editingExpenseId ? t('editExpenseTitle') : t('addExpenseTitle')}</h2>
                      </div>
                      <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
                        {!editingExpenseId ? (
                          <button
                            type="button"
                            className={`receipt-scan-btn${receiptStep ? ' active' : ''}`}
                            onClick={() => { setReceiptStep(receiptStep ? null : 'upload'); setReceiptError(''); }}
                            title={lang === 'sk' ? 'Pridať z blocku (Beta)' : 'Add from receipt (Beta)'}
                          >
                            📷 {lang === 'sk' ? 'Z blocku' : 'Receipt'} <span className="beta-badge">Beta</span>
                          </button>
                        ) : null}
                        <button type="button" className="ghost" onClick={() => { setShowExpenseModal(false); setReceiptStep(null); setReceiptImagePreview(null); setReceiptMerchant(''); setReceiptCategory(''); }}>{t('close')}</button>
                      </div>
                    </div>

                    {/* ── Receipt scanner ── */}
                    {receiptStep ? (
                      <div className="ri-scanner">
                        {receiptStep === 'upload' ? (
                          <>
                            <div className="ri-scan-pill">
                              📷 {lang === 'sk' ? 'Skenovať blok' : 'Scan receipt'} · <strong>BETA</strong>
                            </div>
                            <label className="ri-scanner-zone" htmlFor="receipt-file-input">
                              <span className="ri-upload-icon">🧾</span>
                              <strong>{lang === 'sk' ? 'Nahrať fotku blocku' : 'Upload receipt photo'}</strong>
                              <span className="muted">{lang === 'sk' ? 'Klikni alebo presuň sem obrázok' : 'Click or drop image here'}</span>
                            </label>
                            <input
                              id="receipt-file-input"
                              type="file"
                              accept="image/*"
                              capture="environment"
                              style={{ display: 'none' }}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleReceiptImage(f); }}
                            />
                            {receiptError ? <p className="receipt-error">{receiptError}</p> : null}
                          </>
                        ) : receiptStep === 'analyzing' ? (
                          <div className="ri-scanner-area">
                            {receiptImagePreview ? (
                              <div className="ri-receipt-preview-wrap">
                                <img src={receiptImagePreview} alt="receipt" className="ri-receipt-preview" />
                                <div className="ri-scan-overlay"><div className="ri-scan-line" /></div>
                              </div>
                            ) : null}
                            <div className="ri-analyzing-badge">
                              <div className="ri-spinner" />
                              <div>
                                <div className="ri-analyzing-text">{lang === 'sk' ? 'AI analyzuje blok…' : 'Analysing receipt…'}</div>
                                <div className="ri-analyzing-sub">{lang === 'sk' ? 'Rozpoznávam položky a ceny' : 'Recognising items and prices'}</div>
                              </div>
                            </div>
                          </div>
                        ) : receiptStep === 'assign' ? (
                          <div className="ri-assign">
                            <p className="ri-assign-hint">{lang === 'sk' ? 'Priraď položky členom výletu. "Všetci" = rovnomerne rozdelí medzi všetkých.' : 'Assign items to trip members. "Everyone" = split equally.'}</p>
                            <div className="ri-items-list">
                              {receiptItems.map((item, idx) => (
                                <div className="ri-item-row" key={idx}>
                                  <span className="ri-item-name">{item.name}</span>
                                  <span className="ri-item-price">{item.price.toFixed(2)} {receiptCurrency}</span>
                                  <select
                                    className="ri-item-assign"
                                    value={item.assignedTo}
                                    onChange={(e) => setReceiptItems((prev) => prev.map((it, i) => i === idx ? { ...it, assignedTo: e.target.value } : it))}
                                  >
                                    <option value="__all__">{lang === 'sk' ? '👥 Všetci' : '👥 Everyone'}</option>
                                    {members.map((m) => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                </div>
                              ))}
                            </div>
                            <div className="ri-member-totals">
                              {(() => {
                                const totals: Record<string,number> = {};
                                receiptItems.forEach((item) => {
                                  if (item.assignedTo === '__all__') {
                                    members.forEach((m) => { totals[m] = (totals[m] || 0) + item.price / members.length; });
                                  } else {
                                    totals[item.assignedTo] = (totals[item.assignedTo] || 0) + item.price;
                                  }
                                });
                                return Object.entries(totals).map(([m, amt]) => (
                                  <div key={m} className="ri-total-chip">
                                    <span>{m}</span>
                                    <strong>{amt.toFixed(2)} {receiptCurrency}</strong>
                                  </div>
                                ));
                              })()}
                            </div>
                            <button type="button" className="ri-cta" onClick={applyReceiptToDraft}>
                              ✓ {lang === 'sk' ? 'Použiť ako výdavok' : 'Apply as expense'}
                            </button>
                            <button type="button" className="ghost" onClick={() => { setReceiptStep('upload'); setReceiptItems([]); }}>
                              {lang === 'sk' ? '← Nahrať znova' : '← Re-upload'}
                            </button>
                          </div>
                        ) : null}
                        <hr className="receipt-divider" />
                      </div>
                    ) : null}

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
                        <option value="expense">{t('newExpense')}</option>
                        <option value="transfer">{t('transferOption')}</option>
                      </select>
                      <input
                        value={draft.title}
                        onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder={
                          draft.expenseType === 'transfer'
                            ? t('transferNamePlaceholder')
                            : t('expenseNamePlaceholder')
                        }
                      />
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(event) => setDraft((prev) => ({ ...prev, date: event.target.value }))}
                        className="expense-date-input"
                      />
                      {draft.splitType === 'individual' ? (
                        <input
                          value={money(individualTotal)}
                          readOnly
                          className="amount-calculated"
                          aria-label={t('amountPlaceholder')}
                        />
                      ) : (
                        <input
                          value={draft.amount}
                          onChange={(event) => setDraft((prev) => ({ ...prev, amount: event.target.value }))}
                          inputMode="decimal"
                          placeholder={t('amountPlaceholder')}
                        />
                      )}
                      <label className="field-label">{t('paidBy')}</label>
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
                            <option value="">{t('sendTo')}</option>
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
                                    <>
                                      <input
                                        className="weight"
                                        inputMode="decimal"
                                        value={String(draft.participantAmounts[name] ?? '')}
                                        onChange={(event) => {
                                          const raw = event.target.value;
                                          setDraft((prev) => ({
                                            ...prev,
                                            participantAmounts: {
                                              ...prev.participantAmounts,
                                              [name]: raw,
                                            },
                                          }));
                                        }}
                                      />
                                      <span className="participant-amount" aria-hidden>
                                        {money(parseMoneyInput(draft.participantAmounts[name] || 0))}
                                      </span>
                                    </>
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
                                {t('equalSplit')}
                            </button>
                            <button
                              type="button"
                              className={draft.splitType === 'individual' ? 'active' : ''}
                              onClick={() => setDraft((prev) => ({ ...prev, splitType: 'individual' }))}
                            >
                                {t('individualSplit')}
                            </button>
                          </div>

                          {draft.splitType === 'individual' ? (
                            <p className="muted">
                                {t('individualSum')} {money(individualTotal)} / {t('totalLabel')} {money(amountNumber || 0)}
                            </p>
                          ) : null}
                        </>
                      )}

                      {duplicateWarning ? (
                        <div className="duplicate-warning">
                          <p>{lang === 'sk' ? `Podobný výdavok už existuje: "${duplicateWarning.title}" (${eur(duplicateWarning.amount)})` : `Similar expense already exists: "${duplicateWarning.title}" (${eur(duplicateWarning.amount)})`}</p>
                          <div className="duplicate-warning-btns">
                            <button type="submit" className="ghost danger-btn">{lang === 'sk' ? 'Pridaj aj tak' : 'Add anyway'}</button>
                            <button type="button" className="ghost" onClick={() => setDuplicateWarning(null)}>{lang === 'sk' ? 'Zrušiť' : 'Cancel'}</button>
                          </div>
                        </div>
                      ) : (
                        <button type="submit" disabled={!canAddExpense}>
                          {editingExpenseId ? t('saveChanges') : t('addExpenseTitle')}
                        </button>
                      )}
                      {editingExpenseId ? (
                          <button type="button" className="ghost" onClick={() => setEditingExpenseId(null)}>
                            {t('cancelEdit')}
                        </button>
                      ) : null}
                    </form>
                  </section>
                </div>
              ) : null}

              {showExpenseDetailModal && selectedExpense ? (
                <div className="modal-overlay" role="presentation" onClick={closeExpenseDetail}>
                  <section
                    className="section-card modal-card expense-modal-card"
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('expenseDetailTitle')}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="modal-head">
                      <div>
                        <p className="eyebrow">{t('expensesTab')}</p>
                        <h2>{t('expenseDetailTitle')}</h2>
                      </div>
                      <button type="button" className="ghost" onClick={closeExpenseDetail}>{t('close')}</button>
                    </div>

                    <div className="stack expense-detail-stack">
                      <div className="mini-panel expense-detail-summary">
                        <div className="expense-detail-title-row">
                          <strong className="expense-detail-title">{selectedExpense.title}</strong>
                          <span className="expense-detail-amount">{money(selectedExpense.amount)}</span>
                        </div>
                        {selectedExpense.date ? (
                          <p className="muted expense-detail-meta">{selectedExpense.date}</p>
                        ) : null}
                        <p className="muted expense-detail-meta">
                          {t('paidBy')} {formatMemberName(memberNameOf(selectedExpense.payer || ''))}
                        </p>
                        <p className="muted expense-detail-meta">
                          {t('participantsLabel')} {(selectedExpense.participants || []).map((name) => formatMemberName(memberNameOf(name))).join(', ')}
                        </p>
                        {(() => {
                          const cat = selectedExpense.category || inferCategory(selectedExpense.title);
                          const iconMap: Record<string, React.ReactNode> = { jedlo:<Utensils size={12}/>, doprava:<Car size={12}/>, ubytovanie:<Bed size={12}/>, zabava:<PartyPopper size={12}/>, nakupy:<ShoppingBag size={12}/>, zdravie:<Heart size={12}/>, sport:<Dumbbell size={12}/>, kultura:<Music size={12}/>, technika:<Cpu size={12}/>, ostatne:<Package size={12}/>, prevod:<ArrowLeftRight size={12}/> };
                          const labelMap: Record<string,string> = { jedlo:t('categoryFood'), doprava:t('categoryTransport'), ubytovanie:t('categoryAccom'), zabava:t('categoryFun'), nakupy:t('categoryShopping'), zdravie:t('categoryHealth'), sport:t('categorySport'), kultura:t('categoryKultura'), technika:t('categoryTech'), ostatne:t('categoryOther'), prevod:t('categoryTransfer') };
                          const allCats = ['jedlo','doprava','ubytovanie','zabava','nakupy','zdravie','sport','kultura','technika','ostatne','prevod'];
                          return (
                            <div className="expense-category-row">
                              {editingCategoryExpenseId === selectedExpense.id ? (
                                <div className="category-picker">
                                  {allCats.map((c) => (
                                    <button key={c} type="button" className={`category-badge category-${c}${c === cat ? ' category-selected' : ''}`} onClick={() => updateExpenseCategory(selectedExpense.id, c)}>
                                      {iconMap[c]}{labelMap[c]}
                                    </button>
                                  ))}
                                  <button type="button" className="ghost category-picker-cancel" onClick={() => setEditingCategoryExpenseId(null)}>✕</button>
                                </div>
                              ) : (
                                <button type="button" className={`category-badge category-${cat} category-editable`} onClick={() => setEditingCategoryExpenseId(selectedExpense.id)} title={lang === 'sk' ? 'Zmeniť kategóriu' : 'Change category'}>
                                  {iconMap[cat]}{labelMap[cat] || cat} ✎
                                </button>
                              )}
                            </div>
                          );
                        })()}
                        <div className="expense-detail-actions">
                          <button type="button" className="ghost" onClick={() => editExpense(selectedExpense.id)}>
                            {t('editBtn')}
                          </button>
                          {confirmDeleteExpenseId === selectedExpense.id ? (
                            <div className="confirm-delete-inline">
                              <span className="muted">{lang === 'sk' ? 'Naozaj zmazať?' : 'Really delete?'}</span>
                              <button type="button" className="danger-btn" onClick={() => { removeExpense(selectedExpense.id); setConfirmDeleteExpenseId(null); }}>
                                {lang === 'sk' ? 'Zmazať' : 'Delete'}
                              </button>
                              <button type="button" className="ghost" onClick={() => setConfirmDeleteExpenseId(null)}>
                                {lang === 'sk' ? 'Zrušiť' : 'Cancel'}
                              </button>
                            </div>
                          ) : (
                            <button type="button" className="ghost danger-btn" onClick={() => setConfirmDeleteExpenseId(selectedExpense.id)}>
                              {t('deleteBtn')}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mini-panel expense-detail-history">
                        <h3>{t('expenseHistoryTimeline')}</h3>
                        {expenseHistoryLoading ? <p className="muted">{t('loading')}...</p> : null}
                        {!expenseHistoryLoading && selectedExpenseHistory.length === 0 ? (
                          <p className="muted">{t('noExpenseHistory')}</p>
                        ) : null}
                        <div className="stack-list">
                          {selectedExpenseHistory.map((entry) => (
                            <div className="row expense-history-row" key={entry.id}>
                              <div>
                                <strong>{expenseEventLabel(entry.event_type)}</strong>
                                <p>{formatDateTime(entry.created_at)}</p>
                                {entry.payload ? (
                                  // If updated event contains old/new, show small diff (narrow safely)
                                  entry.event_type === 'updated' &&
                                  typeof entry.payload === 'object' &&
                                  entry.payload !== null &&
                                  'old' in entry.payload &&
                                  'new' in entry.payload &&
                                  entry.payload.old &&
                                  entry.payload.new ? (
                                    <div>
                                      <p className="muted">{t('old')}: {entry.payload.old.title} • {money(entry.payload.old.amount)}</p>
                                      <p className="muted">{t('new')}: {entry.payload.new.title} • {money(entry.payload.new.amount)}</p>
                                    </div>
                                  ) : (
                                    // Fallback: if payload looks like a TripExpense, render title/amount
                                    typeof entry.payload === 'object' && entry.payload !== null && 'title' in entry.payload ? (
                                      <p className="muted">{entry.payload.title} • {money((entry.payload as TripExpense).amount)}</p>
                                    ) : null
                                  )
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          )
        ) : null}
        </main>
      )}

      {showRegistrationNotice ? (
        <div className="modal-overlay" role="presentation" onClick={handleRegistrationNoticeConfirm}>
          <section
            className="section-card modal-card registration-notice-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('registrationSuccess')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="registration-notice-hero">
              <div className="registration-notice-icon" aria-hidden="true">
                <span>✓</span>
              </div>
              <div className="registration-notice-copy">
                <p className="eyebrow">{t('createAccount')}</p>
                <h2>{t('registrationSuccess')}</h2>
                <p>{t('registrationNoticeLead')}</p>
              </div>
            </div>

            <div className="registration-notice-summary">
              <p>{t('registrationCreatedNotice')}</p>
              <p>{t('registrationCreatedAction')}</p>
            </div>

            <div className="registration-notice-highlight">
              <strong>{t('registrationNoticeAccessTitle')}</strong>
              <p>{t('registrationNoticeAccessBody')}</p>
            </div>

            <p className="registration-notice-hint">{t('registrationNoticeEmailHint')}</p>

            <button className="primary-cta registration-notice-button" type="button" onClick={handleRegistrationNoticeConfirm}>
              {t('registrationNoticeButton')}
            </button>
          </section>
        </div>
      ) : null}

      {memberProfile ? (() => {
        const memberColors = ['#2c79f6', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];
        const avatarColor = memberColors[memberProfile.name.charCodeAt(0) % memberColors.length];
        const initial = memberProfile.name.charAt(0).toUpperCase();

        const memberPaidTotal = normalizedExpenses
          .filter((e) => !e.deletedAt && e.expenseType !== 'transfer' && e.payer === memberProfile.name)
          .reduce((s, e) => s + e.amount, 0);

        const memberBalanceEntry = Object.entries(balances).find(
          ([k]) => k === memberProfile.name || k === memberProfile.userId
        );
        const rawBalance = memberBalanceEntry ? memberBalanceEntry[1] : null;

        const memberInTrips = trips.filter((t) =>
          t.members.some((m) =>
            typeof m === 'string' ? m === memberProfile.name : m.name === memberProfile.name || (m.id && m.id === memberProfile.userId)
          )
        );

        return (
          <div className="modal-overlay" role="presentation" onClick={() => setMemberProfile(null)}>
            <section
              className="section-card modal-card support-modal-card"
              role="dialog"
              aria-modal="true"
              aria-label={t('memberProfileTitle')}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-head">
                <div>
                  <p className="eyebrow">{t('memberProfileTitle')}</p>
                </div>
                <button type="button" className="ghost" onClick={() => setMemberProfile(null)}>{t('close')}</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Hero */}
                <div className="member-profile-hero">
                  <div
                    className="member-profile-av"
                    style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)` }}
                  >
                    {initial}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '1.05rem', fontWeight: 800, display: 'block' }}>{memberProfile.name}</strong>
                    {memberProfile.email ? <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>{memberProfile.email}</p> : null}
                    {memberProfile.iban ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: '0.3rem', fontSize: '0.68rem', fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: '999px', padding: '0.12rem 0.5rem' }}>
                        💳 IBAN
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Stats */}
                {currentTrip ? (
                  <div className="member-profile-stats">
                    <div className="member-profile-stat">
                      <div className="member-profile-stat-val" style={{ color: 'var(--accent)' }}>{eur(memberPaidTotal)}</div>
                      <div className="member-profile-stat-lbl">zaplatil</div>
                    </div>
                    <div className="member-profile-stat">
                      {rawBalance !== null ? (
                        <>
                          <div className="member-profile-stat-val" style={{ color: rawBalance < 0 ? '#16a34a' : rawBalance > 0 ? '#c0392b' : 'var(--text)' }}>
                            {eur(Math.abs(rawBalance))}
                          </div>
                          <div className="member-profile-stat-lbl">{rawBalance < 0 ? 'dostane' : rawBalance > 0 ? 'dlhuje' : 'vyrovnaný'}</div>
                        </>
                      ) : (
                        <>
                          <div className="member-profile-stat-val">—</div>
                          <div className="member-profile-stat-lbl">bilancia</div>
                        </>
                      )}
                    </div>
                    <div className="member-profile-stat">
                      <div className="member-profile-stat-val">{memberInTrips.length}</div>
                      <div className="member-profile-stat-lbl">výlety</div>
                    </div>
                  </div>
                ) : null}

                {/* IBAN */}
                {memberProfile.iban ? (
                  <div className="section-card" style={{ padding: '0.6rem 0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div>
                      <p className="muted" style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>IBAN</p>
                      <p style={{ fontSize: '0.8rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.1rem' }}>{memberProfile.iban}</p>
                    </div>
                    <button type="button" className="ghost" onClick={() => copyIban(memberProfile.iban)} style={{ flexShrink: 0 }}>
                      {t('copyIbanBtn')}
                    </button>
                  </div>
                ) : (
                  <div className="section-card" style={{ padding: '0.6rem 0.8rem' }}>
                    <p className="muted" style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>IBAN</p>
                    <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.15rem' }}>{t('ibanNotSet')}</p>
                  </div>
                )}

                {/* Shared trips */}
                {memberInTrips.length > 0 ? (
                  <div>
                    <p className="muted" style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                      Spoločné výlety
                    </p>
                    <div className="member-trip-chips">
                      {memberInTrips.slice(0, 6).map((tr) => (
                        <span key={tr.id} className="member-trip-chip">
                          {tr.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        );
      })() : null}

      {showVisitsModal ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowVisitsModal(false)}>
          <section className="section-card modal-card support-modal-card" role="dialog" aria-modal="true" aria-label={t('visitsModalTitle')} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{t('visitsModalTitle')}</h2>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted">{t('visitsDay')}</span>
                <strong>{visits24hCount || visitsDayCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted">{t('visitsWeek')}</span>
                <strong>{visitsWeekCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted">{t('visitsMonth')}</span>
                <strong>{visitsMonthCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted">{t('visitsYear')}</span>
                <strong>{visitsYearCount}</strong>
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem' }}>
              <button type="button" className="ghost" onClick={() => setShowVisitsModal(false)}>{t('close')}</button>
            </div>
          </section>
        </div>
      ) : null}

      {/* Spam log detail modal - rendered at root level so fixed positioning works */}
      {spamLogModal ? (
        <div className="modal-overlay" onClick={() => setSpamLogModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>{t('adminSpamLog')}</h3>
              <span className="pill" style={{
                fontSize: '0.75rem',
                background: spamLogModal.reason === 'invalid_format' ? 'var(--danger-bg, #f8d7da)' : 'var(--warn-bg, #fff3cd)',
                color: spamLogModal.reason === 'invalid_format' ? 'var(--danger, #842029)' : 'var(--warn, #856404)',
              }}>
                {spamLogModal.reason === 'invalid_format' ? t('spamReasonInvalidFormat') : t('spamReasonNoMx')}
              </span>
            </div>
            <div style={{ background: 'var(--surface-2, #f5f5f5)', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
              <p style={{ margin: '0 0 4px' }}>
                <span className="muted" style={{ fontSize: '0.8rem' }}>{t('adminSpamLogEmail')}</span><br />
                <strong style={{ wordBreak: 'break-all' }}>{spamLogModal.email}</strong>
              </p>
              <p style={{ margin: '8px 0 0' }}>
                <span className="muted" style={{ fontSize: '0.8rem' }}>Subject</span><br />
                <span>{spamLogModal.subject || '—'}</span>
              </p>
            </div>
            {spamLogModal.message ? (
              <>
                <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>{t('adminSpamLogMessage')}</p>
                <pre style={{ background: 'var(--surface-2, #f5f5f5)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '220px', overflowY: 'auto', marginBottom: '12px' }}>
                  {spamLogModal.message}
                </pre>
              </>
            ) : null}
            <p className="muted" style={{ fontSize: '0.75rem', marginBottom: '1rem' }}>
              {new Date(spamLogModal.created_at).toLocaleString(lang === 'sk' ? 'sk-SK' : 'en-GB')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="ghost" onClick={() => setSpamLogModal(null)}>
                {t('adminSpamLogClose')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSupportModal ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowSupportModal(false)}>
          <section
            className="section-card modal-card support-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label={t('contactSupport')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">{t('contactSupport')}</p>
                <h2>{t('contactSupport')}</h2>
              </div>
              <button type="button" className="ghost" onClick={() => setShowSupportModal(false)}>{t('close')}</button>
            </div>

            <form className="support-form" onSubmit={handleSupportSubmit}>
              {!isAuthenticated ? (
                <label className="field-block">
                  <span>{t('supportEmailLabel')}</span>
                  <input
                    type="email"
                    value={supportEmail}
                    onChange={(event) => setSupportEmail(event.target.value)}
                    placeholder={t('emailPlaceholder')}
                  />
                </label>
              ) : null}

              <label className="field-block">
                <span>{t('supportSubject')}</span>
                <input
                  value={supportSubject}
                  onChange={(event) => setSupportSubject(event.target.value)}
                  placeholder={t('supportSubject')}
                  maxLength={140}
                />
              </label>

              <label className="field-block">
                <span>{t('supportMessage')}</span>
                <textarea
                  value={supportBody}
                  onChange={(event) => setSupportBody(event.target.value)}
                  placeholder={t('supportMessagePlaceholder')}
                  rows={5}
                />
              </label>

              <button
                type="submit"
                disabled={
                  supportSending ||
                  !supportSubject.trim() ||
                  !supportBody.trim() ||
                  (!isAuthenticated && !supportEmail.trim())
                }
              >
                {supportSending ? t('supportSending') : t('supportSend')}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {showGuideModal ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowGuideModal(false)}>
          <section
            className="section-card modal-card support-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label={t('guideTitle')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">{t('guideBtn')}</p>
                <h2>{t('guideTitle')}</h2>
              </div>
              <button type="button" className="ghost" onClick={() => setShowGuideModal(false)}>{t('close')}</button>
            </div>

            <a
              href="/tutorial-navod.html"
              target="_blank"
              rel="noopener noreferrer"
              className="tutorial-banner-link"
            >
              <div className="tutorial-banner">
                <div className="tutorial-banner-icon">🎯</div>
                <div className="tutorial-banner-text">
                  <strong>{t('tutorialBtn')}</strong>
                  <span>{t('tutorialDesc')}</span>
                </div>
                <div className="tutorial-banner-arrow">→</div>
              </div>
            </a>

            <p className="muted">{t('guideIntro')}</p>

            <div className="guide-platform-switch" role="tablist" aria-label={t('guideTitle')}>
              <button
                type="button"
                className={`guide-platform-btn${guidePlatform === 'ios' ? ' active' : ''}`}
                onClick={() => setGuidePlatform('ios')}
                role="tab"
                aria-selected={guidePlatform === 'ios'}
              >
                <span aria-hidden="true">🍎</span>
                <span>{t('guideIosBtn')}</span>
              </button>
              <button
                type="button"
                className={`guide-platform-btn${guidePlatform === 'android' ? ' active' : ''}`}
                onClick={() => setGuidePlatform('android')}
                role="tab"
                aria-selected={guidePlatform === 'android'}
              >
                <span aria-hidden="true">🤖</span>
                <span>{t('guideAndroidBtn')}</span>
              </button>
            </div>

            <ol className="guide-steps">
              {guidePlatform === 'ios' ? (
                <>
                  <li>{t('guideStep1Ios')}</li>
                  <li>{t('guideStep2Ios')}</li>
                  <li>{t('guideStep3Ios')}</li>
                  <li>{t('guideStep4Ios')}</li>
                </>
              ) : (
                <>
                  <li>{t('guideStep1Android')}</li>
                  <li>{t('guideStep2Android')}</li>
                  <li>{t('guideStep3Android')}</li>
                  <li>{t('guideStep4Android')}</li>
                </>
              )}
            </ol>
          </section>
        </div>
      ) : null}

      {/* Invite slot picker modal - shows after auth when pending invite exists */}
      {inviteTrip && isAuthenticated ? (
        <div className="modal-overlay" role="presentation" onClick={clearInvite}>
          <section
            className="section-card modal-card invite-join-modal"
            role="dialog"
            aria-modal="true"
              aria-label={t('joinTripModal')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                  <p className="eyebrow">{t('inviteEyebrow')}</p>
                  <h2>{t('joinTripModal')}</h2>
              </div>
                <button type="button" className="ghost" onClick={clearInvite}>{t('close')}</button>
            </div>

            <p className="muted invite-join-desc">
                {t('invitedToTrip')} <strong>{inviteTrip.tripName}</strong>.
                {' '}{t('chooseNameDesc')}
            </p>

            {inviteTrip.slots.length > 0 ? (
              <>
                  <p className="invite-slots-label">{t('availableSlots')}</p>
                <div className="slot-picker">
                  {inviteTrip.slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={`slot-btn${inviteChosenSlot === slot && !inviteUseCustom ? ' active' : ''}`}
                      onClick={() => { setInviteChosenSlot(slot); setInviteUseCustom(false); }}
                    >
                      {slot}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`slot-btn slot-btn-custom${inviteUseCustom ? ' active' : ''}`}
                    onClick={() => { setInviteUseCustom(true); setInviteChosenSlot(''); }}
                  >
                      {t('customName')}
                  </button>
                </div>
              </>
            ) : null}

            {(inviteUseCustom || inviteTrip.slots.length === 0) ? (
              <label className="field-block invite-name-field">
                  <span>{t('yourNameInTrip')}</span>
                <input
                  value={inviteCustomName}
                  onChange={(event) => setInviteCustomName(event.target.value)}
                    placeholder={t('yourNameInTripPlaceholder')}
                  autoFocus
                />
              </label>
            ) : null}

            {inviteError ? <p className="invite-error">{inviteError}</p> : null}

            <button
              type="button"
              className="primary-cta"
              onClick={handleCompleteJoin}
              disabled={inviteLoading || (
                !inviteUseCustom && inviteTrip.slots.length > 0
                  ? !inviteChosenSlot
                  : !inviteCustomName.trim()
              )}
            >
                {inviteLoading ? t('adding') : t('joinTripConfirm')}
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}