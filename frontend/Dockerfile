FROM node:22.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Wait for backend to be healthy before starting Vite
CMD ["sh", "-c", "\
  echo 'Waiting for backend...' && \
  until curl -sf http://backend:8000/api/v1/health >/dev/null 2>&1; do \
    echo 'Backend not ready, retrying in 3s...'; sleep 3; \
  done && \
  echo 'Backend ready, starting Vite' && \
  npm install && npm run dev -- --host \
"]
