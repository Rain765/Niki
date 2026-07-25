FROM node:24-alpine AS build

ENV CI=true
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY apps/relay/package.json ./apps/relay/package.json

RUN corepack enable && \
    corepack prepare pnpm@10.33.2 --activate && \
    pnpm install --frozen-lockfile --ignore-scripts --filter @open-design/relay...

COPY packages/contracts ./packages/contracts
COPY apps/relay ./apps/relay

RUN pnpm --filter @open-design/contracts build && \
    pnpm --filter @open-design/relay build && \
    pnpm --filter @open-design/relay deploy --legacy --prod --ignore-scripts /app/release

FROM node:24-alpine AS runtime

RUN addgroup -S -g 1001 niki && \
    adduser -S -D -H -u 1001 -G niki niki

WORKDIR /app
COPY --from=build --chown=niki:niki /app/release ./

ENV NODE_ENV=production
ENV PORT=18765
EXPOSE 18765

USER niki
CMD ["node", "dist/cli.js"]
