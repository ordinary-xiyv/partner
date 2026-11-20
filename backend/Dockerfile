FROM golang:1.25.1-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/partner-api .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S partner && adduser -S -G partner partner
USER partner
WORKDIR /app
COPY --from=build /out/partner-api /app/partner-api
EXPOSE 3004
CMD ["/app/partner-api"]
