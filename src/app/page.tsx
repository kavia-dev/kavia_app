import Link from "next/link";
import { ArrowRight, Globe, Mail, Sparkles, Wallet, MessageCircle, Phone } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const features = [
  { title: "Multi-dompet", desc: "Tunai, bank, e-wallet dalam satu dasbor." },
  { title: "Anggaran cerdas", desc: "Peringatan otomatis saat mendekati batas kategori." },
  { title: "Target tabungan", desc: "Pantau progres tabungan dengan visualisasi sederhana." },
  { title: "Tagihan berulang", desc: "Jangan pernah lewatkan kos, listrik, atau langganan." },
  { title: "Pengingat Telegram", desc: "Notifikasi otomatis via bot tanpa buka aplikasi." },
  { title: "PWA offline", desc: "Instal seperti aplikasi native, akses tanpa internet." },
];

const projects = [
  { title: "Kavia", desc: "Manajemen keuangan pribadi + bot Telegram + PWA.", tag: "Next.js · Supabase · Telegram Bot" },
  { title: "Sistem Inventaris Lab", desc: "Manajemen aset laboratorium + pelacakan peminjaman.", tag: "Laravel · MySQL" },
  { title: "Dashboard Analitik Penjualan", desc: "Visualisasi penjualan UMKM + ekspor laporan.", tag: "React · Express" },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4">
      {/* Navbar */}
      <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between border-b border-border bg-bg/85 px-4 py-3 backdrop-blur">
        <span className="text-sm font-semibold tracking-tight">kavia.app</span>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <a href="#fitur" className="hidden hover:text-fg sm:block">Fitur</a>
          <a href="#proyek" className="hidden hover:text-fg sm:block">Proyek</a>
          <a href="#kontak" className="hidden hover:text-fg sm:block">Kontak</a>
          <ThemeToggle />
        </nav>
      </header>

      {/* Hero Section */}
      <section className="py-16 md:py-24">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[11px] font-medium text-muted">
          <Sparkles className="h-3 w-3" /> Proyek portofolio · Kavia
        </span>
        <h1 className="mt-5 max-w-2xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
          Kelola keuangan pribadi <span className="text-primary">tanpa ribet</span>, dari browser dan Telegram.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted md:text-base">
          Dashboard keuangan minimalis dengan pencatatan transaksi, anggaran, target tabungan, dan pengingat tagihan
          otomatis lewat bot Telegram — bisa diinstal sebagai aplikasi (PWA).
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg transition hover:opacity-90">
            Buka Dashboard <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#fitur" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-accent">
            Lihat Fitur
          </a>
        </div>
      </section>

      {/* Fitur Section */}
      <section id="fitur" className="border-t border-border py-14">
        <h2 className="text-lg font-semibold tracking-tight">Fitur utama</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Wallet className="h-4 w-4" /></span>
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Proyek Section */}
      <section id="proyek" className="border-t border-border py-14">
        <h2 className="text-lg font-semibold tracking-tight">Proyek lain</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {projects.map((p) => (
            <article key={p.title} className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
              <h3 className="text-sm font-semibold">{p.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">{p.desc}</p>
              <p className="mt-4 text-[11px] font-medium text-primary">{p.tag}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Footer / Kontak Section */}
      <footer id="kontak" className="border-t border-border py-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Mari terhubung</h2>
            <p className="mt-1 text-sm text-muted">Punya pertanyaan atau ingin berkolaborasi? Hubungi kami.</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4">
            {/* Email */}
            <a href="mailto:kavia.app@gmail.com" className="flex items-center gap-3 text-sm text-muted hover:text-primary transition">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-fg">
                <Mail className="h-4 w-4" />
              </span>
              kavia.app@gmail.com
            </a>
            
            {/* WhatsApp */}
            <a href="https://wa.me/628577110291" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-muted hover:text-primary transition">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-fg">
                <Phone className="h-4 w-4" />
              </span>
              0857-7110-291
            </a>

            {/* GitHub */}
            <a href="https://github.com/kavia-dev" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-muted hover:text-primary transition">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-fg">
                <Globe className="h-4 w-4" />
              </span>
              @kavia-dev
            </a>

            {/* Discord */}
            <a href="https://discord.gg/DKst5rmd6c" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-muted hover:text-primary transition">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-fg">
                <MessageCircle className="h-4 w-4" />
              </span>
              Discord Komunitas
            </a>
          </div>
        </div>
        
        {/* Copyright */}
        <div className="mt-10 flex flex-col md:flex-row items-center justify-between border-t border-border pt-6 text-[11px] text-muted">
          <p>© {new Date().getFullYear()} Kavia App. Hak Cipta Dilindungi.</p>
          <p className="mt-2 md:mt-0">Dibangun dengan Next.js & Supabase.</p>
        </div>
      </footer>
    </div>
  );
}