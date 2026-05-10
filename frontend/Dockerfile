FROM node:22.13-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Wait for backend to be healthy before starting Vite
CMD ["sh", "-c", "\
  echo 'Waiting for backend...' && \
  until wget -q --spider http://backend:8000/api/v1/health 2>/dev/null; do \
    echo 'Backend not ready, retrying in 3s...'; sleep 3; \
  done && \
  echo 'Backend ready, starting Vite' && \
  npm install && npm run dev -- --host \
"]
