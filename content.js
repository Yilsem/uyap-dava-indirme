// UYAP Dava İndirme: açık davanın evrak ağacını açar, evrakları 15 eş zamanlı indirir,
// UYAP'taki klasör yapısıyla tek ZIP olarak verir. "Tüm davalarımı indir" her yargı türünü
// sorgular ve listedeki her davayı sırayla ZIP olarak indirir.
(() => {
  if (window.__uyapZipYuklendi) return;
  window.__uyapZipYuklendi = true;

  const ESZAMANLI = 20;
  const BASLATMA_ARASI_MS = 200; // iki indirmenin başlaması arasında en az 0,2 sn
  const EN_YAVAS_ARA_MS = 3000; // UYAP hata verirse aralık bu sınıra kadar kendiliğinden açılır
  const DENEME = 3;
  // UYAP'ın "kaydet" adresi: belgeyi asıl biçimiyle verir. Görüntüleme adresi (view_document_brd)
  // büyük evrakta dosya yerine "evrakın boyutu çok büyük" yazısı döndürüyor (canlı, 7 Kasım 2026).
  const INDIR = "https://vatandas.uyap.gov.tr/main/jsp/download_document_brd.uyap";
  const OTO_ANAHTAR = "uyapZipOtomatik";
  const BITEN_ANAHTAR = "uyapZipBitenDavalar";
  // Chrome arka plandaki sekmenin setTimeout'unu dakikada bire kadar yavaşlatıyor (canlı ölçüm:
  // sekme arkadayken 3 sn'de bir yerine ~23 sn'de bir evrak). Worker zamanlayıcısı bundan etkilenmez.
  const sleep = (() => {
    try {
      const kod = "onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)";
      const w = new Worker(URL.createObjectURL(new Blob([kod], { type: "text/javascript" })));
      const bekleyen = new Map();
      let n = 0;
      w.onmessage = (e) => { const f = bekleyen.get(e.data); bekleyen.delete(e.data); f && f(); };
      return (ms) => new Promise((r) => { const id = ++n; bekleyen.set(id, r); w.postMessage({ id, ms }); });
    } catch {
      return (ms) => new Promise((r) => setTimeout(r, ms));
    }
  })();

  let calisiyor = false;
  let toplu = false;
  let iptal = false;
  let sonImza = "";

  // ---------- panel ----------
  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#0f3d63;color:#fff;" +
    "font:14px/1.4 Segoe UI,Arial,sans-serif;padding:10px 12px;border-radius:10px;box-shadow:0 4px 16px #0006;" +
    "max-width:340px;display:none";
  const dugme = (id, renk, yazi, ek = "") =>
    `<button id="${id}" style="min-height:44px;padding:0 12px;border:0;border-radius:8px;background:${renk};cursor:pointer;font-weight:600;${ek}">${yazi}</button>`;
  panel.innerHTML =
    '<div style="font-weight:600;margin-bottom:6px">UYAP Dava İndirme</div>' +
    '<div id="uz-toplu-durum" style="font-size:12px;opacity:.9"></div>' +
    '<div id="uz-durum">Hazır.</div>' +
    '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
    dugme("uz-basla", "#2ecc71", "Bu davayı ZIP indir", "color:#032") +
    dugme("uz-tumu", "#f1c40f", "Tüm davalarımı indir", "color:#320") +
    dugme("uz-iptal", "#e74c3c", "Durdur", "color:#fff;display:none") +
    "</div>" +
    '<label style="display:block;margin-top:6px;font-size:12px"><input type="checkbox" id="uz-oto"> Davayı açınca kendiliğinden başla</label>' +
    '<a id="uz-sifirla" href="#" style="display:block;margin-top:4px;font-size:11px;color:#9cf">İndirilmiş davalar listesini sıfırla</a>';
  const ekle = () => document.body && !panel.isConnected && document.body.appendChild(panel);
  const $ = (id) => panel.querySelector("#" + id);
  const durum = (t) => ($("uz-durum").textContent = t);
  const topluDurum = (t) => ($("uz-toplu-durum").textContent = t);

  const sakla = {
    al(k, v) { try { const x = localStorage.getItem(k); return x === null ? v : JSON.parse(x); } catch { return v; } },
    koy(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let oto = sakla.al(OTO_ANAHTAR, true) !== false;
  $("uz-oto").checked = oto;
  $("uz-oto").onchange = (e) => { oto = e.target.checked; sakla.koy(OTO_ANAHTAR, oto); };
  $("uz-basla").onclick = () => basla();
  $("uz-tumu").onclick = () => tumDavalar();
  $("uz-iptal").onclick = () => { iptal = true; durum("Durduruluyor…"); };
  $("uz-sifirla").onclick = (e) => { e.preventDefault(); sakla.koy(BITEN_ANAHTAR, []); topluDurum("İndirilmiş davalar listesi sıfırlandı."); };
  function dugmeler(calisma) {
    $("uz-basla").style.display = calisma ? "none" : "";
    $("uz-tumu").style.display = calisma ? "none" : "";
    $("uz-iptal").style.display = calisma ? "" : "none";
  }

  // ---------- ağaç ----------
  const metin = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
  // Dava penceresi açıksa ağacı onun Evrak sekmesinde ara; önceki davanın gizli ağacı karışmasın.
  const agacKoku = () => document.querySelector("#dosya_evrak_bilgileri_tab") || document;
  const evrakEls = () => [...agacKoku().querySelectorAll("[evrak_id]")];
  const klasorEls = () => [...agacKoku().querySelectorAll("span.folder")];

  async function durulmayiBekle(enCok = 20000) {
    const t0 = Date.now();
    let once = -1, sabit = 0;
    while (sabit < 3 && Date.now() - t0 < enCok) {
      const n = evrakEls().length + klasorEls().length;
      sabit = n === once ? sabit + 1 : 0;
      once = n;
      await sleep(400);
    }
  }

  async function agaciAc() {
    const tiklanan = new WeakSet();
    for (let tur = 0; tur < 40 && !iptal; tur++) {
      let yeni = 0;
      for (const h of agacKoku().querySelectorAll(".expandable-hitarea, .hitarea.expandable")) {
        if (tiklanan.has(h) || h.offsetParent === null) continue;
        tiklanan.add(h); h.click(); yeni++;
      }
      for (const f of klasorEls()) {
        if (tiklanan.has(f) || f.offsetParent === null) continue;
        const li = f.closest("li");
        // İçi zaten yüklüyse tıklama (kapatıp açmasın).
        if (li && li.querySelector(":scope > ul > li")) { tiklanan.add(f); continue; }
        tiklanan.add(f); f.click(); yeni++;
        await sleep(150);
      }
      await durulmayiBekle();
      if (yeni === 0) break;
      durum(`Klasörler açılıyor… ${evrakEls().length} evrak görüldü`);
    }
  }

  function temizAd(s) {
    s = (s || "").replace(/\//g, "-").replace(/[\\:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
    return (s || "adsiz").slice(0, 120);
  }

  function yolu(el) {
    const parcalar = [];
    let li = el.closest("li");
    li = li && li.parentElement ? li.parentElement.closest("li") : null; // evrakın kendi li'si hariç
    while (li) {
      const klasor = li.querySelector(":scope > span.folder, :scope > .folder");
      const anaEvrak = li.querySelector(":scope > span[evrak_id], :scope > span.file");
      const ad = metin(klasor) || metin(anaEvrak);
      if (ad) parcalar.unshift(temizAd(ad));
      li = li.parentElement ? li.parentElement.closest("li") : null;
    }
    return parcalar;
  }

  // Açık davanın bilgisi UYAP sayfasında window.dosya_bilgileri'nde (eklenti MAIN dünyada çalışır).
  function dosyaBilgi() {
    const db = window.dosya_bilgileri || {};
    if (!db.dosyaId) throw new Error("Açık davanın kimliği bulunamadı (dosya_bilgileri yok)");
    // dosya_bilgileri.yargiTuru boş gelebiliyor (canlı, 7 Kasım 2026); sorgu sayfasındaki seçim esas.
    // 0 (Ceza) geçerli bir değer; "|| 1" ile ezilmemeli.
    let yt = db.yargiTuru;
    if (yt === undefined || yt === null || yt === "") yt = document.querySelector("#yargiTuru")?.value ?? "1";
    return { dosyaId: db.dosyaId, yargiTuru: yt, ad: [db.birimAdi, db.dosyaNo].filter(Boolean).join(" ") };
  }

  function evraklariTopla() {
    const gorulen = new Set();
    const liste = [];
    for (const el of evrakEls()) {
      const id = el.getAttribute("evrak_id");
      if (!id) continue;
      const yol = yolu(el);
      const ad = temizAd(metin(el) || el.getAttribute("title") || "evrak_" + id);
      const anahtar = id + "|" + yol.join("/") + "|" + ad;
      if (gorulen.has(anahtar)) continue;
      gorulen.add(anahtar);
      liste.push({ id, yol, ad });
    }
    return liste;
  }

  // ---------- indirme ----------
  function uzanti(u8, cd) {
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd || "");
    if (m) {
      let ad = m[1];
      try { ad = decodeURIComponent(ad); } catch {}
      const e = /\.([a-z0-9]{2,5})$/i.exec(ad);
      if (e) return e[1].toLowerCase();
    }
    const b = u8;
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
    if (b[0] === 0x50 && b[1] === 0x4b) return "udf"; // UDF bir zip kabıdır
    if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) return "tif";
    if (b[0] === 0xff && b[1] === 0xd8) return "jpg";
    if (b[0] === 0x89 && b[1] === 0x50) return "png";
    return "bin";
  }

  function htmlMi(u8, tip) {
    if (/text\/html/i.test(tip || "")) return true;
    let i = 0;
    while (i < u8.length && i < 64 && (u8[i] === 0x20 || u8[i] === 0x0a || u8[i] === 0x0d || u8[i] === 0x09 || u8[i] === 0xef || u8[i] === 0xbb || u8[i] === 0xbf)) i++;
    return u8[i] === 0x3c; // '<'
  }

  let oturumDustu = false;
  // Giriş yapılmışken vatandaş sayfası açılır; oturum düşünce /main/index.jsp'ye yönlenir (canlı, 7 Kasım 2026).
  async function oturumAcikMi() {
    try {
      const r = await fetch("/main/jsp/vatandas/index.jsp", { credentials: "include", cache: "no-store" });
      return r.ok && /\/main\/jsp\/vatandas\//.test(r.url);
    } catch { return true; } // ağ hatası oturum kapandı demek değil
  }

  // Başlatma kapısı: işçiler sıraya girer, her başlatma bir öncekinden en az `ara` ms sonra.
  // Hata gelince ara iki katına çıkar (en çok 3 sn), başarıda yavaşça 0,2 sn'ye döner.
  let kapi = Promise.resolve();
  let sonBaslatma = 0;
  let ara = BASLATMA_ARASI_MS;
  const yavasla = () => { ara = Math.min(EN_YAVAS_ARA_MS, ara * 2); };
  const hizlan = () => { ara = Math.max(BASLATMA_ARASI_MS, Math.round(ara * 0.9)); };
  function sirayaGir() {
    const sira = kapi.then(async () => {
      const bekle = sonBaslatma + ara - Date.now();
      if (bekle > 0) await sleep(bekle);
      sonBaslatma = Date.now();
    });
    kapi = sira;
    return sira;
  }

  async function indirBir(ev, did) {
    const url = `${INDIR}?evrakId=${encodeURIComponent(ev.id)}&dosyaId=${encodeURIComponent(did.dosyaId)}&yargiTuru=${encodeURIComponent(did.yargiTuru)}`;
    let sonHata = "";
    for (let d = 1; d <= DENEME && !iptal; d++) {
      try {
        await sirayaGir();
        if (iptal) break;
        const r = await fetch(url, { credentials: "include", cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const u8 = new Uint8Array(await r.arrayBuffer());
        if (u8.length === 0) throw new Error("boş yanıt");
        if (htmlMi(u8, r.headers.get("content-type"))) {
          // Oturum düştüyse kalan evrakları ve davaları boşuna deneme: her şeyi durdur.
          if (!(await oturumAcikMi())) { oturumDustu = true; iptal = true; throw new Error("UYAP oturumu kapandı"); }
          throw new Error("UYAP hata sayfası döndü");
        }
        const ext = uzanti(u8, r.headers.get("content-disposition"));
        // Tanınmayan küçük yanıt çoğu zaman UYAP'ın düz yazı uyarısıdır, dosya değildir.
        if (ext === "bin" && u8.length < 2048) {
          const yazi = new TextDecoder("utf-8", { fatal: false }).decode(u8).trim();
          if (/[a-zçğıöşü]{3,}\s+[a-zçğıöşü]{3,}/i.test(yazi)) throw new Error("UYAP mesajı: " + yazi.slice(0, 200));
        }
        hizlan();
        return { u8, ext };
      } catch (e) {
        sonHata = e.message || String(e);
        yavasla();
        await sleep(1000 * d);
      }
    }
    throw new Error(sonHata || "iptal");
  }

  function zipIndir(blob, ad) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ad;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 120000);
  }

  // Açık davayı indirir. Sonuç: { evrak, hata, sn } ya da hata fırlatır.
  async function davayiIndir() {
    durum("Klasörler açılıyor…");
    await agaciAc();
    const evraklar = evraklariTopla();
    const did = dosyaBilgi();
    if (!evraklar.length) return { evrak: 0, hata: 0, sn: 0, bos: true };
    const girdiler = new Array(evraklar.length);
    const hatalar = [];
    let sira = 0, biten = 0, aktif = 0;
    const t0 = Date.now();
    const goster = () => durum(`İndiriliyor: ${biten}/${evraklar.length} · aktif ${aktif} · hata ${hatalar.length} · ara ${(ara / 1000).toFixed(1)} sn · ${Math.round((Date.now() - t0) / 1000)} sn`);
    // Havuz: 20 işçi; biri bitince sıradakini alır (başlatmalar 0,2 sn arayla), eş zamanlı 20 korunur.
    // Aynı evrak birden çok klasörde görünür (ör. "Son 20 Evrak"); UYAP'tan bir kez indirilir.
    const onbellek = new Map();
    const isci = async () => {
      while (!iptal && sira < evraklar.length) {
        const i = sira++;
        const ev = evraklar[i];
        aktif++; goster();
        try {
          if (!onbellek.has(ev.id)) onbellek.set(ev.id, indirBir(ev, did));
          const { u8, ext } = await onbellek.get(ev.id);
          girdiler[i] = { ev, u8, ext };
        } catch (e) {
          hatalar.push(`${[...ev.yol, ev.ad].join(" / ")}  [evrakId=${ev.id}]  ${e.message}`);
        }
        aktif--; biten++; goster();
      }
    };
    await Promise.all(Array.from({ length: Math.min(ESZAMANLI, evraklar.length) }, isci));
    if (oturumDustu) throw new Error("UYAP oturumu kapandı. Yeniden giriş yapıp tekrar başlatın; inmiş davalar atlanır.");
    if (iptal) throw new Error("Durduruldu");

    durum("ZIP hazırlanıyor…");
    const kullanilan = new Set();
    const zipGirdi = [];
    for (const g of girdiler) {
      if (!g) continue;
      let yol = [...g.ev.yol, g.ev.ad].join("/");
      if (!yol.toLowerCase().endsWith("." + g.ext)) yol += "." + g.ext;
      let aday = yol, n = 2;
      while (kullanilan.has(aday.toLowerCase())) aday = yol.replace(/(\.[^./]+)$/, ` (${n++})$1`);
      kullanilan.add(aday.toLowerCase());
      zipGirdi.push({ path: aday, data: g.u8 });
    }
    if (hatalar.length) zipGirdi.push({ path: "_INDIRILEMEYENLER.txt", data: new TextEncoder().encode(hatalar.join("\r\n")) });
    const kok = evraklar[0].yol[0] || did.ad || "UYAP_Dava";
    zipIndir(window.UyapZip.makeZip(zipGirdi), temizAd(kok) + ".zip");
    const sonuc = { evrak: zipGirdi.length - (hatalar.length ? 1 : 0), hata: hatalar.length, sn: Math.round((Date.now() - t0) / 1000) };
    window.__uzSonuc = { ...sonuc, ad: kok, hatalar };
    durum(`Bitti: ${sonuc.evrak} evrak, ${sonuc.hata} hata, ${sonuc.sn} sn. ZIP indirildi.`);
    return sonuc;
  }

  async function basla() {
    if (calisiyor) return;
    calisiyor = true; iptal = false; oturumDustu = false; dugmeler(true);
    try {
      if (!agacBuDavanin()) { durum("Davanın Evrak sekmesini açın."); return; }
      const s = await davayiIndir();
      if (s.bos) durum("Evrak bulunamadı. Davanın Evrak sekmesini açın.");
    } catch (e) {
      durum("Hata: " + (e.message || e));
    } finally {
      calisiyor = false;
      sonImza = imza(); // açılan klasörler imzayı değiştirmesin, aynı dava yeniden başlamasın
      dugmeler(false);
    }
  }

  // ---------- tüm davalar ----------
  async function bekle(kosul, enCok, adim = 300) {
    const t0 = Date.now();
    while (Date.now() - t0 < enCok) {
      if (iptal) throw new Error("Durduruldu");
      const v = kosul();
      if (v) return v;
      await sleep(adim);
    }
    return null;
  }
  // offsetParent sabit konumlu (position:fixed) dava penceresinde hep null; kutu sayısına bak.
  const gorunur = (el) => !!el && el.getClientRects().length > 0;
  const uyariKapat = () => {
    const ok = document.querySelector("#popup_ok");
    if (gorunur(ok)) { ok.click(); return true; }
    return false;
  };
  const davaPenceresi = () => document.querySelector("#dosya_goruntule_modal");
  const satirlar = () =>
    [...document.querySelectorAll("table tbody tr")].filter((tr) =>
      [...tr.querySelectorAll("button,a,input")].some((b) => /Dosya Görüntüle/.test(b.textContent || b.value || "")));
  const satirDugmesi = (tr) => [...tr.querySelectorAll("button,a,input")].find((b) => /Dosya Görüntüle/.test(b.textContent || b.value || ""));

  async function yargiTuruSorgula(deger) {
    const sec = document.querySelector("#yargiTuru");
    sec.value = deger;
    sec.dispatchEvent(new Event("change", { bubbles: true }));
    if (window.jQuery) window.jQuery(sec).trigger("change");
    await sleep(1500);
    const mahkeme = document.querySelector("#mahkeme");
    if (mahkeme) { mahkeme.value = ""; if (window.jQuery) window.jQuery(mahkeme).trigger("change"); }
    satirlar().forEach((tr) => (tr.__uzEski = true));
    document.querySelector("#btnQueryDoc").click();
    // Yeni satırlar gelene ya da "kayıt bulunamadı" uyarısı çıkana kadar bekle.
    const sonuc = await bekle(() => (uyariKapat() ? "yok" : satirlar().some((tr) => !tr.__uzEski) ? "var" : null), 30000);
    if (sonuc !== "var") return [];
    // Tüm kayıtları tek sayfada göster.
    const uz = document.querySelector('select[name$="_length"]');
    if (uz && uz.value !== "-1") {
      uz.value = "-1";
      if (window.jQuery) window.jQuery(uz).trigger("change"); else uz.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(1500);
    }
    return satirlar();
  }

  async function davaAcVeIndir(tr) {
    const onceki = window.dosya_bilgileri?.dosyaId;
    satirDugmesi(tr).click();
    const yeni = await bekle(() => window.dosya_bilgileri?.dosyaId && window.dosya_bilgileri.dosyaId !== onceki && gorunur(davaPenceresi()), 30000);
    if (!yeni) { uyariKapat(); throw new Error("Dava penceresi açılmadı"); }
    // Pencere açılır açılmaz sekmeye tıklanırsa ağaç yüklenmiyor (canlı, ceza davaları); bekle ve
    // gelmezse sekmeye yeniden tıkla. Yeni ağacın kök klasörü bu davanın numarasını içermeli.
    await sleep(2500);
    let geldi = null;
    for (let d = 0; d < 4 && geldi !== "agac"; d++) {
      const p = davaPenceresi();
      const sekme = p.querySelector('a[href="#dosya_evrak_bilgileri_tab"]');
      if (!sekme) throw new Error("Evrak sekmesi yok");
      // Etkin kalmış sekmeye tıklamak yükleme başlatmaz: önce başka bir sekmeye geç.
      const baska = [...p.querySelectorAll('a[href^="#dosya_"][href$="_tab"]')].find((a) => a !== sekme && gorunur(a));
      if (baska) { baska.click(); await sleep(800); }
      sekme.click();
      geldi = await bekle(() => (uyariKapat() ? "uyari" : agacBuDavanin() ? "agac" : null), 20000);
    }
    if (geldi !== "agac") throw new Error("Evrak ağacı yüklenmedi");
    await durulmayiBekle();
    return await davayiIndir();
  }

  function davaPenceresiniKapat() {
    const m = davaPenceresi();
    if (!gorunur(m)) return;
    const k = [...m.querySelectorAll("button")].find((b) => /Kapat/.test(b.textContent)) || m.querySelector(".close");
    k?.click();
  }

  async function tumDavalar() {
    if (calisiyor) return;
    const sec = document.querySelector("#yargiTuru");
    if (!sec || !document.querySelector("#btnQueryDoc")) {
      durum("Önce Sorgulama İşlemleri › Dosya Sorgulama sayfasını açın.");
      return;
    }
    calisiyor = true; toplu = true; iptal = false; oturumDustu = false; dugmeler(true);
    const biten = new Set(sakla.al(BITEN_ANAHTAR, []));
    const rapor = [];
    window.__uzRapor = rapor; // çalışırken de okunabilsin
    try {
      const turler = [...sec.options].map((o) => ({ deger: o.value, ad: o.text.trim() }));
      for (const tur of turler) {
        if (iptal) break;
        topluDurum(`${tur.ad}: sorgulanıyor…`);
        const trs = await yargiTuruSorgula(tur.deger);
        for (let i = 0; i < trs.length && !iptal; i++) {
          const tr = satirlar()[i];
          if (!tr) break;
          const ad = metin(tr).replace(/Dosya Görüntüle/g, "").slice(0, 160);
          const anahtar = tur.deger + "|" + ad.replace(/\s+(Açık|Kapalı.*|Karara Çıkmış|İstinafta|Temyizde).*$/, "");
          topluDurum(`${tur.ad} ${i + 1}/${trs.length}: ${ad.slice(0, 70)}`);
          if (biten.has(anahtar)) { rapor.push(`ATLANDI (önceden indirildi)  ${tur.ad}  ${ad}`); continue; }
          try {
            const s = await davaAcVeIndir(tr);
            rapor.push(`${s.bos ? "EVRAK YOK" : s.hata ? "EKSİK" : "TAMAM"}  ${tur.ad}  ${ad}  evrak=${s.evrak} hata=${s.hata} ${s.sn}sn`);
            if (!s.hata) { biten.add(anahtar); sakla.koy(BITEN_ANAHTAR, [...biten]); }
          } catch (e) {
            rapor.push(`HATA  ${tur.ad}  ${ad}  ${e.message}`);
            if (iptal) break;
          } finally {
            davaPenceresiniKapat();
            await sleep(1500);
          }
        }
      }
    } catch (e) {
      rapor.push("GENEL HATA: " + (e.message || e));
    } finally {
      window.__uzRapor = rapor;
      zipIndir(new Blob([rapor.join("\r\n")], { type: "text/plain;charset=utf-8" }), "UYAP_indirme_raporu.txt");
      const tamam = rapor.filter((r) => r.startsWith("TAMAM")).length;
      topluDurum(`${oturumDustu ? "Oturum kapandı, durdu" : iptal ? "Durduruldu" : "Bitti"}: ${tamam} dava tam indi, ${rapor.length - tamam} diğer. Rapor indirildi.`);
      calisiyor = false; toplu = false;
      sonImza = imza();
      dugmeler(false);
    }
  }

  // ---------- dava açılınca algıla ----------
  // Görünen ağaç açık davaya mı ait? Önceki davanın gizli ağacı yeni dava kimliğiyle indirilmesin.
  function agacBuDavanin() {
    const kok = klasorEls()[0];
    const no = String(window.dosya_bilgileri?.dosyaNo || "");
    return !!(kok && gorunur(kok) && evrakEls().length && (!no || metin(kok).includes(no)));
  }
  function imza() {
    // Dava kimliği klasör açıldıkça değişmez; yeni dava açılınca değişir.
    if (!agacBuDavanin()) return "";
    return String(window.dosya_bilgileri?.dosyaId || metin(klasorEls()[0]));
  }
  setInterval(() => {
    const sorguSayfasi = !!document.querySelector("#btnQueryDoc");
    const i = imza();
    if (!i && !sorguSayfasi) return;
    ekle();
    panel.style.display = "";
    if (i && i !== sonImza && !calisiyor && !toplu) {
      sonImza = i;
      if (oto) basla();
    }
  }, 1500);
})();
