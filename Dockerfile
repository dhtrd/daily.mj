# صورة موحّدة: تبني الواجهة ثم يخدمها خادم Node مع وسيط فاتورة
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# متغيّرات Firebase تُدمج وقت البناء (Vite) — مرّرها كـ build args عند الحاجة
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_COLLECTION
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY server.js ./
EXPOSE 8787
CMD ["node", "server.js"]
