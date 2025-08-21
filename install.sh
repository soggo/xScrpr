#!/bin/bash

# Twitter DM Fetcher Installation Script
echo " Twitter DM Fetcher - One-Click Setup"
echo "======================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo " Node.js is not installed. Please install Node.js first:"
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

echo " Node.js found: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo " npm is not installed. Please install npm first."
    exit 1
fi

echo " npm found: $(npm --version)"

# Install dependencies
echo ""
echo " Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo " Failed to install dependencies"
    exit 1
fi

echo " Dependencies installed successfully"

# Run setup script
echo ""
echo "  Running setup configuration..."
npm run setup

if [ $? -ne 0 ]; then
    echo " Setup configuration failed"
    exit 1
fi

echo ""
echo " Installation complete!"
echo ""
echo " Ready to start! Choose your monitoring mode:"
echo ""
echo "  npm start               - One-time run"
echo "  npm run start:daemon    - Background monitoring (RECOMMENDED)"
echo ""
echo " For continuous monitoring, use daemon mode!"
echo "   It runs in the background and checks every 4 hours."
echo ""
echo "Daemon controls:"
echo "  npm run daemon:status   - Check if running"
echo "  npm run daemon:stop     - Stop background monitoring"
echo "  npm run daemon:logs     - View logs"
echo ""
echo "For more information, check the README.md file."
