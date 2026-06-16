"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import SignInModal from "@/components/SignInModal";

/** Header auth control: Sign in (modal) when signed out; email + Sign out when in. */
export default function AuthControl() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await createSupabaseBrowser().auth.signOut();
    setEmail(null);
    router.refresh();
  }

  if (!ready) return <div className="h-9" aria-hidden="true" />; // reserve space, no flash

  if (email) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden max-w-[12rem] truncate text-sm text-neutral-500 sm:inline">
          {email}
        </span>
        <button
          type="button"
          onClick={signOut}
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="rounded-xl bg-neutral-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
      >
        Sign in
      </button>
      <SignInModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
