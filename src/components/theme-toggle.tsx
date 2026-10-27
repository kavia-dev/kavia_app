"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
const options = [
  { value: "light", label: "Terang", icon: Sun },
  { value: "dark", label: "Gelap", icon: Moon },
  { value: "system", label: "Sistem", icon: Monitor },
] as const;
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-[96px]" aria-hidden />;
  return (
    <div className="flex items-center gap-1 rounded-lg bg-accent p-1" role="group" aria-label="Pilih tema">
      {options.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" onClick={() => setTheme(value)} aria-label={label}
          aria-pressed={theme === value} title={label}
          className={cn("grid h-7 w-7 place-items-center rounded-md transition",
            theme === value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}>
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
