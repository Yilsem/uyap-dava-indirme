// UYAP ZIP İndirici: açık davanın evrak ağacını açar, evrakları 15 eş zamanlı indirir,
// UYAP'taki klasör yapısıyla tek ZIP olarak verir.
(() => {
  if (window.__uyapZipYuklendi) return;
  window.__uyapZipYuklendi = true;

  const ESZAMANLI = 15;
  const BASLATMA_ARASI_MS = 3000; // iki indirmenin başlaması arasında en az 3 sn
  const DENEME = 3;
  // UYAP'ın "kaydet" adresi: belgeyi asıl biçimiyle verir. Görüntüleme adresi (view_document_brd)
  // büyük evrakta dosya yerine "evrakın boyutu çok büyük" yazısı döndürüyor (canlı, 7 Kasım 2026).
  const INDIR = "https://vatandas.uyap.gov.tr/main/jsp/download_document_brd.uyap";
  const OTO_ANAHTAR = "uyapZipOtomatik";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let calisiyor = false;
  let iptal = false;
  let sonImza = "";

  // ---------- panel ----------
  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#0f3d63;color:#fff;" +
    "font:14px/1.4 Segoe UI,Arial,sans-serif;padding:10px 12px;border-radius:10px;box-shadow:0 4px 16px #0006;" +
    "max-width:320px;display:none";
  panel.innerHTML =
    '<div style="font-weight:600;margin-bottom:6px">UYAP ZIP İndirici</div>' +
    '<div id="uz-durum">Dava evrakları bulundu.</div>' +
    '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
    '<button id="uz-basla" style="min-height:44px;padding:0 12px;border:0;border-radius:8px;background:#2ecc71;color:#032;font-weight:600;cursor:pointer">ZIP indir (15 paralel)</button>' +
    '<button id="uz-iptal" style="min-height:44px;padding:0 12px;border:0;border-radius:8px;background:#e74c3c;color:#fff;cursor:pointer;display:none">İptal</button>' +
    "</div>" +
    '<label style="display:block;margin-top:6px;font-size:12px"><input type="checkbox" id="uz-oto"> Davayı açınca kendiliğinden başla</label>';
  const ekle = () => document.body && !panel.isConnected && document.body.appendChild(panel);
  const $ = (id) => panel.querySelector("#" + id);
  const durum = (t) => ($("uz-durum").textContent = t);

  let oto = true;
  try { oto = localStorage.getItem(OTO_ANAHTAR) !== "0"; } catch {}
  $("uz-oto").checked = oto;
  $("uz-oto").onchange = (e) => {
    oto = e.target.checked;
    try { localStorage.setItem(OTO_ANAHTAR, oto ? "1" : "0"); } catch {}
  };
  $("uz-basla").onclick = () => basla();
  $("uz-iptal").onclick = () => { iptal = true; durum("İptal ediliyor…"); };

  // ---------- ağaç ----------
  const evrakEls = () => [...document.querySelectorAll("[evrak_id]")];
  const metin = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();

  async function agaciAc() {
    const tiklanan = new WeakSet();
    for (let tur = 0; tur < 40 && !iptal; tur++) {
      let yeni = 0;
      for (const h of document.querySelectorAll(".expandable-hitarea, .hitarea.expandable")) {
        if (tiklanan.has(h) || h.offsetParent === null) continue;
        tiklanan.add(h); h.click(); yeni++;
      }
      for (const f of document.querySelectorAll("span.folder")) {
        if (tiklanan.has(f) || f.offsetParent === null) continue;
        const li = f.closest("li");
        // İçi zaten yüklüyse tıklama (kapatıp açmasın).
        if (li && li.querySelector(":scope > ul > li")) { tiklanan.add(f); continue; }
        tiklanan.add(f); f.click(); yeni++;
        await sleep(150);
      }
      // AJAX ile gelen evraklar durulana kadar bekle.
      let once = -1, sabit = 0;
      while (sabit < 3) {
        const n = evrakEls().length + document.querySelectorAll("span.folder").length;
        sabit = n === once ? sabit + 1 : 0;
        once = n;
        await sleep(400);
      }
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
    return { dosyaId: db.dosyaId, yargiTuru: db.yargiTuru || 1, ad: [db.birimAdi, db.dosyaNo].filter(Boolean).join(" ") };
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
      const e = /\.([a-z0-9]{2,5})$/i.exec(decodeURIComponent(m[1]));
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

  // Başlatma kapısı: işçiler sıraya girer, her başlatma bir öncekinden en az 3 sn sonra.
  let kapi = Promise.resolve();
  let sonBaslatma = 0;
  function sirayaGir() {
    const sira = kapi.then(async () => {
      const bekle = sonBaslatma + BASLATMA_ARASI_MS - Date.now();
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
        if (htmlMi(u8, r.headers.get("content-type"))) throw new Error("UYAP hata sayfası döndü (oturum kapanmış olabilir)");
        const ext = uzanti(u8, r.headers.get("content-disposition"));
        // Tanınmayan küçük yanıt çoğu zaman UYAP'ın düz yazı uyarısıdır, dosya değildir.
        if (ext === "bin" && u8.length < 2048) {
          const yazi = new TextDecoder("utf-8", { fatal: false }).decode(u8).trim();
          if (/[a-zçğıöşü]{3,}\s+[a-zçğıöşü]{3,}/i.test(yazi)) throw new Error("UYAP mesajı: " + yazi.slice(0, 200));
        }
        return { u8, ext };
      } catch (e) {
        sonHata = e.message || String(e);
        await sleep(1000 * d);
      }
    }
    throw new Error(sonHata || "iptal");
  }

  async function basla() {
    if (calisiyor) return;
    calisiyor = true; iptal = false;
    $("uz-basla").style.display = "none";
    $("uz-iptal").style.display = "";
    try {
      durum("Klasörler açılıyor…");
      await agaciAc();
      const evraklar = evraklariTopla();
      if (!evraklar.length) { durum("Evrak bulunamadı. Davanın evrak ağacını açın."); return; }
      const did = dosyaBilgi();
      const girdiler = new Array(evraklar.length);
      const hatalar = [];
      let sira = 0, biten = 0, aktif = 0;
      const t0 = Date.now();
      const goster = () => durum(`İndiriliyor: ${biten}/${evraklar.length} · aktif ${aktif} · hata ${hatalar.length} · ${Math.round((Date.now() - t0) / 1000)} sn`);
      // Havuz: 15 işçi; biri bitince sıradakini alır (başlatmalar 3 sn arayla), eş zamanlı 15 korunur.
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
      if (iptal) { durum("İptal edildi."); return; }

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
      const blob = window.UyapZip.makeZip(zipGirdi);
      const kok = evraklar[0].yol[0] || did.ad || "UYAP_Dava";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = temizAd(kok) + ".zip";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      durum(`Bitti: ${zipGirdi.length - (hatalar.length ? 1 : 0)} evrak, ${hatalar.length} hata, ${Math.round((Date.now() - t0) / 1000)} sn. ZIP indirildi.`);
    } catch (e) {
      durum("Hata: " + (e.message || e));
    } finally {
      calisiyor = false;
      sonImza = imza(); // açılan klasörler imzayı değiştirmesin, aynı dava yeniden başlamasın
      $("uz-basla").style.display = "";
      $("uz-iptal").style.display = "none";
    }
  }

  // ---------- dava açılınca algıla ----------
  function imza() {
    // Dava kimliği klasör açıldıkça değişmez; yeni dava açılınca değişir.
    if (!evrakEls().length) return "";
    return String(window.dosya_bilgileri?.dosyaId || metin(document.querySelector("span.folder")));
  }
  setInterval(() => {
    const i = imza();
    if (!i) return;
    ekle();
    panel.style.display = "";
    if (i !== sonImza && !calisiyor) {
      sonImza = i;
      if (oto) basla();
    }
  }, 1500);
})();
