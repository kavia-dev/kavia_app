"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import Tesseract from "tesseract.js";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = navItems.find((i) => isActive(i.href));

  const leftNav = navItems.slice(0, 2);
  const rightNav = navItems.slice(2);

  const handleScanReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    try {
      const result = await Tesseract.recognize(file, 'ind+eng');
      const text = result.data.text;
      const numbers = text.match(/\d{1,3}(?:\.\d{3})*(?:,\d+)?/g);
      
      if (numbers && numbers.length > 0) {
        const parsedNumbers = numbers.map(n => parseInt(n.replace(/\./g, '').replace(/,/g, '')));
        const maxNumber = Math.max(...parsedNumbers);
        
        sessionStorage.setItem("kavia_scan_result", JSON.stringify({
          amount: maxNumber,
          title: "Belanja Struk"
        }));

        if (pathname !== "/transaksi") {
          router.push("/transaksi");
        } else {
          window.dispatchEvent(new Event("kavia_scan_trigger"));
        }
      } else {
        alert("Nominal tidak ditemukan di struk. Silakan isi manual.");
      }
    } catch (err) {
      console.error(err);
      alert("Gagal memproses gambar.");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-dvh">
      {/* Sidebar Desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface/70 p-4 backdrop-blur md:flex">
        <Link href="/" className="flex items-center gap-3 rounded-xl px-2 py-3">
          <Image src="/icons/icon-192.png" width={36} height={36} alt="Kavia" className="h-9 w-9 rounded-xl object-cover shadow-sm" />
          <span className="text-sm font-semibold leading-tight">
            Kavia
            <span className="block text-xs font-normal text-muted">Keuangan Pribadi</span>
          </span>
        </Link>
        <nav className="mt-4 flex flex-1 flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
              className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                isActive(href) ? "bg-primary/10 text-primary" : "text-muted hover:bg-accent hover:text-fg")}>
              <Icon className="h-[18px] w-[18px]" />{label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border px-3 py-2">
          <span className="text-xs text-muted">Tema</span><ThemeToggle />
        </div>
      </aside>

      {/* Header Mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/icons/icon-192.png" width={32} height={32} alt="Kavia" className="h-8 w-8 rounded-lg object-cover shadow-sm" />
          <span className="text-sm font-semibold">{current?.label ?? "Kavia"}</span>
        </Link>
        <ThemeToggle />
      </header>

      {/* Konten Utama */}
      <main className="md:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 md:px-8 md:pb-12 md:pt-10">{children}</div>
      </main>

      {/* Input File Tersembunyi untuk Kamera */}
      <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleScanReceipt} disabled={scanning} />

      {/* Bottom Nav Mobile */}
<nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
  <div className="flex h-[64px] w-full items-center px-2">
    {/* Kiri: Dasbor, Transaksi */}
    {leftNav.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        href={href}
        aria-current={isActive(href) ? "page" : undefined}
        className={cn(
          "flex h-full flex-1 flex-col items-center justify-center gap-1 transition-colors",
          isActive(href) ? "text-primary" : "text-muted hover:text-fg"
        )}
      >
        <Icon className="h-[22px] w-[22px]" />
        <span className="text-[10px] font-medium leading-none">{label}</span>
      </Link>
    ))}

    {/* Tengah: Scan struk (sejajar dengan menu lain) */}
   <button
  type="button"
  onClick={() => fileInputRef.current?.click()}
  disabled={scanning}
  aria-label="Scan struk"
  className="flex h-full flex-1 flex-col items-center justify-center gap-1 text-muted transition-colors hover:text-fg active:scale-95 disabled:opacity-50"
>
  {scanning ? (
    <Loader2 className="h-[22px] w-[22px] animate-spin" />
  ) : (
    <Camera className="h-[22px] w-[22px]" />
  )}
  <span className="text-[10px] font-medium leading-none">
    {scanning ? "Memproses" : "Scan"}
  </span>
</button>

    {/* Kanan: Keuangan, Tagihan, Pengaturan */}
    {rightNav.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        href={href}
        aria-current={isActive(href) ? "page" : undefined}
        className={cn(
          "flex h-full flex-1 flex-col items-center justify-center gap-1 transition-colors",
          isActive(href) ? "text-primary" : "text-muted hover:text-fg"
        )}
      >
        <Icon className="h-[22px] w-[22px]" />
        <span className="text-[10px] font-medium leading-none">{label}</span>
      </Link>
    ))}
  </div>
      </nav>
    </div>
  );
}