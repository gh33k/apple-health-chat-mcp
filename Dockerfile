FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Set environment variables
ENV HEALTH_EXPORT_DIR=/app/health-data

# Expose port (if needed)
EXPOSE 3000

# Start the server
CMD ["node", "dist/index.js"]
