# Use a lightweight Node image
FROM node:22-alpine

# Hugging Face runs as UID 1000, which is the 'node' user
WORKDIR /home/node/app

# Copy package files first to leverage Docker cache
COPY --chown=node:node snooker-client/package*.json ./snooker-client/
COPY --chown=node:node snooker-server/package*.json ./snooker-server/

# Install dependencies
RUN npm install --prefix snooker-client && npm install --prefix snooker-server

# Copy the rest of the application
COPY --chown=node:node . .

# Ensure data directory exists and is writable by the node user
RUN mkdir -p snooker-server/data && chown -R node:node snooker-server/data

# Build the client
RUN npm run build --prefix snooker-client

# Hugging Face expects port 7860
EXPOSE 7860

# Switch to non-root user
USER node

# Start the server
CMD ["node", "snooker-server/server.js"]
