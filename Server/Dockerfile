# Build backend
# Go 1.26+ is required by the module (go.mod `go 1.26.0`): gin-contrib/gzip and
# golang.org/x/crypto both declare it. An older builder fails at `go mod download`.
FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

# Run stage
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata && update-ca-certificates
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]
