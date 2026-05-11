import { redirect } from 'next/navigation';

export default function Page() {
	// Redirect admin route to the dashboard to avoid importing client-only app code
	redirect('/dashboard');
}
