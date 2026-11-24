FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY . .
RUN go mod tidy && go build -o /out/gateway ./cmd/gateway

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /out/gateway /app/gateway
EXPOSE 8080
ENTRYPOINT ["/app/gateway"]
