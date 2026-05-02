FROM node:20-slim

# Install Playwright system dependencies
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 \
    libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 \
    libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 \
    libxrandr2 xdg-utils libxss1 libxtst6 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install server deps
COPY package*.json ./
RUN npm ci --omit=dev

# Install Playwright chromium
RUN npx playwright install chromium --with-deps

# Install and build React frontend
COPY client/package*.json ./client/
RUN cd client && npm ci

COPY client/ ./client/
RUN cd client && npm run build

# Copy rest of server code
COPY . .

EXPOSE 3004

CMD ["node", "server.js"]
