#!/bin/bash

# Bilibili2Audio 启动脚本 (通用)
# 优先使用 starter.js（启动管理器），回退到直接启动 server.js

echo "=========================================="
echo "  Bilibili2Audio - 视频转音频工具"
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
    echo "  https://nodejs.org/"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js版本: $NODE_VERSION"

# 检查 starter.js 是否存在
if [ -f "starter.js" ]; then
    echo "🚀 正在启动启动管理器..."
    echo ""
    exec node starter.js
else
    echo "⚠️  未找到 starter.js，回退到传统启动方式..."
    echo ""

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

    # 启动服务
    echo ""
    echo "🚀 正在启动服务..."
    echo ""
    node src/backend/server.js
fi
