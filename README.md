# SplitPay Web

Webova aplikacia pre rozdelenie vydavkov a vypocet vyrovnania medzi ucastnikmi.

## Co je hotove

- pridanie a odobratie ucastnikov
- pridanie vydavku (equal / shares)
- priebezna bilancia pre kazdeho clena
- navrh vyrovnania kto komu zaplati
- responzivne web UI pre desktop aj mobil
- login a registracia cez email
- prihlasenie cez Google (Supabase OAuth)
- obnova session po refreshi

## Poziadavky

- Node.js `>= 20.9.0`

Ak pouzivas nvm:

```bash
nvm use
```

## Lokalny setup

1. Nainstaluj zavislosti:

```bash
npm install
```

2. Vytvor lokalne env premenne:

```bash
cp .env.example .env.local
```

3. Dopln hodnoty do `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ADMIN_EMAIL` (email admina pre admin sekciu)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (napr. `SplitPay <support@splitpay.sk>`)
- `SUPPORT_TO` (napr. `support@splitpay.sk`)

4. V Supabase SQL Editore spusti obsah suboru `supabase/schema.sql`.
Bez tohto kroku nebude fungovat DB ukladanie vyletov ani admin metriky.

5. Nastav prveho admina (jednorazovo) v Supabase SQL Editore:

```sql
insert into public.user_roles (user_id, role)
values ('<UUID_Z_AUTH_USERS>', 'admin')
on conflict (user_id) do update set role = 'admin';
```

`UUID_Z_AUTH_USERS` najdes v tabulke Authentication -> Users -> ID.

## Spustenie

```bash
npm install
npm run dev
```

Potom otvor `http://localhost:3000`.

## Kontroly

```bash
npm run lint
npm run build
```

## Produkcne publikovanie (Vercel)

1. Pushni projekt do Git repozitara.
2. Vo Vercel importni repozitar a nastav root directory na `splitpay-web`.
3. Vo Vercel nastav Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. Deployni branch `main`.

## Supabase produkcny checklist

1. V Supabase -> Authentication -> URL Configuration nastav:

- Site URL: produkcna domena (napr. `https://splitpay.tvoja-domena.sk`)
- Redirect URLs:
	- produkcna domena
	- lokalny vyvoj (`http://localhost:3000`)

2. V Supabase -> Authentication -> Providers zapni Google provider.
3. V Google Cloud Console nastav OAuth consent a callback URL zo Supabase:

- `https://<project-ref>.supabase.co/auth/v1/callback`

## Vlastny potvrdzovaci email

Vlastny text potvrdenia registracie sa nastavuje v Supabase:

1. Authentication -> Email Templates
2. Confirm signup template uprav podla svojho brandingu

## Email domena a odosielatel support@splitpay.sk

Ak chces, aby vsetky auth maily (confirm signup, reset hesla, zmena emailu) odchadzali z `support@splitpay.sk`, nastav to priamo v Supabase:

1. Authentication -> SMTP Settings -> Enable Custom SMTP
2. Zadaj SMTP host/port/user/pass pre tvoju domenu
3. Sender email nastav na `support@splitpay.sk`
4. Sender name nastav napr. `SplitPay`
5. Otestuj email testovacim odoslanym mailom zo Supabase panelu

Poznamka: app endpoint `/api/support` pouziva rovnake SMTP env premenne a odosiela support formular na `SUPPORT_TO`.

## Pred release over

1. Email login.
2. Email registraciu.
3. Google login.
4. Obnovu hesla.
5. Obnovu session po refreshi.
6. Vytvorenie vyletu, join cez kod, pridanie vydavku, bilanciu.
