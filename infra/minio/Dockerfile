FROM golang:1.24-alpine AS build
RUN apk add --no-cache git ca-certificates
ENV CGO_ENABLED=0
# Preserve the deployed releases; upstream no longer serves their container tags.
RUN go install github.com/minio/minio@0d7408fc9969caf07de6a8c3a84f9fbb10a6739e
RUN go install github.com/minio/mc@b00526b153a31b36767991a4f5ce2cced435ee8e

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=build /go/bin/minio /go/bin/mc /usr/local/bin/
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data"]
