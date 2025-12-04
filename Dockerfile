# Use Node.js 20 explicitly
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first (for better Docker layer caching)
COPY package*.json ./

# Install all dependencies (including dev dependencies for potential build steps)
RUN npm ci

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p logs data

# Verify Node version
RUN node --version

# Start the bot
CMD ["npm", "start"]

