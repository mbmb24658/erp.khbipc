---
Task ID: 1
Agent: main
Task: رفع 504 Gateway Timeout در /api/wbs/auto-plan-progress + اتصال فعالیت‌های PMS به موضوعات استراتژیک در کارپوشه

Work Log:
- بررسی API `/api/wbs/auto-plan-progress`: کشف شد که برای هر WBS به صورت جداگانه DELETE + N INSERT + UPDATE انجام می‌شد → با 100+ فعالیت، 700+ SQL operation متوالی → 504 timeout روی Vercel
- بازنویسی `/api/wbs/auto-plan-progress/route.ts` با bulk SQL:
  * تک UPDATE با `FROM (VALUES ...)` برای progressPlan همه WBSها
  * تک DELETE + multi-row INSERT برای WBSMonthlyProgress (با ON CONFLICT fallback)
  * اضافه کردن `export const maxDuration = 300`
  * chunk کردن operations برای جلوگیری از 65535 param limit
- بررسی API `/api/wbs/backfill-topics`: کشف شد که فقط WBS.strategicTopic را پر می‌کند ولی Activity.strategicTopic هیچ‌وقت پر نمی‌شود → فعالیت‌های کارپوشه همیشه "بدون موضوع"
- بازنویسی `/api/wbs/backfill-topics/route.ts`:
  * اضافه کردن `ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "strategicTopic"`
  * backfill WBS.strategicTopic از wbsCode (با bulk UPDATE)
  * backfill Activity.strategicTopic از WBS مرتبط (از طریق JOIN روی wbsId)
  * `export const maxDuration = 300`
- اصلاح `src/app/(admin)/portfolio/page.tsx`:
  * اضافه کردن `strategicTopic: true` به select مربوط به WBS
  * اضافه کردن `wbsId: true` به select مربوط به Activity
  * ساخت lookup map برای WBS strategic topic از طریق raw SQL
  * fallback: اگر Activity.strategicTopic null بود، از WBS مرتبط استخراج می‌شود
  * fallback: اگر WBS.strategicTopic null بود، از wbsCode محاسبه می‌شود (parts[0].parts[1])
- اصلاح frontend در `src/app/(admin)/wbs/page.tsx`:
  * اضافه کردن AbortController با 90s timeout برای بازخورد بهتر به کاربر
  * `?force=true` برای backfill تا همه رکوردها refresh شوند
  * نمایش تعداد monthlyRecords در پیام موفقیت
- به‌روزرسانی `vercel.json`:
  * `maxDuration: 300` برای auto-plan-progress و backfill-topics
  * `maxDuration: 60` برای bulk-move
  * `maxDuration: 30` برای سایر API routes

Stage Summary:
- 4 فایل اصلاح شد: auto-plan-progress/route.ts, backfill-topics/route.ts, portfolio/page.tsx, wbs/page.tsx
- 1 فایل پیکربندی به‌روزرسانی شد: vercel.json
- همه فایل‌ها TypeScript type-check را با موفقیت پشت سر گذاشتند
- تغییرات آماده deploy روی Vercel هستند
- پس از deploy، کاربر باید:
  1. روی «محاسبه خودکار پیشرفت برنامه» کلیک کند → درصد پیشرفت برنامه برای همه فعالیت‌ها محاسبه می‌شود
  2. روی «بروزرسانی موضوعات استراتژیک» کلیک کند → همه فعالیت‌های PMS و Activity به موضوع استراتژیک خودشان متصل می‌شوند
  3. به کارپوشه برود → فعالیت‌ها باید در موضوعات استراتژیک صحیح دسته‌بندی شده باشند

---
Task ID: 2
Agent: main
Task: افزودن «حالت مدرن» با افکت‌های ElectricBorder، FloatingLines و LineSidebar

Work Log:
- بررسی ساختار تم فعلی: ThemeProvider از next-themes با dark/light attribute
- ایجاد ۴ کامپوننت جدید در `src/components/modern/`:
  * `modern-mode-provider.tsx`: Context + localStorage برای ذخیره حالت مدرن
  * `electric-border.tsx`: افکت حاشیه برقی متحرک با conic-gradient
  * `floating-lines.tsx`: پس‌زمینه خطوط شناور با canvas (interactive mouse)
  * `line-sidebar.tsx`: سایدبار با واکنش به نزدیکی ماوس
- افزودن ModernModeProvider به Providers در `src/components/providers.tsx`
- افزودن دکمه «حالت مدرن» (آیکون Sparkles) به ThemeToggle در `src/components/sidebar.tsx`
  * کنار دکمه dark/light
  * فعال‌سازی با انیمیشن pulse و ring
  * نمایش badge "[MODERN]" در هدر
- بازنویسی Sidebar برای پشتیبانی از دو حالت:
  * Classic: همان طراحی قبلی (emerald/teal)
  * Modern: LineSidebar با proximity effect و neon colors
- افزودن FloatingLines به پس‌زمینه اصلی (فقط در حالت مدرن)
- بازنویسی صفحه login:
  * FloatingLines همیشه فعال (اولین مواجهه کاربر)
  * ElectricBorder دور کارت ورود
  * دکمه toggle modern در گوشه بالا
- اعمال ElectricBorder روی داشبورد:
  * ۴ StatCard با presetهای متفاوت (project, hr, financial, kpi)
  * ۵ SectionCard با presetهای مرتبط
  * پارامترها: color, speed, chaos, thickness, borderRadius
- به‌روزرسانی `src/app/globals.css`:
  * @keyframes eb-rotate و eb-pulse برای ElectricBorder
  * @property --eb-angle برای انیمیشن angle
  * رنگ‌های modern mode (deep navy + neon emerald)
  * body background با radial gradient
  * card glow، glass enhancement، button glow، scrollbar neon
  * قوانین CSS برای نمایش/مخفی کردن electric border و floating lines

Stage Summary:
- ۹ فایل ایجاد/اصلاح شد:
  * جدید: ۴ کامپوننت در src/components/modern/
  * اصلاح: providers.tsx, sidebar.tsx, login/page.tsx, dashboard-charts.tsx, globals.css
- Build موفق با `npx next build` (هیچ خطای جدیدی نداد)
- TypeScript type-check تمیز (فقط خطاهای از قبل موجود در dashboard-charts باقی ماند)
- فایل zip: `/home/z/my-project/download/khbipc-modern-mode.zip` (۲۷KB)

نحوه استفاده:
1. فایل zip را دانلود و در ریپو extract کنید (مسیرها حفظ شده‌اند)
2. Push به Git و Vercel به‌طور خودکار rebuild می‌کند
3. در هدر بالای صفحه، کنار دکمه dark/light، یک دکمه جدید با آیکون ✨ (Sparkles) وجود دارد
4. روی آن کلیک کنید → حالت مدرن فعال می‌شود:
   - پس‌زمینه navy تیره با gradient‌های radial
   - خطوط شناور در پس‌زمینه (به ماوس واکنش نشان می‌دهد)
   - حاشیه برقی متحرک دور کارت‌های داشبورد
   - سایدبار با واکنش به نزدیکی ماوس (آیتم‌ها جابه‌جا می‌شوند و رنگ می‌گیرند)
   - glow روی کارت‌ها و دکمه‌ها
5. صفحه ورود همیشه با این افکت‌ها نمایش داده می‌شود (اولین مواجهه کاربر)

