# MINERVA dashboard for Cloud Run: build the static export, serve it with nginx.
#
# Configuration is read at container start, not at build time: set the
# NEXT_PUBLIC_* variables on the Cloud Run service and docker/write-env.sh
# turns them into /env.js (see src/lib/public-env.ts).

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
ENV PORT=8080
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/write-env.sh /docker-entrypoint.d/40-write-env.sh
RUN chmod +x /docker-entrypoint.d/40-write-env.sh
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 8080
