# Dockerfile

# Use Node.js base image
FROM node:20-slim

WORKDIR /app


# Copy package files and install ALL dependencies (including dev)
COPY package.json package-lock.json* ./
RUN npm install


# Copy the rest of the code
COPY . .


# Run lint at build time so build fails on lint errors
RUN npm run lint

# Default command runs tests (or app)
CMD npm test
