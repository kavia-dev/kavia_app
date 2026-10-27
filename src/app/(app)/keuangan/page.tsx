"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowDownLeft, PiggyBank, Plus, Wallet, TrendingUp, Pencil, Trash2 } from "lucide-react";
import { Card, CardTitle, PageHeader, StatCard } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase";
import { rupiah } from "@/lib/utils";

type WalletType = { id: string; name: string; type: string; balance: number };
type AssetType = { id: string; name: string; type: string; value: number };

const listAssets = ["Saham", "Crypto", "Reksadana", "Emas", "Deposito", "P2P Lending", "Lainnya"];

export default function KeuanganPage() {
  const [mounted, setMounted] = useState(false);
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [assets, setAssets] = useState<AssetType[]>([]);
  
  // Modal State Dompet
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [walletType, setWalletType] = useState<"Bank" | "E-Wallet" | "Tunai">("Bank");
  const [walletName, setWalletName] = useState("BCA");
  const [initialBalance, setInitialBalance] = useState("");

  // Modal State Aset
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("Saham");
  const [assetValue, setAssetValue] = useState("");

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const [resWallets, resAssets] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('assets').select('*').eq('user_id', user.id)
    ]);

    if (resWallets.data) setWallets(resWallets.data);
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

  // --- FUNGSI SIMPAN DOMPET (TAMBAH / EDIT) ---
  const handleSaveWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editingWalletId) {
      // Mode Edit
      await supabase.from('wallets').update({
        name: walletName,
        type: walletType,
        balance: parseInt(initialBalance) || 0
      }).eq('id', editingWalletId);
    } else {
      // Mode Tambah
      await supabase.from('wallets').insert({
        user_id: user.id, 
        name: walletName === "Lainnya" ? "Lainnya" : walletName,
        type: walletType, 
        balance: parseInt(initialBalance) || 0
      });
    }
    
    await fetchData();
    closeWalletModal();
    setLoading(false);
  };

  // --- FUNGSI HAPUS DOMPET ---
  const handleDeleteWallet = async (id: string, name: string) => {
    if (!confirm(`Hapus dompet "${name}"? Pastikan tidak ada transaksi penting di dalamnya.`)) return;
    
    setLoading(true);
    // Hapus dompet dari database
    const { error } = await supabase.from('wallets').delete().eq('id', id);
    
    if (error) {
      alert("Gagal menghapus dompet. Pastikan tidak ada transaksi yang terikat dengan dompet ini.");
    } else {
      await fetchData();
    }
    setLoading(false);
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('assets').insert({
      user_id: user.id, name: assetName, type: assetType, value: parseInt(assetValue) || 0
    });
    await fetchData();
    setIsAssetModalOpen(false);
    setAssetName(""); setAssetValue("");
    setLoading(false);
  };

  // --- FUNGSI MODAL DOMPET ---
  const openAddWallet = () => {
    setEditingWalletId(null);
    setWalletType("Bank");
    setWalletName("BCA");
    setInitialBalance("");
    setIsWalletModalOpen(true);
  };

  const openEditWallet = (w: WalletType) => {
    setEditingWalletId(w.id);
    setWalletType(w.type as "Bank" | "E-Wallet" | "Tunai");
    setWalletName(w.name);
    setInitialBalance(w.balance.toString());
    setIsWalletModalOpen(true);
  };

  const closeWalletModal = () => {
    setIsWalletModalOpen(false);
    setEditingWalletId(null);
  };

  return (
    <>
      <PageHeader title="Keuangan & Aset" description="Pantau seluruh kekayaan dan investasimu." />
      
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Wallet} label="Uang Tunai/Bank" value={rupiah(totalSaldo)} hint={`${wallets.length} dompet`} />
        <StatCard icon={TrendingUp} label="Aset Investasi" value={rupiah(totalAset)} hint={`${assets.length} aset`} />
        <StatCard icon={PiggyBank} label="Total Kekayaan" value={rupiah(totalKekayaan)} hint="Dompet + Aset" />
        <StatCard icon={ArrowDownLeft} label="Pertumbuhan" value="+0%" hint="Bulan ini" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Dompet & Rekening</CardTitle>
            <button onClick={openAddWallet} className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1">
              <Plus className="h-3 w-3"/> Tambah
            </button>
          </div>
          <ul className="space-y-3">
            {wallets.map((w) => (
              <li key={w.id} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{w.name}</p>
                  <p className="text-[11px] text-muted">{w.type}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{rupiah(w.balance)}</span>
                  
                  {/* TOMBOL EDIT & HAPUS */}
                  <div className="flex gap-1 ml-2 border-l border-border pl-2">
                    <button onClick={() => openEditWallet(w)} className="p-1.5 text-muted hover:bg-accent hover:text-primary rounded-lg transition">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDeleteWallet(w.id, w.name)} className="p-1.5 text-muted hover:bg-red-500/10 hover:text-red-600 rounded-lg transition">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Aset & Investasi</CardTitle>
            <button onClick={() => setIsAssetModalOpen(true)} className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1">
              <Plus className="h-3 w-3"/> Tambah
            </button>
          </div>
          <ul className="space-y-3">
            {assets.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-[11px] text-muted">{a.type}</p>
                </div>
                <span className="text-sm font-semibold text-emerald-600">{rupiah(a.value)}</span>
              </li>
            ))}
            {assets.length === 0 && <p className="text-xs text-muted">Belum ada aset. Mulai investasimu!</p>}
          </ul>
        </Card>
      </div>

      {/* MODAL DOMPET (TAMBAH / EDIT) */}
      <Modal isOpen={isWalletModalOpen} onClose={closeWalletModal} title={editingWalletId ? "Edit Dompet" : "Tambah Dompet"}>
        <form onSubmit={handleSaveWallet} className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {["Bank", "E-Wallet", "Tunai"].map((t) => (
              <button key={t} type="button" onClick={() => { setWalletType(t as "Bank" | "E-Wallet" | "Tunai"); setWalletName(t === "Bank" ? "BCA" : t === "E-Wallet" ? "GoPay" : "Dompet"); }} className={`rounded-xl border py-2 text-xs font-medium ${walletType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted"}`}>{t}</button>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Nama Dompet/Rekening</label>
            <input type="text" value={walletName} onChange={(e) => setWalletName(e.target.value)} required className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">{editingWalletId ? "Saldo Saat Ini (Rp)" : "Saldo Awal (Rp)"}</label>
            <input type="number" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-fg disabled:opacity-50">
            {loading ? "Menyimpan..." : editingWalletId ? "Simpan Perubahan" : "Tambah Dompet"}
          </button>
        </form>
      </Modal>

      {/* MODAL ASET */}
      <Modal isOpen={isAssetModalOpen} onClose={() => setIsAssetModalOpen(false)} title="Tambah Aset Investasi">
        <form onSubmit={handleAddAsset} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted">Jenis Aset</label>
            <select value={assetType} onChange={(e) => setAssetType(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:outline-none">
              {listAssets.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Nama Aset</label>
            <input type="text" value={assetName} onChange={(e) => setAssetName(e.target.value)} required className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:outline-none" placeholder="Cth: Saham BBCA" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Nilai Saat Ini (Rp)</label>
            <input type="number" value={assetValue} onChange={(e) => setAssetValue(e.target.value)} required className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-fg">Simpan Aset</button>
        </form>
      </Modal>
    </>
  );
}