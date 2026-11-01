# Zoom Clone - WebRTC Video Conferencing

Zoom uslubidagi zamonaviy, to'liq moslashuvchan (Mobile, Tablet, PC) video-konferensiya veb-ilovasi.

## 🚀 Ishga tushirish (Running)
Loyiha `FastAPI` va `WebSockets` asosida qurilgan.

Serverni ishga tushirish uchun quyidagi buyruqni bering:
```bash
uv run uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

* **Kompyuterda (PC):** [http://localhost:8000](http://localhost:8000)
* **Telefon yoki Planshetda (Mobile/Tablet):** [http://192.168.1.3:8000](http://192.168.1.3:8000) *(kompyuter bilan bir xil Wi-Fi tarmog'ida bo'lganda)*

---

## 📱 Moslashuvchanlik (Responsive Design)
* **Mobile (< 768px):** 
  - Pastki qulay sensorli menyu (Bottom Navigation Bar)
  - Chat va Ishtirokchilar ro'yxati pastdan chiquvchi zamonaviy oyna (Bottom Sheet Drawer)
  - Vertikal / gorizontal video moslashuvi
* **Tablet (768px - 1024px):**
  - 2x2 va 3x2 avtomatik tartiblanuvchi video panjarasi
  - Qisman yon panel va qulay tugmalar
* **Desktop / PC (> 1024px):**
  - Katta Galereya (Gallery View) va Spiker (Speaker View)
  - Zoom uslubidagi to'liq boshqaruv paneli (Mic, Cam, Security, Share Screen, Whiteboard, Reactions, Record)
  - Push-to-talk (`Space` tugmasi bosib turganda gapirish)

---

## ⚡ Asosiy Imkoniyatlar
1. **WebRTC Video va Audio:** Jonli, sifatli video/audio aloqa.
2. **Ekran ulashish (Screen Share):** O'z kompyuter yoki telefon ekranini hammaga ko'rsatish.
3. **Interaktiv Oq Doska (Whiteboard):** Birgalikda rasm chizish, belgilash va PNG qilib yuklab olish.
4. **Jonli Chat:** Umumiy va shaxsiy (1-on-1) xabarlar.
5. **Reaksiyalar va Qo'l ko'tarish:** Ekranda uchuvchi emojilar va navbat tizimi.
6. **Moderatsiya (Host):** Hammaga bir tugma bilan Mute qilish (`Mute All`), xonani qulflash (`Lock Meeting`), ishtirokchini chiqarib yuborish (`Kick`).
7. **Yozib olish (Local Recording):** MediaRecorder orqali uchrashuvni to'g'ridan-to'g'ri brauzerdan WebM/MP4 formatda yuklab olish.
8. **100 kishilik Demo Generator:** `+ Demo` tugmasi orqali xonaga avtomatik 5, 10, 25, 50, 100 ta virtual ishtirokchini qo'shib, interfeys va tarmoq yuklamasini sinash imkoniyati.
