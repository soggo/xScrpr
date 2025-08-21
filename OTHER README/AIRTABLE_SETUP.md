# Airtable Integration Setup Guide

## Overview
This guide explains how to configure Airtable so the scrapers can upload regular DMs and message requests to your base.

## Step 1: Create Airtable Account and Base

1. Go to [airtable.com](https://airtable.com) and create a free account
2. Create a new **Base** (this is like a database)
3. Create at least one table for messages. Optionally, create a second table for message requests.

## Step 2: Set Up Table Structures

The code writes the following fields depending on which module is uploading. Create the tables with these columns so uploads succeed.

### Messages Table (required for regular DMs)
Uploaded by `airtable-integration.js` (used in `scrape-dms.js`):

|| Field Name | Field Type | Description |
||------------|------------|-------------|
|| Name | Single line text | Display name of the sender |
|| Username | Single line text | Twitter username (without @) |
|| Message | Long text | The message content (latest/first) |
|| Timestamp | Date | When the message was sent (ISO) |

### Message Requests Table (optional but recommended)
- Used when you want a separate table for message requests
- Two different modules write to this table:
  - `airtable-integration.js` (basic uploads from request scraping)
  - `analyze-message-requests.js` (enriched uploads with analysis fields)
  - `searchable.js` (later updates with website/LinkedIn)

Minimum base fields (needed by basic uploads):

|| Field Name | Field Type | Description |
||------------|------------|-------------|
|| Name | Single line text | Display name of the sender |
|| Username | Single line text | Twitter username (without @) |
|| Message | Long text | The request content (latest/first) |
|| Timestamp | Date | When the request was sent (ISO) |

Additional fields for enriched message requests (added by `analyze-message-requests.js`):

|| Field Name | Field Type | Description |
||------------|------------|-------------|
|| summary | Long text | AI-generated business summary |
|| vertical | Single line text | Category (e.g., GenAI, B2B SaaS) |
|| website | Single line text | Website in the message (or "Website not provided") |
|| compatibility_rating | Number | 1–10 rating from analysis |

Website/LinkedIn enrichment fields (updated by `searchable.js`):

|| Field Name | Field Type | Description |
||------------|------------|-------------|
|| pr-site | Single line text | Discovered official company website |
|| pr-linkedin | Single line text | Discovered LinkedIn company profile URL |

Notes:
- There is no `ID` column used by the code.
- Field names are case-sensitive in Airtable; match them exactly as listed.

## Step 3: Get Your API Credentials

### Create a Personal Access Token
1. Go to [airtable.com/create/tokens](https://airtable.com/create/tokens)
2. Click "Create new token"
3. Name it (e.g., "DM Scraper")
4. Add scopes:
   - `data.records:read`
   - `data.records:write`
5. Grant access to your base and create the token
6. Copy the token (starts with `pat...`)

### Find Your IDs
- Base ID: in the URL `https://airtable.com/app...` → the `app...` part
- Table IDs: when viewing each table `https://airtable.com/app.../tbl.../viw...` → the `tbl...` part

## Step 4: Configure the Integration

Create `airtable-config.json` in the project root (or run `node setup.js` and follow prompts):

```json
{
  "apiKey": "patXXXXXXXXXXXXXX",
  "baseId": "appXXXXXXXXXXXXXX",
  "messageTableId": "tblMESSAGESXXXXXXXX",
  "messageRequestsTableId": "tblREQUESTSXXXXXXXX"
}
```

- `messageTableId` is required (used for regular DM uploads)
- `messageRequestsTableId` is optional; if omitted, message requests upload to `messageTableId`

## Step 5: Verify Your Setup

Run your scrapers to verify uploads:
```bash
# Regular DMs
node scrape-dms.js

# Message requests
node scrape-message-requests.js

# If you run analysis or website discovery, they will populate extra columns
node analyze-message-requests.js
node searchable.js
```
If configured, you should see initialization logs and records created/updated in Airtable.

## Viewing Your Data

- Open your base and check the configured table(s)
- Use views to sort by `Timestamp`, filter by `Username`, or show only records with `website`/`pr-site`

## Troubleshooting

### "Airtable config not found"
- Ensure `airtable-config.json` exists in the project root

### "Missing required Airtable configuration"
- `apiKey`, `baseId`, and `messageTableId` are required

### Records not appearing in Airtable
- Confirm table IDs are correct (`tbl...`)
- Ensure fields exactly match the sets above for the module you’re running
- Check that your token has `data.records:write`

### Message requests not going to a separate table
- Add `messageRequestsTableId` to `airtable-config.json` (this field remains unchanged)

## Security Notes

- Do not commit `airtable-config.json`
- Treat the token like a password
- Consider environment variables for production

## Rate Limits

- Airtable allows ~5 requests/second per base
- The code batches records in groups of 10 and adds short delays between batches to avoid rate limits
