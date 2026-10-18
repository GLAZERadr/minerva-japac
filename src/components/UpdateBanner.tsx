"use client";

import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";

// Tells an open tab when a newer deploy is live, so nobody has to clear the
// browser cache to see the latest version. Each build stamps a unique id into
// the bundle (NEXT_PUBLIC_BUILD_ID) and into /version.json (served no-store);
// when they differ, a newer build is on the server.

const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const CHECK_INTERVAL_MS = 60_000;

export default function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || CURRENT_BUILD === "dev") return;

    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const { buildId } = (await response.json()) as { buildId?: string };
        if (buildId && buildId !== CURRENT_BUILD) setUpdateReady(true);
      } catch {
        /* offline — try again later */
      }
    };

    void check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 top-16 z-[60] flex w-[min(calc(100vw-1.5rem),26rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-[#3c4043] bg-[#202124]/95 py-2 pl-4 pr-2 text-sm text-[#e8eaed] shadow-2xl backdrop-blur"
    >
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#8ab4f8]" />
      <span className="min-w-0 flex-1 truncate">A new version of MINERVA is available.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#8ab4f8] px-3 py-1.5 text-xs font-medium text-[#062e6f] transition hover:bg-[#aecbfa]"
      >
        <RotateCw className="h-3.5 w-3.5" />
        Reload
      </button>
    </div>
  );
}
