export { updateSession as proxy } from "./lib/supabase/middleware";

// Optionally scope middleware; by default it applies to all routes.
export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"]
};
