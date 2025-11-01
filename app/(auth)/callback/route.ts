import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// This route handler's URL will be YOUR_APP.com/callback
// because the (auth) folder is a route group and does not add to the URL.

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  // `next` is the page the user should be redirected to after login is complete
  const next = requestUrl.searchParams.get('next') || '/';
  // Determine the public-facing base URL. Prefer NEXT_PUBLIC_APP_URL when set,
  // since proxies/tunnels (e.g., Tailscale) may make request.url appear as localhost.
  const preferredBase = process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin;

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Prevent open redirects: only allow path-based redirects within our app.
      const safePath = next.startsWith('/') ? next : '/';

      const destination = new URL(safePath, preferredBase);
      return NextResponse.redirect(destination);
    }
  }

  // If there's an error or no code, something went wrong.
  // Redirect back to the login page with an error message.
  console.error('Error in auth callback:', 'Could not exchange code for session.');
  const errorUrl = new URL('/login', preferredBase);
  errorUrl.searchParams.set('error', 'Authentication failed. Please try again.');
  return NextResponse.redirect(errorUrl);
}
