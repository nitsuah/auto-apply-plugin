# Dockerfile

# Use Node.js base image
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev || true

COPY . .

CMD ["npm", "test"]
