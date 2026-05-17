#!/bin/sh
set -e

# 动态修复 volume mount 后 /app 的权限
if [ "$(stat -c '%u' /app)" != "$(id -u node)" ]; then
    echo "→ 修复 /app 目录归属为 node 用户..."
    chown -R node:node /app
fi

# 确保缓存目录存在且可写（首次 pip/npm 操作免警告）
mkdir -p /home/node/.cache/pip /home/node/.npm
chown node:node /home/node/.cache/pip /home/node/.npm

exec "$@"
