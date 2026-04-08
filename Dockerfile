FROM node:24-alpine
WORKDIR /app
COPY server.js index.html ./
EXPOSE 3000
CMD ["node", "server.js"]
