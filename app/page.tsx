import { redirect } from 'next/navigation';

export const metadata = {
	title: 'SplitPay',
};

export default function Page() {
	// Redirect root to the dashboard page where the full app UI lives
	redirect('/dashboard');
}
