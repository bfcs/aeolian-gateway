#!/bin/bash
# 环境部署脚本 (自动分支切换、同步 Main、构建、Secrets 同步)
# 用法: ./scripts/deploy.sh [production|staging|demo]

set -euo pipefail

ENV="${1:-production}"
ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# 确保最后回到原分支
cleanup() {
    echo "🔄 切回到原分支: $ORIGINAL_BRANCH"
    git checkout "$ORIGINAL_BRANCH"
}
trap cleanup EXIT

# 环境变量映射逻辑
case "$ENV" in
    production)
        TARGET_BRANCH="main"
        SRC_VAR_NAME="ADMIN_PASSWORD"
        ENV_FLAG=""
        ;;
    staging)
        TARGET_BRANCH="staging"
        SRC_VAR_NAME="STAGING_ADMIN_PASSWORD"
        ENV_FLAG="--env staging"
        ;;
    demo)
        TARGET_BRANCH="demo"
        SRC_VAR_NAME="DEMO_ADMIN_PASSWORD"
        ENV_FLAG="--env demo"
        ;;
    *)
        echo "❌ 错误: 未知的环境 '$ENV'"
        exit 1
        ;;
esac

echo "🌿 切换到目标分支: $TARGET_BRANCH"
git checkout "$TARGET_BRANCH"

# --- 分支同步逻辑 ---
if [ "$TARGET_BRANCH" != "main" ]; then
    echo "🔄 正在同步 main 分支的最全修改到 $TARGET_BRANCH..."
    # 尝试合并 main 到当前分支
    git merge main --no-edit || {
        echo "❌ 错误: 合并 main 到 $TARGET_BRANCH 时发生冲突，请手动解决后再部署。"
        exit 1
    }
fi

# --- Secrets 同步逻辑 ---
if [ -f ".dev.vars" ]; then
    SECRET_VALUE=$(grep "^${SRC_VAR_NAME}=" .dev.vars | cut -d'=' -f2- | sed "s/^['\"]//;s/['\"]$//")
    
    # 兼容性处理
    if [ -z "$SECRET_VALUE" ] && [ "$SRC_VAR_NAME" = "ADMIN_PASSWORD" ]; then
         SECRET_VALUE=$(grep "^ADMIN_PASSPORD=" .dev.vars | cut -d'=' -f2- | sed "s/^['\"]//;s/['\"]$//")
    fi

    if [ -n "$SECRET_VALUE" ]; then
        echo "🔐 正在同步 $ENV 环境的 ADMIN_PASSWORD (源自 .dev.vars 提取)..."
        echo "$SECRET_VALUE" | npx wrangler secret put ADMIN_PASSWORD $ENV_FLAG
    else
        echo "⚠️  警告: 在 .dev.vars 中未找到 $SRC_VAR_NAME，跳过 Secret 同步。"
    fi
else
    echo "ℹ️  未找到 .dev.vars 文件，跳过 Secret 同步。"
fi

echo "🏗️  正在执行构建 (open-next build)..."
npx opennextjs-cloudflare build

echo "🚀 正在部署到 $ENV 环境..."
if [ "$ENV" = "production" ]; then
    npx opennextjs-cloudflare deploy
else
    npx opennextjs-cloudflare deploy --env "$ENV"
fi

echo "✅ $ENV 环境部署完成！"
