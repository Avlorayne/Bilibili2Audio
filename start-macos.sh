#!/bin/bash

# Bilibili2Audio 启动脚本 (macOS)

echo "=========================================="
echo "  Bilibili2Audio - 视频转音频工具"
echo "  macOS 版本"
echo "=========================================="
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到Node.js"
    echo ""
    echo "请安装Node.js 18.0或更高版本:"
    echo "  使用Homebrew: brew install node"
    echo "  或访问: https://nodejs.org/"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js版本: $NODE_VERSION"

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未找到npm"
    echo "请安装npm: brew install npm"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo "✅ npm版本: $NPM_VERSION"

# 检查npm依赖
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
    echo "✅ 依赖安装完成"
else
    echo "✅ 依赖已安装"
fi

# 检查FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  警告: 未找到FFmpeg"
    echo ""
    echo "FFmpeg是必需的依赖，请安装:"
    echo "  使用Homebrew: brew install ffmpeg"
    echo ""
    echo "程序将尝试继续运行，但本地视频转换功能将不可用。"
    echo ""
fi

# 启动服务
echo ""
echo "🚀 正在启动服务..."
echo ""
node src/backend/server.js
