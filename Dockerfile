FROM node:18-alpine

WORKDIR /usr/src/app

COPY server/package*.json ./

RUN npm install

COPY server/ ./

EXPOSE 4000

CMD [ "npm", "start" ]