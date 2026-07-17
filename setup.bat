@echo off
chcp 65001 >nul
echo ============================================================
echo   Local Setup - Kharazmi Management System (SQLite)
echo ============================================================
echo.
echo [1/4] Installing dependencies...
call npm install
echo.
echo [2/4] Creating database tables...
call npx prisma db push
echo.
echo [3/4] Creating admin + importing data...
call npm run fix:all
echo.
echo ============================================================
echo   Setup complete! Login: admin / admin123
echo   Run: npm run dev  |  Open: http://localhost:3000
echo ============================================================
set /p RUN=Start now? (Y/N): 
if /i "%RUN%"=="Y" call npm run dev
pause
