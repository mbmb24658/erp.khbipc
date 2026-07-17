# fix-missing-files.ps1
# اسکریپت ایجاد پوشه‌های جاافتاده (با کاراکترهای خاص)
# در پوشه workspace اجرا کنید: powershell -ExecutionPolicy Bypass -File fix-missing-files.ps1

$ErrorActionPreference = "Continue"

Write-Host "=== ایجاد پوشه‌های جاافتاده ===" -ForegroundColor Cyan

# لیست پوشه‌هایی که باید ایجاد شوند (با کاراکترهای خاص)
$dirs = @(
    "src\app\api\auth\[...nextauth]",
    "src\app\(admin)\risks\heatmap",
    "src\app\(admin)\risks\lessons",
    "src\app\(admin)\wbs\[id]",
    "src\app\(admin)\activities\[id]",
    "src\app\api\wbs\[id]",
    "src\app\api\risk\[id]",
    "src\app\api\risk-evaluation\[id]",
    "src\app\api\kpi-evaluation\[id]",
    "src\app\api\kpi-template\[id]",
    "src\app\api\activity\[id]",
    "src\app\api\asset\[id]",
    "src\app\api\executor\[id]",
    "src\app\api\user\[id]",
    "src\app\api\role\[id]",
    "src\app\api\personel\[id]",
    "src\app\api\org-chart\[id]",
    "src\app\api\cost-breakdown\[id]",
    "src\app\api\revenue-breakdown\[id]",
    "src\app\api\lesson-learned\[id]",
    "src\app\api\notification\[id]",
    "src\app\api\notification-template\[id]",
    "src\app\api\notification-config\[id]",
    "src\app\api\system-config\[id]",
    "src\app\api\kpi\[id]",
    "src\app\api\kpi-assignment\[id]",
    "src\app\api\kpi-record\[id]",
    "src\app\api\risk-action\[id]",
    "src\app\api\chart-config\[id]"
)

foreach ($d in $dirs) {
    if (-not (Test-Path -LiteralPath $d)) {
        try {
            New-Item -ItemType Directory -Path $d -Force -ErrorAction Stop | Out-Null
            Write-Host "  ✓ Created: $d" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ Failed: $d - $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "  • Exists: $d" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== ایجاد فایل route.ts برای auth ===" -ForegroundColor Cyan

# فایل auth route - حیاتی برای NextAuth
$authRoute = "src\app\api\auth\[...nextauth]\route.ts"
if (-not (Test-Path -LiteralPath $authRoute)) {
    $content = @"
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
"@
    Set-Content -LiteralPath $authRoute -Value $content -Encoding UTF8
    Write-Host "  ✓ Created: $authRoute" -ForegroundColor Green
} else {
    Write-Host "  • Exists: $authRoute" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "===完成 ===" -ForegroundColor Green
Write-Host "حالا باید فایل‌های page.tsx جاافتاده را از ساندباکس یا GitHub کپی کنید." -ForegroundColor Yellow
Write-Host "بهترین راه: git clone یا robocopy" -ForegroundColor Yellow
