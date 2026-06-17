@echo off
chcp 65001 >nul

echo ==========================================
echo   Bilibili2Audio - 视频转音频工具
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
    echo   https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js版本: %NODE_VERSION%

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

:: 启动服务
echo.
echo 🚀 正在启动服务...
echo.
node src/backend/server.js

pause