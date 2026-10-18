"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The company-profile landing page is disabled for the demo build; old links
// land on the dashboard instead. To re-enable it, render
// `@/components/compro/CompanyProfile` here again.
export default function ComproRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
