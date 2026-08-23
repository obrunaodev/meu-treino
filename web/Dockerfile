FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./

FROM base AS development
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM base AS build
RUN npm ci
COPY . .
# O Vite substitui `import.meta.env.VITE_*` em tempo de BUILD. A variável do
# compose é de runtime e não chega aqui — sem este ARG o bundle sai com o
# fallback de dev (http://localhost:3000) e o SPA publicado chama a máquina de
# quem está visitando. Vazio = mesma origem, que é o que o Caddy serve.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
# SPA: qualquer rota desconhecida cai no index, senão F5 em /dashboard dá 404.
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
