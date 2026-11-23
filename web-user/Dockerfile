FROM oven/bun:latest AS builder
WORKDIR /build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV VITE_API_URL=""
ARG VITE_DEPLOY_MODE=overseas
ENV VITE_DEPLOY_MODE=${VITE_DEPLOY_MODE}
RUN bun run build

FROM nginx:stable-alpine
RUN apk add --no-cache ca-certificates gettext
COPY --from=builder /build/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
