FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY . .
RUN go mod tidy && go build -o /out/service ./cmd/service

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /out/service /app/service
EXPOSE 8084
ENTRYPOINT ["/app/service"]
