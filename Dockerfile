# MY STORE — production image (Next.js standalone output)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/assets ./assets
COPY --from=build /app/db ./db
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=deps /app/node_modules/pg ./node_modules/pg
USER app
EXPOSE 3000
# Apply any pending migrations, then start the server.
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
