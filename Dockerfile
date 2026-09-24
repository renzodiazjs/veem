# One image, two targets: `server` (Node + ffmpeg) and `web` (Next.js).
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .

FROM base AS server
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV SESSIONS_FILE=/app/sessions.json SERVER_PORT=8080
EXPOSE 8080
WORKDIR /app/apps/server
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM base AS web
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN pnpm exec next build
EXPOSE 3100
CMD ["pnpm", "exec", "next", "start", "-p", "3100"]
