# Stage 1: Build the Go application
# We use a Go base image with a specific version for consistency.
FROM golang:1.23-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy the Go module and checksum files to leverage Docker's cache
COPY go.mod go.sum /app

# Download the dependencies. This step is cached and will only re-run
# if go.mod or go.sum change.
RUN go mod download

# Copy the rest of the application source code
COPY . /app

# Build the Go application for Linux.
# The CGO_ENABLED=0 flag creates a statically-linked binary, which is important
# for the final minimal image.
# Build the entire package to include all .go files.
RUN CGO_ENABLED=0 go build -o /app/harvesterNavigator .

# Stage 2: Create the final production image
# We use a small, fresh, scratch image for the final container.
# This results in a very small and secure final image as it contains only the binary.
FROM alpine:latest

# Set the working directory
WORKDIR /root/

# Copy the built binary from the builder stage
COPY --from=builder /app/harvesterNavigator .

# Expose the port the Go application listens on.
# You will need to confirm the port from the Go code, but a common choice is 8080.
EXPOSE 8080

# The command to run the application when the container starts
CMD ["./app/harvesterNavigator"]
