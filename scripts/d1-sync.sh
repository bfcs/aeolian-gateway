#!/bin/bash
# D1 数据库同步工具
# 用法: ./scripts/d1-sync.sh <upload|download> [env] [表名]
#   upload   - 本地 D1 → 远程 D1
#   download - 远程 D1 → 本地 D1
#   env      - 环境名称: production (默认), staging, demo
#   表名可选，不指定则同步所有配置表

set -euo pipefail

ALL_TABLES=("gateway_keys" "providers" "provider_keys" "model_rules" "configs" "playground_projects" "request_logs")
TMP_DIR=$(mktemp -d)

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ACTION="${1:-}"
ENV="${2:-production}"
TABLE_FILTER="${3:-}"

# 如果第二个参数看起来像个表名而不是环境，则顺延
# (兼容旧用法: ./scripts/d1-sync.sh download providers)
IS_TABLE=false
for T in "${ALL_TABLES[@]}"; do
    if [[ "$T" == "$ENV" ]]; then IS_TABLE=true; break; fi
done

if [[ "$IS_TABLE" == "true" ]]; then
    TABLE_FILTER="$ENV"
    ENV="production"
fi

# 环境到数据库名的映射
case "$ENV" in
    production) DB_NAME="ai-gateway-db" ;;
    staging)    DB_NAME="staging-ai-gateway-db" ;;
    demo)       DB_NAME="demo-ai-gateway-db" ;;
    *)
        # 允许直接传入数据库名
        DB_NAME="$ENV"
        ;;
esac

if [[ "$ACTION" != "upload" && "$ACTION" != "download" ]]; then
    echo "用法: $0 <upload|download> [env] [表名]"
    echo ""
    echo "环境可选: production (默认), staging, demo"
    echo "可选表名: ${ALL_TABLES[*]}"
    exit 1
fi

# 确定要同步的表
if [[ -n "$TABLE_FILTER" ]]; then
    # 校验表名
    VALID=false
    for T in "${ALL_TABLES[@]}"; do
        if [[ "$T" == "$TABLE_FILTER" ]]; then VALID=true; break; fi
    done
    if [[ "$VALID" != "true" ]]; then
        echo "❌ 无效的表名: $TABLE_FILTER"
        echo "   可选: ${ALL_TABLES[*]}"
        exit 1
    fi
    SYNC_TABLES=("$TABLE_FILTER")
else
    SYNC_TABLES=("${ALL_TABLES[@]}")
fi

if [[ "$ACTION" == "download" ]]; then
    SOURCE_FLAG="--remote"
    TARGET_FLAG="--local"
    echo "📥 模式: download (远程 $DB_NAME → 本地 ai-gateway-db)"
else
    SOURCE_FLAG="--local"
    TARGET_FLAG="--remote"
    echo "📤 模式: upload (本地 ai-gateway-db → 远程 $DB_NAME)"
fi

echo "📋 同步表: ${SYNC_TABLES[*]}"
echo ""
echo "1️⃣  从源数据库读取数据..."

DUMP_FILE="$TMP_DIR/d1-sync.sql"
touch "$DUMP_FILE"

# upload 模式下，读取本地的是 ai-gateway-db，写入远程的是 DB_NAME
# download 模式下，读取远程的是 DB_NAME，写入本地的是 ai-gateway-db
if [[ "$ACTION" == "upload" ]]; then
    S_DB="ai-gateway-db"
    T_DB="$DB_NAME"
else
    S_DB="$DB_NAME"
    T_DB="ai-gateway-db"
fi

for TABLE in "${SYNC_TABLES[@]}"; do
    echo "   📋 读取表: $TABLE"

    # 获取列名
    COLUMNS_JSON=$(npx wrangler d1 execute "$S_DB" $SOURCE_FLAG \
        --command="PRAGMA table_info(${TABLE});" \
        --json 2>/dev/null | sed -n '/^\[/,/^\]/p')
    
    COLUMNS=$(echo "$COLUMNS_JSON" | node -e "
        const fs = require('fs');
        try {
            const raw = fs.readFileSync(0,'utf8');
            const data = JSON.parse(raw);
            const rows = data[0]?.results || [];
            console.log(rows.map(r => r.name).join(','));
        } catch(e) { }
    ")

    if [[ -z "$COLUMNS" ]]; then
        echo "   ⚠️  表 $TABLE 不存在或无列，跳过"
        continue
    fi

    # 导出数据
    ROWS_JSON=$(npx wrangler d1 execute "$S_DB" $SOURCE_FLAG \
        --command="SELECT * FROM ${TABLE};" \
        --json 2>/dev/null | sed -n '/^\[/,/^\]/p')

    node -e "
        const fs = require('fs');
        try {
            const raw = fs.readFileSync(0,'utf8');
            const data = JSON.parse(raw);
            const rows = data[0]?.results || [];
            if (rows.length > 0) {
                const cols = '${COLUMNS}'.split(',');
                for (const row of rows) {
                    const vals = cols.map(c => {
                        const v = row[c];
                        if (v === null || v === undefined) return 'NULL';
                        if (typeof v === 'number') return String(v);
                        return \"'\" + String(v).replace(/'/g, \"''\") + \"'\";
                    });
                    console.log('INSERT INTO ${TABLE} (' + cols.join(',') + ') VALUES (' + vals.join(',') + ');');
                }
            }
        } catch(e) {}
    " <<< "$ROWS_JSON" >> "$DUMP_FILE"

    ROW_COUNT=$(node -e "
        const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        console.log(data[0]?.results?.length || 0);
    " <<< "$ROWS_JSON" 2>/dev/null || echo "0")
    echo "      → ${ROW_COUNT} 条记录"
done

echo ""
echo "2️⃣  准备同步 SQL..."

FINAL_FILE="$TMP_DIR/d1-final.sql"
{
    for TABLE in "${SYNC_TABLES[@]}"; do
        echo "DELETE FROM ${TABLE};"
    done
    echo ""
    cat "$DUMP_FILE"
} > "$FINAL_FILE"

echo ""
echo "3️⃣  写入目标数据库 $T_DB..."
npx wrangler d1 execute "$T_DB" $TARGET_FLAG \
    --file="$FINAL_FILE" \
    --yes \
    2>&1 | grep -v "^$" | sed 's/^/      /'

echo ""
echo "✅ 同步完成！"
