# نقطة استرجاع — ZK والتشغيل والمسح (حفظ مرجعي)

تاريخ الإنشاء: 2026-05-02 — لاستخدامه عند حدوث مشكلة والرجوع لما كان واضحاً.

## 1) تشغيل المشروع محلياً

- من **جذر المونوريبو**: `npm run dev:all` يشغّل **الـ API + Vite** معاً.
- **`npm run dev` وحده من الجذر** يشغّل الواجهة فقط → طلبات `/api` تفشل (`ECONNREFUSED` للـ proxy) إذا الـ API غير شغّال على **5000**.
- الـ API: `http://localhost:5000` — فحص: `GET /api/health`.
- Vite قد يستخدم **3000** أو **3001/3002** إذا المنافذ مشغولة؛ راقب مخرجات الطرفية.

## 2) «فشل الاتصال» في نموذج الجهاز

- العنوان الأحمر **«فشل الاتصال أو قراءة البيانات»** قد يعني:
  - **لا اتصال بالـ API**: شغّل `dev:all`؛ الواجهة تُحسّن رسالة الشبكة عند `Network Error` / `ECONNREFUSED` بدون رد من السيرفر.
  - **لا اتصال بجهاز ZK**: الـ API يجب أن يكون على **نفس LAN** عنوان الجهاز (`192.168.x.x`)، أو استخدم **`DTR_ZKTECO_API_URL`** (جسر) إذا الـ API على السحابة.
- جسر LAN مضمّن في المشروع: **`backend/zk-lan-bridge/`** + `npm run bridge:zk-lan` من مجلد `backend`، ثم ضبط `DTR_ZKTECO_API_URL` على الـ API.

## 3) أزمنة الطلبات في اللوج (طبيعي / سبب التأخير)

| الطلب | مثال زمن | الملاحظة |
|--------|-----------|-----------|
| `POST /api/devices/probe-zk-socket` | ~21 ثانية | بروتوكول ZK (TCP/UDP + مهلات). **200** = اكتمل الطلب؛ نجاح الجهاز يُقرأ من جسم الرد. |
| `POST /api/devices/probe-connection` | ~108 ثانية | مسح **HTTP** تسلسلي على عدة منافذ ومسارات؛ كل محاولة `PROBE_TIMEOUT_MS` = **4500 ms**. إذا لا رد من الجهاز على HTTP، يقترب الزمن من **عدد الروابط × 4.5 ث**. |

الملف: `backend/src/services/device.service.js` — ثوابت `PROBE_TIMEOUT_MS` و`buildProbeUrls` / `probeDeviceConnection`.

## 4) تعديلات تقنية مرتبطة بهذه النقطة

- **UDP لـ ZK**: تجنب منفذ UDP ثابت 5000 في مسار مستخدمي الجهاز؛ استخدام `ZK_UDP_LOCAL_PORT` أو منفذ عشوائي عالي في `listZkUsersOnDevice` و`probeSnapshot` (انظر `zktecoSocket.service.js`).
- **تصحيح zkteco-js**: ملف `backend/src/utils/zktecoJsUdpFallbackPatch.js` — إعادة محاولة UDP بعد `ECONNREFUSED` عندما تفشل المكتبة الأصلية بسبب `ZkError` بدون `code` على الغلاف.

## 5) مهام طرفية خلفية (Cursor)

- إن ظهر إشعار **aborted** لتشغيل `npm run dev:all` في الخلفية، أعد التشغيل يدوياً في طرفية تفاعلية من جذر المشروع.

## 6) Git

- لالتقط نقطة رسمية على Git بعد استقرار الكود:  
  `git tag -a checkpoint-zk-2026-05-02 -m "ZK probe notes + bridge"`  
  ثم `git push origin checkpoint-zk-2026-05-02` إن رغبت بالمشاركة.

---

*هذا الملف مرجعي فقط؛ لا يغيّر سلوك التطبيق.*
