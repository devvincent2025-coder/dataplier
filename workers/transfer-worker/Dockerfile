FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY . .
RUN go build -o /out/worker ./cmd/worker

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /out/worker /app/worker
ENTRYPOINT ["/app/worker"]

