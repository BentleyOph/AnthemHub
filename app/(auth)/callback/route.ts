import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// This route handler's URL will be YOUR_APP.com/callback
// because the (auth) folder is a route group and does not add to the URL.

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  // `next` is the page the user should be redirected to after login is complete
  const next = requestUrl.searchParams.get('next') || '/'; 

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // On success, redirect the user to the `next` page.
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // If there's an error or no code, something went wrong.
  // Redirect back to the login page with an error message.
  console.error('Error in auth callback:', 'Could not exchange code for session.');
  const errorUrl = new URL('/login', request.url);
  errorUrl.searchParams.set('error', 'Authentication failed. Please try again.');
  return NextResponse.redirect(errorUrl);
}