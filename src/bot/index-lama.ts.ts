import { Telegraf, Context, Markup } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import Tesseract from 'tesseract.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env.local') });

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN as string);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

interface KaviaContext extends Context {
  state: { userId?: string; };
}

type SessionState = {
  step: string;
  type?: 'income' | 'expense';
  amount?: number;
  title?: string;
  walletId?: string;
  walletName?: string;
  fromId?: string;
  fromName?: string;
  toId?: string;
  toName?: string;
  lastTxId?: string;
};
const userSessions = new Map<number, SessionState>();

const escapeHTML = (str: string) => 
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const formatRp = (num: number) => 
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);

// FIX 1: Menggunakan 'any' secara eksplisit untuk menghindari konflik tipe Telegraf
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// HELPER: Fungsi Safe Edit (FIXED TOTAL)
const safeEdit = async (
  ctx: KaviaContext, 
  text: string, 
  extra?: Parameters<Context['reply']>[1]
) => {
  try {
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      // FIX: Kita paksa TypeScript menganggap 'extra' ini adalah tipe yang valid untuk editMessageText
      await ctx.editMessageText(
        text, 
        extra as Parameters<Context['editMessageText']>[1]
      );
    } else {
      await ctx.reply(text, extra);
    }
  } catch (error) {
    console.error("SafeEdit Error:", error);
    await ctx.reply(text, extra);
  }
};

const getUserId = async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return null;
  const { data } = await supabase.from('telegram_links').select('user_id').eq('telegram_id', telegramId).single();
  return data?.user_id || null;
};

const requireLink = async (ctx: KaviaContext, next: () => Promise<void>) => {
  try {
    const userId = await getUserId(ctx);
    if (!userId) {
      return ctx.reply('⚠️ <b>Akses Ditolak</b>\nAkun Telegram kamu belum terhubung ke Web Kavia.\n\nSilakan buka Web Kavia -> Pengaturan -> Generate Kode, lalu kirim perintah:\n<code>/link [KODE_ANDA]</code>', { parse_mode: 'HTML' });
    }
    ctx.state.userId = userId; 
    return next();
  } catch (error) {
    console.error("Middleware Error:", error);
    return ctx.reply('Terjadi kesalahan sistem.');
  }
};

const parseAmount = (str: string): number => {
  const clean = str.toLowerCase().replace(/rp|\./g, '');
  if (clean.includes('jt')) return parseFloat(clean.replace('jt', '')) * 1000000;
  if (clean.includes('rb') || clean.includes('k')) return parseFloat(clean.replace(/rb|k/g, '')) * 1000;
  return parseInt(clean) || 0;
};

const btnBackToMenu = Markup.button.callback('🏠 Menu Utama', 'nav_menu');
const btnCancel = Markup.button.callback('❌ Batal', 'nav_cancel');

// ==========================================
// 3. /start — DASHBOARD UTAMA
// ==========================================
bot.start(async (ctx: KaviaContext) => {
  const userId = await getUserId(ctx);
  if (!userId) {
    return ctx.reply('Selamat datang di <b>KAVIA FINANCE</b>!\n\nUntuk memulai, silakan hubungkan akun Telegram kamu dengan Web Kavia.\n\nKetik:\n<code>/link [KODE_ANDA]</code>', { parse_mode: 'HTML' });
  }
  ctx.state.userId = userId;

  const [resWallets, resAssets, resTx] = await Promise.all([
    supabase.from('wallets').select('balance').eq('user_id', userId),
    supabase.from('assets').select('value').eq('user_id', userId),
    supabase.from('transactions').select('amount, is_income, date').eq('user_id', userId)
  ]);

  const totalSaldo = resWallets.data?.reduce((s, w) => s + w.balance, 0) || 0;
  const totalAset = resAssets.data?.reduce((s, a) => s + a.value, 0) || 0;
  const totalKekayaan = totalSaldo + totalAset;

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const thisMonthTx = resTx.data?.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }) || [];
  
  const income = thisMonthTx.filter(t => t.is_income).reduce((s, t) => s + t.amount, 0);
  const expense = thisMonthTx.filter(t => !t.is_income).reduce((s, t) => s + t.amount, 0);

  if (!resWallets.data || resWallets.data.length === 0) {
    const kb = Markup.inlineKeyboard([[Markup.button.callback('➕ Buat Akun Pertama', 'menu_add_account')]]);
    return ctx.reply('Halo! Kamu belum memiliki akun keuangan. Yuk, buat akun pertamamu (Bank, E-Wallet, atau Tunai) untuk mulai mencatat keuangan.', kb);
  }

  const message = `
<b>KAVIA FINANCE</b>
<i>Personal Finance Assistant</i>

Selamat datang kembali! Berikut ringkasan keuanganmu:

💳 <b>Total Saldo:</b> <code>${formatRp(totalSaldo)}</code>
💎 <b>Total Aset:</b> <code>${formatRp(totalAset)}</code>
👑 <b>Kekayaan Bersih:</b> <code>${formatRp(totalKekayaan)}</code>

📊 <b>Bulan Ini</b>
📈 Pemasukan: <code>${formatRp(income)}</code>
📉 Pengeluaran: <code>${formatRp(expense)}</code>
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Catat', 'menu_catat'), Markup.button.callback('🔄 Transfer', 'menu_transfer')],
    [Markup.button.callback('👛 Saldo', 'menu_saldo'), Markup.button.callback('📊 Laporan', 'menu_laporan')],
    [Markup.button.callback('📷 Scan OCR', 'menu_ocr'), Markup.button.callback('🎯 Tabungan', 'menu_tabungan')],
    [Markup.button.callback('💎 Asset', 'menu_asset'), Markup.button.callback('🔗 Link', 'menu_link')]
  ]);

  ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
});

// ==========================================
// 4. /menu — NAVIGASI UTAMA
// ==========================================
bot.command('menu', (ctx) => showMainMenu(ctx));
bot.action('nav_menu', async (ctx) => {
  await ctx.answerCbQuery();
  if (ctx.from) userSessions.delete(ctx.from.id);
  showMainMenu(ctx);
});

async function showMainMenu(ctx: KaviaContext) {
  const message = `
<b>📋 MENU UTAMA</b>
Silakan pilih menu keuangan yang ingin diakses.
  `;
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Catat Transaksi', 'menu_catat'), Markup.button.callback('🔄 Transfer', 'menu_transfer')],
    [Markup.button.callback('📷 Scan OCR', 'menu_ocr'), Markup.button.callback('👛 Cek Saldo', 'menu_saldo')],
    [Markup.button.callback('📊 Laporan', 'menu_laporan'), Markup.button.callback('🎯 Target Tabungan', 'menu_tabungan')],
    [Markup.button.callback('💎 Portofolio Aset', 'menu_asset'), Markup.button.callback('⚙️ Pengaturan Akun', 'menu_link')]
  ]);
  
  await safeEdit(ctx, message, { parse_mode: 'HTML', ...keyboard });
}

bot.action('nav_cancel', async (ctx) => {
  await ctx.answerCbQuery('Aksi dibatalkan');
  if (ctx.from) userSessions.delete(ctx.from.id);
  await safeEdit(ctx, '❌ Aksi dibatalkan.', Markup.inlineKeyboard([[btnBackToMenu]]));
});

// ==========================================
// 6. /catat — TRANSAKSI (Support NLP & Tombol)
// ==========================================
bot.command('catat', async (ctx: KaviaContext) => {
  if (!ctx.message || !('text' in ctx.message)) return;
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length >= 2) {
    const amount = parseAmount(args[args.length - 1]);
    const title = args.slice(0, args.length - 1).join(' ');
    
    if (amount > 0 && title) {
      if (!ctx.from) return;
      userSessions.set(ctx.from.id, { step: 'catat_wallet', amount, title, type: 'expense' });
      
      const userId = await getUserId(ctx);
      if (!userId) return ctx.reply('Akun belum terhubung.');
      
      const { data: wallets } = await supabase.from('wallets').select('id, name').eq('user_id', userId);
      if (!wallets || wallets.length === 0) return ctx.reply('❌ Kamu belum punya dompet.');
      
      const buttons = wallets.map(w => [Markup.button.callback(`🏦 ${w.name}`, `catat_wallet_${w.id}_${w.name}`)]);
      buttons.push([btnCancel]);

      return ctx.reply(`Terdeteksi Transaksi:\nKeterangan: <b>${escapeHTML(title)}</b>\nNominal: <b>${formatRp(amount)}</b>\n\nPilih akun yang digunakan:`, {
        parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons)
      });
    }
  }
  
  startCatatFlow(ctx);
});

bot.action('menu_catat', async (ctx) => { await ctx.answerCbQuery(); startCatatFlow(ctx); });

async function startCatatFlow(ctx: KaviaContext) {
  if (!ctx.from) return;
  userSessions.set(ctx.from.id, { step: 'catat_type' });
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📉 Pengeluaran', 'catat_type_expense'), Markup.button.callback('📈 Pemasukan', 'catat_type_income')],
    [btnCancel]
  ]);
  await safeEdit(ctx, 'Silakan pilih jenis transaksi yang ingin dicatat:', keyboard);
}

bot.action('catat_type_expense', async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.from) return;
  userSessions.set(ctx.from.id, { ...userSessions.get(ctx.from.id), step: 'catat_amount', type: 'expense' });
  await safeEdit(ctx, '📉 <b>Pengeluaran Baru</b>\n\nKetik nominal dan keterangan (Cth: <code>25000 Makan</code>):', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btnCancel]]) });
});

bot.action('catat_type_income', async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.from) return;
  userSessions.set(ctx.from.id, { ...userSessions.get(ctx.from.id), step: 'catat_amount', type: 'income' });
  await safeEdit(ctx, '📈 <b>Pemasukan Baru</b>\n\nKetik nominal dan keterangan (Cth: <code>500000 Gaji</code>):', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btnCancel]]) });
});

bot.on('text', async (ctx: KaviaContext, next) => {
  if (!ctx.from || !ctx.message || !('text' in ctx.message)) return next();
  const session = userSessions.get(ctx.from.id);
  const text = ctx.message.text;
  if (text.startsWith('/')) return next();

  if (session && session.step === 'catat_amount') {
    const args = text.split(' ');
    const amount = parseAmount(args[0]);
    const title = args.slice(1).join(' ');

    if (amount <= 0 || !title) return ctx.reply('❌ Format salah. Cth: <code>25000 Makan</code>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btnCancel]]) });

    userSessions.set(ctx.from.id, { ...session, step: 'catat_wallet', amount, title });
    const { data: wallets } = await supabase.from('wallets').select('id, name').eq('user_id', ctx.state.userId);
    
    if (!wallets || wallets.length === 0) return ctx.reply('❌ Kamu belum punya dompet.');
    const buttons = wallets.map(w => [Markup.button.callback(`🏦 ${w.name}`, `catat_wallet_${w.id}_${w.name}`)]);
    buttons.push([btnCancel]);

    return ctx.reply(`Pilih akun/dompet:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  }
  return next();
});

bot.action(/^catat_wallet_(.+)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.from) return;
  const walletId = ctx.match[1]; const walletName = ctx.match[2];
  const session = userSessions.get(ctx.from.id);
  
  userSessions.set(ctx.from.id, { ...session, step: 'catat_review', walletId, walletName });
  
  const msg = `
<b>KONFIRMASI TRANSAKSI</b>
Jenis: <b>${session?.type === 'income' ? '📈 Pemasukan' : '📉 Pengeluaran'}</b>
Keterangan: <b>${escapeHTML(session?.title || '')}</b>
Nominal: <b>${formatRp(session?.amount || 0)}</b>
Akun: <b>${walletName}</b>
  `;
  await safeEdit(ctx, msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
    [Markup.button.callback('✅ Konfirmasi', 'catat_confirm')],
    [Markup.button.callback('❌ Batal', 'nav_cancel')]
  ]) });
});

bot.action('catat_confirm', requireLink, async (ctx: KaviaContext) => {
  await ctx.answerCbQuery();
  if (!ctx.from) return;
  const session = userSessions.get(ctx.from.id);
  if (!session || session.step !== 'catat_review') return;

  const userId = ctx.state.userId as string;
  const { data: wallet } = await supabase.from('wallets').select('balance').eq('id', session.walletId).single();
  if (!wallet) return ctx.reply('Dompet error.');

  const isIncome = session.type === 'income';
  const newBalance = isIncome ? wallet.balance + (session.amount || 0) : wallet.balance - (session.amount || 0);

  await supabase.from('wallets').update({ balance: newBalance }).eq('id', session.walletId);
  const { data: tx } = await supabase.from('transactions').insert({
    user_id: userId, title: session.title, category: isIncome ? 'Pemasukan' : 'Pengeluaran',
    amount: session.amount, is_income: isIncome, date: new Date().toISOString(), wallet_id: session.walletId
  }).select('id').single();

  await supabase.from('audit_logs').insert({ user_id: userId, action: 'CREATE_TX', details: `TxID: ${tx?.id}, Amount: ${session.amount}` });

  userSessions.set(ctx.from.id, { ...session, step: 'done', lastTxId: tx?.id });

  const msg = `
✅ <b>Transaksi Berhasil</b>
ID: <code>${tx?.id.split('-')[0]}</code>
${session.title}: <b>${formatRp(session.amount || 0)}</b>
Akun: <b>${session.walletName}</b>
Saldo: <code>${formatRp(wallet.balance)}</code> ➔ <code>${formatRp(newBalance)}</code>
  `;
  await safeEdit(ctx, msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
    [Markup.button.callback('↩️ Undo', 'tx_undo'), Markup.button.callback('🏠 Menu', 'nav_menu')]
  ]) });
});

// ==========================================
// 7. /transfer — TRANSFER (Atomic via RPC)
// ==========================================
bot.command('transfer', (ctx) => startTransfer(ctx));
bot.action('menu_transfer', async (ctx) => { await ctx.answerCbQuery(); startTransfer(ctx); });

async function startTransfer(ctx: KaviaContext) {
  const userId = await getUserId(ctx);
  if (!userId) return;
  const { data: wallets } = await supabase.from('wallets').select('id, name').eq('user_id', userId);
  if (!wallets || wallets.length < 2) return await safeEdit(ctx, 'Butuh minimal 2 akun untuk transfer.', Markup.inlineKeyboard([[btnBackToMenu]]));

  if (!ctx.from) return;
  userSessions.set(ctx.from.id, { step: 'transfer_from' });
  const buttons = wallets.map(w => [Markup.button.callback(`🏦 ${w.name}`, `tr_from_${w.id}_${w.name}`)]);
  buttons.push([btnCancel]);
  await safeEdit(ctx, 'Pilih akun <b>ASAL</b>:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

bot.action(/^tr_from_(.+)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.from) return;
  const fromId = ctx.match[1]; const fromName = ctx.match[2];
  userSessions.set(ctx.from.id, { ...userSessions.get(ctx.from.id), step: 'transfer_to', fromId, fromName });

  const { data: wallets } = await supabase.from('wallets').select('id, name').neq('id', fromId);
  const buttons = wallets!.map(w => [Markup.button.callback(`🏦 ${w.name}`, `tr_to_${w.id}_${w.name}`)]);
  buttons.push([btnCancel]);
  await safeEdit(ctx, `Dari: <b>${fromName}</b>\nPilih akun <b>TUJUAN</b>:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

bot.action(/^tr_to_(.+)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.from) return;
  const toId = ctx.match[1]; const toName = ctx.match[2];
  userSessions.set(ctx.from.id, { ...userSessions.get(ctx.from.id), step: 'transfer_amount', toId, toName });
  await safeEdit(ctx, `Dari: <b>${userSessions.get(ctx.from.id)?.fromName}</b> ➔ Ke: <b>${toName}</b>\nKetik nominal transfer:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btnCancel]]) });
});

bot.on('text', async (ctx: KaviaContext, next) => {
  if (!ctx.from || !ctx.message || !('text' in ctx.message)) return next();
  const session = userSessions.get(ctx.from.id);
  if (session && session.step === 'transfer_amount' && !ctx.message.text.startsWith('/')) {
    const amount = parseAmount(ctx.message.text);
    if (amount <= 0) return ctx.reply('❌ Nominal tidak valid.', Markup.inlineKeyboard([[btnCancel]]));

    const { data: wFrom } = await supabase.from('wallets').select('name, balance').eq('id', session.fromId).single();
    if (!wFrom || wFrom.balance < amount) return ctx.reply('❌ Saldo tidak mencukupi.', Markup.inlineKeyboard([[btnBackToMenu]]));

    userSessions.set(ctx.from.id, { ...session, step: 'transfer_review', amount });
    const msg = `
<b>KONFIRMASI TRANSFER</b>
Dari: <b>${session.fromName}</b>
Ke: <b>${session.toName}</b>
Nominal: <b>${formatRp(amount)}</b>
    `;
    return ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('✅ Konfirmasi', 'tr_confirm')],
      [Markup.button.callback('❌ Batal', 'nav_cancel')]
    ]) });
  }
  return next();
});

bot.action('tr_confirm', requireLink, async (ctx: KaviaContext) => {
  await ctx.answerCbQuery('Memproses...');
  if (!ctx.from) return;
  const session = userSessions.get(ctx.from.id);
  if (!session || session.step !== 'transfer_review') return;

  const userId = ctx.state.userId as string;
  
  const { error } = await supabase.rpc('process_transfer', {
    p_from_id: session.fromId, p_to_id: session.toId, p_amount: session.amount
  });

  if (error) return ctx.reply('❌ Gagal transfer: ' + error.message);

  await supabase.from('transactions').insert([
    { user_id: userId, title: `Transfer ke ${session.toName}`, category: "Transfer", amount: session.amount, is_income: false, date: new Date().toISOString(), wallet_id: session.fromId },
    { user_id: userId, title: `Transfer dari ${session.fromName}`, category: "Transfer", amount: session.amount, is_income: true, date: new Date().toISOString(), wallet_id: session.toId }
  ]);
  
  await supabase.from('audit_logs').insert({ user_id: userId, action: 'TRANSFER', details: `From: ${session.fromId}, To: ${session.toId}, Amount: ${session.amount}` });

  userSessions.delete(ctx.from.id);
  await safeEdit(ctx, `✅ <b>Transfer Berhasil!</b>\n${session.fromName} ➔ ${session.toName}\nNominal: <b>${formatRp(session.amount!)}</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btnBackToMenu]]) });
});

// ==========================================
// 8. OCR SYSTEM
// ==========================================
bot.action('menu_ocr', async (ctx) => {
  await ctx.answerCbQuery();
  await safeEdit(ctx, '📷 <b>SCAN STRUK</b>\nKirimkan foto struk belanja ke chat ini.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btnBackToMenu]]) });
});

bot.on('photo', requireLink, async (ctx: KaviaContext) => {
  if (!ctx.message || !('photo' in ctx.message)) return;
  const loadingMsg = await ctx.reply('🔍 Sedang membaca struk...');
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const buffer = Buffer.from(await (await fetch(fileLink.href)).arrayBuffer());
    const result = await Tesseract.recognize(buffer, 'ind+eng');
    
    const numbers = result.data.text.match(/\d{1,3}(?:\.\d{3})*(?:,\d+)?/g);
    let maxNumber = 0;
    if (numbers) maxNumber = Math.max(...numbers.map(n => parseInt(n.replace(/\./g, '').replace(/,/g, ''))));

    if (maxNumber === 0) return ctx.telegram.editMessageText(ctx.chat!.id, loadingMsg.message_id, undefined, '❌ Gagal membaca nominal struk.', Markup.inlineKeyboard([[btnBackToMenu]]));

    if (!ctx.from) return;
    userSessions.set(ctx.from.id, { step: 'catat_wallet', type: 'expense', amount: maxNumber, title: 'Belanja (OCR)' });

    const { data: wallets } = await supabase.from('wallets').select('id, name').eq('user_id', ctx.state.userId);
    const buttons = wallets?.map(w => [Markup.button.callback(`🏦 ${w.name}`, `catat_wallet_${w.id}_${w.name}`)]) || [];
    buttons.push([btnCancel]);

    ctx.telegram.editMessageText(ctx.chat!.id, loadingMsg.message_id, undefined, `Total: <b>${formatRp(maxNumber)}</b>\nPilih akun:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  } catch (err) {
    // FIX 2: Menambahkan console.error agar variabel err terpakai
    console.error("OCR Error:", err);
    ctx.telegram.editMessageText(ctx.chat!.id, loadingMsg.message_id, undefined, '❌ Gagal memproses gambar.', Markup.inlineKeyboard([[btnBackToMenu]]));
  }
});

// ==========================================
// 9. /saldo — MULTI-ACCOUNT
// ==========================================
bot.command('saldo', requireLink, showSaldo);
bot.action('menu_saldo', requireLink, async (ctx) => { await ctx.answerCbQuery(); showSaldo(ctx); });

async function showSaldo(ctx: KaviaContext) {
  const userId = ctx.state.userId as string;
  const { data: wallets } = await supabase.from('wallets').select('*').eq('user_id', userId);
  if (!wallets || wallets.length === 0) return ctx.reply('Belum ada akun.');

  let bank = ''; let ewallet = ''; let cash = ''; let total = 0;
  wallets.forEach(w => {
    const str = `<b>${escapeHTML(w.name)}</b> — <code>${formatRp(w.balance)}</code>\n`;
    if (w.type === 'Bank') bank += str;
    else if (w.type === 'E-Wallet') ewallet += str;
    else cash += str;
    total += w.balance;
  });

  const msg = `
<b>DAFTAR AKUN KEUANGAN</b>
${bank ? `\n🏦 <b>BANK</b>\n${bank}` : ''}
${ewallet ? `\n📱 <b>E-WALLET</b>\n${ewallet}` : ''}
${cash ? `\n💵 <b>TUNAI</b>\n${cash}` : ''}
━━━━━━━━━━━━━━━━━━━━
<b>Total Saldo:</b> <code>${formatRp(total)}</code>
  `;
  await safeEdit(ctx, msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btnBackToMenu]]) });
}

// ==========================================
// 7. /laporan — LAPORAN KEUANGAN
// ==========================================
bot.command('laporan', requireLink, showLaporan);
bot.action('menu_laporan', requireLink, async (ctx) => { await ctx.answerCbQuery(); showLaporan(ctx); });

async function showLaporan(ctx: KaviaContext) {
  const userId = ctx.state.userId as string;
  const { data: txs } = await supabase.from('transactions').select('amount, is_income, category').eq('user_id', userId);
  if (!txs) return ctx.reply('Gagal mengambil data.');

  const income = txs.filter(t => t.is_income).reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => !t.is_income).reduce((s, t) => s + t.amount, 0);
  const surplus = income - expense;

  const msg = `
<b>LAPORAN KEUANGAN</b>
Pemasukan: <code>${formatRp(income)}</code>
Pengeluaran: <code>${formatRp(expense)}</code>
━━━━━━━━━━━━━━━━━━━━
<b>Surplus:</b> <code>${formatRp(surplus)}</code>
  `;
  await safeEdit(ctx, msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btnBackToMenu]]) });
}

// ==========================================
// 10. /asset — PORTOFOLIO
// ==========================================
bot.command('asset', requireLink, showAsset);
bot.action('menu_asset', requireLink, async (ctx) => { await ctx.answerCbQuery(); showAsset(ctx); });

async function showAsset(ctx: KaviaContext) {
  const userId = ctx.state.userId as string;
  const { data: assets } = await supabase.from('assets').select('*').eq('user_id', userId);
  if (!assets || assets.length === 0) return ctx.reply('Belum ada aset investasi.', Markup.inlineKeyboard([[btnBackToMenu]]));

  let list = ''; let total = 0;
  assets.forEach(a => { list += `<b>${escapeHTML(a.name)}</b> (${a.type}): <code>${formatRp(a.value)}</code>\n`; total += a.value; });

  const msg = `<b>PORTOFOLIO ASET</b>\n\n${list}━━━━━━━━━━━━━━━━━━━━\n<b>Total Aset:</b> <code>${formatRp(total)}</code>`;
  await safeEdit(ctx, msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btnBackToMenu]]) });
}

// ==========================================
// 11. /tabungan — TARGET TABUNGAN
// ==========================================
bot.command('tabungan', requireLink, showSavings);
bot.action('menu_tabungan', requireLink, async (ctx) => { await ctx.answerCbQuery(); showSavings(ctx); });

async function showSavings(ctx: KaviaContext) {
  const userId = ctx.state.userId as string;
  const { data: savings } = await supabase.from('savings_goals').select('*').eq('user_id', userId);
  if (!savings || savings.length === 0) return ctx.reply('Belum ada target tabungan.', Markup.inlineKeyboard([[btnBackToMenu]]));

  let list = '';
  savings.forEach(s => {
    const pct = Math.round((s.current_amount / s.target_amount) * 100);
    list += `<b>${escapeHTML(s.name)}</b>\nTerkumpul: <code>${formatRp(s.current_amount)}</code> / <code>${formatRp(s.target_amount)}</code> (${pct}%)\n\n`;
  });

  const msg = `<b>TARGET TABUNGAN</b>\n\n${list}`;
  await safeEdit(ctx, msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btnBackToMenu]]) });
}

// ==========================================
// 5. /link — TAUTAN & AKUN
// ==========================================
bot.command('link', async (ctx) => {
  if (!ctx.message || !('text' in ctx.message)) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Format salah. Ketik: /link KODE_ANDA');
  const code = args[1].toUpperCase(); const telegramId = ctx.from.id.toString();

  const { data: token } = await supabase.from('link_tokens').select('*').eq('code', code).single();
  if (!token) return ctx.reply('❌ Kode tidak valid.');

  await supabase.from('telegram_links').delete().eq('telegram_id', telegramId);
  await supabase.from('telegram_links').insert({ user_id: token.user_id, telegram_id: telegramId });
  await supabase.from('link_tokens').delete().eq('code', code);
  ctx.reply('✅ Akun berhasil terhubung! Ketik /start untuk melihat Dashboard.');
});

// Global Error Handler
bot.catch((err, ctx) => { console.error(`Error for ${ctx.updateType}`, err); });

bot.launch({ dropPendingUpdates: true }).then(() => console.log('✅ KAVIA FINANCE 2.0 (Enterprise) berjalan!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));