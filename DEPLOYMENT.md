# راهنمای دیپلوی روی Vercel

این راهنما نحوه دیپلوی برنامه مدیریت شرکت خوارزمی بندر امام روی Vercel را توضیح می‌دهد.

## پیش‌نیازها

1. حساب GitHub (برای push کد)
2. حساب Vercel (https://vercel.com — رایگان)
3. یک پایگاه داده PostgreSQL (یکی از گزینه‌های زیر):
   - **Neon** (توصیه‌شده — رایگان، serverless): https://neon.tech
   - **Vercel Postgres**: از dashboard Vercel
   - **Supabase**: https://supabase.com
   - **Railway**: https://railway.app

---

## مرحله ۱: push کد به GitHub

```bash
# در پوشه پروژه
git init
git add -A
git commit -m "initial commit - Kharazmi Management System"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/khbipc.git
git push -u origin main
```

**توجه**: فایل‌های زیر به‌طور خودکار نادیده گرفته می‌شوند (در `.gitignore`):
- `node_modules/` — وابستگی‌ها
- `.next/` — خروجی build
- `.env` — متغیرهای محیطی (مهم! رمز عبور دیتابیس)
- `db/*.db` — دیتابیس محلی SQLite
- `upload/*.xlsx` — فایل‌های Excel (بزرگ هستند)

---

## مرحله ۲: ساخت پایگاه داده PostgreSQL

### گزینه A: Neon (توصیه‌شده — رایگان)

1. به https://neon.tech بروید و ثبت‌نام کنید
2. روی **"New Project"** کلیک کنید
3. نام پروژه: `kharazmi`
4. Region: نزدیک‌ترین منطقه (مثلاً `Frankfurt` برای ایران)
5. روی **"Create Project"** کلیک کنید
6. در صفحه بعد، **connection string** را کپی کنید:
   ```
   postgresql://user:password@ep-xxx.region.aws.neon.tech/kharazmi?sslmode=require
   ```

### گزینه B: Vercel Postgres

1. در dashboard Vercel، پروژه را بسازید (مرحله ۳)
2. به **"Storage"** tab بروید
3. روی **"Create Database"** → **"Postgres"** کلیک کنید
4. نام: `kharazmi-db`
5. connection string به‌طور خودکار به environment variables اضافه می‌شود

---

## مرحله ۳: دیپلوی روی Vercel

1. به https://vercel.com بروید و با GitHub وارد شوید
2. روی **"Add New Project"** کلیک کنید
3. ریپو `khbipc` را انتخاب کنید
4. تنظیمات build به‌طور خودکار تشخیص داده می‌شوند (Next.js)
5. **مهم**: قبل از کلیک روی "Deploy"، environment variables را اضافه کنید:

### Environment Variables در Vercel:

| Key | Value | توضیح |
|-----|-------|-------|
| `DATABASE_URL` | `postgresql://...` | connection string از Neon/Vercel Postgres |
| `DIRECT_URL` | `postgresql://...` | همان مقدار DATABASE_URL (برای migrations) |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` | URL دیپلوی (بعد از اولین deploy مشخص می‌شود) |
| `NEXTAUTH_SECRET` | (رشته تصادفی) | با `openssl rand -base64 32` تولید کنید |

6. روی **"Deploy"** کلیک کنید
7. صبر کنید تا build کامل شود (حدود ۲-۳ دقیقه)

---

## مرحله ۴: ساخت جداول دیتابیس

پس از اولین دیپلوی، باید جداول دیتابیس را بسازید:

### روش ۱: با Vercel CLI (توصیه‌شده)

```bash
# نصب Vercel CLI
npm i -g vercel

# Login
vercel login

# Clone پروژه (اگر قبلاً نکرده‌اید)
git clone https://github.com/YOUR_USERNAME/khbipc.git
cd khbipc
npm install

# Link به پروژه Vercel
vercel link

# Download environment variables
vercel env pull .env.production.local

# ساخت جداول
npx prisma db push

# ایجاد کاربر ادمین
npm run seed:admin

# وارد کردن داده‌ها (اگر نیاز است)
npm run import:excel
npm run import:hr-risk
```

### روش ۲: با Prisma Studio

```bash
# پس از vercel env pull
npx prisma studio
# در مرورگر، جداول را ببینید و به‌صورت دستی داده وارد کنید
```

---

## مرحله ۵: تست دیپلوی

1. به URL دیپلوی بروید (مثلاً `https://khbipc.vercel.app`)
2. با `admin` / `admin123` وارد شوید
3. مطمئن شوید همه ماژول‌ها کار می‌کنند:
   - داشبورد
   - WBS
   - منابع انسانی
   - مدیریت مالی
   - دارایی‌ها
   - فعالیت‌های جاری
   - ریسک‌ها
   - اعلان‌ها

---

## مرحله ۶: تنظیم NEXTAUTH_URL نهایی

پس از اولین دیپلوی، URL نهایی مشخص می‌شود (مثلاً `https://khbipc-xxx.vercel.app`):

1. به dashboard Vercel بروید
2. پروژه را انتخاب کنید → **Settings** → **Environment Variables**
3. `NEXTAUTH_URL` را به URL نهایی به‌روزرسانی کنید
4. **Redeploy** کنید

---

## عیب‌یابی

### خطای "Database connection failed"
- مطمئن شوید `DATABASE_URL` و `DIRECT_URL` درست تنظیم شده‌اند
- connection string باید با `postgresql://` شروع شود
- برای Neon، `?sslmode=require` در انتهای connection string ضروری است

### خطای "Prisma Client not generated"
- این باید به‌طور خودکار با `postinstall` script انجام شود
- اگر نشد، در Vercel dashboard → **Settings** → **Build Command**:
  ```
  prisma generate && next build
  ```

### خطای "NEXTAUTH_URL mismatch"
- مطمئن شوید `NEXTAUTH_URL` دقیقاً با URL دیپلوی مطابقت دارد
- شامل `https://` باشد، بدون `/` در انتها

### ورود کار نمی‌کند
- در Vercel dashboard → **Functions** → بررسی log‌های `/api/auth/callback/credentials`
- مطمئن شوید کاربر ادمین ایجاد شده (`npm run seed:admin`)

---

## ساختار فایل‌های مهم

```
khbipc/
├── prisma/
│   └── schema.prisma          # PostgreSQL schema
├── src/
│   └── lib/
│       ├── auth.ts            # NextAuth config
│       ├── db.ts              # Prisma client
│       └── roles.ts           # Role-based access
├── scripts/
│   ├── seed-admin.js          # Create admin user
│   ├── import-excel.ts        # Import WBS data
│   ├── import-hr-risk.js      # Import HR + Risk data
│   └── fix-all.js             # Fix database + seed
├── .env.example               # Template for .env
├── vercel.json                # Vercel config
├── next.config.ts             # Next.js config (no standalone)
└── package.json               # Scripts + dependencies
```

---

## هزینه‌ها

- **Vercel**: رایگان برای پروژه‌های شخصی (Hobby plan)
- **Neon**: رایگان تا ۰.۵ GB storage و ۱۰۰ hours/month compute
- **GitHub**: رایگان برای ریپوهای public و private

برای استفاده تجاری، upgrade به Vercel Pro ($20/month) و Neon Pro ($19/month) توصیه می‌شود.

---

## پشتیبان‌گیری (Backup)

برای پشتیبان‌گیری از دیتابیس PostgreSQL:

```bash
# Export
pg_dump "$DATABASE_URL" > backup.sql

# Import (در صورت نیاز)
psql "$DATABASE_URL" < backup.sql
```

یا با Prisma:
```bash
npx prisma db pull   # Schema را از دیتابیس بخواند
npx prisma db push   # Schema را به دیتابیس اعمال کند
```

---

## توسعه‌دهنده

**محمد بلدزاده**

سؤالات و مشکلات: در GitHub Issues مطرح کنید.
