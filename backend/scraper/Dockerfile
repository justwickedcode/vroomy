# Multi-stage build: compile with the full Go toolchain, ship only the static binary in a
# minimal runtime image — the build stage (~1GB+ with the Go toolchain) never ends up in the
# final image, which stays a few MB on top of the base.
FROM golang:1.25-alpine AS build
WORKDIR /src

# Dependencies cached in their own layer — only re-downloaded when go.mod/go.sum actually change,
# not on every source edit.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# CGO_ENABLED=0 for a fully static binary — runs on the minimal base image below with no libc
# dependency to worry about matching.
RUN CGO_ENABLED=0 GOOS=linux go build -o /crawler ./cmd/crawler

FROM alpine:3.20
# ca-certificates: required for the crawler's own outbound HTTPS fetches (Goodreads, Wikiquote)
# to verify TLS certificates — omitting this is a common "works in dev, fails in prod" trap for
# a from-scratch/alpine image, since Go's HTTP client relies on the OS certificate store.
#
# git: the crawler's build-info log line (cmd/crawler/main.go's logBuildInfo) shells out to git
# rev-parse/status. That's meaningless inside a container built from a snapshot with no .git
# directory anyway, so it'll just fail soft and log "could not determine build commit" — fine,
# not worth adding git+the full repo history to the image just to make that one line work.
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /crawler .
ENTRYPOINT ["./crawler"]
