# Core — production image. Node 22 (better-sqlite3 needs 20.9+).
FROM node:22-slim AS base
WORKDIR /app
# build tools for better-sqlite3's native addon
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# --- deps (cached) ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- run ---
FROM base AS run
ENV NODE_ENV=production
# database lives on a mounted volume so accounts survive restarts
ENV DATABASE_PATH=/data/core.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /data
EXPOSE 3000
CMD ["npm", "start"]
