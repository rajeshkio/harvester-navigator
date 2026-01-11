# Stage 1: Build the frontend application
# We use a Node.js base image with a specific version to install dependencies and build the project.
FROM node:18-alpine AS builder

# Set the working directory inside the container for all subsequent commands.
WORKDIR /app/frontend

# Copy the required files 
COPY ../index.html ../js/* ../pkg/display/* ../styles/* /app/frontend  

# Stage 2: Create the final production image using a lightweight web server.
# We use a stable Alpine-based NGINX image, which is excellent for serving static files.
FROM nginx:stable-alpine

# Copy the built static assets from the builder stage into NGINX's public directory.
COPY --from=builder /app/frontend/index.html /usr/share/nginx/html

# Expose port 8081, the standard HTTP port, so the outside world can access the application.
EXPOSE 8081

# The default command to run when the container starts.
# This starts NGINX in the foreground, serving the static content.
CMD ["nginx", "-g", "daemon off;"]
