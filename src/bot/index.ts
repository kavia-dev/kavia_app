import { Telegraf, Context, Markup } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import Tesseract from 'tesseract.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env.local') });

/* ==========================================================================
   SETUP & TIPE
   ========================================================================== */
const need = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Environment variable ${key} belum diisi`);
  return v;
};

type Ctx = Context & { state: { userId?: string } };
type Extra = Parameters<Ctx['reply']>[1];
type EditExtra = Parameters<Ctx['telegram']['editMessageText']>[4];
type Btn = ReturnType<typeof Markup.button.callback>;
type TxType = 'income' | 'expense';

const bot = new Telegraf<Ctx>(need('TELEGRAM_BOT_TOKEN'));
const supabase = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'));

interface Wallet { id: string; name: string; type?: string; balance: number }
interface TxRow { title: string; category: string; amount: number; is_income: boolean; date: string }

type Step =
  | 'catat_input' | 'catat_category' | 'catat_wallet' | 'catat_review' | 'catat_busy'
  | 'transfer_amount' | 'transfer_review' | 'transfer_busy';
  
interface Session {
  step: Step;
  type?: TxType;
  amount?: number;
  title?: string;
  category?: string;
  walletId?: string;
  walletName?: string;
  fromId?: string;
  fromName?: string;
  toId?: string;
  toName?: string;
  updatedAt: number;
}

/* ==========================================================================
   KATEGORI
   ========================================================================== */
const CATEGORIES: Record<TxType, { name: string; icon: string }[]> = {
  expense: [
    { name: 'Makanan', icon: '🍜' }, { name: 'Transportasi', icon: '🚗' },
    { name: 'Belanja', icon: '🛍️' }, { name: 'Tagihan', icon: '🧾' },
    { name: 'Hiburan', icon: '🎮' }, { name: 'Kesehatan', icon: '💊' },
    { name: 'Pendidikan', icon: '📚' }, { name: 'Lainnya', icon: '📦' },
  ],
  income: [
    { name: 'Gaji', icon: '💼' }, { name: 'Bonus', icon: '🎁' },
    { name: 'Freelance', icon: '💻' }, { name: 'Investasi', icon: '📈' },
    { name: 'Hadiah', icon: '🎉' }, { name: 'Lainnya', icon: '📦' },
  ],
};

/* ==========================================================================
   HELPER UMUM
   ========================================================================== */
const WIB = 7 * 3600 * 1000;
const LINE = '━━━━━━━━━━━━━━━━━━';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const formatRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
const money = (n: number) => `<code>${formatRp(n)}</code>`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${formatRp(Math.abs(n))}`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const tid = (ctx: Ctx) => ctx.from?.id ?? 0;
const uid = (ctx: Ctx) => ctx.state.userId as string;

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const kb = (rows: Btn[][]) => Markup.inlineKeyboard(rows);
const BTN_MENU = Markup.button.callback('🏠 Menu Utama', 'nav:menu');
const BTN_CANCEL = Markup.button.callback('❌ Batal', 'nav:cancel');

const card = (title: string, rows: string[], footer?: string) =>
  [`<b>${title}</b>`, LINE, ...rows, ...(footer ? [LINE, `<i>${footer}</i>`] : [])].join('\n');
const row = (icon: string, label: string, value: string) => `${icon} <b>${label}:</b> ${value}`;
const bar = (pct: number, size = 10) => {
  const filled = Math.max(0, Math.min(size, Math.round((pct / 100) * size)));
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
};

const greeting = () => {
  const h = new Date(Date.now() + WIB).getUTCHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
};

const monthRange = (offset = 0) => {
  const w = new Date(Date.now() + WIB);
  const y = w.getUTCFullYear();
  const m = w.getUTCMonth() + offset;
  return {
    start: new Date(Date.UTC(y, m, 1) - WIB),
    end: new Date(Date.UTC(y, m + 1, 1) - WIB),
    label: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m, 1))),
  };
};
const todayLabel = () =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(new Date());
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(iso));

async function show(ctx: Ctx, text: string, extra?: Extra) {
  const opts = { parse_mode: 'HTML' as const, ...(extra ?? {}) };
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, opts as Parameters<Ctx['editMessageText']>[1]);
      return;
    } catch (e) {
      const m = errMsg(e);
      if (m.includes('message is not modified')) return;
      console.error('show() edit gagal:', m);
    }
  }
  await ctx.reply(text, opts);
}

const errorCard = (text: string) => card('⚠️ TERJADI MASALAH', [text]);

/* ==========================================================================
   PARSER NOMINAL (NLP)
   ========================================================================== */
const parseAmount = (raw: string): number | null => {
  const s = raw.toLowerCase().replace(/^rp\.?\s*/, '').trim();
  const m = s.match(/^(\d+(?:[.,]\d+)*)\s*(k|rb|ribu|jt|juta)?$/);
  if (!m) return null;
  const [, num, unit] = m;
  let value: number;
  if (unit) {
    value = parseFloat(num.replace(',', '.')) * (unit === 'jt' || unit === 'juta' ? 1_000_000 : 1_000);
  } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(num)) {
    value = parseInt(num.replace(/[.,]/g, ''), 10);
  } else if (/^\d+$/.test(num)) {
    value = parseInt(num, 10);
  } else if (/^\d+[.,]\d{1,2}$/.test(num)) {
    value = Math.round(parseFloat(num.replace(',', '.')));
  } else return null;
  value = Math.round(value);
  return Number.isFinite(value) && value > 0 && value < 1_000_000_000_000 ? value : null;
};

const parseEntry = (text: string): { amount: number; title: string } | null => {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;
  let amount = parseAmount(parts[0]);
  if (amount !== null) return { amount, title: parts.slice(1).join(' ').slice(0, 60) };
  amount = parseAmount(parts[parts.length - 1]);
  if (amount !== null) return { amount, title: parts.slice(0, -1).join(' ').slice(0, 60) };
  return null;
};

/* ==========================================================================
   SESI
   ========================================================================== */
const SESSION_TTL = 15 * 60 * 1000;
const sessions = new Map<number, Session>();

const getSession = (id: number) => {
  const s = sessions.get(id);
  if (!s) return undefined;
  if (Date.now() - s.updatedAt > SESSION_TTL) { sessions.delete(id); return undefined; }
  return s;
};
const newSession = (id: number, s: Omit<Session, 'updatedAt'>) => {
  const next: Session = { ...s, updatedAt: Date.now() };
  sessions.set(id, next);
  return next;
};
const patchSession = (id: number, patch: Partial<Session>) => {
  const prev = getSession(id);
  if (!prev) return undefined;
  const next: Session = { ...prev, ...patch, updatedAt: Date.now() };
  sessions.set(id, next);
  return next;
};
setInterval(() => {
  for (const [k, v] of sessions) if (Date.now() - v.updatedAt > SESSION_TTL) sessions.delete(k);
}, 5 * 60 * 1000).unref();

async function needSession(ctx: Ctx, steps: Step[]): Promise<Session | null> {
  const s = getSession(tid(ctx));
  if (s && steps.includes(s.step)) return s;
  await show(ctx, card('SESI BERAKHIR', ['Sesi ini sudah tidak aktif atau sudah diproses.', 'Silakan mulai lagi dari menu.']), kb([[BTN_MENU]]));
  return null;
}

/* ==========================================================================
   DATABASE HELPER
   ========================================================================== */
const linkCache = new Map<number, { userId: string | null; exp: number }>();

async function getUserId(telegramId: number): Promise<string | null> {
  const hit = linkCache.get(telegramId);
  if (hit && hit.exp > Date.now()) return hit.userId;
  const { data } = await supabase.from('telegram_links').select('user_id').eq('telegram_id', String(telegramId)).maybeSingle();
  const userId = (data?.user_id as string | undefined) ?? null;
  linkCache.set(telegramId, { userId, exp: Date.now() + 60_000 });
  return userId;
}

async function getWallets(userId: string): Promise<Wallet[]> {
  const { data } = await supabase.from('wallets').select('id, name, type, balance').eq('user_id', userId).order('name');
  return (data ?? []) as Wallet[];
}
async function getWallet(userId: string, id: string): Promise<Wallet | null> {
  const { data } = await supabase.from('wallets').select('id, name, type, balance').eq('id', id).eq('user_id', userId).maybeSingle();
  return (data as Wallet | null) ?? null;
}

type Adjust =
  | { ok: true; before: number; after: number }
  | { ok: false; reason: 'not_found' | 'insufficient' | 'conflict' };

async function adjustBalance(userId: string, walletId: string, delta: number, allowNegative: boolean): Promise<Adjust> {
  for (let i = 0; i < 3; i++) {
    const w = await getWallet(userId, walletId);
    if (!w) return { ok: false, reason: 'not_found' };
    const after = w.balance + delta;
    if (!allowNegative && after < 0) return { ok: false, reason: 'insufficient' };
    const { data } = await supabase
      .from('wallets').update({ balance: after })
      .eq('id', walletId).eq('user_id', userId).eq('balance', w.balance)
      .select('balance');
    if (data && data.length > 0) return { ok: true, before: w.balance, after };
  }
  return { ok: false, reason: 'conflict' };
}
const adjustError = (r: Extract<Adjust, { ok: false }>) =>
  r.reason === 'insufficient' ? 'Saldo tidak mencukupi.'
    : r.reason === 'not_found' ? 'Dompet tidak ditemukan.'
    : 'Saldo sedang berubah, silakan coba lagi.';

async function fetchTx(userId: string, range?: { start: Date; end: Date }): Promise<TxRow[]> {
  let q = supabase.from('transactions').select('title, category, amount, is_income, date').eq('user_id', userId);
  if (range) q = q.gte('date', range.start.toISOString()).lt('date', range.end.toISOString());
  const { data, error } = await q.order('date', { ascending: false }).limit(5000);
  if (error) throw error;
  return (data ?? []) as TxRow[];
}
const summarize = (rows: TxRow[]) => {
  const real = rows.filter((t) => t.category !== 'Transfer');
  const income = real.filter((t) => t.is_income).reduce((s, t) => s + t.amount, 0);
  const expense = real.filter((t) => !t.is_income).reduce((s, t) => s + t.amount, 0);
  return { real, income, expense, net: income - expense };
};

/* ==========================================================================
   MIDDLEWARE
   ========================================================================== */
bot.use(async (ctx, next) => {
  if (ctx.chat && ctx.chat.type !== 'private') return; 
  return next();
});

bot.use(async (ctx, next) => {
  ctx.state.userId = (await getUserId(tid(ctx))) ?? undefined;
  if (ctx.state.userId) return next();

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  if (/^\/(start|link|help)(@\w+)?(\s|$)/.test(text) || /^(start|link|help)$/i.test(text)) return next();

  if (ctx.callbackQuery) await ctx.answerCbQuery('Akun belum terhubung').catch(() => undefined);
  await ctx.reply(
    card('🔒 AKSES DITOLAK', [
      'Akun Telegram kamu belum terhubung ke Web Kavia.',
      '',
      '1. Buka <b>Web Kavia → Pengaturan</b>',
      '2. Klik <b>Generate Kode</b>',
      '3. Kirim ke sini:',
      '<code>/link KODE_ANDA</code>',
    ]),
    { parse_mode: 'HTML' },
  );
});

/* ==========================================================================
   MENU & START
   ========================================================================== */
const mainKeyboard = () =>
  kb([
    [Markup.button.callback('➕ Catat', 'm:catat'), Markup.button.callback('🔄 Transfer', 'm:transfer')],
    [Markup.button.callback('👛 Saldo', 'm:saldo'), Markup.button.callback('📊 Laporan', 'm:laporan')],
    [Markup.button.callback('📷 Scan Struk', 'm:ocr'), Markup.button.callback('💎 Aset', 'm:asset')],
    [Markup.button.callback('🎯 Tabungan', 'm:tabungan'), Markup.button.callback('⚙️ Pengaturan', 'm:setting')],
  ]);

async function showMainMenu(ctx: Ctx) {
  await show(
    ctx,
    card('📋 MENU UTAMA', [
      'Mau ngapain hari ini?',
      '',
      '💡 <b>Tips:</b> kirim langsung <code>25k makan siang</code> untuk mencatat pengeluaran cepat.',
    ]),
    mainKeyboard(),
  );
}

// FUNGSI START DIPISAH AGAR BISA DIPANGGIL DARI SLASH ATAU TEKS BIASA
async function handleStart(ctx: Ctx) {
  const userId = ctx.state.userId;
  if (!userId) {
    return ctx.reply(
      card('👋 SELAMAT DATANG DI KAVIA', [
        'Asisten keuangan pribadimu di Telegram.',
        '',
        'Untuk mulai, hubungkan akun ini dengan Web Kavia:',
        '1. Web Kavia → <b>Pengaturan</b> → <b>Generate Kode</b>',
        '2. Kirim: <code>/link KODE_ANDA</code>',
      ]),
      { parse_mode: 'HTML' },
    );
  }

  const range = monthRange(0);
  const [wallets, assetsRes, rows] = await Promise.all([
    getWallets(userId),
    supabase.from('assets').select('value').eq('user_id', userId),
    fetchTx(userId, range),
  ]);
  const totalSaldo = wallets.reduce((s, w) => s + w.balance, 0);
  const totalAset = (assetsRes.data ?? []).reduce((s: number, a: { value: number }) => s + a.value, 0);
  const { income, expense, net } = summarize(rows);
  const name = esc(ctx.from?.first_name ?? 'kamu');

  const welcomeText = `
<b>👋 SELAMAT DATANG DI KAVIA FINANCE</b>
━━━━━━━━━━━━━━━━━━
Halo <b>${name}</b>, ${greeting()}!
Saya adalah asisten keuangan pribadimu. Di sini kamu bisa mencatat pengeluaran, melacak saldo, dan mengatur keuanganmu dengan lebih rapi.

<b>📊 RINGKASAN KEUANGANMU HARI INI</b>
${row('💳', 'Total Saldo', money(totalSaldo))}
${row('💎', 'Total Aset', money(totalAset))}
${row('👑', 'Kekayaan Bersih', money(totalSaldo + totalAset))}

📅 <b>${range.label}</b>
${row('📈', 'Pemasukan', money(income))}
${row('📉', 'Pengeluaran', money(expense))}
${row('🧮', 'Selisih', `<code>${signed(net)}</code>`)}
━━━━━━━━━━━━━━━━━━
<i>Silakan pilih menu di bawah untuk mulai mengelola keuanganmu.</i>
  `;

  await ctx.reply(welcomeText, { parse_mode: 'HTML', ...mainKeyboard() });
}

bot.start(handleStart);
bot.command('menu', showMainMenu);
bot.command('help', showMainMenu);
bot.command('batal', async (ctx) => {
  sessions.delete(tid(ctx));
  await show(ctx, card('BATAL', ['Aksi dibatalkan.']), kb([[BTN_MENU]]));
});

bot.action('nav:menu', async (ctx) => {
  await ctx.answerCbQuery();
  sessions.delete(tid(ctx));
  await showMainMenu(ctx);
});
bot.action('nav:cancel', async (ctx) => {
  await ctx.answerCbQuery('Aksi dibatalkan');
  sessions.delete(tid(ctx));
  await show(ctx, card('❌ DIBATALKAN', ['Tidak ada yang diubah.']), kb([[BTN_MENU]]));
});

/* ==========================================================================
   CATAT
   ========================================================================== */
async function startCatat(ctx: Ctx) {
  newSession(tid(ctx), { step: 'catat_input' });
  await show(
    ctx,
    card('➕ CATAT TRANSAKSI', ['Jenis transaksi apa yang ingin dicatat?']),
    kb([
      [Markup.button.callback('📉 Pengeluaran', 'c:type:expense'), Markup.button.callback('📈 Pemasukan', 'c:type:income')],
      [BTN_CANCEL],
    ]),
  );
}
bot.command('catat', startCatat);
bot.action('m:catat', async (ctx) => { await ctx.answerCbQuery(); await startCatat(ctx); });

bot.action(/^c:type:(expense|income)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const type = ctx.match[1] as TxType;
  newSession(tid(ctx), { step: 'catat_input', type });
  const isExp = type === 'expense';
  await show(
    ctx,
    card(isExp ? '📉 PENGELUARAN BARU' : '📈 PEMASUKAN BARU', [
      'Ketik <b>nominal</b> dan <b>keterangan</b>:',
      '<code>[nominal] [keterangan]</code>',
      '',
      `Contoh: <code>${isExp ? '25000 Makan Siang' : '2jt Proyek Website'}</code>`,
      `Atau: <code>${isExp ? '25k kopi' : '500rb bonus'}</code>`,
    ]),
    kb([[BTN_CANCEL]]),
  );
});

async function showCategoryPicker(ctx: Ctx, s: Session) {
  const type = s.type ?? 'expense';
  const buttons = chunk(
    CATEGORIES[type].map((c, i) => Markup.button.callback(`${c.icon} ${c.name}`, `c:cat:${i}`)),
    2,
  );
  buttons.push([Markup.button.callback('✏️ Ubah Nominal', 'c:edit'), BTN_CANCEL]);
  await show(
    ctx,
    card('🏷️ PILIH KATEGORI', [
      row('📝', 'Keterangan', esc(s.title ?? '-')),
      row('💰', 'Nominal', money(s.amount ?? 0)),
      row(type === 'income' ? '📈' : '📉', 'Jenis', type === 'income' ? 'Pemasukan' : 'Pengeluaran'),
    ], 'Pilih kategori yang paling sesuai'),
    kb(buttons),
  );
}

bot.action('c:edit', async (ctx) => {
  await ctx.answerCbQuery();
  const s = await needSession(ctx, ['catat_category', 'catat_wallet', 'catat_review']);
  if (!s) return;
  patchSession(tid(ctx), { step: 'catat_input' });
  await show(
    ctx,
    card('✏️ KOREKSI', ['Ketik ulang <b>nominal</b> dan <b>keterangan</b>:', '<code>25000 Makan Siang</code>']),
    kb([[BTN_CANCEL]]),
  );
});

bot.action(/^c:cat:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const s = await needSession(ctx, ['catat_category']);
  if (!s) return;
  const cat = CATEGORIES[s.type ?? 'expense'][Number(ctx.match[1])];
  if (!cat) return;

  const wallets = await getWallets(uid(ctx));
  if (wallets.length === 0) {
    sessions.delete(tid(ctx));
    return show(ctx, errorCard('Kamu belum punya dompet. Tambahkan dulu lewat Web Kavia.'), kb([[BTN_MENU]]));
  }
  const next = patchSession(tid(ctx), { step: 'catat_wallet', category: cat.name });
  const buttons = wallets.map((w) => [Markup.button.callback(`🏦 ${w.name} • ${formatRp(w.balance)}`, `c:wal:${w.id}`)]);
  buttons.push([Markup.button.callback('⬅️ Ganti Kategori', 'c:back:cat'), BTN_CANCEL]);
  await show(
    ctx,
    card('🏦 PILIH DOMPET', [
      row(cat.icon, 'Kategori', cat.name),
      row('📝', 'Keterangan', esc(next?.title ?? '-')),
      row('💰', 'Nominal', money(next?.amount ?? 0)),
    ], 'Dompet mana yang dipakai?'),
    kb(buttons),
  );
});

bot.action('c:back:cat', async (ctx) => {
  await ctx.answerCbQuery();
  const s = await needSession(ctx, ['catat_wallet', 'catat_review']);
  if (!s) return;
  const next = patchSession(tid(ctx), { step: 'catat_category' });
  if (next) await showCategoryPicker(ctx, next);
});

bot.action(/^c:wal:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const s = await needSession(ctx, ['catat_wallet']);
  if (!s || !s.amount || !s.type) return;
  const wallet = await getWallet(uid(ctx), ctx.match[1]);
  if (!wallet) return show(ctx, errorCard('Dompet tidak ditemukan.'), kb([[BTN_MENU]]));

  patchSession(tid(ctx), { step: 'catat_review', walletId: wallet.id, walletName: wallet.name });
  const isIncome = s.type === 'income';
  const after = isIncome ? wallet.balance + s.amount : wallet.balance - s.amount;

  await show(
    ctx,
    card('🧾 KONFIRMASI TRANSAKSI', [
      row(isIncome ? '📈' : '📉', 'Jenis', isIncome ? 'Pemasukan' : 'Pengeluaran'),
      row('🏷️', 'Kategori', esc(s.category ?? '-')),
      row('📝', 'Keterangan', esc(s.title ?? '-')),
      row('💰', 'Nominal', money(s.amount)),
      row('🏦', 'Akun', esc(wallet.name)),
      row('📅', 'Tanggal', todayLabel()),
      LINE,
      `Saldo sekarang: ${money(wallet.balance)}`,
      `Saldo sesudah: ${money(after)}`,
      ...(after < 0 ? ['', '⚠️ <b>Saldo akan menjadi negatif.</b>'] : []),
    ], 'Pastikan data sudah benar'),
    kb([
      [Markup.button.callback('✅ Simpan', 'c:ok')],
      [Markup.button.callback('⬅️ Ganti Dompet', 'c:back:wal'), BTN_CANCEL],
    ]),
  );
});

bot.action('c:back:wal', async (ctx) => {
  await ctx.answerCbQuery();
  const s = await needSession(ctx, ['catat_review']);
  if (!s) return;
  const wallets = await getWallets(uid(ctx));
  patchSession(tid(ctx), { step: 'catat_wallet' });
  const buttons = wallets.map((w) => [Markup.button.callback(`🏦 ${w.name} • ${formatRp(w.balance)}`, `c:wal:${w.id}`)]);
  buttons.push([BTN_CANCEL]);
  await show(ctx, card('🏦 PILIH DOMPET', ['Dompet mana yang dipakai?']), kb(buttons));
});

bot.action('c:ok', async (ctx) => {
  await ctx.answerCbQuery();
  const s = await needSession(ctx, ['catat_review']);
  if (!s || !s.amount || !s.walletId || !s.title || !s.type) return;

  const id = tid(ctx);
  const userId = uid(ctx);
  patchSession(id, { step: 'catat_busy' });

  const isIncome = s.type === 'income';
  const delta = isIncome ? s.amount : -s.amount;
  const adj = await adjustBalance(userId, s.walletId, delta, true);
  if (!adj.ok) {
    sessions.delete(id);
    return show(ctx, errorCard(adjustError(adj)), kb([[BTN_MENU]]));
  }

  const { data: tx, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId, title: s.title, category: s.category ?? (isIncome ? 'Pemasukan' : 'Pengeluaran'),
      amount: s.amount, is_income: isIncome, date: new Date().toISOString(), wallet_id: s.walletId,
    })
    .select('id')
    .single();

  if (error || !tx) {
    console.error('Insert transaksi gagal:', error);
    await adjustBalance(userId, s.walletId, -delta, true);
    sessions.delete(id);
    return show(ctx, errorCard('Gagal menyimpan transaksi. Saldo tidak berubah.'), kb([[BTN_MENU]]));
  }

  sessions.delete(id);
  await show(
    ctx,
    card('✅ TRANSAKSI BERHASIL', [
      `${isIncome ? '📈' : '📉'} <b>${esc(s.title)}</b>`,
      row('🏷️', 'Kategori', esc(s.category ?? '-')),
      row('💰', 'Nominal', money(s.amount)),
      row('🏦', 'Akun', esc(s.walletName ?? '-')),
      LINE,
      `Saldo sebelum: ${money(adj.before)}`,
      `Saldo sesudah: ${money(adj.after)}`,
    ], 'Salah catat? Undo tersedia 30 menit.'),
    kb([
      [Markup.button.callback('↩️ Undo', `undo:${tx.id}`), Markup.button.callback('➕ Catat Lagi', 'm:catat')],
      [BTN_MENU],
    ]),
  );
});

bot.action(/^undo:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Membatalkan...');
  const userId = uid(ctx);
  const txId = ctx.match[1];

  const { data: tx } = await supabase
    .from('transactions').select('id, amount, is_income, wallet_id, title, date')
    .eq('id', txId).eq('user_id', userId).maybeSingle();
  if (!tx) return show(ctx, card('↩️ UNDO', ['Transaksi sudah dibatalkan atau tidak ditemukan.']), kb([[BTN_MENU]]));
  if (Date.now() - new Date(tx.date).getTime() > 30 * 60 * 1000) {
    return show(ctx, card('↩️ UNDO', ['Batas waktu undo (30 menit) sudah lewat.', 'Silakan hapus lewat Web Kavia.']), kb([[BTN_MENU]]));
  }

  const { data: deleted } = await supabase.from('transactions').delete().eq('id', txId).eq('user_id', userId).select('id');
  if (!deleted || deleted.length === 0) {
    return show(ctx, card('↩️ UNDO', ['Transaksi sudah dibatalkan sebelumnya.']), kb([[BTN_MENU]]));
  }
  const adj = await adjustBalance(userId, tx.wallet_id, tx.is_income ? -tx.amount : tx.amount, true);
  await show(
    ctx,
    card('↩️ TRANSAKSI DIBATALKAN', [
      `<b>${esc(tx.title)}</b> • ${money(tx.amount)}`,
      adj.ok ? 'Saldo dompet sudah dikembalikan.' : '⚠️ Transaksi dihapus, tetapi saldo gagal dikembalikan. Cek di Web Kavia.',
    ]),
    kb([[Markup.button.callback('➕ Catat Lagi', 'm:catat'), BTN_MENU]]),
  );
});

/* ==========================================================================
   TRANSFER
   ========================================================================== */
async function startTransfer(ctx: Ctx) {
  const wallets = await getWallets(uid(ctx));
  if (wallets.length < 2) {
    return show(ctx, card('🔄 TRANSFER', ['Butuh minimal <b>2 dompet</b> untuk transfer.', 'Tambahkan dompet lewat Web Kavia.']), kb([[BTN_MENU]]));
  }
  sessions.delete(tid(ctx));
  const buttons = wallets.map((w) => [Markup.button.callback(`🏦 ${w.name} • ${formatRp(w.balance)}`, `t:from:${w.id}`)]);
  buttons.push([BTN_CANCEL]);
  await show(ctx, card('🔄 TRANSFER', ['Pilih akun <b>ASAL</b> (saldonya akan dipotong):']), kb(buttons));
}
bot.command('transfer', startTransfer);
bot.action('m:transfer', async (ctx) => { await ctx.answerCbQuery(); await startTransfer(ctx); });

bot.action(/^t:from:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = uid(ctx);
  const from = await getWallet(userId, ctx.match[1]);
  if (!from) return show(ctx, errorCard('Dompet asal tidak ditemukan.'), kb([[BTN_MENU]]));

  newSession(tid(ctx), { step: 'transfer_amount', fromId: from.id, fromName: from.name });
  const others = (await getWallets(userId)).filter((w) => w.id !== from.id);
  const buttons = others.map((w) => [Markup.button.callback(`🏦 ${w.name} • ${formatRp(w.balance)}`, `t:to:${w.id}`)]);
  buttons.push([BTN_CANCEL]);
  await show(
    ctx,
    card('🔄 TRANSFER', [row('📤', 'Dari', esc(from.name)), 'Pilih akun <b>TUJUAN</b> (yang menerima saldo):']),
    kb(buttons),
  );
});

bot.action(/^t:to:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const s = await needSession(ctx, ['transfer_amount']);
  if (!s || !s.fromId) return;
  const to = await getWallet(uid(ctx), ctx.match[1]);
  const from = await getWallet(uid(ctx), s.fromId);
  if (!to || !from || to.id === from.id) return show(ctx, errorCard('Dompet tujuan tidak valid.'), kb([[BTN_MENU]]));

  patchSession(tid(ctx), { toId: to.id, toName: to.name });
  await show(
    ctx,
    card('🔄 TRANSFER', [
      row('📤', 'Dari', `${esc(from.name)} (${money(from.balance)})`),
      row('📥', 'Ke', esc(to.name)),
      '',
      'Ketik <b>nominal</b> yang ingin ditransfer.',
      'Contoh: <code>50000</code> atau <code>50k</code>',
    ]),
    kb([[BTN_CANCEL]]),
  );
});

bot.action('t:ok', async (ctx) => {
  await ctx.answerCbQuery();
  const s = await needSession(ctx, ['transfer_review']);
  if (!s || !s.amount || !s.fromId || !s.toId) return;

  const id = tid(ctx);
  const userId = uid(ctx);
  patchSession(id, { step: 'transfer_busy' });

  const debit = await adjustBalance(userId, s.fromId, -s.amount, false);
  if (!debit.ok) {
    sessions.delete(id);
    return show(ctx, errorCard(adjustError(debit)), kb([[BTN_MENU]]));
  }
  const credit = await adjustBalance(userId, s.toId, s.amount, true);
  if (!credit.ok) {
    await adjustBalance(userId, s.fromId, s.amount, true);
    sessions.delete(id);
    return show(ctx, errorCard(`${adjustError(credit)} Transfer dibatalkan, saldo tidak berubah.`), kb([[BTN_MENU]]));
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('transactions').insert([
    { user_id: userId, title: `Transfer ke ${s.toName}`, category: 'Transfer', amount: s.amount, is_income: false, date: now, wallet_id: s.fromId },
    { user_id: userId, title: `Transfer dari ${s.fromName}`, category: 'Transfer', amount: s.amount, is_income: true, date: now, wallet_id: s.toId },
  ]);
  if (error) console.error('Insert riwayat transfer gagal:', error);

  sessions.delete(id);
  await show(
    ctx,
    card('✅ TRANSFER BERHASIL', [
      row('📤', 'Dari', esc(s.fromName ?? '-')),
      row('📥', 'Ke', esc(s.toName ?? '-')),
      row('💰', 'Nominal', money(s.amount)),
      LINE,
      `${esc(s.fromName ?? '')}: ${money(debit.after)}`,
      `${esc(s.toName ?? '')}: ${money(credit.after)}`,
      ...(error ? ['', '⚠️ Saldo sudah dipindah, tetapi riwayat gagal tercatat.'] : []),
    ], 'Saldo diperbarui otomatis'),
    kb([[Markup.button.callback('🔄 Transfer Lagi', 'm:transfer'), BTN_MENU]]),
  );
});

/* ==========================================================================
   INPUT TEKS (NLP & TRIGGER WORDS)
   ========================================================================== */
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const lowerText = text.toLowerCase();
  const id = tid(ctx);

  if (text.startsWith('/')) {
    return ctx.reply('Perintah tidak dikenal. Ketik /menu untuk melihat pilihan.');
  }

  // 1. KATA PEMICU GLOBAL
  if (/^(batal|cancel)$/i.test(lowerText)) {
    sessions.delete(id);
    return show(ctx, card('❌ DIBATALKAN', ['Tidak ada yang diubah.']), kb([[BTN_MENU]]));
  }
  
  // FIX: "start" sekarang memanggil handleStart, bukan showMainMenu
  if (/^(start)$/i.test(lowerText)) {
    return handleStart(ctx);
  }

  if (/^(menu|help|bantuan)$/i.test(lowerText)) {
    sessions.delete(id);
    return showMainMenu(ctx);
  }
  
  if (/^(saldo|cek saldo|dompet|akun)$/i.test(lowerText)) {
    return showSaldo(ctx);
  }
  
  if (/^(laporan|report|statistik)$/i.test(lowerText)) {
    return showLaporan(ctx);
  }
  
  if (/^(transfer)$/i.test(lowerText)) {
    return startTransfer(ctx);
  }
  
  if (/^(aset|asset|investasi|portofolio)$/i.test(lowerText)) {
    return showAsset(ctx);
  }

  if (/^catat(\s+.*)?$/i.test(lowerText)) {
    const afterCatat = text.substring(5).trim();
    if (!afterCatat) return startCatat(ctx);
    
    const entry = parseEntry(afterCatat);
    if (entry) {
      const next = newSession(id, { step: 'catat_category', type: 'expense', amount: entry.amount, title: entry.title });
      return showCategoryPicker(ctx, next);
    }
    return startCatat(ctx); 
  }

  const s = getSession(id);

  if (s?.step === 'catat_input') {
    const entry = parseEntry(text);
    if (!entry) {
      return show(
        ctx,
        card('❌ FORMAT BELUM TEPAT', [
          'Awali dengan nominal lalu keterangan.',
          'Contoh: <code>25000 Makan Siang</code>',
          'Atau: <code>25k kopi</code>',
        ]),
        kb([[BTN_CANCEL]]),
      );
    }
    const next = patchSession(id, { step: 'catat_category', amount: entry.amount, title: entry.title, type: s.type ?? 'expense' });
    if (next) await showCategoryPicker(ctx, next);
    return;
  }

  if (s?.step === 'transfer_amount' && s.fromId && s.toId) {
    const amount = parseAmount(text);
    if (!amount) {
      return show(ctx, card('❌ NOMINAL TIDAK VALID', ['Ketik angka saja.', 'Contoh: <code>50000</code> atau <code>50k</code>']), kb([[BTN_CANCEL]]));
    }
    const userId = uid(ctx);
    const [from, to] = await Promise.all([getWallet(userId, s.fromId), getWallet(userId, s.toId)]);
    if (!from || !to) return show(ctx, errorCard('Dompet tidak ditemukan.'), kb([[BTN_MENU]]));
    if (from.balance < amount) {
      return show(
        ctx,
        card('❌ SALDO TIDAK CUKUP', [
          row('🏦', esc(from.name), money(from.balance)),
          row('💰', 'Diminta', money(amount)),
          '',
          'Ketik nominal lain, atau batalkan.',
        ]),
        kb([[BTN_CANCEL]]),
      );
    }
    patchSession(id, { step: 'transfer_review', amount });
    return show(
      ctx,
      card('🧾 KONFIRMASI TRANSFER', [
        row('📤', 'Dari', esc(from.name)),
        row('📥', 'Ke', esc(to.name)),
        row('💰', 'Nominal', money(amount)),
        LINE,
        `<b>${esc(from.name)}</b>`,
        `  ${money(from.balance)} → ${money(from.balance - amount)}`,
        `<b>${esc(to.name)}</b>`,
        `  ${money(to.balance)} → ${money(to.balance + amount)}`,
      ], 'Pastikan data sudah benar'),
      kb([[Markup.button.callback('✅ Konfirmasi Transfer', 't:ok')], [BTN_CANCEL]]),
    );
  }

  const entry = parseEntry(text);
  if (entry) {
    const next = newSession(id, { step: 'catat_category', type: 'expense', amount: entry.amount, title: entry.title });
    return showCategoryPicker(ctx, next);
  }

  await ctx.reply(
    card('🤔 BELUM MENGERTI', [
      'Coba kirim seperti ini:',
      '<code>25k makan siang</code>',
      '',
      'Atau buka menu dengan /menu.',
    ]),
    { parse_mode: 'HTML', ...kb([[BTN_MENU]]) },
  );
});

/* ==========================================================================
   OCR SYSTEM
   ========================================================================== */
const toNumber = (s: string) => parseInt(s.split(',')[0].replace(/\./g, ''), 10);
const NUM_RE = /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{5,}/g;
const OCR_MAX = 500_000_000;

function detectTotal(text: string): { amount: number; source: 'total' | 'terbesar' } | null {
  const lines = text.split('\n');
  const totals: number[] = [];
  const all: number[] = [];
  for (const line of lines) {
    const nums = (line.match(NUM_RE) ?? []).map(toNumber).filter((n) => n > 0 && n < OCR_MAX);
    all.push(...nums);
    if (/total|jumlah|tagihan/i.test(line) && !/sub\s*total|kembali|change|tunai|cash|diskon|ppn|pajak|tax|item|qty/i.test(line)) {
      totals.push(...nums);
    }
  }
  if (totals.length) return { amount: Math.max(...totals), source: 'total' };
  if (all.length) return { amount: Math.max(...all), source: 'terbesar' };
  return null;
}

const ocrBusy = new Set<number>();

bot.action('m:ocr', async (ctx) => {
  await ctx.answerCbQuery();
  await show(
    ctx,
    card('📷 SCAN STRUK', [
      'Kirim <b>foto struk</b> belanja atau bukti transfer ke chat ini.',
      '',
      '💡 Foto yang terang, lurus, dan tidak buram memberi hasil terbaik.',
    ]),
    kb([[BTN_MENU]]),
  );
});

bot.on('photo', async (ctx) => {
  const id = tid(ctx);
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  if (ocrBusy.has(id)) return ctx.reply('⏳ Struk sebelumnya masih diproses, tunggu sebentar ya.');
  ocrBusy.add(id);

  const loading = await ctx.reply('🔍 Membaca struk... (sekitar 10–20 detik)');
  const edit = (text: string, extra?: EditExtra) =>
    ctx.telegram.editMessageText(chatId, loading.message_id, undefined, text, { parse_mode: 'HTML', ...(extra ?? {}) } as EditExtra);

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const link = await ctx.telegram.getFileLink(photo.file_id);
    const res = await fetch(link.href);
    if (!res.ok) throw new Error(`Unduh foto gagal (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const result = await Tesseract.recognize(buffer, 'ind+eng');
    const found = detectTotal(result.data.text);

    if (!found) {
      return await edit(
        card('❌ NOMINAL TIDAK DITEMUKAN', ['Pastikan foto jelas dan seluruh struk terlihat.', 'Atau catat manual dengan /catat.']),
        kb([[Markup.button.callback('➕ Catat Manual', 'm:catat'), BTN_MENU]]) as unknown as EditExtra,
      );
    }

    const s = newSession(id, { step: 'catat_category', type: 'expense', amount: found.amount, title: 'Belanja Struk (OCR)' });
    const buttons = chunk(
      CATEGORIES.expense.map((c, i) => Markup.button.callback(`${c.icon} ${c.name}`, `c:cat:${i}`)),
      2,
    );
    buttons.push([Markup.button.callback('✏️ Koreksi Nominal', 'c:edit'), BTN_CANCEL]);

    await edit(
      card('🧾 HASIL SCAN STRUK', [
        row('💰', 'Total terbaca', money(s.amount ?? 0)),
        row('🔎', 'Sumber', found.source === 'total' ? 'Baris TOTAL' : 'Angka terbesar di struk'),
        ...(found.source === 'terbesar' ? ['', '⚠️ Total tidak terdeteksi jelas, mohon periksa nominalnya.'] : []),
      ], 'Pilih kategori untuk melanjutkan'),
      kb(buttons) as unknown as EditExtra,
    );
  } catch (err) {
    console.error('OCR Error:', err);
    await edit(errorCard('Gagal memproses gambar. Coba kirim ulang foto yang lebih jelas.'), kb([[BTN_MENU]]) as unknown as EditExtra).catch(() => undefined);
  } finally {
    ocrBusy.delete(id);
  }
});

/* ==========================================================================
   SALDO & LAPORAN
   ========================================================================== */
async function showSaldo(ctx: Ctx) {
  const wallets = await getWallets(uid(ctx));
  if (wallets.length === 0) {
    return show(ctx, card('👛 DAFTAR AKUN', ['Belum ada akun. Tambahkan lewat Web Kavia.']), kb([[BTN_MENU]]));
  }
  const groups: { icon: string; title: string; items: Wallet[] }[] = [
    { icon: '🏦', title: 'REKENING BANK', items: wallets.filter((w) => w.type === 'Bank') },
    { icon: '📱', title: 'E-WALLET', items: wallets.filter((w) => w.type === 'E-Wallet') },
    { icon: '💵', title: 'TUNAI & LAINNYA', items: wallets.filter((w) => w.type !== 'Bank' && w.type !== 'E-Wallet') },
  ];
  const body: string[] = [];
  for (const g of groups) {
    if (!g.items.length) continue;
    body.push(`${g.icon} <b>${g.title}</b>`);
    g.items.forEach((w) => body.push(`  • ${esc(w.name)} — ${money(w.balance)}`));
    body.push('');
  }
  const total = wallets.reduce((s, w) => s + w.balance, 0);
  body.push(row('💳', 'Total Saldo', money(total)));

  await show(
    ctx,
    card('👛 DAFTAR AKUN', body),
    kb([[Markup.button.callback('➕ Catat', 'm:catat'), Markup.button.callback('🔄 Transfer', 'm:transfer')], [BTN_MENU]]),
  );
}
bot.command('saldo', showSaldo);
bot.action('m:saldo', async (ctx) => { await ctx.answerCbQuery(); await showSaldo(ctx); });

async function showLaporan(ctx: Ctx, period: 'cur' | 'prev' | 'all' = 'cur') {
  const range = period === 'cur' ? monthRange(0) : period === 'prev' ? monthRange(-1) : undefined;
  const rows = await fetchTx(uid(ctx), range);
  const { income, expense, net, real } = summarize(rows);

  const byCat = new Map<string, number>();
  real.filter((t) => !t.is_income).forEach((t) => byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount));
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const body: string[] = [
    row('📈', 'Pemasukan', money(income)),
    row('📉', 'Pengeluaran', money(expense)),
    row('🧮', 'Selisih', `<code>${signed(net)}</code>`),
  ];
  if (top.length) {
    body.push(LINE, '🏷️ <b>Pengeluaran Terbesar</b>');
    top.forEach(([cat, val]) => {
      const pct = expense > 0 ? (val / expense) * 100 : 0;
      body.push(`${bar(pct)} ${pct.toFixed(0)}%`, `  ${esc(cat)} — ${money(val)}`);
    });
  }
  if (rows.length) {
    body.push(LINE, '🕒 <b>Transaksi Terakhir</b>');
    rows.slice(0, 5).forEach((t) => {
      const icon = t.category === 'Transfer' ? '🔄' : t.is_income ? '➕' : '➖';
      body.push(`${icon} ${shortDate(t.date)} • ${esc(t.title)} — <code>${formatRp(t.amount)}</code>`);
    });
  } else {
    body.push('', '<i>Belum ada transaksi pada periode ini.</i>');
  }

  const label = period === 'all' ? 'Keseluruhan' : (range?.label ?? '');
  await show(
    ctx,
    card(`📊 LAPORAN • ${label.toUpperCase()}`, body, 'Transfer antar-akun tidak dihitung'),
    kb([
      [
        Markup.button.callback(period === 'cur' ? '• Bulan Ini •' : 'Bulan Ini', 'lap:cur'),
        Markup.button.callback(period === 'prev' ? '• Bulan Lalu •' : 'Bulan Lalu', 'lap:prev'),
        Markup.button.callback(period === 'all' ? '• Semua •' : 'Semua', 'lap:all'),
      ],
      [BTN_MENU],
    ]),
  );
}
bot.command('laporan', (ctx) => showLaporan(ctx));
bot.action('m:laporan', async (ctx) => { await ctx.answerCbQuery(); await showLaporan(ctx); });
bot.action(/^lap:(cur|prev|all)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await showLaporan(ctx, ctx.match[1] as 'cur' | 'prev' | 'all');
});

/* ==========================================================================
   ASSET & TABUNGAN
   ========================================================================== */
async function showAsset(ctx: Ctx) {
  const { data } = await supabase.from('assets').select('name, type, value').eq('user_id', uid(ctx));
  const assets = (data ?? []) as { name: string; type: string; value: number }[];
  if (assets.length === 0) {
    return show(ctx, card('💎 PORTOFOLIO ASET', ['Belum ada aset investasi.', 'Tambahkan lewat Web Kavia.']), kb([[BTN_MENU]]));
  }
  const total = assets.reduce((s, a) => s + a.value, 0);
  const body = assets.flatMap((a) => [`<b>${esc(a.name)}</b> (${esc(a.type)})`, `  └ ${money(a.value)}`]);
  body.push(LINE, row('💎', 'Total Aset', money(total)));
  await show(ctx, card('💎 PORTOFOLIO ASET', body), kb([[BTN_MENU]]));
}
bot.command('asset', showAsset);
bot.action('m:asset', async (ctx) => { await ctx.answerCbQuery(); await showAsset(ctx); });

async function showTabungan(ctx: Ctx) {
  await show(
    ctx,
    card('🎯 TABUNGAN', ['Fitur target tabungan di bot sedang disiapkan.', 'Sementara, kelola target tabunganmu lewat Web Kavia.']),
    kb([[BTN_MENU]]),
  );
}
bot.command('tabungan', showTabungan);
bot.action('m:tabungan', async (ctx) => { await ctx.answerCbQuery(); await showTabungan(ctx); });

/* ==========================================================================
   PENGATURAN & LINK
   ========================================================================== */
async function showSetting(ctx: Ctx) {
  await show(
    ctx,
    card('⚙️ PENGATURAN', [
      row('🔗', 'Status', 'Terhubung ke Web Kavia'),
      row('🕒', 'Zona waktu', 'WIB (Asia/Jakarta)'),
      '',
      'Ingin mengganti akun? Putuskan tautan, lalu kirim <code>/link KODE_BARU</code>.',
    ]),
    kb([[Markup.button.callback('🔌 Putuskan Tautan', 'u:ask')], [BTN_MENU]]),
  );
}
bot.action('m:setting', async (ctx) => { await ctx.answerCbQuery(); await showSetting(ctx); });

bot.action('u:ask', async (ctx) => {
  await ctx.answerCbQuery();
  await show(
    ctx,
    card('🔌 PUTUSKAN TAUTAN?', ['Bot tidak akan bisa mengakses data keuanganmu sampai kamu menautkan akun lagi.']),
    kb([[Markup.button.callback('✅ Ya, Putuskan', 'u:ok'), Markup.button.callback('↩️ Kembali', 'm:setting')]]),
  );
});
bot.action('u:ok', async (ctx) => {
  await ctx.answerCbQuery();
  await supabase.from('telegram_links').delete().eq('telegram_id', String(tid(ctx)));
  linkCache.delete(tid(ctx));
  sessions.delete(tid(ctx));
  await show(ctx, card('🔌 TAUTAN DIPUTUSKAN', ['Kirim <code>/link KODE_ANDA</code> untuk menautkan kembali.']));
});

bot.command('link', async (ctx) => {
  const code = ctx.message.text.split(/\s+/)[1]?.trim().toUpperCase();
  if (!code) {
    return ctx.reply(card('🔗 TAUTKAN AKUN', ['Format: <code>/link KODE_ANDA</code>', 'Kode didapat dari Web Kavia → Pengaturan → Generate Kode.']), { parse_mode: 'HTML' });
  }
  const telegramId = String(tid(ctx));

  const { data: token } = await supabase.from('link_tokens').select('*').eq('code', code).maybeSingle();
  if (!token) return ctx.reply(card('❌ KODE TIDAK VALID', ['Periksa kembali kodenya, atau generate kode baru di Web Kavia.']), { parse_mode: 'HTML' });
  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now()) {
    return ctx.reply(card('⌛ KODE KEDALUWARSA', ['Silakan generate kode baru di Web Kavia.']), { parse_mode: 'HTML' });
  }

  await supabase.from('telegram_links').delete().eq('telegram_id', telegramId);
  const { error } = await supabase.from('telegram_links').insert({ user_id: token.user_id, telegram_id: telegramId });
  if (error) {
    console.error('Link gagal:', error);
    return ctx.reply(errorCard('Gagal menautkan akun. Coba lagi sebentar lagi.'), { parse_mode: 'HTML' });
  }
  await supabase.from('link_tokens').delete().eq('code', code);
  linkCache.delete(tid(ctx));
  ctx.deleteMessage().catch(() => undefined);

  await ctx.reply(
    card('✅ AKUN TERHUBUNG', ['Telegram kamu sudah tertaut ke Web Kavia.', 'Ketik /start untuk melihat dashboard.']),
    { parse_mode: 'HTML', ...kb([[Markup.button.callback('📊 Buka Dashboard', 'nav:menu')]]) },
  );
});

/* ==========================================================================
   FALLBACK & ERROR HANDLER
   ========================================================================== */
bot.on('callback_query', async (ctx) => { await ctx.answerCbQuery().catch(() => undefined); });

bot.catch(async (err, ctx) => {
  console.error(`Error pada ${ctx.updateType}:`, err);
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Terjadi kesalahan').catch(() => undefined);
    await ctx.reply('⚠️ Terjadi kesalahan sistem. Silakan coba lagi atau ketik /menu.');
  } catch { /* abaikan */ }
});

/* ==========================================================================
   JALANKAN BOT
   ========================================================================== */
async function main() {
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Mulai & Dashboard' },
    { command: 'menu', description: 'Menu utama' },
    { command: 'catat', description: 'Catat pemasukan / pengeluaran' },
    { command: 'transfer', description: 'Transfer antar-akun' },
    { command: 'saldo', description: 'Lihat saldo semua akun' },
    { command: 'laporan', description: 'Laporan keuangan' },
    { command: 'asset', description: 'Portofolio aset' },
    { command: 'batal', description: 'Batalkan aksi berjalan' },
    { command: 'link', description: 'Tautkan akun Web Kavia' },
  ]);
  const me = await bot.telegram.getMe();
  bot.launch({ dropPendingUpdates: true }).catch((e) => {
    console.error('Bot berhenti:', e);
    process.exit(1);
  });
  console.log(`✅ KAVIA FINANCE aktif sebagai @${me.username}`);
}

main().catch((e) => {
  console.error('Gagal menjalankan bot:', e);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));