"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Gunakan replace agar user tidak bisa klik 'Back' ke dashboard
        router.replace("/login");
      } else {
        setLoading(false);
      }
    };
    checkAuth();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg text-sm text-muted">
        Memeriksa sesi keamanan...
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}