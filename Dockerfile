# Base oficial Node.js 22 (LTS) em Alpine
FROM node:22-alpine

WORKDIR /app

# Instala pacotes do sistema necessários para build do better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/server.js"]
