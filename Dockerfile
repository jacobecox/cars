FROM node:18-alpine

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy the rest of the application
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "src/index.js"]
