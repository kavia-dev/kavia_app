import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Wallet = { id: string; name: string; type: string; balance: number };
export type Transaction = { id: string; title: string; category: string; date: string; amount: number; income: boolean; };
export type Bill = { id: string; title: string; amount: number; dueDate: string; status: 'unpaid' | 'paid' };

interface AppState {
  wallets: Wallet[];
  transactions: Transaction[];
  bills: Bill[];
  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  payBill: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      wallets: [
        { id: 'w1', name: "Dompet tunai", type: "Tunai", balance: 450000 },
        { id: 'w2', name: "BCA", type: "Bank", balance: 1850000 },
        { id: 'w3', name: "GoPay", type: "E-wallet", balance: 150000 },
      ],
      transactions: [
        { id: 't1', title: "Uang bulanan", category: "Pemasukan", date: "21 Okt", amount: 3000000, income: true },
        { id: 't2', title: "Kantin kampus", category: "Makan", date: "21 Okt", amount: 25000, income: false },
        { id: 't3', title: "Langganan Spotify", category: "Hiburan", date: "20 Okt", amount: 55000, income: false },
      ],
      bills: [
        { id: 'b1', title: "Kos bulanan", amount: 1200000, dueDate: "25 Okt", status: 'unpaid' },
        { id: 'b2', title: "Listrik & air", amount: 180000, dueDate: "28 Okt", status: 'unpaid' },
        { id: 'b3', title: "Netflix", amount: 54000, dueDate: "1 Nov", status: 'unpaid' },
      ],
      addTransaction: (tx) => set((state) => {
        // Update saldo dompet pertama (default untuk simplifikasi)
        const updatedWallets = [...state.wallets];
        if (tx.income) {
          updatedWallets[0].balance += tx.amount;
        } else {
          updatedWallets[0].balance -= tx.amount;
        }
        
        return {
          transactions: [{ ...tx, id: Math.random().toString(36).substring(7) }, ...state.transactions],
          wallets: updatedWallets
        };
      }),
      payBill: (id) => set((state) => {
        const bill = state.bills.find(b => b.id === id);
        if (!bill || bill.status === 'paid') return state;

        // Potong saldo dompet pertama
        const updatedWallets = [...state.wallets];
        updatedWallets[0].balance -= bill.amount;

        // Masukkan ke transaksi pengeluaran
        const newTx = { id: Math.random().toString(36).substring(7), title: `Bayar ${bill.title}`, category: "Tagihan", date: "Hari ini", amount: bill.amount, income: false };

        return {
          bills: state.bills.map(b => b.id === id ? { ...b, status: 'paid' } : b),
          wallets: updatedWallets,
          transactions: [newTx, ...state.transactions]
        };
      }),
    }),
    { name: 'kavia-storage' }
  )
);