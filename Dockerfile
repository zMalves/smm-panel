# Imagem base com suporte a compilação nativa para SQLite
FROM node:20-alpine

# Instala ferramentas para compilar módulos nativos C++ (necessário para better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/server.js"]
