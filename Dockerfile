# Gêmeos Motors — imagem para o VPS da Hostinger (EasyPanel).
# O EasyPanel puxa a branch vitrine-html do GitHub e compila com este arquivo.
# As variáveis de verdade (banco, sessão, chaves) ficam na aba "Ambiente" do
# EasyPanel, nunca aqui. A mídia do chat fica no volume montado em /data.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# só o que os scripts de manutenção precisam (migrations e cópias), completo:
# o servidor enxuto do Next leva apenas os pedaços que o site usa
FROM node:24-alpine AS ferramentas
WORKDIR /f
COPY package.json ./
RUN node -e "const d=require('./package.json').dependencies;require('fs').writeFileSync('package.json',JSON.stringify({private:true,dependencies:{pg:d.pg,'drizzle-orm':d['drizzle-orm']}}))" \
 && npm install --omit=dev --no-audit --no-fund

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
    HOSTNAME=0.0.0.0 \
    MIDIA_DIR=/data/midia
# ffmpeg: converte o áudio do chat para OGG/Opus antes de mandar ao WhatsApp
RUN apk add --no-cache ffmpeg \
 && addgroup -S app && adduser -S app -G app \
 && mkdir -p /data/midia/chat && chown -R app:app /data
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/scripts ./scripts
COPY --from=ferramentas --chown=app:app /f/node_modules ./scripts/node_modules
USER app
EXPOSE 3000
# confere a mídia, aplica migrations pendentes e liga o servidor
CMD ["node", "scripts/iniciar.mjs"]
