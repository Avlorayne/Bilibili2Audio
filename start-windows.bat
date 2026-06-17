@echo off
chcp 65001 >nul

echo ==========================================
echo   Bilibili2Audio - 视频转音频工具
echo   Windows 版本
echo ==========================================
echo.

:: 获取脚本所在目录
cd /d "%~dp0"

:: 检查Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到Node.js
    echo.
    echo 请安装Node.js 18.0或更高版本:
    echo   访问: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js版本: %NODE_VERSION%

:: 检查npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到npm
    echo.
    echo npm通常随Node.js一起安装，请重新安装Node.js。
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✅ npm版本: %NPM_VERSION%

:: 优先使用 starter.js（启动管理器）
if exist "starter.js" (
    echo 🚀 正在启动启动管理器...
    echo.
    node starter.js
    pause
    exit /b 0
)

:: 回退到传统启动方式
echo ⚠️  未找到 starter.js，回退到传统启动方式...
echo.

:: 检查npm依赖
if not exist "node_modules" (
    echo 📦 正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
    echo ✅ 依赖安装完成
) else (
    echo ✅ 依赖已安装
)

:: 检查FFmpeg
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️  警告: 未找到FFmpeg
    echo.
    echo FFmpeg是必需的依赖，请安装:
    echo   1. 访问 https://ffmpeg.org/download.html
    echo   2. 下载Windows版本
    echo   3. 将ffmpeg.exe添加到系统PATH环境变量
    echo.
    echo 程序将尝试继续运行，但本地视频转换功能将不可用。
    echo.
)

:: 启动服务
echo.
echo 🚀 正在启动服务...
echo.
node src/backend/server.js

pause
