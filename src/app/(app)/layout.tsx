/**
 * Authenticated route group. Middleware has already guaranteed the user is
 * logged in by the time they reach any page under `(app)/`; we also fetch
 * the session here to render the top nav and for server components deeper
 * in the tree.
 */
import { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { ChronoFlowLogo } from "@/components/ChronoFlowLogo";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");


  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/calendar" className="flex items-center gap-2">
            <ChronoFlowLogo size={24} />
            <span className="font-semibold tracking-tight">ChronoFlow</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-zinc-600">
            <Link href="/calendar" className="hover:text-zinc-900">Calendar</Link>
            <Link href="/tasks" className="hover:text-zinc-900">Tasks</Link>
            <Link href="/onboarding" className="hover:text-zinc-900">Constraints</Link>
            <Link href="/review" className="hover:text-zinc-900">Review</Link>
            <span className="text-zinc-300">·</span>
            <span className="text-xs text-zinc-500">{session.user.email}</span>
            <form action={handleSignOut}>
              <button type="submit" className="text-xs text-zinc-500 hover:text-zinc-900">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
