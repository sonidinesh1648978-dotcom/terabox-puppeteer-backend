FROM node:18-slim

# Install Chromium
RUN apt-get update && apt-get install -y \
  chromium \
  chromium-common \
  chromium-driver \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json .
RUN npm install

COPY . .

ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

EXPOSE 10000
CMD ["npm","start"]
