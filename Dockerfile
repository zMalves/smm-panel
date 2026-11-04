# Imagem base oficial leve do Node.js
FROM node:20-alpine

# Define diretório de trabalho
WORKDIR /app

# Copia arquivos de definição de pacotes
COPY package*.json ./

# Instala dependências de produção
RUN npm install --omit=dev

# Copia todo o código da aplicação
COPY . .

# Expõe a porta interna da aplicação
EXPOSE 3000

# Variáveis padrão
ENV NODE_ENV=production
ENV PORT=3000

# Comando para iniciar
CMD ["node", "src/server.js"]
