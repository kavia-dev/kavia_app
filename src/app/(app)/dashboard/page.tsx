"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowDownLeft, ArrowUpRight, TrendingUp, Wallet } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardTitle, PageHeader, StatCard } from "@/components/ui/kit";
import { createClient } from "@/lib/supabase";
import { rupiah } from "@/lib/utils";

type WalletType = { id: string; name: string; balance: number };
type TransactionType = { id: string; title: string; amount: number; is_income: boolean; date: string; category: string };
type AssetType = { value: number };

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [transactions, setTransactions] = useState<TransactionType[]>([]);
  const [assets, setAssets] = useState<AssetType[]>([]);
  
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [resWallets, resTx, resAssets] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', user.id),
      supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('assets').select('value').eq('user_id', user.id)
    ]);

    if (resWallets.data) setWallets(resWallets.data);
    if (resTx.data) setTransactions(resTx.data);
    if (resAssets.data) setAssets(resAssets.data);
  }, [supabase]);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, [fetchData]);

  if (!mounted) return null;

  const totalSaldo = wallets.reduce((s, w) => s + w.balance, 0);
  const totalAset = assets.reduce((s, a) => s + a.value, 0);
  const totalKekayaan = totalSaldo + totalAset;
  
  const totalIncome = transactions.filter(t => t.is_income).reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => !t.is_income).reduce((s, t) => s + t.amount, 0);

  // Logika Data Pie Chart
  const expenseByCategory = transactions.filter(t => !t.is_income).reduce((acc: Record<string, number>, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
    return acc;
  }, {});
  
  const pieData = Object.keys(expenseByCategory).map(key => ({
    name: key,
    value: expenseByCategory[key]
  })).sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHeader title="Dasbor Keuangan 👋" description="Ringkasan seluruh aset dan pengeluaranmu." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Wallet} label="Total Kekayaan" value={rupiah(totalKekayaan)} hint="Dompet + Investasi" />
        <StatCard icon={ArrowDownLeft} label="Pemasukan" value={rupiah(totalIncome)} hint="Total masuk" />
        <StatCard icon={ArrowUpRight} label="Pengeluaran" value={rupiah(totalExpense)} hint="Total keluar" />
        <StatCard icon={TrendingUp} label="Aset Investasi" value={rupiah(totalAset)} hint={`${assets.length} aset`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Statistik Pengeluaran</CardTitle>
          <p className="text-[11px] text-muted mb-4">Berdasarkan kategori transaksi</p>
          <div className="h-64 w-full">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => rupiah(Number(value))}
                    contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">Belum ada data pengeluaran</div>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Transaksi Terbaru</CardTitle>
          <ul className="mt-4 space-y-3">
            {transactions.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="text-[11px] text-muted">{new Date(t.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</p>
                </div>
                <span className={t.is_income ? "text-sm font-semibold text-emerald-600" : "text-sm font-semibold"}>
                  {t.is_income ? "+" : "−"}{rupiah(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}