FROM node:22-alpine

WORKDIR /app

COPY notion_proxy_server.js ./
COPY notion_db_trend_viewer.html ./
COPY notion_mock_cache.json ./

ENV PORT=8787

EXPOSE 8787

CMD ["node", "notion_proxy_server.js"]
