"use client";
import { useState, useEffect, useCallback } from "react";
import { Bell, CalendarDays, CheckCircle2, Receipt } from "lucide-react";
import { Badge, Card, CardTitle, PageHeader, StatCard } from "@/components/ui/kit";
import { createClient } from "@/lib/supabase";
import { rupiah } from "@/lib/utils";

type BillType = { id: string; title: string; amount: number; due_date: string; status: string };

export default function TagihanPage() {
  const [mounted, setMounted] = useState(false);
  const [bills, setBills] = useState<BillType[]>([]);
  const supabase = createClient();

  const fetchBills = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('bills').select('*').eq('user_id', user.id).order('due_date', { ascending: true });
    if (data) setBills(data);
  }, [supabase]);

  useEffect(() => {
    setMounted(true);
    fetchBills();
  }, [fetchBills]);

  if (!mounted) return null;

  const unpaidBills = bills.filter(b => b.status === 'unpaid');
  const totalUnpaid = unpaidBills.reduce((s, b) => s + b.amount, 0);

  const handlePay = async (billId: string, amount: number, title: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('bills').update({ status: 'paid' }).eq('id', billId);

    const { data: wallet } = await supabase.from('wallets').select('id, balance').eq('user_id', user.id).limit(1).single();
    if (wallet) {
      await supabase.from('wallets').update({ balance: wallet.balance - amount }).eq('id', wallet.id);
    }

    await supabase.from('transactions').insert({
      user_id: user.id,
      title: `Bayar ${title}`,
      category: "Tagihan",
      amount: amount,
      is_income: false,
      date: new Date().toISOString()
    });

    fetchBills();
  };

  return (
    <>
      <PageHeader title="Tagihan" description="Kelola tagihan berulang dan bayar langsung." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard icon={Receipt} label="Total belum dibayar" value={rupiah(totalUnpaid)} hint={`${unpaidBills.length} tagihan`} />
        <StatCard icon={Bell} label="Jatuh tempo dekat" value={unpaidBills.filter(b => new Date(b.due_date) <= new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000)).length.toString()} hint="7 hari ke depan" />
        <StatCard icon={CalendarDays} label="Lunas" value={bills.filter(b => b.status === 'paid').length.toString()} hint="Total" />
      </div>
      <Card className="mt-4">
        <CardTitle>Daftar Tagihan</CardTitle>
        <ul className="mt-4 space-y-3">
          {bills.map((b) => (
            <li key={b.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0 ${b.status === 'paid' ? 'opacity-50' : ''}`}>
              <div>
                <p className={`text-sm font-medium ${b.status === 'paid' ? 'line-through' : ''}`}>{b.title}</p>
                <p className="text-[11px] text-muted">{rupiah(b.amount)} · Jatuh tempo {new Date(b.due_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</p>
              </div>
              {b.status === 'unpaid' ? (
                <button onClick={() => handlePay(b.id, b.amount, b.title)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-primary-fg transition">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Bayar
                </button>
              ) : (
                <Badge tone="success">Lunas</Badge>
              )}
            </li>
          ))}
          {bills.length === 0 && <p className="text-sm text-muted">Belum ada tagihan di database.</p>}
        </ul>
      </Card>
    </>
  );
}