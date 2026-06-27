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
RUN npm install @axe-core/playwright && npm install -g @playwright/test
COPY . .
CMD ["npm", "run", "test:e2e"]
