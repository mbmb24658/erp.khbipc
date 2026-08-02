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

---
Task ID: 3
Agent: main
Task: بازطراحی کامل داشبورد با ساختار جدید (KPI + TrendChart + TopItems + جدول + عملکرد پرسنل)

Work Log:
- بازنویسی کامل `src/app/(admin)/dashboard-charts.tsx`:
  * حذف SectionCardهای تخصصی (PMS، مالی، ریسک، مسائل، ارزیابی)
  * ایجاد کامپوننت TrendChart (AreaChart) برای نمایش روند پیشرفت سازمان
  * ایجاد کامپوننت TopItemsList برای نمایش ۵ مورد برتر (پرهزینه‌ترین دسته‌ها)
  * ایجاد کامپوننت RecentTable (جدول تمام‌عرض آخرین فعالیت‌ها)
  * ایجاد کامپوننت PersonnelStatsGrid (گرید پرسنل با لوگو و ۶ متریک)
  * به‌روزرسانی DashboardData interface با فیلدهای جدید: recentItems, personnelStats
  * حفظ ElectricBorder برای حالت مدرن روی همه‌ی کارت‌ها
- بازنویسی `src/app/(admin)/page.tsx`:
  * کوئری‌های جدید: costBreakdown، recentActivities، recentWbs، personnel، users، userLogs
  * محاسبه ۶ متریک برای هر پرسنل:
    - تعداد فعالیت‌ها (از activityAssignments)
    - میانگین درصد پیشرفت (از progressPct)
    - تعداد فعالیت‌های «خارج از چارت» (با delayCauseId)
    - تعداد فعالیت‌های اصلاحی (isCorrective)
    - تعداد ثبت علت تأخیر (delayCauseId)
    - میزان حضور در سامانه (از UserLog در ۳۰ روز اخیر)
  * تجمیع costByCategory (گروه‌بندی بر اساس category)
  * merge کردن recentActivities + recentWbs (۱۰ مورد آخر)
  * ساخت lookup برای userLogCounts (با فیلتر ۳۰ روز اخیر)

ساختار داشبورد جدید:
  ردیف ۱: هدر «داشبورد» + توضیح «نمای کلی عملکرد سازمان»
  ردیف ۲: ۴ کارت KPI:
    - تعداد پرسنل (آیکون Users، رنگ emerald/teal)
    - پروژه‌های فعال PMS (آیکون Network، رنگ blue/indigo)
    - درآمد کل (آیکون DollarSign، رنگ amber/orange)
    - ریسک‌های باز (آیکون AlertTriangle، رنگ rose/red)
  ردیف ۳: گرید ۲ ستونی:
    - ستون چپ (۲/۳): TrendChart — AreaChart روند پیشرفت برنامه‌ریزی‌شده vs واقعی
    - ستون راست (۱/۳): TopItemsList — ۵ دسته‌ی پرهزینه
  ردیف ۴: PersonnelStatsGrid — کارت پرسنل با:
    - آواتار (با initials) + نام + سمت
    - گرید ۳×۲ متریک با آیکون و رنگ متمایز برای هر متریک
  ردیف ۵: RecentTable — جدول تمام‌عرض با ستون‌های:
    - عنوان (با badge نوع PMS/جاری + کد + عنوان)
    - وضعیت (Badge)
    - مسئول
    - تاریخ (فارسی)
    - درصد پیشرفت (Progress bar + عدد)

Stage Summary:
- ۲ فایل اصلاح شد: page.tsx (بازنویسی کامل)، dashboard-charts.tsx (بازنویسی کامل)
- Build موفق با `npx next build`
- TypeScript type-check تمیز
- فایل zip: `/home/z/my-project/download/khbipc-dashboard-v2.zip` (۱۲KB)

نکات:
- همه‌ی اعداد فارسی و با کاما جدا می‌شوند (toLocaleString("fa-IR"))
- تاریخ‌ها به فارسی نمایش داده می‌شوند
- در حالت مدرن، ElectricBorder روی همه‌ی کارت‌ها فعال است
- compact amount: م.ت (میلیارد)، م.م (میلیون)، ه.ت (هزار تومان)


---
Task ID: 4
Agent: main
Task: اصلاحات داشبورد: پردرآمدترین دارایی‌ها + واحد پولی + پرسنل + خارج از چارت + موضوعات استراتژیک + ریسک HeatMap

Work Log:
- اصلاح واحد پولی در `dashboard-charts.tsx`:
  * مبالغ در دیتابیس به «میلیون تومان» ذخیره می‌شوند (نه هزار تومان)
  * مثال: 500 = 500 میلیون تومان، 6150 = 6.15 میلیارد تومان
  * تابع `formatAmount`: مقدار >= 1000 → «X میلیارد تومان»، مقدار < 1000 → «X میلیون تومان»
  * تابع `formatAmountCompact`: «م.ت» (میلیارد) یا «م.م» (میلیون)
  * نمایش suffix روی کارت درآمد کل: «(میلیارد تومان)» یا «(میلیون تومان)»
- جایگزینی «پرهزینه‌ترین دسته‌ها» با «پردرآمدترین دارایی‌ها»:
  * کوئری جدید: `RevenueBreakdown.findMany` با JOIN روی Asset
  * تجمیع درآمد هر دارایی (actualRevenue + programForecast)
  * مرتب‌سازی نزولی و گرفتن ۱۰ مورد برتر
- اصلاح کوئری پرسنل:
  * فیلتر `where: { user: { isNot: null } }` — فقط پرسنل دارای حساب کاربری
  * شامل فعالیت‌های Activity (از activityAssignments) + فعالیت‌های PMS (از WBS با hrActual)
  * کوئری جداگانه برای WBSهای سطح ۴ که personelId در hrActual است
- اصلاح محاسبه «خارج از چارت»:
  * فعالیت‌های Activity: user در hrActual است ولی orgChartId در hrPlan نیست
  * فعالیت‌های PMS: user در hrActual است ولی orgChartId در hrPlan نیست
  * استفاده از `parseIdArray` برای parse کردن JSON array
- اصلاح میانگین پیشرفت:
  * progressPct در Activity و progressActual در WBS هر دو ۰-۱ ذخیره می‌شوند
  * فرمول صحیح: `(sum / count) * 100` (نه `sum * 100 / count`)
  * محاسبه میانگین وزنی Activity + PMS با هم
- اصلاح شمارش فعالیت‌های PMS:
  * کوئری WBS با `level >= 4` و بررسی `hrActual` شامل personelId
  * شمارش موارد با `status === "on_hold"` به عنوان تأخیر (WBS فیلد delayCauseId ندارد)
  * `isCorrective` فقط برای Activity موجود است (روی WBS صفر)
- اضافه شدن چارت‌های موضوعات استراتژیک (StrategicTopicCharts):
  * کوئری WBS سطح ۲ با monthlyProgress
  * فیلتر بر اساس strategicTopic (1.1 - 1.5)
  * نمایش ۵ کارت کوچک با AreaChart برای هر موضوع
  * نمایش «برنامه» و «واقعی» با رنگ‌های متمایز
  * عنوان فارسی: «۱.۱ - حکمرانی دارایی‌محور» و ...
- اضافه شدن چارت ریسک + HeatMap (RiskCharts):
  * کوئری RiskEvaluation + Risk
  * ساخت latestEvalByRisk map
  * محاسبه byType، byLevel، heatmap (5×5 matrix)
  * نمایش ۴ کارت آماری: کل، باز، بسته، بحرانی
  * BarChart توزیع بر اساس نوع
  * HeatMap 5×5 با رنگ‌های emerald/amber/orange/red
  * Legend با ۴ سطح: پایین، متوسط، زیاد، بحرانی
- هشدار در TrendChart اگر actualPct خالی است:
  * پیام: «هنوز پیشرفت واقعی ثبت نشده است — برای محاسبه، از صفحه PMS روی «محاسبه خودکار پیشرفت برنامه» کلیک کنید»

Stage Summary:
- ۲ فایل اصلاح شد: page.tsx، dashboard-charts.tsx
- Build موفق با `npx next build`
- TypeScript type-check تمیز (فقط خطاهای از قبل موجود در notifications)
- فایل zip: `/home/z/my-project/download/khbipc-dashboard-v3.zip`

ساختار نهایی داشبورد:
  ردیف ۱: هدر + ۴ کارت KPI (پرسنل، PMS، درآمد کل با واحد صحیح، ریسک‌های باز)
  ردیف ۲: TrendChart (2/3) + TopAssetsList پردرآمدترین دارایی‌ها (1/3)
  ردیف ۳: PersonnelStatsGrid (فقط کاربران دارای حساب، شامل PMS)
  ردیف ۴: StrategicTopicCharts (۵ نمودار برای موضوعات ۱.۱ تا ۱.۵)
  ردیف ۵: RiskCharts (آمار + BarChart نوع + HeatMap 5×5)
  ردیف ۶: RecentTable (جدول ۱۰ فعالیت آخر)


---
Task ID: 5
Agent: main
Task: ارتقای جامع رابط کاربری به فضای کاری enterprise (Linear/Vercel/Notion style)

Work Log:
- افزودن design tokens کامل به `src/app/globals.css`:
  * ۷ status color sets (overdue, current, corrective, pms, pending, completed, onhold)
  * هر status شامل: color, bg, border (light + dark)
  * ۵ سطح elevation با shadow لایه‌ای (light + dark)
  * surface hierarchy (background → card → popover)
  * motion tokens (ease-out-soft, durations)
  * ActivityCard variant classes (7 variants با gradient background + border accent)
  * Progress bar color variants (low/medium/high)
  * Status badge classes (badge-overdue, badge-current, ...)
  * Page transition animation (fade + slide-up)
  * Stagger children animation (8 children با delay 40ms)
  * Skeleton shimmer enhancement
  * FAB (Floating Action Button) class
  * Micro-interactions (button press scale, toast slide-in)
  * Gauge ring animation
  * Surface tint utilities
  * Enhanced focus visible
  * Reduced motion overrides
- ساخت کامپوننت `src/components/activity-card.tsx`:
  * ۷ variant: overdue, current, corrective, pms, pending, completed, onhold
  * هر variant: آیکون، badge، رنگ حاشیه، tinted background
  * Progress bar با رنگ پویا (0-50% قرمز، 50-80% کهربایی، >80% سبز)
  * detectVariant() function برای تشخیص خودکار variant از status + dueDate
  * StatusBadge component
- ساخت کامپوننت `src/components/command-palette.tsx`:
  * باز شدن با Cmd+K (Mac) یا Ctrl+K (Windows/Linux)
  * باز شدن با "/" (وقتی در input نیست)
  * ۲۰ آیتم ناوبری در ۶ گروه (اصلی، مدیریت پروژه، منابع انسانی، مالی، ریسک، سیستم)
  * Fuzzy search با keywords فارسی + انگلیسی
  * Quick actions (فعالیت جدید، ساختار WBS)
  * Floating search button در گوشه پایین-چپ
- ساخت کامپوننت `src/components/page-transition.tsx`:
  * PageTransition: fade + slide-up با framer-motion (250ms, ease-out-soft)
  * StaggerGroup + StaggerItem: برای staggering children در لیست‌ها
  * CardHover: scale + shadow روی hover
- به‌روزرسانی `src/app/(admin)/layout.tsx`:
  * افزودن <CommandPalette /> به layout
- به‌روزرسانی `src/app/(admin)/dashboard-charts.tsx`:
  * تمام Cardها: افزودن `elevated-card surface-tint-1`
  * KPI grid: افزودن `stagger-children` برای انیمیشن ورود
- به‌روزرسانی `src/app/(admin)/user-dashboard.tsx`:
  * ActivityCard محلی: استفاده از `activity-card activity-card--{variant}`
  * تشخیص variant از status + isCorrective + overdue
  * Progress bar با progress-track-low/medium/high
  * Badge overdue با badge-overdue class
  * رنگ تاریخ overdue با var(--status-overdue)

Stage Summary:
- ۶ فایل ایجاد/اصلاح شد:
  * جدید: activity-card.tsx, command-palette.tsx, page-transition.tsx
  * اصلاح: globals.css, (admin)/layout.tsx, (admin)/dashboard-charts.tsx, (admin)/user-dashboard.tsx
- Build موفق با `npx next build`
- TypeScript type-check تمیز
- فایل zip: `/home/z/my-project/download/khbipc-enterprise-ui.zip`

نواحی ارتقا:
1. **Design Tokens**: ۷ وضعیت semantic با رنگ‌های ملایم، ۵ سطح elevation، motion tokens
2. **ActivityCard**: ۷ variant متمایز (overdue/current/corrective/pms/pending/completed/onhold)
3. **Command Palette**: Cmd+K با ۲۰ آیتم ناوبری + fuzzy search فارسی/انگلیسی
4. **Page Transitions**: fade + slide-up با framer-motion
5. **Stagger Animations**: ورود پلکانی کارت‌ها
6. **Progress Bar Colors**: پویا بر اساس مقدار (قرمز/کهربایی/سبز)
7. **Elevated Cards**: surface tint + elevation 1 → 3 روی hover
8. **Micro-interactions**: button press scale, toast slide-in
9. **Accessibility**: focus visible بهبودیافته، reduced motion support




