import Link from 'next/link';

export default function LoginPage() {
  return (
    <main className="page-wrap">
      <section className="card">
        <h1>Login flow sa pripravuje</h1>
        <p className="muted">
          Zakladna web appka uz funguje lokalne bez prihlasenia. Ked budes chciet, doplnime
          Supabase auth ako dalsi krok.
        </p>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <button type="button">Pokracovat do appky</button>
        </Link>
      </section>
    </main>
  );
}