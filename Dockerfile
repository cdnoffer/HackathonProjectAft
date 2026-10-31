FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.14
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV ROUTEY_DB=/data/routey.db
COPY --from=build /app/package.json /app/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
EXPOSE 8787
CMD ["bun", "server/index.ts"]
