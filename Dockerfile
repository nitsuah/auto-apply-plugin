# Dockerfile

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS test
COPY . .
CMD ["npm", "test"]
