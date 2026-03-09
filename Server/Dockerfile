# Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app
COPY Client/package*.json ./
RUN npm install
COPY Client/ .
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Build backend
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY Server/go.mod Server/go.sum ./
RUN go mod download
COPY Server/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

# Run stage
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata && update-ca-certificates
WORKDIR /app
COPY --from=builder /app/server .
COPY --from=frontend /app/dist ./static
EXPOSE 8080
CMD ["./server"]
