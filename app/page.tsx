"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const locale = navigator.language.toLowerCase();
    let target = "/en";
    if (locale.includes("zh")) target = "/zh";
    else if (locale.includes("es")) target = "/es";
    router.replace(target);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-500">Redirecting...</div>
    </div>
  );
}
