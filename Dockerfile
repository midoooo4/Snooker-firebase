FROM node:20-bookworm-slim

WORKDIR /home/node/app

# Set environment
ENV NODE_ENV=production
ENV CI=true
ENV PORT=7860
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Copy package files
COPY snooker-client/package*.json ./snooker-client/
COPY snooker-server/package*.json ./snooker-server/

# Install dependencies
RUN cd snooker-client && npm ci --verbose
RUN cd snooker-server && npm ci --verbose

# Copy source
COPY . .

# Build Client
RUN cd snooker-client && npm run build --verbose

# Setup data folder
RUN mkdir -p snooker-server/data && chown -R node:node /home/node/app

# Switch to non-root user
USER node

# Expose port
EXPOSE 7860

# Run server
CMD ["node", "snooker-server/server.js"]



