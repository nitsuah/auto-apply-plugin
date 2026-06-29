# Dockerfile

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS test
COPY lib ./lib
RUN ls -l /app/lib/
RUN cat /app/lib/job-search.js
CMD ["npm", "test"]

FROM mcr.microsoft.com/playwright:v1.61.0-noble AS e2e
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "run", "test:e2e"]
