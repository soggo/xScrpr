# Twitter Authentication Setup Guide

This guide explains how to set up Twitter authentication for the DM Fetcher.

## Overview

The Twitter DM Fetcher supports multiple authentication methods:

1. **Cookie-based Authentication** (RECOMMENDED) - Most reliable
2. **Username/Password Authentication** - Alternative method
3. **Full Cookie String** - Advanced method

## Method 1: Cookie-based Authentication (RECOMMENDED)

This method uses your browser's authentication cookies and is the most reliable.

### Step 1: Get Your Cookies

1. **Log in to Twitter/X.com** in your browser
2. **Open Developer Tools**:
   - Chrome/Edge: Press `F12` or `Ctrl+Shift+I`
   - Firefox: Press `F12` or `Ctrl+Shift+I`
   - Safari: Press `Cmd+Option+I`

3. **Navigate to Cookies**:
   - Chrome/Edge: `Application` tab → `Storage` → `Cookies` → `https://x.com`
   - Firefox: `Storage` tab → `Cookies` → `https://x.com`
   - Safari: `Storage` tab → `Cookies` → `x.com`

4. **Find and copy these cookie values**:
   - `auth_token` - A long string (usually 40+ characters)
   - `ct0` - A shorter string (usually 32 characters)

### Step 2: Configure Your .env File

Add these lines to your `.env` file:

```bash
# Twitter Cookie Authentication
X_AUTH_TOKEN=your_auth_token_value_here
X_CT0=your_ct0_value_here
```

### Example:
```bash
X_AUTH_TOKEN=a1b2c3d4e5f6789012345678901234567890abcd
X_CT0=1a2b3c4d5e6f7890abcdef1234567890
```

## Method 2: Username/Password Authentication

This method uses your Twitter credentials directly.

### Configure Your .env File

```bash
# Twitter Username/Password Authentication
X_USERNAME=your_username_or_handle
X_PASSWORD=your_password
X_EMAIL=your_email_address  # Optional, for 2FA verification
```

### Notes:
- Username can be your @handle (without @) or your display name
- If you have 2FA enabled, you'll need to enter the code in the browser window
- This method may be less reliable than cookie-based authentication

## Method 3: Full Cookie String (Advanced)

For advanced users who want to provide all cookies at once.

```bash
# All cookies as semicolon-separated string
X_COOKIES=auth_token=your_token; ct0=your_ct0; other_cookie=value

# OR as JSON array
X_COOKIES=[{"name":"auth_token","value":"your_token","domain":".x.com"}]
```

## Browser Configuration

You can also configure browser behavior:

```bash
# Browser settings
HEADLESS=false    # Set to true to run browser hidden
SLOW=true         # Set to false for faster automation
```

## Security Best Practices

### Important Security Notes:

1. **Never commit your .env file** to version control
2. **Keep your auth tokens secure** - they provide full access to your Twitter account
3. **Regenerate tokens periodically** by logging out and back in
4. **Use environment variables** in production environments

### Protecting Your Credentials:

- The `.env` file is already in `.gitignore` to prevent accidental commits
- Consider using a password manager to store your tokens securely
- Be aware that anyone with your `auth_token` can access your Twitter account

## Troubleshooting

### Authentication Failed
- **Check token validity**: Log out and back into Twitter/X.com to get fresh tokens
- **Verify copy/paste**: Ensure no extra spaces or characters in your tokens
- **Check expiration**: Twitter tokens can expire, especially if you change your password

### Login Redirects or Errors
- **Clear browser data**: The script saves login state, delete `auth-state.json` to reset
- **2FA issues**: Make sure you complete 2FA in the browser window when prompted
- **Rate limiting**: Twitter may temporarily block login attempts if you retry too quickly

### Token Not Found
- **Case sensitivity**: Make sure cookie names are exactly `auth_token` and `ct0`
- **Domain check**: Ensure you're copying from `https://x.com` (not `twitter.com`)
- **Browser refresh**: Sometimes you need to refresh the page to see updated cookies

## Testing Your Setup

After configuration, test your authentication:

```bash
# Test DM scraper
npm run start:dms

# Test message requests scraper  
npm run start:requests
```

If authentication is working, you should see:
- Browser opens and navigates to Twitter
- Script automatically logs in (no manual login required)
- Screenshots are taken and data is extracted

If authentication fails, you'll see:
- Login prompts or redirects
- "Please log in manually" messages
- Authentication timeout errors

## Getting Fresh Tokens

If your tokens stop working:

1. **Log out of Twitter/X.com** completely
2. **Clear browser cookies** for x.com/twitter.com
3. **Log back in** to Twitter/X.com
4. **Get new tokens** following the steps above
5. **Update your .env file** with the new values

## Alternative: Manual Login

If automated authentication fails, the script will fall back to manual login:

1. The browser will open to Twitter's login page
2. Log in manually in the browser window
3. The script will save your session for future runs
4. Subsequent runs will use the saved session

---

**Need Help?** Check the main [README.md](README.md) or open an issue on GitHub.
