FROM node:20-bookworm-slim

WORKDIR /app

# Enable CI mode to prevent interactive prompts
ENV CI=true
ENV NODE_OPTIONS="--max-old-space-size=2048"

# ── force full rebuild by changing this value ──
ARG CACHE_BUST=2026-03-29-v5
RUN echo "Cache bust: $CACHE_BUST"

# Copy package files (leverages Docker caching)
COPY snooker-client/package*.json ./snooker-client/
COPY snooker-server/package*.json ./snooker-server/

# Install ALL dependencies (including devDeps for the build)
RUN cd snooker-client && npm ci --verbose
RUN cd snooker-server && npm ci --verbose

# Copy the rest of the application
COPY . .

# Build the client (Now tsc will be found)
RUN cd snooker-client && npm run build --verbose

# Set production environment for runtime
ENV NODE_ENV=production
ENV PORT=7860

# Create data folder and fix permissions
RUN mkdir -p snooker-server/data && chown -R node:node /app

# Switch to official non-root user
USER node

# Expose build port
EXPOSE 7860

# Start server
CMD ["node", "snooker-server/server.js"]
