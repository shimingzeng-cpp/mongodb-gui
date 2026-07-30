@echo off
chcp 65001 >nul
title MongoDB GUI - 环境检查

echo ========================================
echo   MongoDB GUI - 环境检查
echo ========================================
echo.

:: 检查 Node.js
echo [1/3] 检查 Node.js ...
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('node -v') do set NODE_VER=%%i
    echo   [OK] Node.js %NODE_VER%
) else (
    echo   [FAIL] 未安装 Node.js
    echo         请访问 https://nodejs.org/ 下载安装 (建议 v18+)
)

:: 检查 npm
echo.
echo [2/3] 检查 npm ...
where npm >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('npm -v') do set NPM_VER=%%i
    echo   [OK] npm v%NPM_VER%
) else (
    echo   [FAIL] 未安装 npm
    echo         （通常安装 Node.js 时会自动包含 npm）
)

:: 检查 MongoDB
echo.
echo [3/3] 检查 MongoDB ...
where mongod >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('mongod --version 2^>nul ^| findstr /i "db version"') do set MONGO_VER=%%i
    echo   [OK] MongoDB %MONGO_VER%
) else (
    echo   [WARN] 未检测到本地 MongoDB
    echo         你可以：
    echo         1. 安装 MongoDB: https://www.mongodb.com/try/download/community
    echo         2. 或连接远程 MongoDB 地址（如云数据库）
)

echo.
echo ========================================
echo.

:: 检查是否全部通过
set ALL_OK=1
where node >nul 2>&1 || set ALL_OK=0
where npm >nul 2>&1 || set ALL_OK=0

if %ALL_OK% equ 1 (
    echo [OK] 环境就绪，可以启动项目：
    echo.
    echo   npm install
    echo   npm run dev
) else (
    echo [WARN] 请先安装缺失的依赖，然后重新运行此脚本。
)

echo.
pause