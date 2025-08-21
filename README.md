# Twitter DM Fetcher

An automated system that monitors your Twitter direct messages and message requests, then uses AI to analyze them for business opportunities. Perfect for investors, entrepreneurs, and anyone who receives a lot of business inquiries on Twitter.

## What Does This Do?

- **Automatically checks your Twitter DMs** - No need to manually scroll through messages
- **Monitors message requests** - Catches new business inquiries from people you don't follow
- **AI analyzes everything** - Uses Google's Gemini AI to identify business opportunities
- **Saves everything organized** - Data files and spreadsheets
- **Optional Airtable integration** - Automatically uploads data to your Airtable for easy tracking

## Quick Start (Simple Installation)

1. **Download and install everything:**
   ```bash
 1.  git clone 
 2.  cd twitter-dm-fetcher
 3.   ./install.sh  - how to actually start it all.
   ```

2. **Start monitoring:**
   ```bash
 npm start               - One-time run
  npm run start:daemon    - Background monitoring (RECOMMENDED)
   ```

That's it! The system will guide you through setup and start monitoring automatically.

## What You'll Need

- **Google Gemini API key** (free) - For AI analysis ([Get one here](https://aistudio.google.com/))
- **Your Twitter login** - Either cookies or username/password
- **Airtable account** (optional) - For organized data storage

## How to Set Up

### Option 1: Automatic Setup (Recommended)
Run the installation script above and it will guide you through everything step by step.

### Option 2: Manual Setup
If you prefer to set things up yourself:

1. **Get your Google Gemini API key:**
   - Go to [Google AI Studio](https://aistudio.google.com/)
   - Sign in and click "Get API Key"
   - Copy the key

2. **Set up Twitter authentication:**
   - **Easy way:** Copy cookies from your browser (see `TWITTER_AUTH_SETUP.md`)
   - **Alternative:** Use your Twitter username and password

### Quick Guide: Getting Your X/Twitter auth_token and ct0

To get your authentication tokens from X (Twitter):

1. **Log into X/Twitter** in your browser
2. **Open Developer Tools** (F12 or right-click → Inspect)
3. **Go to Application/Storage tab** → Cookies → https://x.com (or twitter.com)
4. **Find these two cookies:**
   - `auth_token` - Copy the entire value
   - `ct0` - Copy the entire value
5. **Add them to your `.env` file:**
   ```
   TWITTER_AUTH_TOKEN=your_auth_token_here
   TWITTER_CT0=your_ct0_here
   ```

**Note:** These tokens expire, so you may need to refresh them periodically if authentication fails.

3. **Configure the system:**
   - Edit `config.json` and add your Gemini API key
   - Edit `.env` file with your Twitter login info

## Main Features

### Smart AI Analysis
The system analyzes your messages using Google's AI:
- "Are there any new business opportunities here?"
- Extracts company names, websites, and business details
- Rates opportunities on a 1-10 scale

### Organized Data
Everything gets saved to organized folders:
- `regular-dms/` - Your normal DM conversations
- `message-requests/` - New message requests from unknown people
- Each has a `data/` subfolder with structured JSON files

### Background Monitoring
Set it to run automatically every few hours:
```bash
npm run start:daemon
```

### Website Discovery
For message requests that don't include websites, the system automatically:
- Extracts company names from messages
- Searches Google to find their official websites
- Updates your records with the found websites

## Where Everything Is

|| What You're Looking For | Where To Find It |
||------------------------|------------------|
|| **Configuration** | `config.json` (main settings), `.env` (login info) |
|| **Setup help** | `API_KEY_SETUP.md`, `TWITTER_AUTH_SETUP.md` |
|| **Regular DM data** | `regular-dms/data/` folder |
|| **Message request data** | `message-requests/data/` folder |

|| **Airtable setup** | `AIRTABLE_SETUP.md` |
|| **Website search feature** | `SEARCHABLE_README.md` |

## Understanding the Files

### Data Files
- **`*-flow.json`** - Simplified, clean data that's easy to read
- **`*_data_*.json`** - Complete raw data with all details
- **`enriched-*.json`** - Data enhanced with AI analysis


## Common Commands

|| Command | What It Does |
||---------|-------------|
|| `npm start` | Run everything once |
|| `npm run start:daemon` | Start background monitoring |
|| `npm run daemon:status` | Check if background monitoring is running |
|| `npm run daemon:stop` | Stop background monitoring |
|| `npm run start:dms` | Only check regular DMs |
|| `npm run start:requests` | Only check message requests |
|| `npm run analyze` | Re-analyze existing message requests with AI |

## Airtable Integration (Optional)

If you want your data automatically organized in a spreadsheet-like interface:

1. Create a free Airtable account
2. Follow the setup guide in `AIRTABLE_SETUP.md`
3. Your data will automatically upload to Airtable after each run

## Troubleshooting

### "Authentication failed"
- Check your Twitter login info in the `.env` file
- For cookies: Make sure they're current (get fresh ones from your browser)
- For username/password: Make sure they're correct

### "API key not working"
- Verify your Gemini API key in `config.json`
- Make sure you have API quota remaining
- Check for typos in the key

### "No new messages found"
- This is normal if you have no new DMs or message requests
- The system only processes truly NEW content

### Browser won't open
- Try running with: `HEADLESS=false npm start`
- Install the browser: `npx playwright install chromium`

## Getting Help

1. **Check the specific setup guides in other readme folder:**
   - `TWITTER_AUTH_SETUP.md` - Twitter login issues
   - `API_KEY_SETUP.md` - Google Gemini setup
   - `AIRTABLE_SETUP.md` - Airtable integration

2. **Look at the detailed guides:**
   - `MESSAGE_REQUESTS_README.md` - Message request specifics
   - `SEARCHABLE_README.md` - Website discovery feature

3. **Check your data folders** for JSON files to see what the system extracted

## Security Notes

- Your API keys and login info are stored locally on your computer
- Never share your `config.json`, `.env`, or `airtable-config.json` files
- The system only reads your messages - it never sends or replies to anything


