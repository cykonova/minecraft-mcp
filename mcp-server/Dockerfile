# Multi-stage build for smaller production image
FROM node:20-alpine AS builder

# Install build dependencies including cmake for native modules
RUN apk add --no-cache python3 make g++ cmake

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies for build (including dev)
RUN npm install --legacy-peer-deps

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production --legacy-peer-deps

# Production stage
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    openssl \
    ca-certificates \
    tini

# Create non-root user
RUN addgroup -g 1001 -S minecraft && \
    adduser -u 1001 -S minecraft -G minecraft

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy entrypoint script
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create directories for config and logs
RUN mkdir -p /app/config /app/logs && \
    chown -R minecraft:minecraft /app && \
    chown minecraft:minecraft /usr/local/bin/docker-entrypoint.sh

# Switch to non-root user
USER minecraft

# Expose SSE port
EXPOSE 3000

# Use tini to handle signals properly with our entrypoint
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"