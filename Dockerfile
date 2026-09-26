# Gêmeos Motors — imagem para o VPS da Hostinger (EasyPanel).
# O EasyPanel puxa a branch vitrine-html do GitHub e compila com este arquivo.
# As variáveis de verdade (banco, sessão, chaves) ficam na aba "Ambiente" do
# EasyPanel, nunca aqui.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# valores de mentira só para compilar: o pool do banco é criado ao importar,
# mas não conecta; em execução valem os do EasyPanel
RUN DATABASE_URL="postgresql://build:build@localhost/build" \
    SESSION_SECRET="somente-para-compilar-somente-para-compilar" \
    npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
