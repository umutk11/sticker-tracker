# Panini WM 2026 Sticker Tracker

Mobil-first, statik bir PWA. 3+ arkadaşın Panini Dünya Kupası 2026 sticker koleksiyonunu birlikte takip etmesini ve duplicate sticker takas fırsatlarını otomatik görmesini sağlar.

Uygulama yalnızca Firebase Firestore ile çalışır. Demo database, mock database veya `localStorage` fallback içermez.

## Dosyalar

- `index.html`: Uygulama kabuğu ve ekran yapısı.
- `style.css`: Koyu tema, mobil-first grid, takas kartları ve PWA görünümü.
- `app.js`: GROUPS datası, sticker slug üretimi, Firestore realtime sync, özetler ve takas algoritmaları.
- `firebase-config.example.js`: Firebase config şablonu.
- `manifest.json`: PWA manifest ayarları.
- `sw.js`: Statik dosyalar için basit service worker cache.
- `README.md`: Kurulum ve kullanım dokümantasyonu.

## Firebase Kurulumu

1. [Firebase Console](https://console.firebase.google.com/) içinde yeni bir proje oluştur.
2. Firestore Database oluştur.
3. Project settings içinde Web app ekle.
4. Firebase Web config bilgilerini al.
5. `firebase-config.example.js` dosyasını kopyala.
6. Kopyanın adını `firebase-config.js` yap.
7. İçine kendi Firebase config bilgilerini koy:

```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

`firebase-config.js` yoksa uygulama açılır ama çalışmaya başlamaz ve şu hatayı gösterir:

> Firebase bağlantısı eksik. Lütfen firebase-config.js dosyasını oluşturun.

## Firebase Config Güvenliği

GitHub Pages statik hosting kullandığı için `firebase-config.js` tarayıcıya public olarak gider. Firebase `apiKey` tek başına gizli parola değildir. Asıl güvenlik Firestore rules, Authentication veya erişimi zor tahmin edilen collection/document yapılarıyla sağlanır.

Bu MVP `collections/main` dokümanını kullanır:

```txt
collections/main
```

## Firestore Rules

Development için kısa süreli public read/write örneği:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /collections/main {
      allow read, write: if true;
    }
  }
}
```

Bu rules gerçek kullanım için güvenli değildir. Test mode veya public write rules uzun süre açık bırakılmamalıdır. Daha güvenli kullanım için Firebase Auth ekleyebilir, sadece belirli kullanıcıların yazmasına izin verebilir veya `collections/main` yerine grup tarafından bilinen gizli bir collection/document id kullanabilirsin.

## Lokal Çalıştırma

Statik ES module import kullanıldığı için dosyayı doğrudan açmak yerine küçük bir lokal server ile çalıştır.

VS Code Live Server kullanabilir veya terminalde şunu çalıştırabilirsin:

```bash
python3 -m http.server 8000
```

Sonra tarayıcıda aç:

```txt
http://localhost:8000
```

Firebase SDK CDN üzerinden yüklendiği için internet bağlantısı gerekir.

## GitHub Pages Deploy

1. GitHub repo oluştur.
2. Bu dosyaları repo root içine koy ve pushla.
3. GitHub repo içinde Settings → Pages bölümüne git.
4. Source: Deploy from branch seç.
5. Branch: `main` seç.
6. Folder: `/root` seç.
7. Yayınlanan GitHub Pages URL’sini aç.

`firebase-config.js` dosyasının da deploy edilmiş olması gerekir. Statik hosting olduğu için bu dosya public görünür.

## iPhone’da PWA Olarak Kullanım

1. Safari’de GitHub Pages sitesini aç.
2. Share butonuna bas.
3. Add to Home Screen seç.
4. Ana ekrandan standalone app gibi aç.

## Takım Listesini Değiştirme

Takımlar [app.js](./app.js) içindeki `GROUPS` constant içinde durur. Grup veya takım değişikliği gerekiyorsa burayı düzenle. Sticker ID’leri takım adlarından deterministic slug ile üretilir.

Örnekler:

- `Türkiye` sticker 7 → `turkiye-7`
- `Güney Kore` sticker 12 → `guney-kore-12`
- `Fildişi Sahili` sticker 4 → `fildisi-sahili-4`
- `Yeşil Burun Adaları` sticker 9 → `yesil-burun-adalari-9`
- `Demokratik Kongo Cumhuriyeti` sticker 3 → `demokratik-kongo-cumhuriyeti-3`

## Kullanıcılar

Başlangıç kullanıcıları:

- Umut
- Arkadas1
- Arkadas2

Yeni kullanıcılar app içindeki “Kullanıcı ekle” butonuyla Firestore’daki `users` listesine eklenir. Boş isim, aynı isim ve 30 karakterden uzun isim kabul edilmez.

Yeni kullanıcı eklendiğinde eski sticker kayıtlarında eksik kullanıcı alanları okuma tarafında `0` kabul edilir. Sticker kaydedildiğinde ilgili sticker map’i tutarlı şekilde Firestore’a yazılır.

## Takas Mantığı

- `count === 0`: sticker eksik.
- `count === 1`: sticker var.
- `count > 1`: duplicate, takaslık.

Uygulama şunları hesaplar:

- Bana gelebilecekler: Aktif kullanıcının eksik olduğu ve başka kullanıcıda duplicate olan stickerlar.
- Ben verebilirim: Aktif kullanıcının duplicate olduğu ve başka kullanıcıların eksik olduğu stickerlar.
- Karşılıklı takas: İki kullanıcının birbirine verebileceği stickerlar.

Takas metni “Kopyala” butonuyla WhatsApp’a gönderilebilir formatta panoya alınır.

## Notlar

- Toplam 12 grup, 48 takım, 960 sticker vardır.
- Her takımda 20 sticker bulunur.
- Firestore `onSnapshot` ile realtime dinlenir.
- Hücreye dokununca aktif kullanıcının adedi `0 → 1 → 2 → 3 → 0` döner.
- Yazmalar debounce ile yapılır ve ilgili sticker map’i Firestore’a kaydedilir.
- Offline local database fallback yoktur. Çevrimdışı kalındığında uygulama uyarı gösterir.
