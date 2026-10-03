# Multi-stage build: compile with the full Go toolchain, ship only the static binary in a
# minimal runtime image.
FROM golang:1.26-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /ws .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /ws .
EXPOSE 8081
ENTRYPOINT ["./ws"]
