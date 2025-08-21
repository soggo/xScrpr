const fs = require('fs');
const path = require('path');
const {
  GoogleGenAI
} = require('@google/genai');
let genAI = null;
async function initializeGemini() {
  try {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    if (config.gemini && config.gemini.apiKey && config.gemini.apiKey !== 'YOUR_GEMINI_API_KEY_HERE') {
      genAI = new GoogleGenAI({
        apiKey: config.gemini.apiKey
      });
      console.log(' Gemini AI with Search grounding initialized successfully');
      return true;
    } else {
      console.log('️  No Gemini API key found in config');
      return false;
    }
  } catch (error) {
    console.error(' Failed to initialize Gemini AI:', error.message);
    return false;
  }
}
async function extractCompanyName(messageData) {
  if (!genAI) {
    console.log('️  Gemini AI not available, skipping company name extraction');
    return null;
  }
  try {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const model = config.gemini.model || "gemini-2.5-flash";
    const systemInstruction = config.searchable?.systemInstruction || "You are a company name extractor. Your job is to identify the main company name from business messages.";
    const prompt = config.searchable?.searchPrompt || "Based on this message, what is the main company name that I should search for to find their official website? Return ONLY the company name, nothing else.";
    const messageText = `
Name: ${messageData.name}
Username: @${messageData.username}
Message: ${messageData.message}
        `.trim();
    const contents = [{
      role: "user",
      parts: [{
        text: `${prompt}\n\nMessage to analyze:\n${messageText}`
      }]
    }];
    const response = await genAI.models.generateContent({
      model: model,
      contents: contents,
      config: {
        systemInstruction: systemInstruction
      }
    });
    const companyName = response.text.trim();
    console.log(` Extracted company name for @${messageData.username}: "${companyName}"`);
    return companyName;
  } catch (error) {
    console.error(` Failed to extract company name from @${messageData.username}:`, error.message);
    return null;
  }
}
function isValidWebsiteUrl(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();
    const excludePatterns = ['linkedin.com', 'twitter.com', 'facebook.com', 'instagram.com', 'youtube.com', 'github.com', 'medium.com', 'crunchbase.com', 'wikipedia.org', 'reddit.com', 'quora.com'];
    const isExcluded = excludePatterns.some(pattern => domain.includes(pattern));
    return urlObj.protocol === 'https:' && !isExcluded && domain.includes('.');
  } catch {
    return false;
  }
}
function isValidLinkedInUrl(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();
    return domain.includes('linkedin.com') && pathname.startsWith('/company/') && !pathname.includes('/in/');
  } catch {
    return false;
  }
}
async function searchCompanyWebsite(companyName, messageData, retries = 2) {
  if (!genAI || !companyName) {
    return "No search result found";
  }
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const vertical = messageData.vertical || '';
      const searchContext = vertical ? ` (${vertical} company)` : '';
      console.log(` Searching for website of: ${companyName}${searchContext} (attempt ${attempt}/${retries + 1})`);
      const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
      const model = config.gemini.model || "gemini-2.5-flash";
      const groundingTool = {
        googleSearch: {}
      };
      const searchQuery = vertical ? `Find the official company website for "${companyName}", a ${vertical} company. Look for their main corporate website URL, not social media profiles or third-party sites. The company operates in the ${vertical} sector. If you find their official website, return only the clean website URL (e.g., https://example.com). If you cannot find an official company website, return exactly "No search result found".` : `Find the official company website for "${companyName}". Look for their main corporate website URL, not social media profiles or third-party sites. If you find it, return only the clean website URL (e.g., https://example.com). If you cannot find an official company website, return exactly "No search result found".`;
      const contents = [{
        role: "user",
        parts: [{
          text: searchQuery
        }]
      }];
      const response = await genAI.models.generateContent({
        model: model,
        contents: contents,
        config: {
          tools: [groundingTool],
          systemInstruction: "You are a website finder. Your job is to find official company websites using search results. Return only the main company website URL, not social media or third-party sites. Return 'No search result found' if no official website is found."
        }
      });
      const result = response.text.trim();
      console.log(` Search result for ${companyName}: ${result}`);
      if (response.candidates?.[0]?.groundingMetadata) {
        const metadata = response.candidates[0].groundingMetadata;
        console.log(` Search queries used: ${metadata.webSearchQueries?.join(', ') || 'N/A'}`);
        console.log(` Sources found: ${metadata.groundingChunks?.length || 0}`);
      }
      if (result.toLowerCase().includes('http') && !result.toLowerCase().includes('no search result found')) {
        const urlMatch = result.match(/(https?:\/\/[^\s\)]+)/);
        const cleanUrl = urlMatch ? urlMatch[1].replace(/[,\.]$/, '') : result;
        if (isValidWebsiteUrl(cleanUrl)) {
          console.log(` Valid website found: ${cleanUrl}`);
          return cleanUrl;
        } else {
          console.log(`️  URL failed validation: ${cleanUrl}`);
        }
      }
      return "No search result found";
    } catch (error) {
      console.error(` Attempt ${attempt} failed for ${companyName}:`, error.message);
      if (attempt <= retries) {
        console.log(` Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  console.error(` All attempts failed for ${companyName}`);
  return "No search result found";
}
async function searchLinkedInProfile(companyName, messageData, retries = 2) {
  if (!genAI || !companyName) {
    return "No LinkedIn profile found";
  }
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const vertical = messageData.vertical || '';
      const searchContext = vertical ? ` (${vertical} company)` : '';
      console.log(` Searching for LinkedIn profile of: ${companyName}${searchContext} (attempt ${attempt}/${retries + 1})`);
      const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
      const model = config.gemini.model || "gemini-2.5-flash";
      console.log(` LinkedIn search query preview: Find LinkedIn for "${companyName}" using site:linkedin.com/company/`);
      const groundingTool = {
        googleSearch: {}
      };
      const linkedinConfig = config.searchable?.searches?.linkedin;
      const basePrompt = linkedinConfig?.prompt || "Find the official LinkedIn company page for the company.";
      const systemInstruction = linkedinConfig?.systemInstruction || "You are a LinkedIn profile finder.";
      const searchQuery = basePrompt.replace(/\[COMPANY_NAME\]/g, companyName).replace(/\[VERTICAL\]/g, vertical || 'company') + (vertical ? ` This is a ${vertical} company.` : '') + ` Return the full LinkedIn company URL (https://linkedin.com/company/company-name) or "No LinkedIn profile found" if none exists.`;
      const contents = [{
        role: "user",
        parts: [{
          text: searchQuery
        }]
      }];
      const response = await genAI.models.generateContent({
        model: model,
        contents: contents,
        config: {
          tools: [groundingTool],
          systemInstruction: systemInstruction
        }
      });
      const result = response.text.trim();
      console.log(` LinkedIn search result for ${companyName}: ${result}`);
      if (response.candidates?.[0]?.groundingMetadata) {
        const metadata = response.candidates[0].groundingMetadata;
        console.log(` LinkedIn search queries used: ${metadata.webSearchQueries?.join(', ') || 'N/A'}`);
        console.log(` LinkedIn sources found: ${metadata.groundingChunks?.length || 0}`);
      }
      if (result.toLowerCase().includes('linkedin.com') && !result.toLowerCase().includes('no linkedin profile found')) {
        const urlMatch = result.match(/(https?:\/\/[^\s\)]*linkedin\.com[^\s\)]*)/);
        const cleanUrl = urlMatch ? urlMatch[1].replace(/[,\.]$/, '') : result;
        if (isValidLinkedInUrl(cleanUrl)) {
          console.log(` Valid LinkedIn profile found: ${cleanUrl}`);
          return cleanUrl;
        } else {
          console.log(`️  LinkedIn URL failed validation: ${cleanUrl}`);
        }
      }
      return "No LinkedIn profile found";
    } catch (error) {
      console.error(` LinkedIn search attempt ${attempt} failed for ${companyName}:`, error.message);
      if (attempt <= retries) {
        console.log(` Retrying LinkedIn search in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  console.error(` All LinkedIn search attempts failed for ${companyName}`);
  return "No LinkedIn profile found";
}
function loadSearchableState() {
  try {
    if (fs.existsSync('searchable-state.json')) {
      const state = JSON.parse(fs.readFileSync('searchable-state.json', 'utf8'));
      console.log(` Loaded searchable state - Last processed ID: ${state.lastProcessedId}`);
      return state;
    }
  } catch (error) {
    console.log('️  Could not load searchable state, starting fresh');
  }
  return {
    lastProcessedId: 0,
    processedIds: [],
    lastRunTimestamp: null,
    totalSearched: 0,
    websitesFound: 0,
    noResultsCount: 0
  };
}
function saveSearchableState(state) {
  try {
    state.lastRunTimestamp = new Date().toISOString();
    fs.writeFileSync('searchable-state.json', JSON.stringify(state, null, 2));
    console.log(` Searchable state saved - Last processed ID: ${state.lastProcessedId}`);
  } catch (error) {
    console.error(' Failed to save searchable state:', error.message);
  }
}
function loadSearchableResults() {
  try {
    if (fs.existsSync('searchable-results.json')) {
      const results = JSON.parse(fs.readFileSync('searchable-results.json', 'utf8'));
      console.log(` Loaded existing searchable results: ${results.length} records`);
      return results;
    }
  } catch (error) {
    console.log('️  Could not load searchable results, starting fresh');
  }
  return [];
}
function saveSearchableResults(results) {
  try {
    fs.writeFileSync('searchable-results.json', JSON.stringify(results, null, 2));
    console.log(` Searchable results saved: ${results.length} records`);
  } catch (error) {
    console.error(' Failed to save searchable results:', error.message);
  }
}
async function updateAirtableWithSearchResults(messageData, searchResults) {
  try {
    const airtableConfig = JSON.parse(fs.readFileSync('airtable-config.json', 'utf8'));
    const searchResponse = await fetch(`https://api.airtable.com/v0/${airtableConfig.baseId}/${airtableConfig.messageRequestsTableId}?filterByFormula=AND({Username}='${messageData.username}',FIND('${messageData.message.substring(0, 50)}',{Message})>0)`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${airtableConfig.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (!searchResponse.ok) {
      console.error(` Failed to find record in Airtable for @${messageData.username}`);
      return false;
    }
    const searchResult = await searchResponse.json();
    if (searchResult.records.length === 0) {
      console.log(`️  No matching record found in Airtable for @${messageData.username}`);
      return false;
    }
    const recordId = searchResult.records[0].id;
    const fieldsToUpdate = {};
    if (searchResults.website) {
      fieldsToUpdate['pr-site'] = searchResults.website;
    }
    if (searchResults.linkedin) {
      fieldsToUpdate['pr-linkedin'] = searchResults.linkedin;
    }
    const updateResponse = await fetch(`https://api.airtable.com/v0/${airtableConfig.baseId}/${airtableConfig.messageRequestsTableId}/${recordId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${airtableConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: fieldsToUpdate
      })
    });
    if (updateResponse.ok) {
      const updateFields = Object.keys(fieldsToUpdate).map(key => `${key}: ${fieldsToUpdate[key]}`).join(', ');
      console.log(` Updated Airtable record for @${messageData.username} with ${updateFields}`);
      return true;
    } else {
      const error = await updateResponse.text();
      console.error(` Failed to update Airtable record:`, error);
      return false;
    }
  } catch (error) {
    console.error(` Failed to update Airtable for @${messageData.username}:`, error.message);
    return false;
  }
}
function isAlreadySearched(messageData, searchableState) {
  return searchableState.processedIds.includes(messageData.id);
}
async function searchWebsites() {
  console.log(' Starting website search for messages with "Website not provided"...');
  const geminiInitialized = await initializeGemini();
  if (!geminiInitialized) {
    console.log(' Cannot proceed without Gemini AI');
    return;
  }
  try {
    if (!fs.existsSync('enriched-request-flow.json')) {
      console.log(' enriched-request-flow.json not found. Run analyze-message-requests.js first.');
      return;
    }
    const enrichedData = JSON.parse(fs.readFileSync('enriched-request-flow.json', 'utf8'));
    console.log(` Found ${enrichedData.length} enriched message requests`);
    let searchableState = loadSearchableState();
    const newEntries = enrichedData.filter(entry => entry.id > searchableState.lastProcessedId && entry.website === "Website not provided");
    if (enrichedData.length === 0) {
      console.log(' No enriched data found');
      return;
    }
    if (newEntries.length === 0) {
      console.log(` No new entries need website search (last processed ID: ${searchableState.lastProcessedId})`);
      console.log(' All entries up to date');
      return;
    }
    console.log(` Found ${newEntries.length} new entries that need website search!`);
    console.log(`   Processing IDs: ${newEntries.map(e => e.id).join(', ')}`);
    console.log(`   Last processed ID was: ${searchableState.lastProcessedId}`);
    let searchableResults = loadSearchableResults();
    for (let i = 0; i < newEntries.length; i++) {
      const entry = newEntries[i];
      console.log(`\n Processing entry ${i + 1}/${newEntries.length}: @${entry.username} (ID: ${entry.id})`);
      if (isAlreadySearched(entry, searchableState)) {
        console.log(` Entry (ID: ${entry.id}) already processed, skipping`);
        continue;
      }
      const companyName = await extractCompanyName(entry);
      if (!companyName) {
        console.log(`️  Could not extract company name from @${entry.username}, skipping`);
        continue;
      }
      console.log(` Searching for website of: ${companyName}`);
      const website = await searchCompanyWebsite(companyName, entry);
      console.log(` Searching for LinkedIn profile of: ${companyName}`);
      const linkedin = await searchLinkedInProfile(companyName, entry);
      const searchResult = {
        id: entry.id,
        name: entry.name,
        username: entry.username,
        companyName: companyName,
        searches: {
          website: {
            result: website,
            status: website !== "No search result found" ? "found" : "not_found"
          },
          linkedin: {
            result: linkedin,
            status: linkedin !== "No LinkedIn profile found" ? "found" : "not_found"
          }
        },
        searchTimestamp: new Date().toISOString(),
        originalMessage: entry.message.substring(0, 100) + '...'
      };
      searchableResults.push(searchResult);
      searchableState.totalSearched++;
      if (website !== "No search result found") {
        searchableState.websitesFound++;
      }
      if (linkedin !== "No LinkedIn profile found") {
        searchableState.linkedinFound = (searchableState.linkedinFound || 0) + 1;
      }
      const noResults = website === "No search result found" && linkedin === "No LinkedIn profile found";
      if (noResults) {
        searchableState.noResultsCount++;
      } else {
        if (searchableState.noResultsCount > 0 && (website !== "No search result found" || linkedin !== "No LinkedIn profile found")) {
          searchableState.noResultsCount = Math.max(0, searchableState.noResultsCount - 1);
        }
      }
      searchableState.processedIds.push(entry.id);
      searchableState.lastProcessedId = Math.max(searchableState.lastProcessedId, entry.id);
      const searchResultsForAirtable = {
        website: website !== "No search result found" ? website : null,
        linkedin: linkedin !== "No LinkedIn profile found" ? linkedin : null
      };
      console.log(` Updating Airtable with search results...`);
      const airtableUpdated = await updateAirtableWithSearchResults(entry, searchResultsForAirtable);
      console.log(` Completed processing @${entry.username}:`);
      console.log(`    Company: ${companyName}`);
      console.log(`    Website: ${website}`);
      console.log(`    LinkedIn: ${linkedin}`);
      console.log(`    Airtable updated: ${airtableUpdated ? ' Yes' : ' No'}`);
      if (i < newEntries.length - 1) {
        console.log(`⏳ Waiting 2 seconds before next entry...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    saveSearchableState(searchableState);
    saveSearchableResults(searchableResults);
    const websiteSuccessRate = searchableState.totalSearched > 0 ? (searchableState.websitesFound / searchableState.totalSearched * 100).toFixed(1) : '0';
    const linkedinSuccessRate = searchableState.totalSearched > 0 ? ((searchableState.linkedinFound || 0) / searchableState.totalSearched * 100).toFixed(1) : '0';
    console.log(`\n Batch search completed!`);
    console.log(`    Processed ${newEntries.length} new entries`);
    console.log(`    Updated last processed ID to: ${searchableState.lastProcessedId}`);
    console.log(`    Overall session stats:`);
    console.log(`      • Total searches: ${searchableState.totalSearched}`);
    console.log(`      • Websites found: ${searchableState.websitesFound} (${websiteSuccessRate}%)`);
    console.log(`      • LinkedIn found: ${searchableState.linkedinFound || 0} (${linkedinSuccessRate}%)`);
    console.log(`      • Complete failures: ${searchableState.noResultsCount}`);
    console.log(`    Last run: ${searchableState.lastRunTimestamp}`);
  } catch (error) {
    console.error(' Error during website search:', error.message);
  }
}
if (require.main === module) {
  searchWebsites();
}
module.exports = {
  searchWebsites,
  extractCompanyName,
  searchCompanyWebsite,
  searchLinkedInProfile,
  updateAirtableWithSearchResults
};