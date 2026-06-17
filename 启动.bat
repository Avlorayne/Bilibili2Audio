@echo off
chcp 65001 >nul
title Bilibili2Audio - 视频转音频工具

echo.
echo  ========================================
echo    Bilibili2Audio - 视频转音频工具
echo  ========================================
echo.
echo  正在启动服务，请稍候...
echo.

cd /d "%~dp0"

:: 检查Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [错误] 未找到 Node.js
    echo.
    echo  请先安装 Node.js 18.0 或更高版本:
    echo  https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 检查依赖
if not exist "node_modules" (
    echo  [提示] 首次运行，正在安装依赖...
    call npm install --silent
    echo  [完成] 依赖安装完成
    echo.
)

:: 启动服务并自动打开浏览器
echo  [启动] 正在启动服务器...
echo  [提示] 浏览器将自动打开，如果没有请访问 http://localhost:3000
echo.
node src/backend/server.js

pause
