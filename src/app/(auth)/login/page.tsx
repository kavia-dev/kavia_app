"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image"; // <-- Import Image
import { createClient } from "@/lib/supabase";
import { Mail, Lock } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace("/dashboard");
      }
    };
    checkSession();
  }, [router, supabase]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMsg(error.message);
      } else {
        router.push("/dashboard");
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setErrorMsg(error.message);
      } else {
        alert("Pendaftaran berhasil! Silakan cek email kamu untuk verifikasi, lalu login.");
        setIsLogin(true);
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-soft">
        
        <div className="mb-6 flex flex-col items-center text-center">
          {/* Ganti <img> menjadi <Image> */}
          <Image src="/icons/icon-192.png" width={56} height={56} alt="Kavia" className="mb-3 rounded-2xl object-cover shadow-md" />
          <h1 className="text-xl font-semibold text-fg">
            {isLogin ? "Masuk ke Kavia" : "Daftar Kavia"}
          </h1>
          <p className="mt-1 text-sm text-muted">Kelola keuanganmu dengan aman.</p>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted">Email</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 focus-within:border-primary">
              <Mail className="h-4 w-4 text-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-transparent text-sm text-fg focus:outline-none"
                placeholder="kamu@email.com"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted">Password</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 focus-within:border-primary">
              <Lock className="h-4 w-4 text-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-transparent text-sm text-fg focus:outline-none"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-fg transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Memproses..." : isLogin ? "Masuk" : "Daftar Sekarang"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          {isLogin ? "Belum punya akun? " : "Sudah punya akun? "}
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="font-medium text-primary hover:underline"
          >
            {isLogin ? "Daftar" : "Masuk"}
          </button>
        </p>
      </div>
    </div>
  );
}