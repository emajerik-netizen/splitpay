'use client';

import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
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

function memberCountLabel(count: number, l: Lang = 'sk') {
  if (count === 1) return T[l].member1;
  if (l === 'sk' && count >= 2 && count <= 4) return `${count} ${T[l].members2to4suffix}`;
  return `${count} ${T[l].membersPlural}`;
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
    backToTrips: '← Späť na moje výlety',
    tripCode: 'Kód výletu:',
    settings: 'Nastavenie',
    membersTab: 'Členovia',
    invitesTab: 'Pozvánky',
    expensesTab: 'Výdavky',
    balanceTab: 'Bilancia',
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
    noDate: 'Bez dátumu',
    member1: '1 člen',
    membersPlural: 'členov',
    members2to4suffix: 'členovia',
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
    backToTrips: '← Back to my trips',
    tripCode: 'Trip code:',
    settings: 'Settings',
    membersTab: 'Members',
    invitesTab: 'Invites',
    expensesTab: 'Expenses',
    balanceTab: 'Balance',
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
    noDate: 'No date',
    member1: '1 member',
    membersPlural: 'members',
    members2to4suffix: 'members',
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

type TripExpense = Expense & {
  id: string;
  title: string;
};

type TripExpenseRow = {
  trip_id: string;
  expense_id: string;
  payload: TripExpense;
  updated_at: string;
};

type ExpenseHistoryEvent = {
  id: number;
  trip_id: string;
  expense_id: string;
  event_type: 'created' | 'updated' | 'deleted';
  payload: TripExpense | null;
  created_at: string;
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
  deletedAt?: string | null;
  deletedBy?: string | null;
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
type TripDetailScreen = 'overview' | 'members' | 'invites' | 'expenses' | 'balances';

type StaleTripWarning = {
  tripId: string;
  tripName: string;
};

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
    deletedAt: null,
    deletedBy: null,
    members: ['Ty'],
    expenses: [],
    pendingInvites: [],
  };
}

function normalizeTrip(trip: Trip): Trip {
  const owner = trip.owner || 'Ty';
  const ownerKey = owner.trim().toLowerCase();
  const rawMembers = Array.isArray(trip.members) ? trip.members : [];
  const dedupedMembers: string[] = [];
  const seen = new Set<string>();

  for (const member of rawMembers) {
    const cleaned = (member || '').trim();
    if (!cleaned) continue;
    const mapped =
      cleaned.toLowerCase() === 'ty' && ownerKey && ownerKey !== 'ty'
        ? owner
        : cleaned;
    const key = mapped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedMembers.push(mapped);
  }

  if (ownerKey && ownerKey !== 'ty' && !seen.has(ownerKey)) {
    dedupedMembers.unshift(owner);
  }

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
  };
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
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [globalAnnouncement, setGlobalAnnouncement] = useState('');
  const [memberAddNotifications, setMemberAddNotifications] = useState<MemberAddNotification[]>([]);
  const [localStateHydrated, setLocalStateHydrated] = useState(false);
    const [lang, setLang] = useState<Lang>(() => {
      if (typeof window === 'undefined') return 'sk';
      return (window.localStorage.getItem(LANG_KEY) as Lang) || 'sk';
    });
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
      setMemberAddNotifications((data || []) as MemberAddNotification[]);
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
        const seen = new Set<string>();
        const canonicalMembers: string[] = [];

        for (const member of trip.members || []) {
          const cleaned = (member || '').trim();
          if (!cleaned) continue;

          const key = cleaned.toLowerCase();
          const canonical = key === 'ty' || key === selfKey ? 'Ty' : cleaned;
          const canonicalKey = canonical.toLowerCase();
          if (seen.has(canonicalKey)) continue;
          seen.add(canonicalKey);
          canonicalMembers.push(canonical);
        }

        const ownerClean = (trip.owner || '').trim();
        const ownerKey = ownerClean.toLowerCase();

        if (ownerKey && ownerKey !== 'ty' && ownerKey !== selfKey && !seen.has(ownerKey)) {
          canonicalMembers.unshift(ownerClean);
          seen.add(ownerKey);
        }

        if ((ownerKey === selfKey || ownerKey === 'ty') && !seen.has('ty')) {
          canonicalMembers.unshift('Ty');
          seen.add('ty');
        }

        const sameLength = canonicalMembers.length === trip.members.length;
        const sameValues = sameLength && canonicalMembers.every((value, idx) => value === trip.members[idx]);

        if (sameValues) return trip;
        changed = true;
        return { ...trip, members: canonicalMembers };
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
          const { error: syncError } = await supabaseClient.rpc('sync_trip_state_by_invite_code', {
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
      const remoteSerialized = JSON.stringify({
        trips: sanitized.trips,
        selectedTripId: sanitized.selectedTripId,
      });

      if (remoteSerialized === latestLocalStateRef.current) return;

      skipNextSaveRef.current = true;
      setTrips(sanitized.trips);
      setSelectedTripId(sanitized.selectedTripId);
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
    }, 1000);

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

      setAdminTrips(
        [...dedupedTrips.values()].sort((left, right) => {
          const leftTs = new Date(left.updatedAt || 0).getTime();
          const rightTs = new Date(right.updatedAt || 0).getTime();
          return rightTs - leftTs;
        })
      );

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
      const remapName = (n: string) => {
        if (n === memberName) return effectiveName;
        if (n.toLowerCase() === 'ty') return ownerLabel;
        if (n === effectiveName) return null; // remove pre-existing duplicate
        return n;
      };

      const remapMembers = (members: string[]) => {
        const result: string[] = [];
        let addedSelf = false;
        for (const m of members) {
          const mapped = remapName(m);
          if (mapped === null) {
            if (!addedSelf && m === memberName) { result.push(effectiveName); addedSelf = true; }
            continue;
          }
          if (mapped === effectiveName) { if (!addedSelf) { result.push(effectiveName); addedSelf = true; } continue; }
          result.push(mapped);
        }
        if (!addedSelf) result.push(effectiveName);
        return result;
      };

      normalized = {
        ...normalized,
        members: remapMembers(normalized.members),
        expenses: normalized.expenses.map((exp) => ({
          ...exp,
          payer: remapName(exp.payer) ?? effectiveName,
          participants: exp.participants
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
      const { data } = (await supabaseClient.rpc('lookup_trip_by_invite_code', {
        p_invite_code: currentTrip.inviteCode,
      })) as unknown as { data: Record<string, any> | null };

      if (cancelled) return;

      if (!data?.found || !data.trip) {
        const ownerNormalized = (currentTrip.owner || '').trim().toLowerCase();
        const selfNormalized = (appSession?.name || '').trim().toLowerCase();
        const isCurrentUserOwner =
          ownerNormalized === 'ty' || (Boolean(selfNormalized) && ownerNormalized === selfNormalized);

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

      const sharedTrip = normalizeTrip(data.trip as Trip);

      setTrips((prev) => {
        const idx = prev.findIndex((trip) => trip.id === currentTrip.id);
        if (idx < 0) return prev;

        const existing = prev[idx];
        const existingSerialized = JSON.stringify(existing);
        const sharedSerialized = JSON.stringify(sharedTrip);
        if (existingSerialized === sharedSerialized) return prev;

        skipNextSaveRef.current = true;
        const next = [...prev];
        next[idx] = sharedTrip;
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
        const existingSerialized = JSON.stringify(sortTripExpensesByNewest(existing.expenses || []));
        const dbSerialized = JSON.stringify(dbExpenses);
        if (existingSerialized === dbSerialized) {
          lastPersistedExpenseSnapshotRef.current[tripId] = dbSerialized;
          return prev;
        }

        skipNextSaveRef.current = true;
        skipExpenseDbWriteRef.current = true;
        lastPersistedExpenseSnapshotRef.current[tripId] = dbSerialized;
        const next = [...prev];
        next[idx] = {
          ...existing,
          expenses: dbExpenses,
        };
        return next;
      });
    };

    void refreshTripExpensesFromDb();
    const interval = window.setInterval(() => {
      void refreshTripExpensesFromDb();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
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
  // For individual split, accept when participant amounts sum to > 0
  const validIndividualSplit = draft.splitType !== 'individual' || individualTotal > 0;

  const normalizedExpenses = useMemo(() => {
    if (!currentTrip) return [];
    return currentTrip.expenses.map((expense) => ({
      ...expense,
      participants: expense.participants.length ? expense.participants : currentTrip.members,
    }));
  }, [currentTrip]);

  const balances = useMemo(() => computeBalances(members, normalizedExpenses), [members, normalizedExpenses]);
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
      normalizedExpenses.reduce((sum, expense) => sum + expense.amount, 0),
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

  const formatMemberName = (name: string) => (isSelfName(name) ? displayCurrentUserName : name);
  
  // Close add/edit expense modal if currentTrip becomes unavailable
  useEffect(() => {
    if (!currentTrip && editingExpenseId) {
      setEditingExpenseId(null);
      // Reset draft to default state
      setDraft({
        title: '',
        amount: '',
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

    const currentMembers = new Set(currentTrip.members.map((name) => name.trim().toLowerCase()));
    const seen = new Set<string>();
    const suggestions: string[] = [];

    for (const trip of trips) {
      if (trip.id === currentTrip.id) continue;

      const tripHasCurrentUser =
        trip.owner.trim().toLowerCase() === normalizedCurrentUser ||
        trip.members.some((member) => member.trim().toLowerCase() === normalizedCurrentUser);
      if (!tripHasCurrentUser) continue;

      for (const member of trip.members) {
        const cleaned = member.trim();
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
  const selfBalance = appSession?.name
    ? (balances[appSession.name] ?? balances.Ty ?? 0)
    : (balances.Ty ?? 0);
  const safeSelfBalance = Number.isFinite(selfBalance) ? selfBalance : 0;

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
      appSession?.name || 'Ty'
    );
    setTrips((prev) => [trip, ...prev]);
    openTrip(trip.id, 'overview', trip.inviteCode);
    setNewTripName('');
    setNewTripDate('');
    setShowCreateTripModal(false);
    setInfoMessage(`${trip.name}: ${t('tripCreated')}`);
  }

  function updateTripSettings(partial: Partial<Pick<Trip, 'name' | 'date' | 'currency' | 'color' | 'archived'>>) {
    if (!currentTrip) return;
    if (partial.archived) {
      const tripBalances = computeBalances(currentTrip.members, currentTrip.expenses);
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

    if (supabase && appSession?.userId) {
      void notifyMemberAdded(cleaned, currentTrip);
    }
  }

  async function notifyMemberAdded(memberName: string, trip: Trip) {
    if (!supabase || !appSession?.userId) return;

    const { data: candidates, error } = await supabase
      .from('user_presence')
      .select('user_id, user_name, last_seen')
      .ilike('user_name', memberName)
      .order('last_seen', { ascending: false })
      .limit(3);

    if (error || !candidates?.length) return;

    const target = candidates.find((row) => row.user_id !== appSession.userId);
    if (!target?.user_id) return;

    await supabase.from('member_add_notifications').insert({
      target_user_id: target.user_id,
      trip_id: trip.id,
      trip_name: trip.name,
      member_name: memberName,
      actor_name: appSession.name,
    });
  }

  function handleAddMemberFromHistory(memberName: string) {
    if (!currentTripOwnerIsSelf || !currentTrip) return;

    const exists = currentTrip.members.some(
      (name) => name.trim().toLowerCase() === memberName.trim().toLowerCase()
    );
    if (exists) return;

    updateCurrentTrip((trip) => ({ ...trip, members: [...trip.members, memberName] }));
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
      setInfoMessage(`${t('ownershipTransferredAndRemoved')} ${formatMemberName(newOwner)}. ${t('removedFromTrip')}`);
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

    setInfoMessage(`${t('identityNow')} ${invitedName}.`);
  }

  function mergeFictionalMember(fictionalName: string) {
    if (!currentTrip || !appSession?.name) return;
    const realName = appSession.name;

    // Rename fictionalName → realName everywhere, remove duplicate realName entry if exists
    updateCurrentTrip((trip) => ({
      ...trip,
      members: trip.members
        .filter((m) => m !== realName || m === fictionalName) // remove existing realName duplicate
        .map((m) => (m === fictionalName ? realName : m)),
      expenses: trip.expenses.map((expense) => ({
        ...expense,
        payer: expense.payer === fictionalName ? realName : expense.payer,
        participants: expense.participants
          .filter((p) => p !== realName || p === fictionalName)
          .map((p) => (p === fictionalName ? realName : p)),
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

    const { error: syncError } = await supabase.rpc('sync_trip_state_by_invite_code', {
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

        if (trip.members.includes(cleanedName)) {
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
          members: [...trip.members, cleanedName],
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

    if (!foundTripId || (supabase && appSession && canSyncWithDb)) {
      if (!supabase || !appSession) {
        setInfoMessage(t('invalidCode'));
        return;
      }

      // Fallback to server-side join for trips owned by other users.
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

      const remapName = (n: string) => {
        if (n === cleanedName) return effectiveName;
        if (n.toLowerCase() === 'ty') return ownerLabel;
        if (n === effectiveName) return null;
        return n;
      };

      const remapMembers = (members: string[]) => {
        const result: string[] = [];
        let addedSelf = false;
        for (const m of members) {
          const mapped = remapName(m);
          if (mapped === null) {
            if (!addedSelf && m === cleanedName) {
              result.push(effectiveName);
              addedSelf = true;
            }
            continue;
          }
          if (mapped === effectiveName) {
            if (!addedSelf) {
              result.push(effectiveName);
              addedSelf = true;
            }
            continue;
          }
          result.push(mapped);
        }
        if (!addedSelf) result.push(effectiveName);
        return result;
      };

      normalized = {
        ...normalized,
        members: remapMembers(normalized.members),
        expenses: normalized.expenses.map((exp) => ({
          ...exp,
          payer: remapName(exp.payer) ?? effectiveName,
          participants: exp.participants
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

  async function logExpenseEvent(expenseId: string, eventType: ExpenseHistoryEvent['event_type'], payload: TripExpense | null) {
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

    // For 'individual' split, compute total from participantAmounts instead of relying on draft.amount
    let amount = Number(draft.amount);
    if (draft.splitType === 'individual') {
      amount = safeParticipants.reduce((sum, name) => {
        const raw = Number(draft.participantAmounts?.[name] || 0);
        return sum + (Number.isFinite(raw) && raw > 0 ? raw : 0);
      }, 0);
    }
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
      // capture previous expense to include a concise diff in history
      const previous = currentTrip.expenses.find((item) => item.id === editingExpenseId) || null;

      updateCurrentTrip((trip) => ({
        ...trip,
        expenses: trip.expenses.map((item) => (item.id === editingExpenseId ? { ...expense, id: editingExpenseId } : item)),
      }));
      // store both old and new in payload so UI can render a small before/after
      void logExpenseEvent(editingExpenseId, 'updated', { old: previous, new: { ...expense, id: editingExpenseId } } as unknown as TripExpense);
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
    closeExpenseDetail();
  }

  function openExpenseModalForCreate() {
    setEditingExpenseId(null);
    // Determine payer: preferably current user if in members, else first member
    const currentUserInMembers = members.find((m) => isSelfName(m)) || 'Ty';
    setDraft({
      title: '',
      amount: '',
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
    closeExpenseDetail();
    setShowExpenseModal(true);
  }

  function removeExpense(expenseId: string) {
    if (!currentTrip) return;
    const found = currentTrip.expenses.find((expense) => expense.id === expenseId) || null;
    if (found) {
      void logExpenseEvent(expenseId, 'deleted', found);
    }
    updateCurrentTrip((trip) => ({
      ...trip,
      expenses: trip.expenses.filter((expense) => expense.id !== expenseId),
    }));
    closeExpenseDetail();
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

          const tripBalances = computeBalances(trip.members, trip.expenses);
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
        memberSnapshotRef.current[trip.id] = [...trip.members];
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
          let actorName = addedExpense.payer;
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
          let actorName = updatedExpense.payer;
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
          let actorName = deletedExpense.payer;
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
        const previousSet = new Set(previousMembers.map((name) => name.trim().toLowerCase()));
        const addedMembers = trip.members.filter(
          (name) => !previousSet.has(name.trim().toLowerCase())
        );
        const newestMember = addedMembers[addedMembers.length - 1];

        if (
          newestMember &&
          !isSelf(newestMember, trip) &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          sendNotification(`${trip.name} - ${langPack.ownerNewMemberTitleSuffix}`, {
            body: `${newestMember} ${langPack.ownerNewMemberBody}`,
            icon: '/icon.png',
          });
        }
      }

      memberSnapshotRef.current[trip.id] = [...trip.members];

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
    const moneyLocale = lang === 'en' ? 'en-GB' : 'sk-SK';
    return new Intl.NumberFormat(moneyLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function expenseEventLabel(eventType: ExpenseHistoryEvent['event_type']) {
    if (eventType === 'created') return t('eventCreated');
    if (eventType === 'updated') return t('eventUpdated');
    return t('eventDeleted');
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
          <div className="profile-fab-wrap" ref={profileMenuWrapRef}>
            <button type="button" className="profile-fab" onClick={() => setProfileOpen((prev) => !prev)}>
              {(appSession?.name || 'U').slice(0, 1).toUpperCase()}
            </button>
            {profileOpen ? (
              <section className="profile-menu section-card">
                  <h3>{t('myProfile')}</h3>
                <p className="muted">{appSession?.name}</p>
                <p className="muted">{appSession?.email}</p>
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
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => openTrip(trip.id, 'overview', trip.inviteCode)}
                          >
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
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => openTrip(trip.id, 'overview', trip.inviteCode)}
                          >
                            {t('openBtn')}
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Unverified registrations */}
              {(() => {
                const unverified = adminAuthUsers
                  .filter((u) => !u.email_confirmed_at && !u.is_oauth)
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                return (
                  <div className="admin-card" style={{ marginTop: '1.5rem' }}>
                    <div className="admin-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h3 style={{ margin: 0 }}>
                        {t('adminUnverifiedTitle')}
                        {unverified.length > 0 ? <span className="badge" style={{ marginLeft: '8px', background: 'var(--warn-bg, #fff3cd)', color: 'var(--warn, #856404)' }}>{unverified.length}</span> : null}
                      </h3>
                    </div>
                    {unverified.length === 0 ? (
                      <p className="muted" style={{ marginTop: '0.5rem' }}>{t('adminUnverifiedEmpty')}</p>
                    ) : (
                      <div className="stack-list" style={{ marginTop: '0.5rem' }}>
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
                    )}
                  </div>
                );
              })()}

              {/* Deleted accounts log */}
              <div className="admin-card" style={{ marginTop: '1.5rem' }}>
                <h3 style={{ margin: '0 0 0.5rem' }}>
                  {t('adminDeletedAccountsTitle')}
                  {deletedAccounts.length > 0 ? <span className="badge" style={{ marginLeft: '8px' }}>{deletedAccounts.length}</span> : null}
                </h3>
                {deletedAccounts.length === 0 ? (
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
                )}
              </div>

              <div className="admin-card" style={{ marginTop: '1.5rem' }}>
                <div className="admin-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0 }}>{t('adminSpamLog')} {spamLog.length > 0 ? <span className="badge">{spamLog.length}</span> : null}</h3>
                  {spamLog.length > 0 ? (
                    <button type="button" className="ghost danger-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={clearSpamLog}>
                      {t('adminSpamLogClearAll')}
                    </button>
                  ) : null}
                </div>
                {spamLog.length === 0 ? (
                  <p className="muted" style={{ marginTop: '0.5rem' }}>{t('adminSpamLogEmpty')}</p>
                ) : (
                  <div className="stack-list" style={{ marginTop: '0.5rem' }}>
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
                <div>
                  <div className="hero-brand">
                    <Image src="/icon.png" alt="Split Pay" width={56} height={56} className="hero-app-icon" />
                    <div>
                      <p className="eyebrow">{t('appName')}</p>
                        <h1>{t('heroTitle')}</h1>
                    </div>
                  </div>
                    <p>{t('heroDesc')}</p>
                  <div className="hero-metrics">
                      <span>{t('quickInvites')}</span>
                      <span>{t('fairSplit')}</span>
                      <span>{t('instantBalance')}</span>
                  </div>
                </div>
                <div className="hero-actions">
                    <p><span className="muted">{t('loggedInEmail')}</span> <strong>{appSession?.name || appSession?.email}</strong></p>
                  <label className="muted archived-toggle">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(event) => setShowArchived(event.target.checked)}
                    />
                      {t('showArchived')}
                  </label>
                </div>
                {infoMessage ? <p className="info-banner hero-info">{infoMessage}</p> : null}
              </section>

              <section className="app-section">
                <div className="section-head">
                  <p className="eyebrow">{t('overviewTab')}</p>
                  <h2>{t('myTrips')}</h2>
                </div>
                <div className="trip-overview-list">
                  {visibleTrips.map((trip) => {
                    const tripBalances = computeBalances(trip.members, trip.expenses);
                    const tripTotal = trip.expenses.reduce((sum, expense) => sum + expense.amount, 0);
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
                              <p>{formatTripDate(trip.date, lang)}</p>
                            </div>
                            <span className={userBalance >= 0 ? 'positive trip-balance' : 'negative trip-balance'}>
                              {money(userBalance)}
                            </span>
                          </div>
                          <div className="trip-card-meta">
                            <span>{memberCountLabel(trip.members.length, lang)}</span>
                             <span>{trip.expenses.length} {t('expenses')}</span>
                             <span>{t('totalMeta')} {money(tripTotal)}</span>
                            <span>{trip.currency}</span>
                             {trip.archived ? <span>{t('archived')}</span> : null}
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
                    <p className="eyebrow">{t('newTrip')}</p>
                    <h2>{t('createTrip')}</h2>
                    <p className="muted card-subtitle">{t('createTripDesc')}</p>
                </button>

                <button
                  type="button"
                  className="section-card action-tile action-tile-join"
                  onClick={() => setShowJoinTripModal(true)}
                >
                    <p className="eyebrow">{t('joinTripEyebrow')}</p>
                    <h2>{t('joinTripTitle')}</h2>
                    <p className="muted card-subtitle">{t('joinTripDesc')}</p>
                </button>
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
              </section>

              {activeDetailScreen === 'overview' ? (
                <section className="screen-window section-card screen-single full-window">
                  <div className="section-head compact-head overview-head">
                    <div>
                        <p className="eyebrow">{t('tripOverview')}</p>
                        <h2>{t('basicInfo')}</h2>
                    </div>
                    <button
                      type="button"
                      className="expense-open-modal-btn"
                      onClick={openExpenseModalForCreate}
                        title={t('addExpense')}
                    >
                      <Plus size={16} />
                        <span>{t('addExpense')}</span>
                    </button>
                  </div>
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
                                    openMemberProfile(expense.payer);
                                  }}
                                >
                                  {formatMemberName(expense.payer)}
                                </button>
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
                      ? currentTrip.members.some((m) => m.trim().toLowerCase() === realName)
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
                            onClick={() => mergeFictionalMember(suggestion)}
                          >
                            <span>{suggestion}</span>
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
                  <div className="invite-code-box">
                    <span>{t('code')}</span>
                    <strong>{currentTrip.inviteCode}</strong>
                    <div className="share-buttons">
                      <button type="button" className="ghost share-action-btn" onClick={copyInviteCodeToClipboard}>
                        <Clipboard size={14} aria-hidden="true" />
                        <span>{t('copy')}</span>
                      </button>
                      <button type="button" className="ghost share-action-btn" onClick={shareViaEmail}>
                        <Mail size={14} aria-hidden="true" />
                        <span>{t('shareEmail')}</span>
                      </button>
                      <button type="button" className="ghost share-action-btn" onClick={shareViaWhatsApp}>
                        <Share2 size={14} aria-hidden="true" />
                        <span>{t('shareWhatsApp')}</span>
                      </button>
                      <button type="button" className="ghost share-action-btn" onClick={shareViaSMS}>
                        <MessageSquare size={14} aria-hidden="true" />
                        <span>{t('shareSms')}</span>
                      </button>
                      <button
                        type="button"
                        className="ghost share-action-btn"
                        onClick={() => setShowInviteQr((prev) => !prev)}
                      >
                        <QrCode size={14} aria-hidden="true" />
                        <span>{showInviteQr ? t('hideQr') : t('showQr')}</span>
                      </button>
                    </div>
                    {showInviteQr ? (
                      <div className="qr-share-box">
                        <QRCodeSVG value={inviteJoinUrl || currentTrip.inviteCode} size={160} includeMargin />
                        <div>
                          <p className="muted">{t('scanQr')}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
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
                      <h3>{t('expenseHistory')}</h3>
                    <div className="stack-list">
                        {currentTrip.expenses.length === 0 ? <p className="muted">{t('noRecords')}</p> : null}
                      {currentTrip.expenses.map((expense) => (
                        <div
                          className="row expense-row expense-row-compact"
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
                          <strong>{expense.title}</strong>
                          <strong>{money(expense.amount)}</strong>
                        </div>
                      ))}
                    </div>
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
                            const displayName = formatMemberName(name);
                            return (
                              <div className="balance-transfer-row" key={name}>
                                <button
                                  type="button"
                                  className="balance-person member-link-inline"
                                  onClick={() => openMemberProfile(name)}
                                >
                                  {displayName}
                                </button>
                                <span className="balance-arrow" aria-hidden="true">{value >= 0 ? '←' : '→'}</span>
                                <span className="balance-target">
                                  <span className="balance-avatar">€</span>
                                    {value >= 0 ? t('receives') : t('pays')}
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
                            const fromName = formatMemberName(transfer.from);
                            const toName = formatMemberName(transfer.to);
                            const recipientIban = memberIbanByName[memberKey(transfer.to)] || '';
                            const canCopyRecipientIban = isSelfName(transfer.from) && Boolean(recipientIban.trim());

                            return (
                              <div className="balance-transfer-row" key={`${transfer.from}-${transfer.to}-${index}`}>
                                <button
                                  type="button"
                                  className="balance-person member-link-inline"
                                  onClick={() => openMemberProfile(transfer.from)}
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
                                    onClick={() => openMemberProfile(transfer.to)}
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

              {showExpenseModal ? (
                <div className="modal-overlay" role="presentation" onClick={() => setShowExpenseModal(false)}>
                  <section className="section-card modal-card expense-modal-card" role="dialog" aria-modal="true" aria-label={t('addExpenseTitle')} onClick={(event) => event.stopPropagation()}>
                    <div className="modal-head">
                      <div>
                        <p className="eyebrow">{t('expenseModalEyebrow')}</p>
                        <h2>{editingExpenseId ? t('editExpenseTitle') : t('addExpenseTitle')}</h2>
                      </div>
                      <button type="button" className="ghost" onClick={() => setShowExpenseModal(false)}>{t('close')}</button>
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
                        value={draft.amount}
                        onChange={(event) => setDraft((prev) => ({ ...prev, amount: event.target.value }))}
                        inputMode="decimal"
                        placeholder={t('amountPlaceholder')}
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

                      <button type="submit" disabled={!canAddExpense}>
                          {editingExpenseId ? t('saveChanges') : t('addExpenseTitle')}
                      </button>
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
                        <p className="muted expense-detail-meta">
                          {t('paidBy')} {formatMemberName(selectedExpense.payer)}
                        </p>
                        <p className="muted expense-detail-meta">
                          {t('participantsLabel')} {selectedExpense.participants.map((name) => formatMemberName(name)).join(', ')}
                        </p>
                        <div className="expense-detail-actions">
                          <button type="button" className="ghost" onClick={() => editExpense(selectedExpense.id)}>
                            {t('editBtn')}
                          </button>
                          <button type="button" className="ghost danger-btn" onClick={() => removeExpense(selectedExpense.id)}>
                            {t('deleteBtn')}
                          </button>
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
                                  // If updated event contains old/new, show small diff
                                  entry.event_type === 'updated' && entry.payload.old && entry.payload.new ? (
                                    <div>
                                      <p className="muted">{t('old')}: {entry.payload.old.title} • {money(entry.payload.old.amount)}</p>
                                      <p className="muted">{t('new')}: {entry.payload.new.title} • {money(entry.payload.new.amount)}</p>
                                    </div>
                                  ) : (
                                    <p className="muted">{entry.payload.title} • {money(entry.payload.amount)}</p>
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

      {memberProfile ? (
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
                <h2>{memberProfile.name}</h2>
              </div>
              <button type="button" className="ghost" onClick={() => setMemberProfile(null)}>{t('close')}</button>
            </div>

            <div className="support-form">
              <label className="field-block">
                <span>{t('name')}</span>
                <input value={memberProfile.name} readOnly />
              </label>
              <label className="field-block">
                <span>{t('email')}</span>
                <input value={memberProfile.email || ''} readOnly />
              </label>
              <label className="field-block">
                <span>{t('ibanLabel')}</span>
                <input value={memberProfile.iban || ''} placeholder={t('ibanNotSet')} readOnly />
              </label>
              <button
                type="button"
                className="ghost"
                disabled={!memberProfile.iban}
                onClick={() => copyIban(memberProfile.iban)}
              >
                {t('copyIbanBtn')}
              </button>
            </div>
          </section>
        </div>
      ) : null}

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