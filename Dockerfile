# Use Node 20.18.3 Alpine (lightweight)
FROM node:20.18.3-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app files
COPY . .

# Expose port 3300
EXPOSE 3300

# Start the app
CMD ["npm", "run", "start"]
