(() => {
  'use strict';
  const { CATEGORIES, parseSlip } = SlipParser;
  const $ = (s) => document.querySelector(s);
  const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  const KEY = 'slipsense.v1';
  const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const fmt = (n) => '฿' + Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---------- storage ----------
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { db = {}; }
  db.items ||= []; db.rules ||= {}; db.settings ||= { auto: true };
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch { toast('พื้นที่เก็บข้อมูลเต็ม – ลองส่งออก CSV แล้วลบรายการเก่า'); }
  }
  const ruleKey = (m) => m.toLowerCase().replace(/\s+/g, '');

  // ---------- view ----------
  let ym = today().slice(0, 7);
  function render() {
    const [y, m] = ym.split('-').map(Number);
    $('#monthLabel').textContent = `${TH_MONTHS[m - 1]} ${y + 543}`;
    const items = db.items.filter((i) => i.date.startsWith(ym)).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    const total = items.reduce((s, i) => s + i.amount, 0);
    $('#totalAmt').textContent = fmt(total);
    $('#totalCnt').textContent = `${items.length} รายการ`;
    const by = {};
    items.forEach((i) => (by[i.category] = (by[i.category] || 0) + i.amount));
    $('#bars').innerHTML = '<h2>แยกตามหมวดหมู่</h2>' + (Object.entries(by).sort((a, b) => b[1] - a[1]).map(([id, v]) => {
      const c = catById[id] || catById.other;
      return `<div class="bar"><div class="lbl"><span>${c.icon} ${c.name}</span><span>${fmt(v)} · ${Math.round(v / total * 100)}%</span></div><div class="t"><i style="width:${v / total * 100}%;background:${c.color}"></i></div></div>`;
    }).join('') || '<p class="muted">ยังไม่มีข้อมูล</p>');
    $('#list').innerHTML = items.map((i) => {
      const c = catById[i.category] || catById.other;
      return `<li data-id="${i.id}"><div class="ic" style="background:${c.color}22">${c.icon}</div><div class="mid"><div class="nm">${esc(i.merchant || c.name)}</div><div class="sub">${c.name} · ${i.date.slice(8)}/${i.date.slice(5, 7)}${i.time ? ' ' + i.time : ''}${i.note ? ' · ' + esc(i.note) : ''}</div></div><div class="amt">${fmt(i.amount)}</div></li>`;
    }).join('');
    $('#empty').hidden = items.length > 0;
    $('#autoSave').checked = !!db.settings.auto;
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500); }
  function shiftMonth(d) { let [y, m] = ym.split('-').map(Number); m += d; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } ym = `${y}-${String(m).padStart(2, '0')}`; render(); }

  // ---------- review / edit dialog ----------
  const dlg = $('#dlg'), form = $('#form');
  form.category.innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  let dlgDone = null;
  function openDialog(d, { isNew, title }) {
    return new Promise((resolve) => {
      $('#dlgTitle').textContent = title;
      form.amount.value = d.amount ?? ''; form.date.value = d.date || today(); form.time.value = d.time || '';
      form.merchant.value = d.merchant || ''; form.category.value = d.category || 'other'; form.note.value = d.note || '';
      form.remember.checked = true;
      $('#thumb').hidden = !d.thumb; if (d.thumb) $('#thumb').src = d.thumb;
      $('#raw').textContent = d.raw || '';
      $('#delBtn').hidden = isNew;
      $('#skipBtn').textContent = isNew ? 'ข้าม' : 'ยกเลิก';
      dlgDone = (action) => {
        dlgDone = null; dlg.close();
        if (action === 'save') {
          resolve({ ...d, amount: parseFloat(form.amount.value), date: form.date.value, time: form.time.value || null,
            merchant: form.merchant.value.trim(), category: form.category.value, note: form.note.value.trim(), remember: form.remember.checked });
        } else resolve(action);
      };
      dlg.showModal();
    });
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); if (form.reportValidity()) dlgDone?.('save'); });
  $('#skipBtn').onclick = () => dlgDone?.('skip');
  $('#delBtn').onclick = () => { if (confirm('ลบรายการนี้?')) dlgDone?.('delete'); };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); dlgDone?.('skip'); });

  function saveItem(d) {
    const { remember, raw, ...item } = d;
    item.id ||= Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const idx = db.items.findIndex((i) => i.id === item.id);
    if (idx >= 0) db.items[idx] = item; else db.items.push(item);
    if (remember && item.merchant && item.merchant.length >= 3) db.rules[ruleKey(item.merchant)] = item.category;
    persist();
  }
  const isDup = (d) => db.items.some((i) => i.id !== d.id && i.amount === d.amount && i.date === d.date && (i.time || '') === (d.time || '') && ruleKey(i.merchant) === ruleKey(d.merchant));

  // ---------- image + OCR ----------
  async function prep(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(2, Math.max(0.5, 1500 / bmp.width), 3000 / bmp.height);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const t = document.createElement('canvas'); const ts = 160 / Math.max(c.width, c.height);
    t.width = Math.round(c.width * ts); t.height = Math.round(c.height * ts);
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    const img = ctx.getImageData(0, 0, c.width, c.height), p = img.data;
    for (let i = 0; i < p.length; i += 4) { // ขาวดำ + เพิ่มคอนทราสต์ ช่วยให้ OCR แม่นขึ้น
      const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      const v = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128));
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    bmp.close?.();
    return { canvas: c, thumb: t.toDataURL('image/jpeg', 0.6) };
  }

  let worker, workerP, onProg = () => {};
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('โหลดไลบรารี OCR ไม่ได้ (ต้องเชื่อมเน็ตครั้งแรก)')); document.head.append(s); }); }
  function getWorker() {
    return (workerP ||= (async () => {
      if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      worker = await Tesseract.createWorker('tha+eng', 1, { logger: (m) => onProg(m) });
      return worker;
    })().catch((e) => { workerP = null; throw e; }));
  }

  function setProgress(text, pct) {
    $('#progress').hidden = text == null;
    if (text != null) { $('#progressText').textContent = text; $('#progressBar').style.width = (pct || 0) + '%'; }
  }

  let busy = false;
  async function handleFiles(files) {
    if (busy || !files.length) return;
    busy = true;
    let saved = 0, skipped = 0, dups = 0, failed = 0;
    try {
      for (let n = 0; n < files.length; n++) {
        const label = `สลิป ${n + 1}/${files.length}`;
        try {
          setProgress(`${label}: กำลังเตรียมรูป…`, 0);
          const { canvas, thumb } = await prep(files[n]);
          setProgress(`${label}: กำลังโหลดตัวอ่านภาษาไทย (ครั้งแรกอาจนาน)…`, 0);
          onProg = (m) => { if (m.status === 'recognizing text') setProgress(`${label}: กำลังอ่านข้อความ ${Math.round(m.progress * 100)}%`, m.progress * 100); };
          const w = await getWorker();
          const { data } = await w.recognize(canvas);
          setProgress(null);
          const r = parseSlip(data.text);
          const learned = r.merchant && db.rules[ruleKey(r.merchant)];
          const draft = { amount: r.amount, date: r.date, time: r.time, merchant: r.merchant, category: learned || r.category, thumb, raw: data.text, createdAt: Date.now() };
          if (db.settings.auto && draft.amount > 0 && draft.date) {
            if (isDup(draft)) { dups++; continue; }
            saveItem({ ...draft, remember: false }); saved++;
          } else {
            const res = await openDialog(draft, { isNew: true, title: `ตรวจสอบสลิป ${n + 1}/${files.length}` });
            if (res === 'skip') skipped++; else if (isDup(res)) dups++; else { saveItem(res); saved++; }
          }
          if (draft.date) ym = draft.date.slice(0, 7);
          render();
        } catch (e) {
          console.error(e); failed++;
          if (/OCR/.test(e.message)) { toast(e.message); break; }
        }
      }
    } finally { busy = false; setProgress(null); render(); }
    toast(`บันทึก ${saved} รายการ` + (dups ? ` · ซ้ำ ${dups}` : '') + (skipped ? ` · ข้าม ${skipped}` : '') + (failed ? ` · อ่านไม่ได้ ${failed}` : ''));
  }

  // ---------- events ----------
  $('#fileInput').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; handleFiles(f); });
  $('#prev').onclick = () => shiftMonth(-1); $('#next').onclick = () => shiftMonth(1);
  $('#autoSave').onchange = (e) => { db.settings.auto = e.target.checked; persist(); };
  $('#addBtn').onclick = async () => {
    const res = await openDialog({ date: ym === today().slice(0, 7) ? today() : ym + '-01', category: 'other' }, { isNew: true, title: 'เพิ่มรายการเอง' });
    if (res !== 'skip') { saveItem(res); ym = res.date.slice(0, 7); render(); }
  };
  $('#list').addEventListener('click', async (e) => {
    const li = e.target.closest('li'); if (!li) return;
    const it = db.items.find((i) => i.id === li.dataset.id); if (!it) return;
    const res = await openDialog(it, { isNew: false, title: 'แก้ไขรายการ' });
    if (res === 'delete') { db.items = db.items.filter((i) => i.id !== it.id); persist(); }
    else if (res !== 'skip') saveItem(res);
    render();
  });
  $('#exportBtn').onclick = () => {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [['วันที่', 'เวลา', 'ผู้รับ/ร้านค้า', 'หมวดหมู่', 'จำนวนเงิน', 'หมายเหตุ']].concat(
      [...db.items].sort((a, b) => a.date.localeCompare(b.date)).map((i) => [i.date, i.time || '', i.merchant, (catById[i.category] || catById.other).name, i.amount.toFixed(2), i.note || '']));
    const blob = new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `slips-${today()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
