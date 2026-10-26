FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY web ./web
COPY server ./server
COPY shared ./shared
COPY scripts/copy-migrations.mjs ./scripts/copy-migrations.mjs
COPY scripts/ci/check-route-splitting.mjs ./scripts/ci/check-route-splitting.mjs
RUN npm run build && npm prune --omit=dev && npm cache clean --force

FROM node:24.22.1-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 MEDIA_DIR=/app/media
WORKDIR /app
RUN mkdir -p /app/media && chown node:node /app/media
COPY --chown=node:node --from=build /app/package.json /app/package-lock.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node scripts/container-health.mjs ./scripts/container-health.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD ["node", "scripts/container-health.mjs"]
CMD ["node", "dist/server/index.js"]
