FROM node:20.19.0-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsup.config.ts ./
COPY src ./src
COPY tests ./tests
COPY scripts ./scripts
COPY test.ts ./test.ts
RUN npm run build && npm test

FROM node:20.19.0-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY README.md LICENSE ./

# The package is consumed by an application; this image validates the install
# and provides a reproducible Node runtime for smoke checks.
CMD ["node", "-e", "import('intellerror').then(() => console.log('intellerror ready'))"]
