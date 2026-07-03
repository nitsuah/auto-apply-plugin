# Dockerfile

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS test
COPY . .
CMD ["npm", "test"]

FROM mcr.microsoft.com/playwright:v1.61.0-noble AS e2e
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
# Install the exact Chromium version matching @playwright/test (1.61.1)
RUN npx playwright install chromium
COPY . .
RUN npm run build
CMD ["npm", "run", "test:e2e"]
