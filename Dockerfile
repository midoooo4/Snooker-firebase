# Use a lightweight Node image
FROM node:22-alpine

# Hugging Face runs as UID 1000, which is the 'node' user in this image
WORKDIR /home/node/app

# Copy all files and set ownership to 'node' user
COPY --chown=node:node . .

# Switch to the 'node' user for security and HF compatibility
USER node

# Install dependencies for both client and server manually
RUN npm install --prefix snooker-client && npm install --prefix snooker-server

# Build the client manually
RUN npm run build --prefix snooker-client

# Expose port (Hugging Face expects 7860)
EXPOSE 7860

# Start the server directly
CMD ["node", "snooker-server/server.js"]
