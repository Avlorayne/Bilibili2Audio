#!/bin/bash

# Bilibili2Audio 启动脚本 (Linux/macOS)

echo ""
echo "  ========================================"
echo "    Bilibili2Audio - 视频转音频工具"
echo "  ========================================"
echo ""
echo "  正在启动服务，请稍候..."
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "  [错误] 未找到 Node.js"
    echo ""
    echo "  请先安装 Node.js 18.0 或更高版本:"
    echo "  https://nodejs.org/"
    echo ""
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "  [提示] 首次运行，正在安装依赖..."
    npm install --silent
    echo "  [完成] 依赖安装完成"
    echo ""
fi

# 启动服务并自动打开浏览器
echo "  [启动] 正在启动服务器..."
echo "  [提示] 浏览器将自动打开，如果没有请访问 http://localhost:3000"
echo ""
node src/backend/server.js
