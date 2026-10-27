"use client";
import { useState, useEffect, useCallback } from "react";
import { 
  ArrowDownLeft, ArrowUpRight, Plus, 
  Pencil, Trash2, ArrowRightLeft, Search 
} from "lucide-react";
import { Card, CardTitle, PageHeader, StatCard } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase";
import { rupiah } from "@/lib/utils";

type TransactionType = { id: string; title: string; category: string; amount: number; is_income: boolean; date: string; wallet_id: string; };
type WalletType = { id: string; name: string; balance: number };

export default function TransaksiPage() {
  const [mounted, setMounted] = useState(false);
  const [transactions, setTransactions] = useState<TransactionType[]>([]);
  const [wallets, setWallets] = useState<WalletType[]>([]);
  
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [selectedWallet, setSelectedWallet] = useState("");

  const [fromWallet, setFromWallet] = useState("");
  const [toWallet, setToWallet] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const [resTx, resWallet] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('wallets').select('id, name, balance').eq('user_id', user.id)
    ]);

    if (resTx.data) setTransactions(resTx.data);
    if (resWallet.data) {
      setWallets(resWallet.data);
      if (resWallet.data.length > 0) {
        setSelectedWallet(resWallet.data[0].id);
        setFromWallet(resWallet.data[0].id);
        if (resWallet.data.length > 1) setToWallet(resWallet.data[1].id);
      }
    }
  }, [supabase]);

  useEffect(() => {
    setMounted(true);
    fetchData();

    // FUNGSI UNTUK MENANGKAP HASIL SCAN DARI BOTTOM NAV
    const checkScanResult = () => {
      const scanData = sessionStorage.getItem("kavia_scan_result");
      if (scanData) {
        sessionStorage.removeItem("kavia_scan_result"); // Hapus setelah dibaca
        const parsed = JSON.parse(scanData);
        setAmount(parsed.amount.toString());
        setTitle(parsed.title);
        setType("expense");
        setEditingId(null);
        setIsTxModalOpen(true); // Buka modal otomatis
      }
    };

    checkScanResult(); // Cek saat halaman pertama dimuat
    window.addEventListener("kavia_scan_trigger", checkScanResult); // Cek saat tombol kamera diklik dari halaman ini
    
    return () => window.removeEventListener("kavia_scan_trigger", checkScanResult);
  }, [fetchData]);

  if (!mounted) return null;

  const filteredTransactions = transactions.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const income = filteredTransactions.filter((t) => t.is_income).reduce((s, t) => s + t.amount, 0);
  const expense = filteredTransactions.filter((t) => !t.is_income).reduce((s, t) => s + t.amount, 0);

  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || !selectedWallet) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const parsedAmount = parseInt(amount);
    const wallet = wallets.find(w => w.id === selectedWallet);

    if (editingId) {
      const oldTx = transactions.find(t => t.id === editingId);
      if (oldTx) {
        let tempBalance = wallet?.balance || 0;
        if (oldTx.is_income) tempBalance -= oldTx.amount;
        else tempBalance += oldTx.amount;
        if (type === "income") tempBalance += parsedAmount;
        else tempBalance -= parsedAmount;
        await supabase.from('wallets').update({ balance: tempBalance }).eq('id', selectedWallet);
      }
      await supabase.from('transactions').update({ title, amount: parsedAmount, is_income: type === "income", wallet_id: selectedWallet }).eq('id', editingId);
    } else {
      await supabase.from('transactions').insert({
        user_id: user.id, title, category: type === "income" ? "Pemasukan" : "Pengeluaran",
        amount: parsedAmount, is_income: type === "income", date: new Date().toISOString(), wallet_id: selectedWallet
      });
      if (wallet) {
        const newBalance = type === "income" ? wallet.balance + parsedAmount : wallet.balance - parsedAmount;
        await supabase.from('wallets').update({ balance: newBalance }).eq('id', selectedWallet);
      }
    }

    await fetchData();
    closeTxModal();
    setLoading(false);
  };

  const handleDeleteTx = async (tx: TransactionType) => {
    if (!confirm(`Hapus transaksi "${tx.title}"? Saldo dompet akan dikembalikan.`)) return;
    const wallet = wallets.find(w => w.id === tx.wallet_id);
    if (wallet) {
      const newBalance = tx.is_income ? wallet.balance - tx.amount : wallet.balance + tx.amount;
      await supabase.from('wallets').update({ balance: newBalance }).eq('id', tx.wallet_id);
    }
    await supabase.from('transactions').delete().eq('id', tx.id);
    await fetchData();
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromWallet === toWallet) return alert("Dompet asal dan tujuan tidak boleh sama!");
    const parsedAmount = parseInt(transferAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const wFrom = wallets.find(w => w.id === fromWallet);
    const wTo = wallets.find(w => w.id === toWallet);

    if (wFrom && wTo) {
      await supabase.from('wallets').update({ balance: wFrom.balance - parsedAmount }).eq('id', fromWallet);
      await supabase.from('wallets').update({ balance: wTo.balance + parsedAmount }).eq('id', toWallet);
      await supabase.from('transactions').insert([
        { user_id: user.id, title: `Transfer ke ${wTo.name}`, category: "Transfer", amount: parsedAmount, is_income: false, date: new Date().toISOString(), wallet_id: fromWallet },
        { user_id: user.id, title: `Transfer dari ${wFrom.name}`, category: "Transfer", amount: parsedAmount, is_income: true, date: new Date().toISOString(), wallet_id: toWallet }
      ]);
    }
    await fetchData();
    setIsTransferModalOpen(false);
    setTransferAmount("");
    setLoading(false);
  };

  const openAddModal = () => { setEditingId(null); setTitle(""); setAmount(""); setType("expense"); setIsTxModalOpen(true); };
  const openEditModal = (tx: TransactionType) => { setEditingId(tx.id); setTitle(tx.title); setAmount(tx.amount.toString()); setType(tx.is_income ? "income" : "expense"); setSelectedWallet(tx.wallet_id); setIsTxModalOpen(true); };
  const closeTxModal = () => { setIsTxModalOpen(false); setEditingId(null); };

  return (
    <>
      <PageHeader
        title="Transaksi"
        description="Semua pemasukan dan pengeluaranmu."
        action={
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setIsTransferModalOpen(true)} disabled={wallets.length < 2} className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50">
              <ArrowRightLeft className="h-4 w-4" /> Transfer
            </button>
            <button onClick={openAddModal} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-fg hover:opacity-90 transition">
              <Plus className="h-4 w-4" /> Tambah
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard icon={ArrowDownLeft} label="Pemasukan" value={rupiah(income)} hint="Total" />
        <StatCard icon={ArrowUpRight} label="Pengeluaran" value={rupiah(expense)} hint="Total" />
        <StatCard icon={ArrowDownLeft} label="Selisih" value={rupiah(income - expense)} hint="Net" />
      </div>

      <Card className="mt-4">
        <div className="flex items-center justify-between mb-4">
          <CardTitle>Daftar Transaksi</CardTitle>
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Cari..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-border bg-surface pl-7 pr-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
          </div>
        </div>
        <ul className="space-y-3">
          {filteredTransactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
              <div>
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-[11px] text-muted">{t.category} · {new Date(t.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={t.is_income ? "text-sm font-semibold text-emerald-600" : "text-sm font-semibold"}>
                  {t.is_income ? "+" : "−"}{rupiah(t.amount)}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => openEditModal(t)} className="p-1.5 text-muted hover:bg-accent hover:text-primary rounded-lg"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDeleteTx(t)} className="p-1.5 text-muted hover:bg-red-500/10 hover:text-red-600 rounded-lg"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </li>
          ))}
          {filteredTransactions.length === 0 && <p className="text-sm text-muted">Tidak ada transaksi.</p>}
        </ul>
      </Card>

      {/* MODAL TRANSAKSI */}
      <Modal isOpen={isTxModalOpen} onClose={closeTxModal} title={editingId ? "Edit Transaksi" : "Konfirmasi Transaksi"}>
        <form onSubmit={handleSaveTx} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted">Pilih Dompet</label>
            <select value={selectedWallet} onChange={(e) => setSelectedWallet(e.target.value)} required className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:border-primary focus:outline-none">
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Nama Transaksi</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Nominal (Rp)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setType("expense")} className={`rounded-xl border py-2 text-sm font-medium transition ${type === "expense" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted"}`}>Pengeluaran</button>
            <button type="button" onClick={() => setType("income")} className={`rounded-xl border py-2 text-sm font-medium transition ${type === "income" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted"}`}>Pemasukan</button>
          </div>
          <button type="submit" disabled={loading} className="mt-2 w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-fg disabled:opacity-50">
            {loading ? "Menyimpan..." : "Simpan Transaksi"}
          </button>
        </form>
      </Modal>

      {/* MODAL TRANSFER */}
      <Modal isOpen={isTransferModalOpen} onClose={() => setIsTransferModalOpen(false)} title="Transfer Antar Dompet">
        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted">Dari Dompet</label>
            <select value={fromWallet} onChange={(e) => setFromWallet(e.target.value)} required className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:outline-none">
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name} (Rp {w.balance.toLocaleString('id-ID')})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Ke Dompet</label>
            <select value={toWallet} onChange={(e) => setToWallet(e.target.value)} required className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:outline-none">
              {wallets.filter(w => w.id !== fromWallet).map(w => <option key={w.id} value={w.id}>{w.name} (Rp {w.balance.toLocaleString('id-ID')})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Nominal (Rp)</label>
            <input type="number" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} required className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <button type="submit" disabled={loading} className="mt-2 w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-fg disabled:opacity-50">Transfer</button>
        </form>
      </Modal>
    </>
  );
}