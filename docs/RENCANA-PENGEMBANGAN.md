# Rencana Pengembangan v2: Belajar Bahasa + Persiapan Ujian HSK 3.0

> Status: rancangan, 2026-11-16. Disusun dari pembacaan kode dan data repositori saat ini, blueprint resmi di `blueprints/hsk3.0/`, dan riset sumber luar (daftar di [§7](#7-referensi-dan-sumber-data)). Angka bertanda **[sekunder]** berasal dari blog/panduan pihak ketiga dan harus dicocokkan dengan pengumuman CTI sebelum dijadikan aturan di aplikasi.

## 0. Ringkasan

Aplikasi sekarang sudah kuat untuk **HSK 1–3**: hafalan SRS, 2.746 soal, simulasi bertimer, 34 pelajaran bertema, tab Tulis untuk 1.200 hanzi, latihan bicara, dan analitik kelemahan. Celah terbesar untuk dipakai sebagai alat **belajar sekaligus persiapan ujian**:

1. **HSK 4–6 belum bisa dipakai untuk ujian.** Arti Indonesia baru ada untuk 1.000 dari 5.400 kata (HSK 1–3), soal dan simulasi hanya HSK 1–3.
2. **Tidak ada modul tata bahasa.** Padahal hampir semua soal susun kalimat, cloze, dan menulis menguji pola tata bahasa.
3. **Speaking HSK 3–6 sekarang bagian ujian** (menurut sumber sekunder, wajib didaftarkan bersama ujian tulis), tapi belum ada mode simulasi speaking.
4. **Empat jenis soal resmi HSK 1–3 masih diganti pengganti** (`match_question_to_answer`, `audio_statement_question_mcq`, `choose_missing_character_component`, `write_sentence_from_picture_and_word`).
5. **Tidak ada rencana belajar menuju tanggal ujian**: pelajar tidak tahu berapa kata/hari yang harus dikejar dan kapan harus simulasi.
6. **Setelah ujian tidak ada mode pembahasan** dan tidak ada **buku kesalahan (错题本)** yang terkumpul otomatis.
7. **Belum bisa offline** (tidak ada service worker), padahal aplikasi statis dan cocok jadi PWA.

Urutan pengerjaan yang disarankan ada di [§5 Peta jalan](#5-peta-jalan): fase 1 menutup celah HSK 1–3 dan alat persiapan ujian (paling cepat terasa), fase 2 membuka HSK 4, fase 3 HSK 5–6.

---

## 1. Kondisi saat ini (diukur dari repositori)

| Komponen | HSK 1 | HSK 2 | HSK 3 | HSK 4 | HSK 5 | HSK 6 |
|---|---|---|---|---|---|---|
| Kata silabus (baru) | 300 | 200 | 500 | 1.000 | 1.600 | 1.800 |
| Arti Indonesia + kalimat contoh (`vocab_id.json`) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Soal Latihan (`questions.json`) | 882 | 619 | 1.245 | 0 | 0 | 0 |
| Simulasi ujian | ✅ (2 jenis pengganti) | ✅ (2 pengganti) | ✅ (2 pengganti) | ❌ | ❌ | ❌ |
| Pelajaran bertema | 7 | 6 | 6 | 5 | 5 | 5 |
| Hanzi tulis (Tulis) | – | 100 (L1–2) | 150 | 150 | 150 | 150 |
| Tata bahasa | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Speaking (format ujian) | – | – | ❌ | ❌ | ❌ | ❌ |
| Menulis kalimat/esai | – | – | ❌ | ❌ | ❌ | ❌ |

Fitur lintas level yang sudah ada: SRS SM-2 satu arah (hanzi → arti), kuis arti, pencarian kata, TTS browser + panel uji suara, rekam/bandingkan + pengenalan ucapan + kontur nada eksperimental, streak, tren akurasi, kelemahan per keterampilan/jenis soal/kata, ekspor/impor progres, lembar review untuk penutur asli.

Catatan teknis yang relevan:
- `vocab.json` (1,8 MB, 11.000 kata termasuk HSK 7–9) dimuat utuh saat aplikasi dibuka; berat di ponsel.
- Progres di `localStorage` (batas ±5 MB per origin); log jawaban dibatasi 5.000 kejadian.
- Kartu Hafalan hanya satu arah dan satu jenis; tidak ada deteksi "kata bandel" (leech).

## 2. Fakta HSK 3.0 terbaru yang memengaruhi rancangan

| Fakta | Status | Dampak ke aplikasi |
|---|---|---|
| Ujian reguler HSK 3.0 level 1–6 pertama: **13 Desember 2026**; sitting HSK 2.0 global terakhir 7 November 2026 | [sekunder], konsisten di beberapa sumber | Target pengguna sekarang = HSK 3.0; tidak perlu dukungan HSK 2.0 |
| Struktur ujian tulis (jumlah soal, bagian, waktu) | resmi, sudah di `blueprints/` | Tetap jadi sumber kebenaran |
| **Speaking HSK 3–6** punya kertas sendiri per level, didaftarkan bersama ujian tulis; HSKK lama diganti untuk level itu | [sekunder]; dokumen struktur resmi 1–6 tidak memuatnya | Perlu modul simulasi speaking; format disimpan sebagai blueprint `verified: false` |
| Format speaking: HSK 3 ±15 mnt (ulangi kalimat, bicara tentang gambar, jawab pertanyaan); HSK 4 ±20 mnt (dengar & ceritakan ulang, gambar, jawab terbuka); HSK 5–6 lebih panjang, lebih banyak persiapan | [sekunder], **jumlah butir berbeda antar sumber** | Buat tugas speaking modular (jenis tugas tetap, jumlah/waktu dari blueprint yang bisa diganti) |
| Rubrik speaking memakai beberapa dimensi (mis. pelafalan, kelancaran, ketepatan, isi) | [sekunder] | Rubrik penilaian diri, bukan skor resmi |
| **Skala skor dan nilai lulus HSK 3.0 belum diumumkan** (per akhir Oktober 2026) | dikonfirmasi beberapa sumber | Tetap tampilkan persen + "perkiraan"; siapkan `scoring` di blueprint agar tinggal diisi saat diumumkan |
| Laporan skor berlaku 2 tahun | [sekunder] | Info di halaman panduan ujian |

Tindakan rutin: setiap kali CTI menerbitkan dokumen baru (sistem skor, contoh soal speaking), perbarui `blueprints/` dan `docs/sources.md`, lalu jalankan tes.

## 3. Prinsip yang dipertahankan

1. **Statis, tanpa akun, privasi lokal.** Fitur baru tidak boleh mewajibkan server. Fitur yang butuh layanan luar (AI, sinkronisasi) selalu opsional dan dimatikan secara bawaan.
2. **Konten orisinal + kunci level.** Semua kalimat/soal baru lolos pemeriksa "hanzi ≤ level". Teks tata bahasa resmi tidak disalin; penjelasan ditulis sendiri.
3. **Jujur soal ketidakpastian.** Skor = perkiraan, format speaking = berdasarkan sumber sekunder, konten = belum/sudah direview, selalu ditandai di layar.
4. **Satu tempat per hal.** Soal baru tetap digambar oleh `views/question.js`; logika murni tetap di modul yang diuji `tests/js/`.

## 4. Rancangan fitur

Setiap modul: tujuan → tampilan → data → aturan mutu → ukuran selesai.

### A. Rencana belajar menuju tanggal ujian (Beranda "Hari ini")

**Tujuan:** pelajar membuka aplikasi dan langsung tahu apa yang harus dikerjakan hari ini agar siap pada tanggal ujian.

- **Pengaturan target:** level ujian, tanggal ujian (bawaan: sitting berikutnya yang diisi manual), menit belajar per hari (15/30/45/60).
- **Tes penempatan (opsional, ±10 menit):** 30 soal campuran adaptif (naik/turun level per 5 soal) → saran level target dan kata yang dianggap sudah dikenal (ditandai "kenal" di SRS dengan interval awal panjang).
- **Penjadwal harian** (`plan.js`, logika murni): 
  - kata baru/hari = sisa kata level target ÷ (hari tersisa − 14 hari cadangan untuk ulangan), dibatasi menurut menit belajar;
  - kuota latihan per keterampilan menurut kelemahan (`analytics.js` sudah menghitungnya);
  - **simulasi penuh** dijadwalkan: 1× di awal (baseline), lalu tiap 7–10 hari, 2× di minggu terakhir;
  - 7 hari terakhir: tidak ada kata baru, fokus ulangan + buku kesalahan + simulasi.
- **Daftar "Hari ini"** di Beranda: Hafalan (n kartu), 1 pelajaran/tata bahasa, 1 set latihan kelemahan, menulis 5 hanzi, (opsional) speaking 1 tugas. Centang otomatis saat selesai.
- **Hitung mundur + indikator kesiapan:** "Kesiapan HSK 3: 68%" = gabungan cakupan kata (kartu yang matang), akurasi 14 hari terakhir per keterampilan, dan skor simulasi terakhir; diberi label perkiraan.

Data: `store.data.plan = { level, examDate, minutes, placement: {...} }`. Ukuran selesai: tes `plan.test.mjs` untuk pembagian kuota, hari libur, tanggal lewat, dan level yang kata-katanya sudah habis.

### B. Kosakata HSK 4–6 (4.400 kata)

**Tujuan:** Hafalan, Kuis, Daftar, dan pembuat soal bisa dipakai untuk HSK 4–6.

- Berkas sumber baru `content/id/level-4.psv`, `level-5.psv`, `level-6.psv` dengan format yang sama dengan HSK 1–3: arti Indonesia, kalimat contoh, terjemahan.
- Dikerjakan **per gelombang 200 kata**, diurutkan menurut frekuensi (kata yang paling sering muncul di teks lebih dulu) agar manfaat terasa sebelum semua selesai. Aplikasi menampilkan kata tanpa arti Indonesia dengan glos Inggris (sudah didukung `deck.js`).
- Aturan mutu yang sudah ada otomatis berlaku: hanzi kalimat ≤ level, kata target ada di kalimat, kalimat unik, bacaan kata target = silabus, ejaan Indonesia (hunspell), angka cocok.
- Tambahan untuk HSK 4–6: kolom opsional **kolokasi** (mis. 提高 + 水平/效率) dan **sinonim yang mirip** (mis. 发现/发明), dipakai modul D dan soal pilihan kata.
- Lembar review (`npm run review-sheet`) menyertakan gelombang baru.

Ukuran selesai per gelombang: `npm run test` hijau, tes jumlah diperbarui, entri di `docs/AUDIT-id.md`.

### C. Hafalan v2

| Perubahan | Alasan | Catatan |
|---|---|---|
| **FSRS** menggantikan SM-2 | Jadwal lebih efisien (lebih sedikit ulangan untuk retensi yang sama); target retensi bisa diatur (mis. 90%) | `ts-fsrs` (MIT) atau port kecil sendiri; migrasi kartu SM-2 → FSRS dengan memperkirakan stabilitas dari `interval` dan `lapses`; opsi kembali ke SM-2 |
| **Jenis kartu** per kata: Kenali (hanzi → arti), Ingat (arti → hanzi/pinyin), Dengar (audio → arti), Nada (hanzi → pilih nada) | Ujian menguji membaca, mendengar, dan menulis; kartu satu arah membuat pelajar "kenal tapi tidak bisa memakai" | Pengguna memilih jenis aktif; kartu Ingat dan Nada baru dibuka setelah kartu Kenali matang |
| **Deteksi kata bandel (leech)** | Kata yang gagal ≥6× butuh cara lain, bukan diulang terus | Tandai, tawarkan: lihat kalimat lain, bandingkan dengan kata mirip, hafalan komponen hanzi |
| **Kartu kalimat** (cloze dari kalimat contoh) | Memindahkan kata dari hafalan ke pemakaian | Sumber: kalimat contoh + kalimat kunci pelajaran |
| **Kartu tata bahasa** | Dari modul D | Satu kartu = satu pola, diuji lewat contoh baru |

Data: `cards["<id>:<jenis>"]`; skema store naik ke versi 2 dengan migrasi otomatis (dan tes migrasi).

### D. Modul Tata Bahasa (语法) — tab baru

**Tujuan:** penjelasan pola dalam bahasa Indonesia, contoh ≤ level, dan latihan yang langsung menguji pola itu.

- **Daftar poin disusun sendiri** per level (target awal ±25 poin HSK 1, ±25 HSK 2, ±40 HSK 3, ±50 HSK 4, ±50 HSK 5, ±50 HSK 6). Nama pola adalah fakta bahasa (mis. 把字句, 比 perbandingan, 了 perubahan keadaan); **teks dan contoh silabus resmi tidak disalin**. Pemetaan level mengikuti urutan umum buku ajar dan dicek terhadap kosakata level (contoh harus lolos pemeriksa hanzi).
- **Satu berkas per poin** `content/grammar/<id>.json`:
  ```json
  { "id": "ba-sentence", "level": 3, "title": "把: memindahkan objek ke depan kata kerja",
    "pattern": "S + 把 + O + V + hasil/arah",
    "explain": "Dipakai saat objek sudah jelas dan kata kerja punya akibat ...",
    "examples": [{ "zh": "请把门关上。", "id": "Tolong tutup pintunya." }],
    "pitfalls": ["Tidak bisa: *我把书看。 (kata kerja tanpa hasil)"],
    "contrast": ["bei-passive"],
    "drills": [ { "type": "order_sentence", ... }, { "type": "grammar_choose", ... }, { "type": "error_spot", ... } ] }
  ```
- **Bagian "Kesalahan umum penutur Indonesia"** di tiap poin yang relevan, mis.: 是 di depan kata sifat (*我是很忙*), urutan keterangan waktu/tempat (Indonesia: di akhir; Mandarin: sebelum kata kerja), 了 dipakai sebagai "sudah" untuk semua kalimat lampau, 的/地/得, 二/两, 不/没, 会/能/可以, 又/再, 还是/或者, pelengkap durasi, kata ganti ukur (量词).
- **Jenis latihan baru** (digambar di `question.js`): `grammar_choose` (pilih bentuk yang benar), `error_spot` (pilih kalimat yang salah, bentuk resmi HSK 6 R1 di HSK 2.0 dan berguna untuk semua level), `transform` (ubah kalimat ke pola: 把 ↔ 被, 是…的).
- **Tautan dua arah:** soal Latihan diberi tag `g: ["ba-sentence"]` (otomatis untuk soal susun yang memuat 把, 被, 比, 是…的, dst.; manual untuk lainnya) → analitik bisa melaporkan "pola terlemah", dan penjelasan soal menautkan ke poin tata bahasa.
- Pelajaran bertema mendapat kolom `grammar: [...]` sehingga halaman pelajaran menampilkan "Pola di pelajaran ini".

Ukuran selesai fase pertama: poin HSK 1–3 lengkap, tiap poin ≥3 contoh dan ≥5 latihan, tes build memeriksa level hanzi dan tautan `contrast` yang valid.

### E. Jenis soal resmi HSK 1–3 yang masih diganti

| Jenis | Level | Bentuk | Sumber konten |
|---|---|---|---|
| `match_question_to_answer` | R2 (HSK 1), R3 (HSK 2), R1 (HSK 3) | 5 pertanyaan ↔ 5–6 jawaban (satu pengecoh), tiap pasangan hanya cocok satu | `content/id/qa-level-*.psv` sudah punya pasangan tanya-jawab; tambah pemeriksa "jawaban tidak cocok dengan pertanyaan lain" (tag topik + review manual) |
| `audio_statement_question_mcq` | L4 (HSK 1) | dengar pernyataan pendek + pertanyaan, pilih jawaban | Tulis ±60 butir baru HSK 1 |
| `choose_missing_character_component` | W1 (HSK 2) | hanzi dengan satu komponen kosong → pilih komponen | Data dekomposisi (Make Me a Hanzi `dictionary.txt`, cek lisensi) untuk 100 hanzi tulis HSK 1–2; pengecoh dari komponen yang sering tertukar (氵/冫, 日/目, 木/禾) |
| `write_sentence_from_picture_and_word` | W2 (HSK 3) | gambar + kata wajib → tulis satu kalimat | Lihat modul G: pemeriksaan otomatis terbatas + jawaban model + penilaian diri |

Setelah keempatnya ada, simulasi HSK 1–3 tidak lagi punya bagian bertanda "pengganti".

### F. Soal dan simulasi HSK 4–6

Jumlah butir per **satu** kertas (dari blueprint resmi) dan target bank soal (≥4 kertas unik + kolam latihan):

| Level | Mendengar | Membaca | Menulis | Target bank awal |
|---|---|---|---|---|
| 4 | 14 dialog + 18 teks | 10 cloze kalimat + 15 teks + 7 isi kalimat/teks | 5 kalimat dari kata + 1 esai ≥80 hanzi | ±300 butir objektif + 30 tugas menulis |
| 5 | 19 dialog + 16 teks | 10 cloze paragraf + 10 isi/urutkan kalimat + 15 teks | esai dari 4 gambar ≥100 hanzi + esai topik ≥200 hanzi | ±320 butir + 20 tugas |
| 6 | 8 butir pendek + 20 teks + 12 wawancara | 10 cloze paragraf + 10 isi kalimat + 20 teks | teks praktis ≥150 hanzi + esai opini ≥300 hanzi | ±360 butir + 20 tugas |

- **Jenis baru di `question.js`:** `cloze_passage_mcq` (beberapa rumpang dalam satu paragraf), `passage_fill_sentences` (isi kalimat A–E ke dalam teks; satu pengecoh), `passage_fill_or_order_sentences`, `audio_short_item_pick_matching_statement`, `audio_interview_question_mcq` (audio panjang, beberapa pertanyaan). Teks panjang memakai komponen "teks + beberapa soal" yang sama (pilihan tetap terlihat saat menggulir).
- **Audio panjang (wawancara, teks 1–3 menit):** TTS dengan dua suara + jeda antarbaris; mode ujian memutar satu kali, mode latihan bisa diulang dan diperlambat.
- **Sumber teks:** ditulis sendiri per topik pelajaran HSK 4–6 (lingkungan, teknologi, pendidikan, ekonomi, budaya, ...), lolos pemeriksa hanzi level, panjang sesuai level (HSK 4 ±150–300 hanzi, HSK 5 ±300–500, HSK 6 ±500–800). Dari mana pun ide teks berasal, jawaban harus tepat satu; setiap butir diperiksa dengan "pemecah kedua" (orang atau model lain menjawab tanpa kunci) sebelum masuk bank.
- Pilihan level 4–6 di tab Ujian dibuka per level setelah bank mencukupi (sudah ada mekanisme `ok` di `views/exam.js`).

### G. Menulis: kalimat dan esai (HSK 3–6)

Penilaian esai yang setara penguji tidak mungkin dijamin. Rancangan bertingkat:

1. **Pemeriksa otomatis lokal (selalu ada):** jumlah hanzi vs minimum, kata wajib terpakai, hanzi di atas level ditandai, tanda baca Tionghoa (，。？), kalimat sangat panjang tanpa tanda baca, hanzi tertukar yang umum (的/得/地, 在/再, 做/作) diberi peringatan, jumlah paragraf.
2. **Jawaban model + rubrik penilaian diri:** tiap tugas punya 1–2 jawaban model berlevel dan rubrik (isi sesuai tugas, struktur, kosakata, tata bahasa, hanzi) dengan contoh skor rendah/sedang/tinggi.
3. **Pola kerangka (template)** untuk esai HSK 5–6: pembuka, tiga alasan, penutup; frasa penghubung per level (首先…其次…最后, 一方面…另一方面, 总之).
4. **Penilai AI (opsional, mati secara bawaan):** pelajar memasukkan kunci API sendiri; teks dikirim ke penyedia yang dipilih hanya saat tombol "Nilai dengan AI" ditekan; hasil berupa koreksi + skor rubrik berlabel "perkiraan AI". Kunci disimpan lokal. Tanpa kunci, tingkat 1–3 tetap lengkap.

Untuk `write_sentence_from_word` (HSK 4 W1) dan `write_sentence_from_picture_and_word` (HSK 3 W2): pemeriksa otomatis = kata wajib ada + hanzi ≤ level + diakhiri tanda baca + panjang wajar; lalu pelajar membandingkan dengan 3 contoh jawaban benar.

Riwayat tulisan disimpan lokal agar bisa dibandingkan dari waktu ke waktu (`store.data.writing[]`, dibatasi jumlahnya).

### H. Speaking HSK 3–6 (format ujian)

Dibangun di atas `speech.js` dan `tone.js` yang sudah ada.

- **Blueprint speaking** `blueprints/hsk3.0/speaking-level-3.yaml` … `-6.yaml` dengan `verified: false` dan sumbernya dicatat; jenis tugas:
  - `repeat_sentence` (dengar lalu ulangi), dinilai dengan pengenalan ucapan + nada (sudah ada);
  - `describe_picture` (bicara tentang gambar, waktu persiapan + waktu bicara);
  - `answer_question` (jawab pertanyaan terbuka, mis. "你周末一般做什么？");
  - `retell` (dengar teks pendek lalu ceritakan ulang, HSK 4+);
  - `read_aloud` / `give_opinion` (HSK 5–6).
- **Mode simulasi:** hitung mundur persiapan → rekam otomatis selama waktu bicara → berhenti otomatis, persis seperti ujian; tidak bisa diulang.
- **Penilaian:** 
  - otomatis untuk `repeat_sentence` dan `read_aloud` (kata terdengar + nada, sudah ada);
  - untuk tugas terbuka: transkrip pengenalan ucapan ditampilkan, lalu dihitung **durasi bicara, kecepatan (hanzi/menit), kata level yang terpakai, panjang jeda**, plus rubrik penilaian diri 4 dimensi dan jawaban model untuk didengarkan.
- **Bank pertanyaan dan gambar:** ±40 pertanyaan + ±20 gambar per level (emoji/ilustrasi buatan sendiri dulu; foto berlisensi bebas bila ada).
- Privasi: sama seperti sekarang, rekaman hanya di memori; opsi "simpan rekaman ke perangkat" (IndexedDB) untuk membandingkan kemajuan, mati secara bawaan.

### I. Mendengar intensif

- **Dikte (听写):** dengar kalimat → ketik pinyin atau hanzi (IME) → koreksi per hanzi (LCS dari `speech.js`). Melatih telinga sekaligus menulis.
- **Shadowing:** putar kalimat per frasa, pelajar mengulang segera; dapat menyambung ke perekaman.
- **Kontrol kecepatan** 0,7× / 0,85× / 1× dan **tampilkan/sembunyikan transkrip** di mode latihan; mode ujian mengikuti aturan ujian (sekali putar, tanpa jeda).
- **Kualitas audio:** TTS bergantung perangkat. Tetap pakai TTS browser (gratis, offline di banyak ponsel), dengan rencana opsional audio rekaman: kata dari proyek audio berlisensi terbuka atau sukarelawan penutur asli; kalimat Tatoeba yang punya audio **hanya bila lisensi per berkas mengizinkan** (lisensi audio Tatoeba berbeda per perekam). Audio rekaman disimpan sebagai berkas statis per level agar bisa di-cache offline.

### J. Bacaan bertingkat (graded reader)

- Pustaka teks orisinal per level (mulai 10 teks/level), dari topik pelajaran; semua lolos pemeriksa level.
- **Ketuk kata → kartu kecil** (pinyin, arti, suara, "Tambah ke Hafalan"); segmentasi memakai pemecah kata yang sama dengan soal susun (maximum matching dengan daftar silabus).
- Pinyin bisa diatur: semua / hanya kata di atas level saya / tidak ada.
- **Kecepatan baca** (hanzi per menit) diukur dan dicatat; HSK 5–6 menuntut membaca cepat. Target indikatif ditampilkan sebagai panduan, bukan angka resmi.
- 3–5 soal pemahaman di akhir tiap teks (bentuk `passage_mcq` yang sudah ada).

### K. Hanzi: komponen dan hanzi mirip

- Halaman detail hanzi: komponen/radikal, arti komponen, hanzi lain dengan komponen sama yang sudah dipelajari, hanzi mirip (`lookalikes.json` sudah ada).
- Latihan `choose_missing_character_component` (modul E) juga tersedia di tab Tulis.
- "Kata bandel" di Hafalan (modul C) menautkan ke halaman ini.

### L. Ujian v2

- **Mode pembahasan setelah simulasi:** buka setiap soal dengan jawaban pelajar, kunci, penjelasan, transkrip audio, tautan tata bahasa, dan tombol "Masukkan ke buku kesalahan".
- **Buku kesalahan (错题本):** semua soal yang salah (latihan dan ujian) terkumpul otomatis; diulang dengan jadwal SRS sampai dijawab benar 2× berturut di hari berbeda.
- **Perkiraan skor per bagian** pada skala 0–100 per keterampilan (bentuk umum laporan HSK) **dengan label "perkiraan, sistem skor resmi HSK 3.0 belum diumumkan"**; begitu CTI menerbitkan skala, isi `scoring` di blueprint dan perhitungan mengikuti.
- **Aturan hari ujian** di simulasi: audio sekali putar, waktu isi lembar jawaban di akhir bagian mendengar, tidak bisa kembali ke bagian yang sudah lewat (sebagian sudah ada).
- **Halaman "Panduan ujian"** statis: struktur tiap level, tanggal sitting (diisi manual dengan tanggal pembaruan), cara mendaftar (tautan ke situs resmi), checklist hari H, bedanya ujian kertas dan ujian komputer (latihan mengetik hanzi dengan IME untuk ujian komputer).

### M. Analitik dan motivasi

- **Dasbor kesiapan** per keterampilan (Mendengar, Membaca, Menulis, Bicara) dibanding target, ditambah pola tata bahasa terlemah dan cakupan kosakata level target.
- **Laporan mingguan** di Beranda: kata baru, kartu matang, akurasi per keterampilan, perubahan skor simulasi.
- Streak sudah ada; tambah **target harian yang bisa disesuaikan** dan "hari libur" yang tidak memutus streak (sekali seminggu).

### N. Teknis

| Perubahan | Rincian |
|---|---|
| **PWA offline** | `manifest.webmanifest` + service worker cache-first untuk aplikasi dan data per level; data goresan dimuat dan di-cache per hanzi; tombol "Unduh level 4 untuk offline" |
| **Pecah data per level** | `vocab-L1.json` … `L6.json` (HSK 7–9 tidak dimuat kecuali dipilih); muat awal turun dari ±1,8 MB ke beberapa ratus KB |
| **IndexedDB untuk data besar** | log jawaban, tulisan, rekaman opsional; `localStorage` tetap untuk pengaturan; migrasi otomatis + tes |
| **Skema store v2** | kartu berjenis, `plan`, `mistakes`, `grammar`, `speaking`, `writing`; impor berkas ekspor v1 tetap didukung |
| **Sinkronisasi antar perangkat (opsional, nanti)** | tahap 1: ekspor/impor (sudah ada) + kode QR; tahap 2 bila dibutuhkan: penyimpanan cloud opsional dengan login, tidak mengubah mode tanpa akun |
| **Aksesibilitas & ponsel** | navigasi bawah 5 tab utama (Beranda, Belajar, Latihan, Ujian, Saya) karena 10 tab terlalu banyak di layar kecil; tab lain masuk menu |
| **Tes** | setiap modul logika murni baru punya `tests/js/*.test.mjs`; setiap jenis konten baru punya pemeriksa di build dan tes Python |

### O. Mutu konten

- **Status per butir**: `draft` / `ai-checked` / `reviewed` (penutur asli) disimpan di sumber, ditampilkan sebagai lencana kecil; pengguna bisa memilih "hanya konten yang sudah direview" untuk simulasi.
- Lembar review (`build_review_sheet.py`) diperluas ke tata bahasa, teks bacaan, tugas speaking, dan jawaban model esai.
- Tombol "Laporkan" di setiap soal yang membuka issue "Koreksi konten" dengan id soal terisi.
- Pemeriksa otomatis baru: pengecoh tata bahasa harus benar-benar salah (daftar pola salah yang diketahui), panjang teks per level, satu jawaban benar untuk `passage_fill_sentences` (setiap kalimat pengecoh tidak cocok di celah mana pun, dicek manual + pemecah kedua).

## 5. Peta jalan

Prioritas dihitung dari manfaat untuk pelajar yang sedang menyiapkan ujian dibanding usaha.

### Fase 1 — Siap ujian HSK 1–3 (±3–4 minggu)

| # | Pekerjaan | Modul | Usaha |
|---|---|---|---|
| 1 | Pengaturan target + tanggal ujian + daftar "Hari ini" + hitung mundur | A | S |
| 2 | Mode pembahasan setelah simulasi + buku kesalahan | L | S–M |
| 3 | Empat jenis soal resmi HSK 1–3 yang masih diganti | E | M |
| 4 | Simulasi speaking HSK 3 (ulangi kalimat, gambar, jawab pertanyaan) | H | M |
| 5 | Tata bahasa HSK 1–3 (±90 poin) + tag `g` di soal + "pola terlemah" | D | L |
| 6 | PWA offline + pecah data per level | N | S–M |
| 7 | Dikte + kontrol kecepatan audio | I | S |

### Fase 2 — HSK 4 (±6–8 minggu)

1. Arti Indonesia + kalimat contoh 1.000 kata HSK 4 (5 gelombang × 200) — B
2. FSRS + jenis kartu Ingat/Dengar + deteksi kata bandel — C
3. Jenis soal HSK 4 + bank ±300 butir + simulasi HSK 4 — F
4. Menulis: pemeriksa lokal, `write_sentence_from_word`, esai ≥80 hanzi dengan jawaban model dan rubrik — G
5. Tata bahasa HSK 4 (±50 poin) — D
6. Speaking HSK 4 (`retell`, gambar, jawab terbuka) — H
7. Bacaan bertingkat HSK 1–4 (10 teks/level) — J

### Fase 3 — HSK 5–6 (±10–12 minggu)

1. Kosakata HSK 5–6 (3.400 kata, 17 gelombang) — B
2. Jenis soal HSK 5–6 (cloze paragraf, isi kalimat, wawancara) + simulasi — F
3. Esai 4 gambar / topik / teks praktis / opini, template dan frasa penghubung — G
4. Tata bahasa HSK 5–6 (±100 poin), termasuk kalimat formal/tulis dan 成语 yang sering muncul — D
5. Speaking HSK 5–6 — H
6. Penilai AI opsional untuk esai dan jawaban speaking terbuka — G/H

### Berkelanjutan

- Review penutur asli per gelombang; perbarui lencana status — O
- Pantau pengumuman CTI (sistem skor, contoh soal speaking resmi) dan perbarui blueprint — §2
- Analitik/laporan mingguan, navigasi ponsel, sinkronisasi opsional — M, N

## 6. Perubahan struktur repositori

```
content/
  id/level-4.psv … level-6.psv          arti + kalimat HSK 4–6 (modul B)
  id/qa-level-*.psv                     + pasangan untuk match_question_to_answer (E)
  grammar/<id>.json                     poin tata bahasa (D)
  reader/<level>/<id>.json              bacaan bertingkat (J)
  speaking/level-<n>.json               pertanyaan, gambar, teks ceritakan ulang (H)
  writing/level-<n>.json                tugas menulis + jawaban model + rubrik (G)
  passages/level-<n>.psv                teks dan dialog panjang HSK 4–6 (F)
blueprints/hsk3.0/speaking-level-3..6.yaml   format speaking (verified: false)
scripts/
  build_grammar.py  build_reader.py  build_speaking.py  build_writing.py  build_components.py
data/hsk3/
  vocab-L1..L6.json  grammar.json  reader.json  speaking.json  writing.json  components.json
app/js/
  plan.js  fsrs.js  grammar.js  mistakes.js  reader.js  essay.js (pemeriksa lokal)  speakexam.js
  views/grammar.js  views/reader.js  views/speaking.js  views/plan.js
app/sw.js  app/manifest.webmanifest
tests/js/ plan, fsrs (+migrasi), grammar, mistakes, essay, reader, speakexam
tests/   test_grammar.py  test_reader.py  test_speaking.py  test_writing.py
```

Semua berkas data baru tetap hasil build yang di-commit, dan `test_committed_data_is_current` diperluas ke berkas baru.

## 7. Referensi dan sumber data

### Resmi (sumber kebenaran)

| Sumber | Isi | Pemakaian |
|---|---|---|
| CTI, 《新版HSK（1-6级）考试结构与样题示例》 (2025-12) | struktur ujian tulis level 1–6 | `blueprints/` (sudah) |
| 《HSK 考试大纲》 (CLEC/CTI, 2025-11), [chinesetest.cn/syllabus](https://www.chinesetest.cn/syllabus) | daftar kata, hanzi tulis | `data/hsk3/` (sudah) |
| [chinesetest.cn](https://www.chinesetest.cn) | pendaftaran, pengumuman skor, contoh soal speaking bila terbit | panduan ujian (L), blueprint speaking (H) |
| Pengumuman pendaftaran HSK 3.0, mis. [Beijing.gov.cn, 2025-12](https://english.beijing.gov.cn/studyinginbeijing/news/202512/t20251222_4355931.html), [Guangming, 2025-12](https://m.gmw.cn/2025-12/19/content_1304269625.htm) | jadwal uji coba dan pendaftaran | konteks §2 |

### Data terbuka yang bisa dipakai (cek lisensi sebelum dimasukkan)

| Sumber | Isi | Lisensi (dicek/perlu dicek) | Untuk |
|---|---|---|---|
| [ofou/hsk](https://github.com/ofou/hsk) | salinan silabus | MIT atas salinan; isi milik CLEC/CTI | sudah dipakai |
| CC-CEDICT (lewat [drkameleon/complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary)) | glos Inggris | CC BY-SA 4.0 | sudah dipakai |
| [Hanzi Writer](https://hanziwriter.org/license.html) + data goresan | animasi goresan | kode MIT, data Arphic Public License | sudah dipakai |
| [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) `dictionary.txt` | dekomposisi, radikal, petunjuk etimologi | **perlu dicek** (berkas grafik berlisensi Arphic; berkas kamus disebut berlisensi lain) | komponen hanzi (E, K) |
| [Tatoeba](https://tatoeba.org/downloads) | ±200 rb kalimat Mandarin + terjemahan, sebagian beraudio | teks CC BY 2.0 FR (sebagian CC0); **audio: lisensi per perekam** | ide/contoh kalimat tambahan, audio (I); kalimat tetap harus lolos pemeriksa level |
| [ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs) / [open-spaced-repetition](https://github.com/open-spaced-repetition) | algoritma FSRS | MIT | Hafalan v2 (C) |
| Unicode Unihan | radikal, jumlah goresan | Unicode License | komponen hanzi (K) |
| pypinyin, jieba | pinyin, segmentasi | MIT | build (pypinyin sudah dipakai) |
| Daftar frekuensi kata (mis. SUBTLEX-CH) | urutan gelombang kosakata | **perlu dicek** (lisensi akademik) | urutan B; bisa diganti hitungan frekuensi dari kalimat contoh sendiri |

### Rujukan belajar (dibaca, tidak disalin)

- Chinese Grammar Wiki (AllSet Learning): penjelasan pola per level; **lisensinya perlu dicek** (kemungkinan nonkomersial, tidak cocok dengan CC BY-SA konten kita), jadi hanya dijadikan rujukan saat menulis penjelasan sendiri.
- Panduan HSK 3.0 pihak ketiga (dipakai untuk §2, semuanya [sekunder]):
  [studycli.org — New HSK 3.0](https://studycli.org/hsk/the-new-hsk/),
  [hsklord — HSK passing scores](https://hsklord.com/blog/hsk-passing-scores),
  [hsklord — New HSK 3.0 guide](https://hsklord.com/blog/new-hsk-3-0-complete-guide),
  [hsklord — HSK test dates 2026](https://hsklord.com/blog/hsk-3-0-test-dates-2026),
  [saymei — HSKK & HSK speaking 3–6](https://www.saymei.app/guides/hskk-speaking-test),
  [saymei — HSK exam guide](https://www.saymei.app/guides/hsk-exam-guide),
  [echineselearning — HSK 3.0 speaking rubric](https://www.echineselearning.com/blog/hskk-scoring-rubric-self-assessment),
  [mandarinzone — HSK 5 & 6 speaking](https://www.mandarinzone.com/hsk-5-6-speaking-test-guide/),
  [nihawa — HSK speaking test](https://nihawa.com/learn/hsk-speaking-test),
  [The Pure Language — HSK 3.0 format](https://www.thepurelanguage.com/Articles/Hsk3NewExamFormat),
  [second-language.app — HSK 3.0 guide](https://second-language.app/blog/hsk-3-guide),
  [chinaeducenter — HSK 3.0 Band 5](https://www.chinaeducenter.com/en/hsk/newhskband5.php).

## 8. Risiko dan keputusan

| Risiko | Mitigasi |
|---|---|
| Format speaking dan skor resmi berubah/berbeda dari sumber sekunder | Format di blueprint data (bukan kode), label "belum terverifikasi", perbarui saat CTI terbit |
| Volume konten besar (4.400 kata, ±1.000 soal HSK 4–6, ±300 poin tata bahasa) | Gelombang kecil, urut frekuensi, pemeriksa otomatis, lembar review, status per butir |
| Konten AI keliru/tidak natural | Pemeriksa level + pemecah kedua + review penutur asli; lencana status |
| Penilaian esai/speaking terlalu optimistis | Hanya "perkiraan", jawaban model dan rubrik selalu ditampilkan, AI opsional |
| Lisensi sumber luar tidak cocok dengan CC BY-SA | Tabel §7 diisi setelah lisensi dicek; sumber nonkomersial hanya rujukan |
| Data lokal hilang (browser dibersihkan) | Pengingat ekspor berkala, IndexedDB + `navigator.storage.persist()`, sinkronisasi opsional nanti |

Keputusan yang perlu dari pemilik proyek:
1. Level target pribadi dan tanggal ujian (menentukan apakah fase 1 atau fase 2 didahulukan).
2. Apakah penilai AI opsional (kunci API milik pengguna) boleh masuk aplikasi.
3. Apakah ada penutur asli/guru yang bisa mereview per gelombang.
4. Apakah navigasi ponsel boleh dirombak (10 tab → 5 tab + menu).
