# Searchable Module - Website Discovery System

The **Searchable Module** is an intelligent website discovery system that uses Google Search grounding to find missing company websites from your Twitter message request analysis.

## Purpose

When analyzing Twitter message requests, many companies don't include their website in their pitch. The Searchable Module automatically:

1. **Detects** entries with `"Website not provided"` in `enriched-request-flow.json`
2. **Extracts** company names from messages using AI
3. **Searches** for official websites using Google Search grounding
4. **Updates** your Airtable with found websites in the `pr-site` column
5. **Tracks** progress to avoid duplicate processing

## How It Works

### Automatic Integration
The module runs automatically after `analyze-message-requests.js` completes:
- Via scrape-message-requests.js: Runs automatically during message request scraping
- Via analyze-message-requests.js: Runs when analysis script is called directly

### Smart Triggering
- Only processes the **latest entry** in `enriched-request-flow.json`
- Only runs if the latest entry has `"Website not provided"`
- Skips already processed entries using state tracking

## Files Created

- `searchable.js` - Main module
- `searchable-state.json` - State tracking (processed IDs, statistics)
- `searchable-results.json` - Results log with timestamps
- `run-searchable.js` - Standalone execution script

## Configuration

Added to `config.json`:
```json
"searchable": {
  "enabled": true,
  "systemInstruction": "You are a company name extractor and website finder...",
  "searchPrompt": "Based on this message, what is the main company name...",
  "validationPrompt": "Look at these search results and determine..."
}
```

## Manual Usage

### Run Standalone
```bash
# Run the searchable module independently
node run-searchable.js

# Or directly
node searchable.js
```

### Integration Status
The module is **automatically integrated** into your existing workflow:
- Runs after each message request analysis
- No manual intervention required
- Processes only new entries with missing websites

## Features

### Smart Website Discovery
- **Google Search Grounding**: Uses real-time web search
- **AI Company Name Extraction**: Intelligently identifies company names from messages
- **URL Validation**: Filters out social media and non-company sites
- **Retry Logic**: Handles API failures with automatic retries

### State Management
- **Duplicate Prevention**: Tracks processed entries
- **Statistics Tracking**: Success rates, total searches, found websites
- **Timestamped Results**: Complete audit trail of discoveries

### Airtable Integration
- **Automatic Updates**: Updates `pr-site` column in Table 2
- **Batch Processing**: Handles multiple entries efficiently
- **Error Handling**: Graceful failure handling

### Quality Controls
- **URL Validation**: Ensures legitimate company websites
- **Social Media Filtering**: Excludes LinkedIn, Twitter, etc.
- **HTTPS Requirement**: Only accepts secure websites
- **Clean URL Extraction**: Removes trailing punctuation

## Output Examples

### Successful Discovery
```
Website search completed!
   Company: Manus AI
   Website: https://manus.im
   Airtable updated: Yes
   Session stats:
      • Total searches: 2
      • Websites found: 1
      • No results: 1
      • Success rate: 50.0%
```

### No Results Found
```
Website search completed!
   Company: Willow & Ink Books
   Website: No search result found
   Airtable updated: Yes
   Session stats:
      • Total searches: 1
      • Websites found: 0
      • No results: 1
      • Success rate: 0.0%
```

## Technical Details

### Dependencies
- Uses existing `@google/genai` library
- Integrates with current Gemini AI configuration
- Leverages Google Search grounding tool

### Rate Limiting
- 2-second delays between requests
- 3-second delays between retry attempts
- Respects API quotas and limits

### Error Handling
- Graceful API failure handling
- Automatic retry logic (up to 3 attempts)
- Detailed error logging and reporting

## Business Value

### For Investment Analysis
- **Enhanced Due Diligence**: Automatically discovers company websites
- **Time Savings**: No manual website hunting required
- **Data Completeness**: Fills gaps in your investment pipeline
- **Source Attribution**: Uses verifiable search results

### For Workflow Efficiency
- **Seamless Integration**: Works with existing tools
- **Zero Maintenance**: Runs automatically
- **Smart Processing**: Only processes what's needed
- **Comprehensive Logging**: Full audit trail

## Workflow Integration

```
Message Request Detected → Analysis → Website Search → Airtable Update
                    ↓              ↓              ↓              ↓
            scrape-message-  analyze-message-  searchable.js   pr-site
            requests.js      requests.js                       column
```

The Searchable Module seamlessly integrates into your existing Twitter DM monitoring and investment analysis workflow, providing automated website discovery without any additional manual steps required.
