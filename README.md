# راهنمای نصب و اجرا

سامانه یکپارچه مدیریت شرکت خوارزمی بندر امام

## پیش‌نیازها

- Node.js نسخه ۱۸ یا بالاتر
- npm (همراه Node.js نصب می‌شود)

## مراحل نصب در Windows

### ۱. نصب وابستگی‌ها

```powershell
npm install
```

### ۲. ساخت دیتابیس و وارد کردن داده‌ها

```powershell
# ساخت جداول در دیتابیس
npx prisma db push

# (اختیاری) وارد کردن داده‌ها از فایل Excel
# فایل MASTER_R05.xlsx را در پوشه upload قرار دهید
npm run import:excel

# ایجاد کاربر ادمین (اگر از قبل وجود داشته باشد، فقط رمز را بازنشانی می‌کند)
npm run seed:admin
```

اطلاعات ورود پیش‌فرض:
- **نام کاربری**: `admin`
- **رمز عبور**: `admin123`

### ۳. اجرای محیط توسعه

```powershell
npm run dev
```

سپس مرورگر را به آدرس `http://localhost:3000` باز کنید.

### ۴. اجرای محیط Production

```powershell
# Build پروژه
npm run build

# اجرای production
npm start
```

## عیب‌یابی

اگر در ورود با خطای ۴۰۱ مواجه شدید:

### مرحله ۱: صفحه دیباگ را باز کنید

به آدرس `http://localhost:3000/debug-db` بروید. این صفحه به طور خودکار علت مشکل را تشخیص می‌دهد.

### مرحله ۲: کاربر ادمین را دوباره ایجاد کنید

اگر پیام "کاربر ادمین وجود ندارد" دریافت کردید:

```powershell
npm run seed:admin
```

### مرحله ۳: مطمئن شوید دیتابیس در standalone کپی شده

اگر از `npm start` (محیط production) استفاده می‌کنید، اسکریپت `start-prod.js` به طور خودکار دیتابیس را در پوشه standalone کپی می‌کند. اما اگر هنوز مشکل دارید:

```powershell
# بازسازی دیتابیس و داده‌ها
npx prisma db push
npm run seed:admin
npm run import:excel

# Build مجدد
npm run build

# اجرای production
npm start
```

### مرحله ۴: تنظیم NEXTAUTH_URL

اگر سرور را روی آدرس دیگری (نه localhost:3000) اجرا می‌کنید، فایل `.env` را ویرایش کنید:

```
NEXTAUTH_URL=http://your-server-address:port
```

## بازنشانی داده‌ها از Excel

۱. به عنوان ادمین وارد شوید
۲. به مسیر **تنظیمات → بازنشانی از Excel** بروید
۳. فایل MASTER_R05.xlsx جدید را آپلود کنید

یا از خط فرمان:

```powershell
npm run import:excel
```

## ساختار پروژه

```
├── prisma/
│   └── schema.prisma          # اسکیمای دیتابیس (۲۲ مدل)
├── scripts/
│   ├── import-excel.ts         # اسکریپت وارد کردن داده‌ها از Excel
│   ├── seed-admin.js           # ایجاد کاربر ادمین
│   ├── copy-standalone.js      # کپی فایل‌های ضروری برای production
│   └── start-prod.js           # اجرای production (cross-platform)
├── src/
│   ├── app/
│   │   ├── (admin)/            # صفحات ادمین (محافظت‌شده با auth)
│   │   ├── api/                # API routes
│   │   ├── debug-db/           # صفحه عیب‌یابی دیتابیس
│   │   └── login/              # صفحه ورود
│   ├── components/             # کامپوننت‌های React
│   └── lib/
│       ├── auth.ts             # تنظیمات NextAuth
│       └── db.ts               # Prisma client
├── upload/                     # فایل‌های Excel برای import
├── db/                         # دیتابیس SQLite
└── .env                        # متغیرهای محیطی
```

## دستورات مفید

| دستور | توضیح |
|-------|-------|
| `npm run dev` | اجرای محیط توسعه |
| `npm run build` | ساخت production |
| `npm start` | اجرای production |
| `npm run lint` | بررسی کد |
| `npm run db:push` | اعمال تغییرات اسکیمای دیتابیس |
| `npm run import:excel` | وارد کردن داده‌ها از MASTER_R05.xlsx |
| `npm run seed:admin` | ایجاد/بازنشانی کاربر ادمین |
