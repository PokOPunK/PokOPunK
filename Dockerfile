FROM node:22-alpine
WORKDIR /app
COPY server.js parser.js app.js index.html style.css sw.js manifest.json icon.svg ./
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/slips.db TZ=Asia/Bangkok
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
