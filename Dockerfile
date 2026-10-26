# 阶段1：构建前端（Vite + tsc），产物输出到 client/dist
FROM node:20-slim AS frontend
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 阶段2：运行后端（Koa 同时托管前端静态文件与 SQLite）
FROM node:20-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
# 兜底：better-sqlite3 若找不到预编译二进制，可用源码编译（python3/make/g++）
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN cd server && npm ci --omit=dev
COPY server/src ./server/src
COPY --from=frontend /app/client/dist ./client/dist
ENV NODE_ENV=production
EXPOSE 3000
# 数据目录挂载卷：有持久卷的平台（如 Railway）可挂到这里保存 SQLite
VOLUME ["/app/server/data"]
CMD ["node", "server/src/index.js"]
