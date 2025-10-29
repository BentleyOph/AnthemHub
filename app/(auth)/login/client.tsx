"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function LoginClient() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const search = useSearchParams();
  const router = useRouter();

  const { redirectTo, hasExplicitRedirect } = useMemo(() => {
    const explicit =
      search.get("next") ||
      search.get("redirect") ||
      search.get("redirectTo");

    return {
      redirectTo: explicit || "/",
      hasExplicitRedirect: Boolean(explicit),
    };
  }, [search]);

  const redirectAfterLogin = useCallback(
    (user: User | null | undefined) => {
      const baseDestination = redirectTo || "/";
      if (!user) {
        return;
      }

      const metadata =
        (user.app_metadata as Record<string, unknown> | undefined) ??
        {};
      const role = typeof metadata.role === "string" ? metadata.role : null;

      const destination =
        role === "ADMIN" && !hasExplicitRedirect
          ? "/admin/overview"
          : baseDestination;

      router.replace(destination);
    },
    [hasExplicitRedirect, redirectTo, router],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const supabase = getSupabaseBrowserClient();

    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        redirectAfterLogin(data.user);
      }
    });

    // Handle form submit (email/password)
    const form = root.querySelector("form");
    const onSubmit = async (e: Event) => {
      e.preventDefault();
      setMessage(null);

      const email = (root.querySelector("#email") as HTMLInputElement | null)?.value?.trim();
      const password = (root.querySelector("#password") as HTMLInputElement | null)?.value ?? "";

      if (!email || !password) {
        setMessage("Please provide email and password.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message ?? "Failed to sign in.");
        return;
      }

      const user =
        data.user || (await supabase.auth.getUser()).data.user || null;
      if (!user) {
        setMessage("Signed in but could not load your account. Please try again.");
        return;
      }
      redirectAfterLogin(user);
    };

    form?.addEventListener("submit", onSubmit);

    // Event delegation for social buttons inside LoginForm
    const onClick = async (e: Event) => {
      const target = e.target as HTMLElement;
      // Find the closest button
      const btn = target.closest("button");
      if (!btn) return;

      const sr = btn.querySelector("span.sr-only");
      const label = sr?.textContent || "";

      let provider: "google" | "apple" | "facebook" | null = null;
      if (/Google/i.test(label)) provider = "google";
      else if (/Apple/i.test(label)) provider = "apple";
      else if (/Meta/i.test(label)) provider = "facebook";

      if (!provider) return;
      setMessage(null);

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          // We explicitly tell Supabase where to redirect the user AFTER a successful login.
          // This will be our new callback route.
          redirectTo: `${window.location.origin}/callback?next=${encodeURIComponent(redirectTo)}`,
        },
      });
      if (error) setMessage(error.message ?? "OAuth sign-in failed.");
    };

    root.addEventListener("click", onClick);

    return () => {
      form?.removeEventListener("submit", onSubmit);
      root.removeEventListener("click", onClick);
    };
  }, [redirectAfterLogin, redirectTo, router]);

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <LoginForm />
      {message && (
        <p className="text-sm text-red-600" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
