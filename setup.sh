#!/bin/bash

echo "🚀 Setting up Confluence Markdown Exporter..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (v16 or higher) first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Build the project
echo "🔨 Building the project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Failed to build the project"
    exit 1
fi

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit the .env file with your Confluence credentials:"
    echo "   - CONFLUENCE_BASE_URL: Your Confluence instance URL"
    echo "   - CONFLUENCE_USERNAME: Your username/email"
    echo "   - CONFLUENCE_PASSWORD: Your password/API token"
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Edit the .env file with your Confluence credentials"
echo "2. Test the connection: npm start list-spaces"
echo "3. Export a space: npm start export-space --space YOUR_SPACE_KEY"
echo ""
echo "For more information, see the README.md file."
