#!/bin/bash
# Mars3D 集成验证脚本

set -e

echo "🔍 Mars3D 集成验证脚本"
echo "========================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
}

check_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# 1. 检查 Node.js 和 npm
echo "1️⃣  检查 Node.js 环境..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    check_pass "Node.js: $NODE_VERSION"
else
    check_fail "Node.js 未安装"
    exit 1
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    check_pass "npm: $NPM_VERSION"
else
    check_fail "npm 未安装"
    exit 1
fi
echo ""

# 2. 检查依赖
echo "2️⃣  检查项目依赖..."
cd /opt/development/ui/web

if [ -f "package.json" ]; then
    check_pass "package.json 存在"
    
    if grep -q "mars3d" package.json; then
        check_pass "mars3d 依赖已配置"
    else
        check_fail "mars3d 依赖未配置"
    fi
    
    if grep -q "mars2d" package.json; then
        check_warn "mars2d 依赖仍存在（建议移除）"
    fi
else
    check_fail "package.json 不存在"
    exit 1
fi

if [ -d "node_modules/mars3d" ]; then
    check_pass "mars3d 已安装"
else
    check_fail "mars3d 未安装，运行：npm install"
    exit 1
fi
echo ""

# 3. 检查配置文件
echo "3️⃣  检查配置文件..."

if [ -f "vite.config.js" ]; then
    check_pass "vite.config.js 存在"
    
    if grep -q "worker" vite.config.js; then
        check_pass "Worker 配置已添加"
    else
        check_warn "Worker 配置可能缺失"
    fi
    
    if grep -q "mars3d" vite.config.js; then
        check_pass "Mars3D 优化配置已添加"
    else
        check_warn "Mars3D 优化配置可能缺失"
    fi
else
    check_fail "vite.config.js 不存在"
fi

if [ -f "src/components/MarsMap.jsx" ]; then
    check_pass "MarsMap.jsx 存在"
    
    if grep -q "mars3d/mars3d.css" src/components/MarsMap.jsx; then
        check_pass "CSS 导入路径正确"
    else
        check_fail "CSS 导入路径可能错误"
    fi
else
    check_fail "MarsMap.jsx 不存在"
fi

if [ -f "src/pages/NavPage.jsx" ]; then
    check_pass "NavPage.jsx 存在"
    
    if grep -q "import MarsMap" src/pages/NavPage.jsx; then
        check_pass "MarsMap 组件已集成"
    else
        check_fail "MarsMap 组件未集成"
    fi
else
    check_fail "NavPage.jsx 不存在"
fi
echo ""

# 4. 构建测试
echo "4️⃣  执行构建测试..."
if npm run build > /tmp/mars3d_build.log 2>&1; then
    check_pass "构建成功"
    echo "   输出目录：dist/"
    ls -lh dist/ | tail -5
else
    check_fail "构建失败"
    echo "   查看日志：/tmp/mars3d_build.log"
    tail -20 /tmp/mars3d_build.log
    exit 1
fi
echo ""

# 5. 检查输出文件
echo "5️⃣  检查构建输出..."
if [ -f "dist/index.html" ]; then
    check_pass "dist/index.html 已生成"
else
    check_fail "dist/index.html 未生成"
fi

if [ -f "dist/static/mars3d-"*.js ]; then
    MARS3D_SIZE=$(ls -lh dist/static/mars3d-*.js | awk '{print $5}')
    check_pass "Mars3D bundle: $MARS3D_SIZE"
else
    check_warn "Mars3D bundle 未找到"
fi
echo ""

# 6. 开发服务器状态
echo "6️⃣  检查开发服务器..."
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    check_pass "开发服务器运行中 (http://localhost:5173)"
else
    check_warn "开发服务器未运行"
    echo "   启动命令：npm run dev"
fi
echo ""

# 总结
echo "========================"
echo "📊 验证完成"
echo ""
echo "📍 访问导航页面："
echo "   http://localhost:5173/#/nav"
echo ""
echo "📖 查看详细报告："
echo "   cat MARS3D_FIX_REPORT.md"
echo ""
