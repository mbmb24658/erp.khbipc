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
