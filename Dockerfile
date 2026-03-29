# Stage 1: Build the Snooker Client
FROM node:22-bookworm-slim AS build-client
WORKDIR /app/snooker-client

# Standard environment settings for memory-constrained environments
ENV CI=true
ENV NODE_OPTIONS="--max-old-space-size=1536"

# Copy package files separately to leverage Docker layer caching
COPY snooker-client/package*.json ./
RUN npm ci --loglevel error

# Copy the rest of the client source and build
COPY snooker-client/ ./
RUN npm run build

# Stage 2: Final Production Image
FROM node:22-bookworm-slim
WORKDIR /app

# Production environment settings
ENV CI=true
ENV NODE_ENV=production
ENV PORT=7860
ENV NODE_OPTIONS="--max-old-space-size=1536"

# Cache bust argument to force rebuild if needed
ARG CACHE_BUST=2026-03-30-v8

# Copy server dependency files and install production-only modules
COPY snooker-server/package*.json ./snooker-server/
RUN cd snooker-server && npm ci --only=production --loglevel error

# Copy the built client assets from the build stage
COPY --from=build-client /app/snooker-client/dist ./snooker-client/dist

# Copy the server source code
COPY snooker-server/ ./snooker-server/

# Copy public assets required for background serving
COPY snooker-client/public ./snooker-client/public

# Setup data persistence and security (non-root user)
RUN mkdir -p snooker-server/data && chown -R node:node /app
USER node

# Expose build port (standard for Hugging Face)
EXPOSE 7860

# Start the application
CMD ["node", "snooker-server/server.js"]
