FROM node:20-bookworm-slim

# Set standard /app directory
WORKDIR /app

# Set build-time environment
ENV NODE_ENV=production
ENV CI=true
ENV PORT=7860
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Copy package files (leverages Docker caching)
COPY snooker-client/package*.json ./snooker-client/
COPY snooker-server/package*.json ./snooker-server/

# Install dependencies
RUN cd snooker-client && npm ci --verbose
RUN cd snooker-server && npm ci --verbose

# Copy the rest of the application
COPY . .

# Build the client
RUN cd snooker-client && npm run build --verbose

# Create data folder and fix permissions in one go
RUN mkdir -p snooker-server/data && chown -R node:node /app

# Switch to official non-root user
USER node

# Expose build port
EXPOSE 7860

# Start server
CMD ["node", "snooker-server/server.js"]




