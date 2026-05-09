FROM node:22.13-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["sh", "-c", "npm install && npm run dev -- --host"]
