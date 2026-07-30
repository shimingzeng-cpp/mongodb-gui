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
    echo.
    pause
    exit /b 1
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
    echo.
    pause
    exit /b 1
)

:: 检查 MongoDB
echo.
echo [3/3] 检查 MongoDB ...
where mongod >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] 已安装 MongoDB
) else (
    echo   [WARN] 未检测到本地 MongoDB
    echo         你可以连接远程数据库使用
)

echo.
echo ========================================
echo.
echo [OK] 环境就绪！
echo.
echo 选择启动方式：
echo   1. 启动项目（npm install + npm run dev）
echo   2. 仅退出
echo.
set /p CHOICE=请输入 1 或 2:

if "%CHOICE%"=="1" (
    echo.
    echo 正在安装依赖并启动项目...
    start "MongoDB GUI" cmd /k "cd /d %~dp0 && npm install && npm run dev"
    echo.
    echo 已在新窗口中启动，请等待项目加载完成。
    timeout /t 3 >nul
) else (
    echo.
    echo 已退出。
)

echo.
pause