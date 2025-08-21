# API Key Setup Guide

## Where to Enter Your Gemini API Key

### Step 1: Get Your API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key


## Configuration Options Explained

- **`apiKey`**: Your Google Gemini API key (required)
- **`model`**: Uses `gemini-2.5-flash` (latest and fastest)
- **`systemInstruction`**: Tells the AI it's a Twitter DM analyzer
- **`thinkingConfig.thinkingBudget: 0`**: Disables thinking for faster responses
- **`prompt`**: The question asked about each screenshot

## Security Note

**Keep your API key secure!** 
- Don't commit it to version control
- Don't share it publicly
- Consider using environment variables for production
