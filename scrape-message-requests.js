const {
  chromium
} = require('playwright');
const {
  GoogleGenAI
} = require('@google/genai');
const fs = require('fs');
const path = require('path');
const AirtableIntegration = require('./airtable-integration');
const {
  analyzeMessageRequests
} = require('./analyze-message-requests');
require('dotenv').config();
const STORAGE_STATE_PATH = path.resolve(__dirname, 'auth-state.json');
const REQUEST_STATE_FILE_PATH = path.resolve(__dirname, 'request_state.json');
const REQUESTS_FOLDER = path.resolve(__dirname, 'message-requests');
const DATA_FOLDER = path.resolve(__dirname, REQUESTS_FOLDER, 'data');
[REQUESTS_FOLDER, DATA_FOLDER].forEach(folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, {
      recursive: true
    });
    console.log(` Created folder: ${folder}`);
  }
});
let genAI = null;
try {
  const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  if (config.gemini && config.gemini.apiKey && config.gemini.apiKey !== 'YOUR_GEMINI_API_KEY_HERE') {
    genAI = new GoogleGenAI({
      apiKey: config.gemini.apiKey
    });
    console.log(' Gemini AI initialized successfully for message requests');
  }
} catch (error) {
  console.log('️  Gemini AI not configured, conditional logic disabled');
}
const airtable = new AirtableIntegration();
let airtableEnabled = false;
try {
  airtableEnabled = airtable.initialize();
  if (airtableEnabled) {
    console.log(' Airtable integration enabled for message requests');
  } else {
    console.log('️  Airtable not configured, data will not be uploaded');
  }
} catch (error) {
  console.log('️  Airtable integration failed:', error.message);
}
function getEnv(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === null ? fallback : value;
}
function parseBoolEnv(name, fallback = false) {
  const val = getEnv(name, '').toLowerCase();
  if (val === '1' || val === 'true' || val === 'yes') return true;
  if (val === '0' || val === 'false' || val === 'no') return false;
  return fallback;
}
function buildCookiesFromEnv() {
  const extraCookies = getEnv('X_COOKIES', '').trim();
  const authToken = getEnv('X_AUTH_TOKEN', '').trim();
  const ct0 = getEnv('X_CT0', '').trim();
  const cookies = [];
  if (authToken) {
    cookies.push({
      name: 'auth_token',
      value: authToken,
      domain: '.x.com',
      path: '/',
      httpOnly: true,
      secure: true
    }, {
      name: 'auth_token',
      value: authToken,
      domain: '.twitter.com',
      path: '/',
      httpOnly: true,
      secure: true
    });
  }
  if (ct0) {
    cookies.push({
      name: 'ct0',
      value: ct0,
      domain: '.x.com',
      path: '/',
      httpOnly: true,
      secure: true
    }, {
      name: 'ct0',
      value: ct0,
      domain: '.twitter.com',
      path: '/',
      httpOnly: true,
      secure: true
    });
  }
  if (extraCookies) {
    try {
      if (extraCookies.startsWith('[')) {
        const parsed = JSON.parse(extraCookies);
        for (const c of parsed) cookies.push(c);
      } else {
        for (const pair of extraCookies.split(';')) {
          const [name, ...rest] = pair.trim().split('=');
          if (!name) continue;
          const value = rest.join('=');
          cookies.push({
            name,
            value,
            domain: '.x.com',
            path: '/',
            httpOnly: true,
            secure: true
          });
          cookies.push({
            name,
            value,
            domain: '.twitter.com',
            path: '/',
            httpOnly: true,
            secure: true
          });
        }
      }
    } catch (e) {
      console.warn('️  Failed to parse X_COOKIES env, ignoring.');
    }
  }
  return cookies;
}
function loadRequestState() {
  try {
    if (fs.existsSync(REQUEST_STATE_FILE_PATH)) {
      const data = fs.readFileSync(REQUEST_STATE_FILE_PATH, 'utf8');
      return JSON.parse(data);
    }
    return {
      runs: [],
      lastRunId: 0
    };
  } catch (error) {
    console.log(`️  Error loading request state: ${error.message}`);
    return {
      runs: [],
      lastRunId: 0
    };
  }
}
function saveRequestRunRecord(requests, hasNewRequests = true) {
  try {
    const state = loadRequestState();
    const newRunId = state.lastRunId + 1;
    const newRunRecord = {
      runId: newRunId,
      timestamp: new Date().toISOString(),
      totalRequests: requests.length,
      hasNewRequests: hasNewRequests,
      requests: requests.map(req => ({
        username: req.username,
        displayName: req.displayName,
        lastMessage: req.firstMessage,
        timestamp: req.timestamp
      }))
    };
    state.runs.push(newRunRecord);
    state.lastRunId = newRunId;
    state.lastRun = new Date().toISOString();
    if (state.runs.length > 10) {
      state.runs = state.runs.slice(-10);
    }
    fs.writeFileSync(REQUEST_STATE_FILE_PATH, JSON.stringify(state, null, 2));
    console.log(` Request run record saved: Run ${newRunId} with ${requests.length} message requests`);
    return newRunId;
  } catch (error) {
    console.log(` Error saving request run record: ${error.message}`);
    return null;
  }
}
function isFirstRequestRun() {
  const state = loadRequestState();
  return !state.runs || state.runs.length === 0;
}
function getLastRequestRunRecord() {
  const state = loadRequestState();
  if (!state.runs || state.runs.length === 0) {
    return null;
  }
  return state.runs[state.runs.length - 1];
}
function compareRequestRuns(currentRequests, previousRunRecord) {
  if (!previousRunRecord) {
    return {
      newRequests: currentRequests,
      updatedRequests: [],
      unchangedRequests: []
    };
  }
  const previousRequests = previousRunRecord.requests;
  const newRequests = [];
  const updatedRequests = [];
  const unchangedRequests = [];
  const previousMap = new Map();
  previousRequests.forEach(req => {
    previousMap.set(req.username, req);
  });
  currentRequests.forEach(currentReq => {
    const previousReq = previousMap.get(currentReq.username);
    if (!previousReq) {
      newRequests.push(currentReq);
    } else if (previousReq.lastMessage !== currentReq.firstMessage) {
      updatedRequests.push({
        ...currentReq,
        previousMessage: previousReq.lastMessage
      });
    } else {
      unchangedRequests.push(currentReq);
    }
  });
  return {
    newRequests,
    updatedRequests,
    unchangedRequests
  };
}
function loadCleanedRequestFlow() {
  try {
    const filename = path.resolve(__dirname, 'cleaned-request-flow.json');
    if (fs.existsSync(filename)) {
      const data = fs.readFileSync(filename, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.log(`️  Error loading cleaned request flow: ${error.message}`);
    return [];
  }
}
function getNextRequestMessageId() {
  const cleanedFlow = loadCleanedRequestFlow();
  if (cleanedFlow.length === 0) {
    return 1;
  }
  const maxId = Math.max(...cleanedFlow.map(msg => msg.id));
  return maxId + 1;
}
function appendToCleanedRequestFlow(newRequests) {
  try {
    const existingFlow = loadCleanedRequestFlow();
    let nextId = getNextRequestMessageId();
    const newEntries = newRequests.map(req => ({
      id: nextId++,
      name: req.displayName,
      username: req.username,
      message: req.firstMessage,
      timestamp: req.timestamp,
      detectedAt: new Date().toISOString(),
      type: 'message_request'
    }));
    const updatedFlow = [...existingFlow, ...newEntries];
    const filename = path.resolve(__dirname, 'cleaned-request-flow.json');
    fs.writeFileSync(filename, JSON.stringify(updatedFlow, null, 2));
    console.log(` Appended ${newEntries.length} new message requests to cleaned flow`);
    newEntries.forEach(entry => {
      console.log(`    #${entry.id} @${entry.username}: "${entry.message.substring(0, 50)}${entry.message.length > 50 ? '...' : ''}"`);
    });
    return newEntries.length;
  } catch (error) {
    console.log(` Error appending to cleaned request flow: ${error.message}`);
    return 0;
  }
}
function saveRequestComparisonToState(runComparison, currentRunId, previousRunId) {
  try {
    const state = loadRequestState();
    if (!state.comparison) {
      state.comparison = {};
    }
    state.comparison.lastComparison = {
      timestamp: new Date().toISOString(),
      currentRun: currentRunId,
      previousRun: previousRunId,
      stats: {
        totalNew: runComparison.newRequests.length,
        totalUpdated: runComparison.updatedRequests.length,
        totalUnchanged: runComparison.unchangedRequests.length
      }
    };
    fs.writeFileSync(REQUEST_STATE_FILE_PATH, JSON.stringify(state, null, 2));
    console.log(` Request comparison stats saved to request_state.json`);
  } catch (error) {
    console.log(` Error saving request comparison to state: ${error.message}`);
  }
}
async function createBrowserContext(headless) {
  const hasStorage = fs.existsSync(STORAGE_STATE_PATH);
  const contextOptions = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: {
      width: 1280,
      height: 800
    },
    storageState: hasStorage ? STORAGE_STATE_PATH : undefined
  };
  const browser = await chromium.launch({
    headless,
    slowMo: parseBoolEnv('SLOW', true) ? 250 : 0,
    args: ['--disable-web-security', '--disable-features=VizDisplayCompositor', '--disable-gpu-sandbox']
  });
  const context = await browser.newContext(contextOptions);
  const envCookies = buildCookiesFromEnv();
  if (envCookies.length > 0) {
    await context.addCookies(envCookies);
  }
  return {
    browser,
    context,
    envCookiesApplied: envCookies.length > 0
  };
}
async function ensureLoggedIn(page, opts) {
  await page.goto('https://x.com/messages', {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForTimeout(3000);
  console.log(' Checking authentication status...');
  await page.waitForTimeout(5000);
  const loggedIn = await page.locator('[data-testid="AppTabBar_Home_Link"], [data-testid="conversation"], [data-testid="SideNav_Home_Link"]').first().count();
  if (loggedIn > 0) {
    console.log(' Authentication confirmed');
    try {
      await page.context().storageState({
        path: STORAGE_STATE_PATH
      });
      if (opts?.envCookiesApplied) {
        console.log(' Saved session from cookies to auth-state.json');
      }
    } catch {}
    return true;
  }
  const username = getEnv('X_USERNAME');
  const password = getEnv('X_PASSWORD');
  const email = getEnv('X_EMAIL');
  if (username && password) {
    console.log(' Attempting automated login with credentials from .env...');
    await page.goto('https://x.com/i/flow/login', {
      waitUntil: 'domcontentloaded'
    });
    const userField = page.locator('input[autocomplete="username"], input[name="text"]');
    await userField.waitFor({
      timeout: 20000
    });
    await userField.fill(username);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    const maybeAltIdField = page.locator('input[name="text"]').first();
    if (await maybeAltIdField.isVisible()) {
      if (email) {
        await maybeAltIdField.fill(email);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
      } else {
        console.log('️  Twitter requested email/phone but X_EMAIL is not set. Please complete manually.');
      }
    }
    const passField = page.locator('input[name="password"]');
    await passField.waitFor({
      timeout: 20000
    });
    await passField.fill(password);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    const twoFaField = page.locator('input[name="text"][inputmode="numeric"]');
    if (await twoFaField.isVisible()) {
      console.log(' 2FA required. Please enter your 2FA code in the browser window.');
      await page.waitForTimeout(30000);
    }
    await page.goto('https://x.com/messages', {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(2000);
    const ok = await page.locator('[data-testid="conversation"], [data-testid="AppTabBar_Home_Link"], [data-testid="SideNav_Home_Link"]').first().count();
    if (ok > 0) {
      console.log(' Logged in. Saving storage state for future runs.');
      await page.context().storageState({
        path: STORAGE_STATE_PATH
      });
      return true;
    }
    console.log('️  Automated login did not confirm. You may need to log in manually.');
  }
  console.log(' Manual login required. Please log in to X.com in the browser window.');
  console.log(' The script will wait for you to complete the login process...');
  let loginAttempts = 0;
  const maxAttempts = 60;
  while (loginAttempts < maxAttempts) {
    await page.waitForTimeout(8000);
    loginAttempts++;
    try {
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      console.log(` Checking login status... Current URL: ${currentUrl}`);
      if (!currentUrl.includes('/login') && !currentUrl.includes('/i/flow/login') && !currentUrl.includes('/account/login')) {
        console.log(' No longer on login page - checking if authenticated...');
        const authSelectors = ['[data-testid="AppTabBar_Home_Link"]', '[data-testid="SideNav_Home_Link"]', '[data-testid="conversation"]', '[data-testid="primaryColumn"]', '[data-testid="SideNav_NewTweet_Button"]', '[data-testid="AppTabBar_Notifications_Link"]', '[data-testid="AppTabBar_Profile_Link"]'];
        let totalAuthElements = 0;
        for (const selector of authSelectors) {
          const count = await page.locator(selector).count();
          if (count > 0) {
            console.log(` Found ${count} elements with selector: ${selector}`);
            totalAuthElements += count;
          }
        }
        if (totalAuthElements > 0) {
          console.log(` Found ${totalAuthElements} authenticated page elements!`);
          console.log(' Login detected! Saving session...');
          await page.context().storageState({
            path: STORAGE_STATE_PATH
          });
          return true;
        }
      }
      if (currentUrl.includes('/messages') || currentUrl.includes('/home')) {
        const authenticated = await page.locator('[data-testid="AppTabBar_Home_Link"], [data-testid="conversation"], [data-testid="SideNav_Home_Link"], [data-testid="primaryColumn"]').first().count();
        console.log(` Found ${authenticated} authenticated elements`);
        if (authenticated > 0) {
          console.log(' Login detected! Saving session...');
          await page.context().storageState({
            path: STORAGE_STATE_PATH
          });
          return true;
        }
      }
      if (currentUrl.includes('/login') || currentUrl.includes('/i/flow/login')) {
        console.log(` Still on login page... (${loginAttempts}/${maxAttempts})`);
        continue;
      }
      console.log(' Navigating to messages to check login status...');
      await page.waitForTimeout(3000);
      await page.goto('https://x.com/messages', {
        waitUntil: 'domcontentloaded'
      });
      await page.waitForTimeout(5000);
      const loggedIn = await page.locator('[data-testid="conversation"], [data-testid="AppTabBar_Home_Link"], [data-testid="SideNav_Home_Link"]').first().count();
      console.log(` Found ${loggedIn} conversation/home elements`);
      if (loggedIn > 0) {
        console.log(' Login confirmed! Saving session...');
        await page.context().storageState({
          path: STORAGE_STATE_PATH
        });
        return true;
      }
    } catch (error) {
      console.log(`️  Error checking login status: ${error.message}`);
    }
    console.log(` Waiting for login completion... (${loginAttempts}/${maxAttempts})`);
  }
  console.log(' Login timeout reached. Please try again.');
  return false;
}
async function scrapeMessageRequests() {
  console.log(' Starting X.com Message Requests scraper with AI-powered conditional logic...');
  const args = process.argv.slice(2);
  const headless = args.includes('--headless') || parseBoolEnv('HEADLESS', false);
  const {
    browser,
    context,
    envCookiesApplied
  } = await createBrowserContext(headless);
  const page = await context.newPage();
  try {
    console.log(' Navigating to X.com messages...');
    const loggedIn = await ensureLoggedIn(page, {
      envCookiesApplied
    });
    if (!loggedIn) {
      console.log(' Could not confirm login. Exiting.');
      return;
    }
    console.log(' Waiting for messages to load...');
    await page.waitForSelector('[data-testid="conversation"]', {
      timeout: 20000
    }).catch(() => {});
    await page.waitForTimeout(2000);
    console.log(' Checking for NEW requests using fast selector detection (from messages overview)...');
    const newRequestCount = await page.locator('text=new request').count();
    console.log(` Found ${newRequestCount} "new request" entries on messages page`);
    const pendingRequestCount = await page.locator('text=pending request').count();
    console.log(` Found ${pendingRequestCount} "pending request" entries (will be ignored)`);
    const messageRequestsTab = await page.locator('text=Message requests').count();
    console.log(` Found ${messageRequestsTab} "Message requests" tab(s)`);
    const requestIndicators = await page.locator('[data-testid="cellInnerDiv"]:has-text("request")').count();
    console.log(` Found ${requestIndicators} elements containing "request" text`);
    const findings = {
      newRequestCount,
      pendingRequestCount,
      messageRequestsTab,
      requestIndicators,
      hasNewRequests: newRequestCount > 0
    };
    console.log(' Detection Results:', JSON.stringify(findings, null, 2));
    if (newRequestCount === 0) {
      console.log(' No NEW requests found on messages page');
      console.log(' Will not proceed to click message requests tab');
      return {
        hasNewRequests: false,
        message: 'No new requests detected from messages overview',
        findings
      };
    }
    console.log(` Found ${newRequestCount} NEW message request(s) - proceeding to click tab and scrape`);
    console.log(' Clicking on Message requests tab...');
    try {
      await page.click('text=Message requests');
      await page.waitForTimeout(3000);
      console.log(' Successfully navigated to message requests tab');
    } catch (error) {
      console.log(` Failed to click message requests tab: ${error.message}`);
      try {
        await page.click('[data-testid="cellInnerDiv"] div.r-a023e6 > span');
        await page.waitForTimeout(3000);
        console.log(' Successfully navigated to message requests tab (alternative method)');
      } catch (altError) {
        console.log(` Failed to navigate to message requests: ${altError.message}`);
        return {
          hasNewRequests: false,
          message: 'Could not navigate to message requests tab',
          findings
        };
      }
    }
    const firstRun = isFirstRequestRun();
    console.log(firstRun ? ' First request run detected - will scrape all message requests' : ' Subsequent run - checking for new requests');
    console.log(' Looking for message request conversations...');
    const requestSelectors = ['[data-testid="conversation"]', '[data-testid="messageRequest"]', '[data-testid="dmConversation"]', 'a[href*="/messages/"]', '[role="listitem"]'];
    let requests = [];
    for (const selector of requestSelectors) {
      requests = await page.locator(selector).all();
      if (requests.length > 0) {
        console.log(` Found ${requests.length} message requests using selector: ${selector}`);
        break;
      }
    }
    if (requests.length === 0) {
      console.log(' No message requests found.');
      return {
        hasNewRequests: false,
        message: 'No message requests found'
      };
    }
    const requestData = [];
    console.log(` Processing ${requests.length} message requests...`);
    for (let i = 0; i < requests.length; i++) {
      try {
        console.log(`\n Processing message request ${i + 1}/${requests.length}...`);
        let username = '';
        let displayName = '';
        const requestItem = requests[i];
        const usernameElement = requestItem.locator('[data-testid="UserName"], span, a').first();
        if ((await usernameElement.count()) > 0) {
          const usernameText = await usernameElement.textContent();
          if (usernameText) {
            const usernameMatch = usernameText.match(/@(\w+)/);
            if (usernameMatch) {
              username = usernameMatch[1];
              console.log(` Found username: @${username}`);
            }
          }
        }
        const displayNameElement = requestItem.locator('span').first();
        if ((await displayNameElement.count()) > 0) {
          const displayText = await displayNameElement.textContent();
          if (displayText) {
            const cleanDisplayName = displayText.replace(/[]/g, '').replace(/verified/i, '').replace(/@\w+/, '').trim();
            if (cleanDisplayName && cleanDisplayName.length > 0 && cleanDisplayName.length < 100) {
              if (!cleanDisplayName.includes('keyboard shortcuts') && !cleanDisplayName.includes('View') && !cleanDisplayName.includes('press question mark') && !cleanDisplayName.includes('Thank you') && !cleanDisplayName.includes('Hello') && !cleanDisplayName.includes('You sent')) {
                displayName = cleanDisplayName;
                console.log(` Found display name: "${displayName}"`);
              }
            }
          }
        }
        const fullText = await requestItem.textContent();
        console.log(` Full request item text: "${fullText}"`);
        if (!username) {
          const usernameMatch = fullText.match(/@(\w+)/);
          if (usernameMatch) {
            username = usernameMatch[1];
            console.log(` Found username from full text: @${username}`);
          }
        }
        const lines = fullText.split('\n').filter(line => line.trim());
        console.log(` Parsed ${lines.length} lines:`);
        lines.forEach((line, idx) => {
          console.log(`  Line ${idx + 1}: "${line.trim()}"`);
        });
        let extractedMessage = '';
        if (lines.length > 0) {
          const line1 = lines[0].trim();
          const messageMatch = line1.match(/@\w+[·•]\s*\d+[smhd]?\s+(.+)$/);
          if (messageMatch) {
            extractedMessage = messageMatch[1].trim();
            console.log(` Extracted message from Line 1: "${extractedMessage.substring(0, 100)}..."`);
          } else {
            const usernameEndMatch = line1.match(/@\w+[·•\s]+(.+)$/);
            if (usernameEndMatch) {
              extractedMessage = usernameEndMatch[1].trim();
              console.log(` Extracted message from Line 1 (fallback): "${extractedMessage.substring(0, 100)}..."`);
            } else {
              extractedMessage = line1.replace(/^[^@]*@\w+[·•\s]*/, '').trim();
              console.log(` Extracted message from Line 1 (last resort): "${extractedMessage.substring(0, 100)}..."`);
            }
          }
        }
        if (!displayName) {
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine && cleanLine.length > 0 && cleanLine.length < 50 && !cleanLine.includes('@') && !cleanLine.includes('keyboard shortcuts') && !cleanLine.includes('View') && !cleanLine.includes('press question mark') && !cleanLine.includes('Thank you') && !cleanLine.includes('Hello') && !cleanLine.includes('You sent') && !cleanLine.match(/\d{1,2}\s+[A-Za-z]{3}/)) {
              displayName = cleanLine;
              console.log(` Found display name from line: "${displayName}"`);
              break;
            }
          }
        }
        console.log('  Skipping conversation navigation - using Line 1 message data');
        if (!username) {
          username = `Unknown_Request_${i + 1}`;
          console.log(`️  Could not extract username, using fallback: ${username}`);
        }
        if (!displayName) {
          displayName = username;
        }
        username = username.trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
        displayName = displayName.trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
        let firstMessage = extractedMessage;
        if (!firstMessage || firstMessage.trim().length === 0) {
          firstMessage = 'No message content found';
          console.log('️  No message extracted from Line 1, using fallback');
        } else {
          console.log(` Using Line 1 extracted message (${firstMessage.length} chars): "${firstMessage.substring(0, 100)}..."`);
        }
        firstMessage = firstMessage.trim().replace(/\s+/g, ' ').substring(0, 500);
        const timestamp = new Date().toISOString();
        requestData.push({
          username,
          displayName,
          firstMessage,
          timestamp
        });
        console.log(` Username: ${username}`);
        console.log(` Display Name: ${displayName}`);
        console.log(` First message: ${firstMessage.substring(0, 100)}${firstMessage.length > 100 ? '...' : ''}`);
      } catch (error) {
        console.log(` Error processing message request ${i + 1}: ${error.message}`);
        continue;
      }
    }
    const outputData = {
      timestamp: new Date().toISOString(),
      isFirstRun: firstRun,
      totalRequests: requestData.length,
      requests: requestData,
      metadata: {
        scrapedAt: new Date().toISOString(),
        userAgent: 'scrape-message-requests.js',
        hasNewRequests: true
      }
    };
    if (requestData.length > 0) {
      const previousRunRecord = getLastRequestRunRecord();
      const currentRunId = saveRequestRunRecord(requestData, true);
      if (firstRun) {
        console.log('\n First request run detected - adding all message requests to cleaned flow');
        const appendedCount = appendToCleanedRequestFlow(requestData);
        console.log('\n First Request Run Summary:');
        console.log(`    Run ID: ${currentRunId} (first run)`);
        console.log(`    Total message requests: ${requestData.length}`);
        console.log(`    Requests added to cleaned flow: ${appendedCount}`);
        console.log(' Raw data saved - Gemini analysis will handle Airtable upload');
      } else {
        const runComparison = compareRequestRuns(requestData, previousRunRecord);
        const requestsToAppend = [...runComparison.newRequests, ...runComparison.updatedRequests];
        const appendedCount = appendToCleanedRequestFlow(requestsToAppend);
        saveRequestComparisonToState(runComparison, currentRunId, previousRunRecord?.runId);
        console.log('\n Request Run Summary:');
        console.log(`    Run ID: ${currentRunId} (comparing with run ${previousRunRecord?.runId})`);
        console.log(`    Total message requests: ${requestData.length}`);
        console.log(`    New requests: ${runComparison.newRequests.length}`);
        console.log(`    Updated requests: ${runComparison.updatedRequests.length}`);
        console.log(`    Unchanged requests: ${runComparison.unchangedRequests.length}`);
        console.log(`    Requests added to cleaned flow: ${appendedCount}`);
        console.log(' Raw data saved - Gemini analysis will handle Airtable upload');
      }
      const filename = `request_data_${Date.now()}.json`;
      const filePath = path.resolve(DATA_FOLDER, filename);
      fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2));
      console.log(`\n Full request data backup saved to: ${filePath}`);
      console.log('\n Starting Gemini business analysis...');
      try {
        await analyzeMessageRequests();
        console.log(' Gemini analysis completed successfully');
        console.log('\n Starting website search for missing websites...');
        const {
          searchWebsites
        } = require('./searchable.js');
        await searchWebsites();
        console.log(' Website search completed successfully');
      } catch (error) {
        console.error(' Gemini analysis failed:', error.message);
        console.log(' Raw data is still saved locally');
      }
      return {
        ...outputData,
        runId: currentRunId,
        isFirstRun: firstRun
      };
    } else {
      console.log(' No message request data collected to save.');
      const currentRunId = saveRequestRunRecord([], true);
      return {
        hasNewRequests: false,
        message: 'No message request data collected',
        runId: currentRunId
      };
    }
  } catch (error) {
    console.error(' An error occurred:', error);
    throw error;
  } finally {
    console.log('\n Closing browser...');
    await browser.close();
  }
}
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
X.com Message Requests Scraper with AI-Powered Conditional Logic

Usage:
  node scrape-message-requests.js [options]

Options:
  --help, -h       Show this help message
  --headless       Run browser in headless mode (or set HEADLESS=true)

Environment (.env):
  X_USERNAME=your_username_or_handle
  X_PASSWORD=your_password
  X_EMAIL=optional_email_if_prompted
  # Prefer these for cookie-based login (copy from browser):
  X_AUTH_TOKEN=your_auth_token_cookie
  X_CT0=your_ct0_cookie
  # Or provide all cookies as string or JSON:
  X_COOKIES=auth_token=...; ct0=...
  HEADLESS=false
  SLOW=true

Features:
  - First run: Scrapes all message requests and saves to JSON
  - Subsequent runs: Uses fast selector-based detection to only scrape if NEW requests detected
  - Direct text matching for "new request" vs "pending request" - no AI analysis needed
  - Only processes requests labeled as 'new request' - ignores 'pending request' entries
  - Much faster than AI analysis - uses direct DOM selectors
  - Aggressive cache clearing: Clears all cached data except authentication for fresh results
  - Network cache bypassing: Forces fresh HTTP requests with no-cache headers
  - Saves state in request_state.json to track runs
  - Outputs structured JSON data in organized folders
  - Optional Gemini AI for advanced text extraction if needed

Files Created:
  - message-requests/data/request_data_[timestamp].json - Scraped message request data
  - request_state.json - State tracking for conditional logic
  - cleaned-request-flow.json - Simplified request flow data

  - auth-state.json - Saved login session (shared with regular DM scraper)

Notes:
  - Configure Gemini API key in config.json for conditional logic
  - The script saves login state to auth-state.json so you don't need to log in every time
  - You can paste cookies via X_AUTH_TOKEN/X_CT0 or X_COOKIES. Successful login is saved to auth-state.json
  - All data is organized in the message-requests folder to keep it separate from regular DM data
`);
  process.exit(0);
}
scrapeMessageRequests().catch(console.error);