FROM node:18

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm install

# Copy remaining files
COPY frontend/ .

EXPOSE 3000

CMD ["npm", "start"]