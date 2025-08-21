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
      console.log(' Gemini AI initialized successfully');
      return true;
    } else {
      console.log(' No Gemini API key found in config');
      return false;
    }
  } catch (error) {
    console.error(' Failed to initialize Gemini AI:', error.message);
    return false;
  }
}
async function analyzeMessageWithGemini(messageData) {
  if (!genAI) {
    console.log(' Gemini AI not available, skipping analysis');
    return null;
  }
  try {
    console.log(`Analyzing message from @${messageData.username}: "${messageData.message.substring(0, 50)}..."`);
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const model = config.gemini.model || "gemini-2.5-flash";
    const systemInstruction = config.gemini.businessAnalysis.systemInstruction;
    const prompt = config.gemini.businessAnalysis.prompt;
    const messageText = `
Name: ${messageData.name}
Username: @${messageData.username}
Message: ${messageData.message}
Timestamp: ${messageData.timestamp}
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
        systemInstruction: systemInstruction,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    });
    const analysisText = response.text.trim();
    console.log(`Gemini analysis result for @${messageData.username}:`);
    console.log(analysisText);
    const analysis = parseGeminiResponse(analysisText);
    return analysis;
  } catch (error) {
    console.error(`Failed to analyze message from @${messageData.username}:`, error.message);
    return null;
  }
}
function parseGeminiResponse(responseText) {
  const analysis = {
    summary: '',
    vertical: '',
    website: '',
    compatibility_rating: ''
  };
  try {
    const lines = responseText.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('SUMMARY:')) {
        analysis.summary = trimmedLine.replace('SUMMARY:', '').trim();
      } else if (trimmedLine.startsWith('VERTICAL:')) {
        analysis.vertical = trimmedLine.replace('VERTICAL:', '').trim();
      } else if (trimmedLine.startsWith('WEBSITE:')) {
        analysis.website = trimmedLine.replace('WEBSITE:', '').trim();
      } else if (trimmedLine.startsWith('COMPATIBILITY_RATING:')) {
        analysis.compatibility_rating = trimmedLine.replace('COMPATIBILITY_RATING:', '').trim();
      }
    }
    if (!analysis.summary || !analysis.vertical || !analysis.website || !analysis.compatibility_rating) {
      console.log(' Incomplete analysis response, using fallback values');
      analysis.summary = analysis.summary || 'Analysis incomplete';
      analysis.vertical = analysis.vertical || 'N/A';
      analysis.website = analysis.website || 'Website not provided';
      analysis.compatibility_rating = analysis.compatibility_rating || '0';
    }
  } catch (error) {
    console.error('Failed to parse Gemini response:', error.message);
    return {
      summary: 'Parse error',
      vertical: 'N/A',
      website: 'Website not provided',
      compatibility_rating: '0'
    };
  }
  return analysis;
}
async function uploadToAirtable(enrichedData) {
  try {
    const airtableConfig = JSON.parse(fs.readFileSync('airtable-config.json', 'utf8'));
    const records = enrichedData.map(item => ({
      fields: {
        'Name': item.name,
        'Username': item.username,
        'Message': item.message,
        'Timestamp': item.timestamp,
        'summary': item.summary,
        'vertical': item.vertical,
        'website': item.website,
        'compatibility_rating': item.compatibility_rating
      }
    }));
    const batches = [];
    for (let i = 0; i < records.length; i += 10) {
      batches.push(records.slice(i, i + 10));
    }
    console.log(`Uploading ${records.length} records to Airtable in ${batches.length} batch(es)...`);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const response = await fetch(`https://api.airtable.com/v0/${airtableConfig.baseId}/${airtableConfig.messageRequestsTableId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${airtableConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: batch
        })
      });
      if (response.ok) {
        const result = await response.json();
        console.log(`Batch ${batchIndex + 1}/${batches.length} uploaded successfully (${result.records.length} records)`);
      } else {
        const error = await response.text();
        console.error(`Failed to upload batch ${batchIndex + 1}:`, error);
      }
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    console.log('All data uploaded to Airtable successfully!');
  } catch (error) {
    console.error('Failed to upload to Airtable:', error.message);
  }
}
function loadEnrichedData() {
  try {
    if (fs.existsSync('enriched-request-flow.json')) {
      const data = JSON.parse(fs.readFileSync('enriched-request-flow.json', 'utf8'));
      console.log(`Loaded existing enriched data: ${data.length} records`);
      return data;
    }
  } catch (error) {
    console.log('Could not load existing enriched data, starting fresh');
  }
  return [];
}
function loadAnalysisState() {
  try {
    if (fs.existsSync('analysis-state.json')) {
      const state = JSON.parse(fs.readFileSync('analysis-state.json', 'utf8'));
      console.log(`Loaded analysis state - Last processed ID: ${state.lastProcessedId}`);
      return state;
    }
  } catch (error) {
    console.log('Could not load analysis state, starting fresh');
  }
  return {
    lastProcessedId: 0,
    processedIds: []
  };
}
function saveAnalysisState(state) {
  try {
    fs.writeFileSync('analysis-state.json', JSON.stringify(state, null, 2));
    console.log(`Analysis state saved - Last processed ID: ${state.lastProcessedId}`);
  } catch (error) {
    console.error('Failed to save analysis state:', error.message);
  }
}
function saveEnrichedData(enrichedData) {
  try {
    fs.writeFileSync('enriched-request-flow.json', JSON.stringify(enrichedData, null, 2));
    console.log(`State saved: ${enrichedData.length} records in enriched-request-flow.json`);
  } catch (error) {
    console.error('Failed to save enriched data:', error.message);
  }
}
function isAlreadyAnalyzed(messageData, analysisState) {
  return analysisState.processedIds.includes(messageData.id);
}
async function analyzeMessageRequests() {
  console.log('Starting message request analysis...');
  const geminiInitialized = await initializeGemini();
  if (!geminiInitialized) {
    console.log('Cannot proceed without Gemini AI');
    return;
  }
  try {
    const cleanedData = JSON.parse(fs.readFileSync('cleaned-request-flow.json', 'utf8'));
    console.log(`Found ${cleanedData.length} message requests in cleaned flow`);
    let enrichedData = loadEnrichedData();
    let analysisState = loadAnalysisState();
    const messagesToAnalyze = cleanedData.filter(message => !isAlreadyAnalyzed(message, analysisState));
    console.log(`${messagesToAnalyze.length} new messages need analysis`);
    console.log(`${analysisState.processedIds.length} messages already processed`);
    for (let i = 0; i < messagesToAnalyze.length; i++) {
      const messageData = messagesToAnalyze[i];
      console.log(`\nProcessing ${i + 1}/${messagesToAnalyze.length}: @${messageData.username} (ID: ${messageData.id})`);
      const analysis = await analyzeMessageWithGemini(messageData);
      if (analysis) {
        const enrichedMessage = {
          ...messageData,
          summary: analysis.summary,
          vertical: analysis.vertical,
          website: analysis.website,
          compatibility_rating: analysis.compatibility_rating
        };
        enrichedData.push(enrichedMessage);
        analysisState.processedIds.push(messageData.id);
        analysisState.lastProcessedId = Math.max(analysisState.lastProcessedId, messageData.id);
        saveEnrichedData(enrichedData);
        saveAnalysisState(analysisState);
        console.log(`Analysis complete for @${messageData.username} (ID: ${messageData.id})`);
      } else {
        console.log(`Skipping @${messageData.username} due to analysis failure`);
      }
      if (i < messagesToAnalyze.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (messagesToAnalyze.length > 0) {
      const newlyAnalyzedMessages = enrichedData.filter(item => messagesToAnalyze.some(msg => msg.id === item.id) && item.summary);
      if (newlyAnalyzedMessages.length > 0) {
        console.log(`\nUploading ${newlyAnalyzedMessages.length} newly analyzed messages to Airtable...`);
        await uploadToAirtable(newlyAnalyzedMessages);
      } else {
        console.log('\nNo new messages to upload to Airtable');
      }
    } else {
      console.log('\nNo new messages to analyze');
    }
    console.log('\nAnalysis completed!');
    console.log(`Total enriched records: ${enrichedData.length}`);
    console.log(`Last processed ID: ${analysisState.lastProcessedId}`);
    console.log(`Processed IDs count: ${analysisState.processedIds.length}`);
    console.log('\nStarting website search for missing websites...');
    try {
      const {
        searchWebsites
      } = require('./searchable.js');
      await searchWebsites();
      console.log('Website search completed successfully');
    } catch (error) {
      console.error('Website search failed:', error.message);
    }
  } catch (error) {
    console.error('Error during message request analysis:', error.message);
  }
}
if (require.main === module) {
  analyzeMessageRequests();
}
module.exports = {
  analyzeMessageRequests,
  analyzeMessageWithGemini,
  uploadToAirtable
};