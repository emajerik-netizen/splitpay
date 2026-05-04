import Link from 'next/link';

export default function DashboardPage() {
  return (
    <main className="page-wrap">
      <section className="card">
        <h1>Dashboard je presunuty</h1>
        <p className="muted">
          Aktivna verzia web appky je momentalne na hlavnej stranke, kde je kompletna split
          logika aj vizual.
        </p>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <button type="button">Otvorit SplitPay Web</button>
        </Link>
      </section>
    </main>
  );
}