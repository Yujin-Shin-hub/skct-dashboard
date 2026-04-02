FROM node:22-alpine

WORKDIR /app

COPY backend ./backend
COPY frontend ./frontend
COPY notion_mock_cache.json ./

ENV PORT=8787

EXPOSE 8787

CMD ["node", "backend/notion_proxy_server.js"]
