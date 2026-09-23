FROM node:22.23.2-alpine AS build

WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')" \
    && pnpm install --frozen-lockfile

COPY docs/design-system/tokens.ts docs/design-system/package.json /app/docs/design-system/
COPY frontend/index.html frontend/tsconfig*.json frontend/vite.config.ts ./
COPY frontend/scripts ./scripts
COPY frontend/src ./src
COPY frontend/public ./public
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm run build

FROM nginx:1.27.4-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
