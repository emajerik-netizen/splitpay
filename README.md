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

## Pred release over

1. Email login.
2. Email registraciu.
3. Google login.
4. Obnovu hesla.
5. Obnovu session po refreshi.
6. Vytvorenie vyletu, join cez kod, pridanie vydavku, bilanciu.
