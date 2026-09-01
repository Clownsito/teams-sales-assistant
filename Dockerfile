# syntax=docker/dockerfile:1

# --- Etapa 1: build ---------------------------------------------------------
# Compila TypeScript a dist/ con todas las dependencias (incluidas las de dev).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- Etapa 2: dependencias de producción ----------------------------------
# node_modules solo con lo necesario para correr (sin devDependencies).
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Etapa 3: runtime -----------------------------------------------------
# Imagen final liviana: solo Node, node_modules de prod y dist/.
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# El puerto real lo fija la variable PORT (default 3000).
EXPOSE 3000
USER node

# Chequeo local del contenedor; el orquestador igual usa el endpoint /health.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
