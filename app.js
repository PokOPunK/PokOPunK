(() => {
  'use strict';
  const { CATEGORIES } = SlipParser;
  const $ = (s) => document.querySelector(s);
  const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const fmt = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const PASS_KEY = 'slipsense.pass', OLD_KEY = 'slipsense.v1';

  // ---------- API ----------
  let pass = localStorage.getItem(PASS_KEY) || '';
  class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  async function api(path, { method = 'GET', body, raw } = {}) {
    const res = await fetch('api/' + path, { method, headers: { 'x-slip-pass': pass, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) { showLogin('รหัสผ่านไม่ถูกต้อง'); throw new ApiError(401, 'รหัสผ่านไม่ถูกต้อง'); }
    if (raw && res.ok) return res;
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, j.error || `เซิร์ฟเวอร์ตอบผิดพลาด (${res.status})`);
    return j;
  }

  // ---------- state + view ----------
  let ym = today().slice(0, 7), items = [], review = [];
  function toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); }
  function setProgress(text, pct) {
    $('#progress').hidden = text == null;
    if (text != null) { $('#progressText').textContent = text; $('#progressBar').style.width = (pct || 0) + '%'; }
  }
  function showLogin(msg) { $('#login').hidden = false; $('#app').hidden = true; $('#loginMsg').textContent = msg || ''; $('#passInput').focus(); }

  async function load() {
    try { ({ items, review } = await api('items?month=' + ym)); $('#login').hidden = true; $('#app').hidden = false; render(); }
    catch (e) { if (e.status !== 401) toast(e.message); }
  }
  function render() {
    const [y, m] = ym.split('-').map(Number);
    $('#monthLabel').textContent = `${TH_MONTHS[m - 1]} ${y + 543}`;
    const excluded = (i) => (catById[i.category] || {}).excluded;
    const counted = items.filter((i) => !excluded(i) && i.amount);
    const total = counted.reduce((s, i) => s + i.amount, 0);
    const ccSum = items.filter((i) => excluded(i)).reduce((s, i) => s + (i.amount || 0), 0);
    $('#totalAmt').textContent = fmt(total);
    $('#totalCnt').textContent = `${counted.length} รายการ`;
    $('#ccNote').textContent = ccSum ? `ชำระบัตรเครดิต ${fmt(ccSum)} (ไม่นับรวม เพื่อไม่ให้ซ้ำกับรายการที่รูด)` : '';
    $('#reviewBar').hidden = !review.length;
    $('#reviewBar').textContent = `⚠️ มี ${review.length} รายการที่อ่านไม่ครบ รอคุณตรวจ – แตะเพื่อตรวจ`;
    const by = {};
    counted.forEach((i) => (by[i.category] = (by[i.category] || 0) + i.amount));
    $('#bars').innerHTML = '<h2>แยกตามหมวดหมู่</h2>' + (Object.entries(by).sort((a, b) => b[1] - a[1]).map(([id, v]) => {
      const c = catById[id] || catById.other, pct = v / (total || 1) * 100;
      return `<div class="bar"><div class="lbl"><span>${c.icon} ${c.name}</span><span>${fmt(v)} · ${Math.round(pct)}%</span></div><div class="t"><i style="width:${pct}%;background:${c.color}"></i></div></div>`;
    }).join('') || '<p class="muted">ยังไม่มีข้อมูล</p>');
    $('#list').innerHTML = items.map((i) => {
      const c = catById[i.category] || catById.other;
      return `<li data-id="${i.id}" class="${i.needsReview ? 'rev' : ''}"><div class="ic" style="background:${c.color}22">${i.needsReview ? '⚠️' : c.icon}</div><div class="mid"><div class="nm">${esc(i.merchant || c.name)}</div><div class="sub">${c.name} · ${i.date.slice(8)}/${i.date.slice(5, 7)}${i.time ? ' ' + i.time : ''}${i.note ? ' · ' + esc(i.note) : ''}${i.needsReview ? ' · รอตรวจ' : ''}</div></div><div class="amt">${i.amount == null ? '–' : fmt(i.amount)}</div></li>`;
    }).join('');
    $('#empty').hidden = items.length > 0;
    const old = oldData();
    $('#migrate').hidden = !old.items.length;
    $('#migrate').textContent = `⬆︎ ย้ายข้อมูลเดิมในเครื่องนี้ ${old.items.length} รายการขึ้นเซิร์ฟเวอร์`;
  }
  function shiftMonth(d) { let [y, m] = ym.split('-').map(Number); m += d; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } ym = `${y}-${String(m).padStart(2, '0')}`; load(); }

  // ---------- dialog ----------
  const dlg = $('#dlg'), form = $('#form');
  form.category.innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  let dlgDone = null;
  function openDialog(d, title) {
    return new Promise((resolve) => {
      $('#dlgTitle').textContent = title;
      form.amount.value = d.amount ?? ''; form.date.value = d.date || today(); form.time.value = d.time || '';
      form.merchant.value = d.merchant || ''; form.category.value = d.category || 'other'; form.note.value = d.note || '';
      form.remember.checked = true;
      $('#thumb').hidden = !d.thumb; if (d.thumb) $('#thumb').src = d.thumb;
      $('#delBtn').hidden = !d.id;
      dlgDone = (action) => {
        dlgDone = null; dlg.close();
        resolve(action !== 'save' ? action : { item: { ...d, amount: parseFloat(form.amount.value), date: form.date.value, time: form.time.value || null,
          merchant: form.merchant.value.trim(), category: form.category.value, note: form.note.value.trim() }, remember: form.remember.checked });
      };
      dlg.showModal();
    });
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); if (form.reportValidity()) dlgDone?.('save'); });
  $('#skipBtn').onclick = () => dlgDone?.('skip');
  $('#delBtn').onclick = () => { if (confirm('ลบรายการนี้?')) dlgDone?.('delete'); };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); dlgDone?.('skip'); });

  /** เปิดหน้าแก้ไข แล้วบันทึก/ลบตามที่เลือก */
  async function edit(it, title) {
    const res = await openDialog(it, title);
    try {
      if (res === 'delete') await api('items/' + it.id, { method: 'DELETE' });
      else if (res !== 'skip') {
        const saved = it.id ? await api('items/' + it.id, { method: 'PUT', body: res })
          : await api('items', { method: 'POST', body: res });
        if (!it.id && saved.item) ym = saved.item.date.slice(0, 7);
      }
    } catch (e) { if (e.status !== 401) toast(e.message); }
    await load();
    return res;
  }

  // ---------- สแกน ----------
  async function prep(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const draw = (maxSide, q) => {
      const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    };
    const out = { image: draw(1600, 0.85), thumb: draw(160, 0.6) };
    bmp.close?.();
    return out;
  }
  let busy = false;
  async function handleFiles(files) {
    if (busy || !files.length) return;
    busy = true;
    const n = { saved: 0, review: 0, dup: 0, notslip: 0, fail: 0 }, toReview = [];
    try {
      for (let k = 0; k < files.length; k++) {
        setProgress(`สลิป ${k + 1}/${files.length}: กำลังอ่าน…`, (k / files.length) * 100);
        try {
          const { image, thumb } = await prep(files[k]);
          const r = await api('ingest', { method: 'POST', body: { image_b64: image.split(',')[1], mime: 'image/jpeg', thumb, source: 'web' } });
          n[r.status]++;
          if (r.status === 'review') toReview.push(r.item);
          if (r.item && r.status === 'saved') ym = r.item.date.slice(0, 7);
        } catch (e) {
          n.fail++; console.error(e);
          if (e.status === 401) break;
          toast('อ่านไม่ได้: ' + e.message, 8000);
        }
      }
    } finally { busy = false; setProgress(null); }
    await load();
    toast(`บันทึก ${n.saved}` + (n.review ? ` · รอตรวจ ${n.review}` : '') + (n.dup ? ` · ซ้ำ ${n.dup}` : '') + (n.notslip ? ` · ไม่ใช่สลิป ${n.notslip}` : '') + (n.fail ? ` · ผิดพลาด ${n.fail}` : ''), 6000);
    for (const it of toReview) await edit(it, 'ตรวจสลิปที่อ่านไม่ครบ');
  }

  // ---------- ย้ายข้อมูลเดิมจาก localStorage ----------
  function oldData() { try { const d = JSON.parse(localStorage.getItem(OLD_KEY)) || {}; return { items: d.items || [], rules: d.rules || {} }; } catch { return { items: [], rules: {} }; } }
  $('#migrate').onclick = async () => {
    const old = oldData();
    try {
      const r = await api('import', { method: 'POST', body: old });
      localStorage.setItem(OLD_KEY + '.migrated', localStorage.getItem(OLD_KEY)); localStorage.removeItem(OLD_KEY);
      toast(`ย้ายแล้ว ${r.added} รายการ` + (r.dups ? ` · ซ้ำ ${r.dups}` : '') + (r.bad ? ` · ข้อมูลเสีย ${r.bad}` : ''));
      load();
    } catch (e) { if (e.status !== 401) toast(e.message); }
  };

  // ---------- events ----------
  $('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); pass = $('#passInput').value; localStorage.setItem(PASS_KEY, pass); load(); });
  $('#logout').onclick = () => { localStorage.removeItem(PASS_KEY); pass = ''; showLogin(); };
  $('#fileInput').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; handleFiles(f); });
  $('#prev').onclick = () => shiftMonth(-1); $('#next').onclick = () => shiftMonth(1);
  $('#addBtn').onclick = () => edit({ date: ym === today().slice(0, 7) ? today() : ym + '-01', category: 'other' }, 'เพิ่มรายการเอง');
  $('#list').addEventListener('click', (e) => {
    const li = e.target.closest('li'); const it = li && items.find((i) => i.id === li.dataset.id);
    if (it) edit(it, it.needsReview ? 'ตรวจสลิปที่อ่านไม่ครบ' : 'แก้ไขรายการ');
  });
  $('#reviewBar').onclick = async () => {
    const first = review[0]; if (!first) return;
    if (first.date.slice(0, 7) !== ym) { ym = first.date.slice(0, 7); await load(); }
    const it = items.find((i) => i.id === first.id); if (it) edit(it, 'ตรวจสลิปที่อ่านไม่ครบ');
  };
  $('#exportBtn').onclick = async () => {
    try {
      const blob = await (await api('export.csv', { raw: true })).blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `slips-${today()}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { if (e.status !== 401) toast(e.message); }
  };

  // ต้องเปิดจากเซิร์ฟเวอร์ของเรา (ไม่ใช่ GitHub Pages)
  fetch('api/health').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
    if (!j || !j.slip) { $('#login').hidden = true; $('#app').hidden = true; $('#noServer').hidden = false; return; }
    if (!pass) showLogin(); else load();
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
