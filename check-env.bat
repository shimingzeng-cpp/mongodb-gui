@echo off
title MongoDB GUI - 环境检查

echo ========================================
echo   MongoDB GUI - 环境检查
echo ========================================
echo.

:: Node.js
echo [1/3] Node.js ...
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('node -v') do set NODE_VER=%%i
    echo   [OK] Node.js %NODE_VER%
) else (
    echo   [FAIL] Node.js not found
    echo   Download: https://nodejs.org/ (v18+)
)

:: npm
echo.
echo [2/3] npm ...
where npm >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('npm -v') do set NPM_VER=%%i
    echo   [OK] npm v%NPM_VER%
) else (
    echo   [FAIL] npm not found
)

:: MongoDB
echo.
echo [3/3] MongoDB ...
where mongod >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('mongod --version 2^>nul ^| findstr /i "db version"') do set MONGO_VER=%%i
    echo   [OK] MongoDB %MONGO_VER%
) else (
    echo   [WARN] MongoDB not found
    echo   You can connect to a remote MongoDB instead.
)

echo.
echo ========================================
echo.

set ALL_OK=1
where node >nul 2>&1 || set ALL_OK=0
where npm >nul 2>&1 || set ALL_OK=0

if %ALL_OK% equ 1 (
    echo [OK] Ready! Run:
    echo.
    echo   npm install
    echo   npm run dev
) else (
    echo [WARN] Please install missing dependencies first.
)

echo.
pause