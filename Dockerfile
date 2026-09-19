# Build multi-stage do Bom Dia v3: web (Vite) → server (Hono/TS) → runtime node enxuto.
# syntax=docker/dockerfile:1

FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
COPY web/vendor ./vendor
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-slim AS server
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=server /app/server/dist ./dist
COPY --from=web /app/web/dist ./public
ENV PORT=9463
EXPOSE 9463
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||9463)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
