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

const STORAGE_KEY = 'splitpay-web-v1';
const SESSION_CACHE_KEY = 'splitpay-web-session';
const STARTUP_SEEN_KEY = 'splitpay-web-startup-seen-v1';
const INVITE_PENDING_KEY = 'splitpay-invite-pending';
const LANG_KEY = 'splitpay-lang';

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
    contactSupport: 'Kontaktovať podporu',
    supportSubject: 'Predmet',
    supportMessage: 'Správa',
    supportMessagePlaceholder: 'Napíš, s čím potrebuješ pomôcť...',
    supportSend: 'Odoslať na podporu',
    supportSending: 'Odosielam...',
    supportSent: 'Správa bola odoslaná na podporu.',
    supportSendFailed: 'Správu sa nepodarilo odoslať. Skús to znova.',
    supportSmtpMissing: 'Podpora nie je správne nakonfigurovaná (SMTP). Kontaktuj administrátora.',
    supportSmtpAuthFailed: 'Emailová schránka podpory odmietla prihlásenie. Skontroluj SMTP údaje.',
    supportSmtpUnreachable: 'SMTP server je dočasne nedostupný. Skús to znova neskôr.',
    supportEmailLabel: 'Tvoj email',
    heroTitle: 'Výlety, rozpočet a vyrovnanie bez chaosu',
    heroDesc: 'Vytvor výlet, pozvi ľudí cez kód a maj výdavky pod kontrolou od prvého nákupu až po posledné vyrovnanie.',
    quickInvites: 'Rýchle pozvánky',
    fairSplit: 'Spravodlivé rozdelenie',
    instantBalance: 'Okamžitá bilancia',
    loggedInEmail: 'Prihlásený email:',
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
    allSettled: 'Všetko je vyrovnané.',
    balanceTip: 'Pošli kamarátom svoje číslo účtu alebo vyrovnajte v hotovosti.',
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
    removeSelfWarningLead: '⚠️ Ak sa odstránite:',
    removeSelfWarningSolo: 'Si jediný člen, výlet bude vymazaný.',
    removeSelfInfoLead: 'ℹ️ Ak sa odstránite:',
    removeSelfInfoTransfer: 'Vlastníctvo preberá',
    anotherMember: 'ďalší člen',
    accountDeleteRequiresServer: 'Vymazanie účtu vyžaduje serverovú funkciu (service role).',
    supabaseNotConfigured: 'Supabase nie je nastavene. Doplnenie .env je povinne.',
    supabaseNotConfiguredShort: 'Supabase nie je nastavene.',
    enterEmailPassword: 'Zadaj email aj heslo.',
    loginSuccess: 'Prihlásenie úspešne.',
    registrationSuccess: 'Registrácia prebehla. Skontroluj email pre potvrdenie účtu.',
    registrationSuccessInstant: 'Registrácia prebehla a si prihlásený.',
    registrationPendingLocalAccess: 'Konto bolo vytvorené. Potvrzovací email bol odoslaný znova a do appky si vpustený dočasne. Po potvrdení emailu sa prihláš bez obmedzení.',
    registrationCreatedNotice: 'Užívateľ je vytvorený. Potvrzovací email príde do pár minút.',
    registrationCreatedAction: 'Po kliknutí na OK ťa pustíme do appky.',
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
    contactSupport: 'Contact Support',
    supportSubject: 'Subject',
    supportMessage: 'Message',
    supportMessagePlaceholder: 'Describe what you need help with...',
    supportSend: 'Send to support',
    supportSending: 'Sending...',
    supportSent: 'Message was sent to support.',
    supportSendFailed: 'Message could not be sent. Please try again.',
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
    allSettled: 'Everything is settled.',
    balanceTip: 'Share your bank account number or settle in cash.',
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
    removeSelfWarningLead: '⚠️ If you remove yourself:',
    removeSelfWarningSolo: 'You are the only member, the trip will be deleted.',
    removeSelfInfoLead: 'ℹ️ If you remove yourself:',
    removeSelfInfoTransfer: 'Ownership will transfer to',
    anotherMember: 'another member',
    accountDeleteRequiresServer: 'Deleting account requires a server function (service role).',
    supabaseNotConfigured: 'Supabase is not configured. .env setup is required.',
    supabaseNotConfiguredShort: 'Supabase is not configured.',
    enterEmailPassword: 'Enter email and password.',
    loginSuccess: 'Sign in successful.',
    registrationSuccess: 'Registration completed. Check your email to confirm the account.',
    registrationSuccessInstant: 'Registration completed and you are signed in.',
    registrationPendingLocalAccess: 'Account was created. Verification email was resent and temporary app access is enabled. After email confirmation, sign in for full access.',
    registrationCreatedNotice: 'User account has been created. Verification email should arrive in a few minutes.',
    registrationCreatedAction: 'After clicking OK, you can enter the app.',
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

type PendingVerification = {
  email: string;
  password: string;
  fullName: string;
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
    date: trip.date || '',
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
  const [showSupportModal, setShowSupportModal] = useState(false);
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
  const [balanceTab, setBalanceTab] = useState<'all' | 'settlements'>('settlements');
  const [invitePendingCode, setInvitePendingCode] = useState<string | null>(null);
  const [inviteTrip, setInviteTrip] = useState<{ tripId: string; tripName: string; slots: string[] } | null>(null);
  const [inviteChosenSlot, setInviteChosenSlot] = useState('');
  const [inviteCustomName, setInviteCustomName] = useState('');
  const [inviteUseCustom, setInviteUseCustom] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
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
  const appliedJoinCodeRef = useRef('');
  const inviteProcessedRef = useRef(false);
  const profileMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const latestLocalStateRef = useRef('');

  const t = (key: keyof typeof T.sk) => T[lang][key];

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
    if (appSession) {
      window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(appSession));
      return;
    }

    window.localStorage.removeItem(SESSION_CACHE_KEY);
  }, [appSession]);

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
      await supabaseClient.from('trip_states').upsert({
        user_id: userId,
        state_json: payload,
      });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [appSession?.userId, selectedTripId, supabase, trips]);

  useEffect(() => {
    if (!supabase || !authResolved || !appSession?.userId || !dbLoadedRef.current) return;

    const supabaseClient = supabase;
    const userId = appSession.userId;
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

    const interval = window.setInterval(() => {
      void refreshFromDb();
    }, 5000);

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
  }, [appSession?.userId, authResolved, supabase]);

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

      // Always strip "Ty" (owner placeholder from owner's copy) and rename the chosen slot
      // to the user's real registration name. Handles both cases:
      // - memberName !== registrationName (e.g. slot "Janco", registered as "Ján Džurindák")
      // - memberName === registrationName (e.g. slot "Janco", registered as "Janco") — "Ty" still removed
      const registrationName = (appSession?.name || '').trim();
      const effectiveName = registrationName || memberName;

      const remapName = (n: string) => {
        if (n === memberName) return effectiveName;
        if (n.toLowerCase() === 'ty') return null; // remove owner's "Ty" placeholder
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
      ) || null,
    [routeTripKey, trips]
  );
  const activeAppScreen: AppScreen =
    virtualPathname === '/admin' ? 'admin' : routeTripKey ? 'trip-detail' : 'trips';
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
    navigateInApp('/', 'replace');
  }, [
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
    navigateInApp(tripPath(tripKey, nextScreen));
  }

  function goToTripsHome() {
    navigateInApp('/');
  }

  function goToAdmin() {
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

  function removeMember(memberName: string) {
    if (!currentTrip) return;
    const isOwner = isSelfName(currentTrip.owner);
    if (!isOwner) return;

    const isOwnerRemoving = isSameMember(memberName, currentTrip.owner);
    const otherMembers = currentTrip.members.filter((name) => !isSameMember(name, memberName));

    if (isOwnerRemoving && otherMembers.length === 0) {
      // If owner removes themselves and they're alone, delete trip
      deleteTrip(currentTrip.id);
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

  function deleteTrip(tripId: string) {
    const tripToDelete = trips.find((t) => t.id === tripId);
    if (!tripToDelete) return;
    const isOwner = isSelfName(tripToDelete.owner);
    if (!isOwner) return;

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
    setInfoMessage(`${t('invitePreparedFor')} ${cleanedName}. ${t('inviteCodeLabel')} ${currentTrip.inviteCode}`);
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
      setInfoMessage(t('invalidCode'));
      return;
    }

    if (duplicateMember) {
      setInfoMessage(`${cleanedName} ${t('nameAlreadyInGroup')}`);
      return;
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
      setInfoMessage(t('transactionUpdatedInfo'));
      sendNotification(`${currentTrip?.name || t('tripLabel')} - ${t('transactionUpdatedTitle')}`, {
        body: `${expense.title} (${eur(expense.amount)})`,
      });
    } else {
      updateCurrentTrip((trip) => ({ ...trip, expenses: [expense, ...trip.expenses] }));
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
    if (!notificationsEnabled || !appSession) return;

    const selfName = appSession.name;
    const normalizedSelfName = selfName.trim().toLowerCase();
    const langPack = T[lang];
    const isSelf = (name: string) => {
      const normalizedName = name.trim().toLowerCase();
      if (!normalizedName) return false;
      if (normalizedName === 'ty') return true;
      return Boolean(normalizedSelfName) && normalizedName === normalizedSelfName;
    };
    trips.forEach((trip) => {
      const previousExpenseSnapshot = expenseSnapshotRef.current[trip.id] || {};
      const currentExpenseSnapshot: Record<string, string> = {};
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

      const addedExpense = trip.expenses.find(
        (expense) => !Object.prototype.hasOwnProperty.call(previousExpenseSnapshot, expense.id)
      );
      const updatedExpense = trip.expenses.find(
        (expense) =>
          Object.prototype.hasOwnProperty.call(previousExpenseSnapshot, expense.id) &&
          previousExpenseSnapshot[expense.id] !== currentExpenseSnapshot[expense.id]
      );

      if (
        addedExpense &&
        !isSelf(addedExpense.payer) &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification(`${langPack.newTransactionInTrip} ${trip.name}`, {
          body: `${addedExpense.payer} ${langPack.addedExpense} ${addedExpense.title} (${eur(addedExpense.amount)})`,
        });
      } else if (
        updatedExpense &&
        !isSelf(updatedExpense.payer) &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification(`${langPack.transactionUpdatedInTrip} ${trip.name}`, {
          body: `${updatedExpense.payer} ${langPack.updatedExpense} ${updatedExpense.title} (${eur(updatedExpense.amount)})`,
        });
      }

      expenseSnapshotRef.current[trip.id] = currentExpenseSnapshot;

      const previousMembers = memberSnapshotRef.current[trip.id] ?? trip.members;
      if (isSelf(trip.owner) && trip.members.length > previousMembers.length) {
        const previousSet = new Set(previousMembers.map((name) => name.trim().toLowerCase()));
        const addedMembers = trip.members.filter(
          (name) => !previousSet.has(name.trim().toLowerCase())
        );
        const newestMember = addedMembers[addedMembers.length - 1];

        if (
          newestMember &&
          !isSelf(newestMember) &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          new Notification(`${trip.name} - ${langPack.ownerNewMemberTitleSuffix}`, {
            body: `${newestMember} ${langPack.ownerNewMemberBody}`,
            icon: '/icon.png',
          });
        }
      }

      memberSnapshotRef.current[trip.id] = [...trip.members];
    });
  }, [appSession, lang, notificationsEnabled, trips]);

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
                    {t('continueWithGoogle')}
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
                  <button type="button" className="ghost" onClick={goToTripsHome}>{t('myTrips')}</button>
                  {isAdmin ? <button type="button" className="ghost" onClick={goToAdmin}>{t('adminSection')}</button> : null}
                <button type="button" className="ghost" onClick={toggleNotifications}>
                    {notificationsEnabled ? t('notificationsOn') : t('notificationsOff')}
                </button>
                <button
                  type="button"
                  className="ghost danger-btn"
                  onClick={() => setInfoMessage(t('accountDeleteRequiresServer'))}
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
                  <button type="button" className="ghost" onClick={handleLogout}>{t('signOut')}</button>
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
                    {adminPresence.map((user) => (
                      <div className="row" key={user.user_id}>
                        <div>
                          <strong>{user.user_name}</strong>
                          <p>{user.user_email}</p>
                          <p>{t('lastSeen')} {formatDateTime(user.last_seen)}</p>
                        </div>
                        <div className="expense-actions">
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
                    ))}
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
                    {trips.filter((t) => !t.archived).length === 0 ? (
                      <p className="muted">{t('noActiveTrips')}</p>
                    ) : null}
                    {trips
                      .filter((t) => !t.archived)
                      .map((trip) => (
                        <div className="row" key={trip.id}>
                          <div>
                            <strong>{trip.name}</strong>
                            <p className="muted">{memberCountLabel(trip.members.length, lang)}</p>
                          </div>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => openTrip(trip.id, 'overview')}
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
                    {trips.filter((t) => t.archived).length === 0 ? (
                      <p className="muted">{t('noArchivedTrips')}</p>
                    ) : null}
                    {trips
                      .filter((t) => t.archived)
                      .map((trip) => (
                        <div className="row" key={trip.id}>
                          <div>
                            <strong>{trip.name}</strong>
                            <p className="muted">{memberCountLabel(trip.members.length, lang)}</p>
                          </div>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => openTrip(trip.id, 'overview')}
                          >
                            {t('openBtn')}
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="admin-actions">
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
                    <p className="muted">{t('loggedInEmail')} {appSession?.email}</p>
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
                          deleteTrip(currentTrip.id);
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
                        <span>{t('membersLabel')}</span>
                      <strong>{members.length}</strong>
                    </div>
                    <div className="stat-card overview-stat-card">
                        <span>{t('expensesLabel')}</span>
                      <strong>{normalizedExpenses.length}</strong>
                    </div>
                    <div className="stat-card overview-stat-card">
                        <span>{t('invitesLabel')}</span>
                      <strong>{currentTrip.pendingInvites.length}</strong>
                    </div>
                    <div className="stat-card overview-stat-card">
                        <span>{t('totalSpent')}</span>
                      <strong>{money(totalSpent)}</strong>
                    </div>
                  </div>
                  <div className="screen-grid compact-grid overview-compact-grid">
                    <div className="mini-panel overview-mini-panel">
                        <h3>{t('tripMembers')}</h3>
                      <div className="pill-list">
                        {members.map((name) => (
                          <div key={name} className="pill">
                            <span>{name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mini-panel overview-mini-panel">
                        <h3>{t('recentExpenses')}</h3>
                      <div className="stack-list">
                          {recentExpenses.length === 0 ? <p className="muted">{t('noRecords')}</p> : null}
                        {recentExpenses.map((expense) => (
                          <div className="row overview-row" key={expense.id}>
                            <div>
                              <strong>{expense.title}</strong>
                                <p>{t('paidBy')} {expense.payer}</p>
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
                        <div>
                          <strong>{formatMemberName(name)}</strong>
                          {(isSelfName(name) || currentTrip.owner === name) && (
                            <p>
                              {currentTrip.owner === name ? t('ownerLabel') : displayCurrentUserName}
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
                  {currentTripOwnerIsSelf ? (
                    <>
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
                      <form className="stack compact-form" onSubmit={handleAddInvite}>
                        <input
                          value={inviteName}
                          onChange={(event) => setInviteName(event.target.value)}
                            placeholder={t('namePlaceholderInvite')}
                        />
                        <input
                          value={inviteContact}
                          onChange={(event) => setInviteContact(event.target.value)}
                            placeholder={t('contactPlaceholder')}
                        />
                          <button type="submit">{t('addBtn')}</button>
                      </form>
                    </>
                  ) : (
                      <p className="muted">{t('tripCode')} {currentTrip.inviteCode}</p>
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
                        <div className="row" key={expense.id}>
                          <div>
                            <strong>{expense.title}</strong>
                            <p>
                              {expense.expenseType === 'transfer'
                                  ? `${expense.payer} ${t('sent')} ${expense.transferTo || expense.participants[0] || '-'}.`
                                  : `${t('paidBy')} ${expense.payer}, ${t('participantsLabel')} ${expense.participants.join(', ')}`}
                            </p>
                          </div>
                          <div className="expense-actions">
                              <button type="button" className="ghost" onClick={() => editExpense(expense.id)}>
                                {t('editBtn')}
                            </button>
                              <button type="button" className="ghost danger-btn" onClick={() => removeExpense(expense.id)}>
                                {t('deleteBtn')}
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
                            if (Math.abs(value) < 0.01) return null;
                            const displayName = formatMemberName(name);
                            return (
                              <div className="balance-transfer-row" key={name}>
                                <span className="balance-person">{displayName}</span>
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
                              {selfBalance >= 0 ? `${displayCurrentUserName} ${t('receivesTotal')}` : `${displayCurrentUserName} ${t('paysTotal')}`}
                          </p>
                          <strong className={selfBalance >= 0 ? 'positive' : 'negative'}>
                            {eur(Math.abs(selfBalance))}
                          </strong>
                        </div>
                      </div>
                    ) : null}

                    {balanceTab === 'settlements' ? (
                      <div className="balance-main-card">
                          <h3>{t('balanceTitle')}</h3>
                          <p className="muted balance-subtitle">{t('fewestTransfers')}</p>

                          {settlements.length === 0 ? <p className="muted">{t('allSettled')}</p> : null}

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
                              {selfBalance >= 0 ? `${displayCurrentUserName} ${t('receivesTotal')}` : `${displayCurrentUserName} ${t('paysTotal')}`}
                          </p>
                          <strong className={selfBalance >= 0 ? 'positive' : 'negative'}>
                            {eur(Math.abs(selfBalance))}
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
            </div>
          )
        ) : null}
        </main>
      )}

      {showRegistrationNotice ? (
        <div className="modal-overlay" role="presentation" onClick={handleRegistrationNoticeConfirm}>
          <section
            className="section-card modal-card support-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label={t('registrationSuccess')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">{t('createAccount')}</p>
                <h2>{t('registrationSuccess')}</h2>
              </div>
            </div>

            <p className="muted">{t('registrationCreatedNotice')}</p>
            <p className="muted">{t('registrationCreatedAction')}</p>

            <button type="button" onClick={handleRegistrationNoticeConfirm}>OK</button>
          </section>
        </div>
      ) : null}

      {/* Invite slot picker modal - shows after auth when pending invite exists */}
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