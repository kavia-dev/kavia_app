"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Cloud, LogOut, Send } from "lucide-react";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/kit";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase";

const toggles = [
  { label: "Pengingat tagihan", desc: "Notifikasi 24 jam & 1 jam sebelum jatuh tempo" },
  { label: "Ringkasan harian", desc: "Rangkuman saldo & pengeluaran tiap pukul 21.00" },
];

export default function PengaturanPage() {
  const [loading, setLoading] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleGenerateCode = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Buat kode acak 6 digit
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Hapus kode lama milik user ini (opsional, agar tidak menumpuk)
    await supabase.from("link_tokens").delete().eq("user_id", user.id);

    // Simpan ke tabel link_tokens
    const { error } = await supabase.from("link_tokens").insert({
      code: code,
      user_id: user.id
    });

    if (error) {
      alert("Gagal membuat kode: " + error.message);
    } else {
      setLinkCode(code);
    }
    setLoading(false);
  };

  return (
    <>
      <PageHeader title="Pengaturan" description="Preferensi tampilan, notifikasi, dan integrasi Telegram." />
      
      <Card>
        <CardTitle>Tampilan</CardTitle>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Mode gelap otomatis mengikuti sistem, atau pilih manual.</p>
          <ThemeToggle />
        </div>
      </Card>

      <Card className="mt-4">
        <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Notifikasi</CardTitle>
        <ul className="mt-3 divide-y divide-border">
          {toggles.map((t) => (
            <li key={t.label} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-[11px] text-muted">{t.desc}</p>
              </div>
              <span className="h-5 w-9 shrink-0 rounded-full bg-accent p-0.5">
                <span className="block h-4 w-4 rounded-full bg-muted/60" />
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4">
        <CardTitle>Integrasi bot Telegram</CardTitle>
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-border p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Send className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Kavia Bot</p>
              {linkCode ? <Badge tone="success">Kode Aktif</Badge> : <Badge tone="warning">Belum terhubung</Badge>}
            </div>
            
            {linkCode ? (
              <div className="mt-3 rounded-lg bg-primary/10 p-4 text-center">
                <p className="text-xs text-muted mb-1">Kirim perintah ini ke bot Telegram:</p>
                <code className="text-lg font-bold text-primary tracking-widest">/link {linkCode}</code>
                <p className="text-[10px] text-muted mt-2">Kode ini hanya berlaku sekali pakai.</p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">Hubungkan akun untuk menerima pengingat tagihan dan mencatat transaksi langsung dari Telegram.</p>
            )}

            {/* TOMBOL INI HANYA MUNCUL KALAU KODE BELUM DIBUAT */}
            {!linkCode && (
              <button 
                onClick={handleGenerateCode} 
                disabled={loading} 
                className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg disabled:opacity-50"
              >
                {loading ? "Membuat kode..." : "Generate Kode"}
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <CardTitle className="flex items-center gap-2"><Cloud className="h-4 w-4" /> Sinkronisasi data</CardTitle>
        <p className="mt-2 text-sm text-muted">Data kamu tersimpan secara real-time di Supabase Cloud.</p>
      </Card>

      <button 
        onClick={handleLogout} 
        disabled={loading}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" /> 
        {loading ? "Keluar..." : "Keluar dari Akun"}
      </button>
    </>
  );
}