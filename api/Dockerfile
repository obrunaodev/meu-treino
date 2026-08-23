# ── base ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app
# sharp precisa de libc compatível no Alpine
RUN apk add --no-cache vips-dev build-base python3
COPY package.json package-lock.json* ./

# ── development ──────────────────────────────────────────────────────────
FROM base AS development
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── build ────────────────────────────────────────────────────────────────
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ── production ───────────────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app
RUN apk add --no-cache vips
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
