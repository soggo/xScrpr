const {
  chromium
} = require('playwright');
const {
  GoogleGenAI
} = require('@google/genai');
const fs = require('fs');
const path = require('path');
const AirtableIntegration = require('./airtable-integration');
require('dotenv').config();
const STORAGE_STATE_PATH = path.resolve(__dirname, 'auth-state.json');
const STATE_FILE_PATH = path.resolve(__dirname, 'dm_state.json');
const REGULAR_DMS_FOLDER = path.resolve(__dirname, 'regular-dms');
const DM_DATA_FOLDER = path.resolve(__dirname, REGULAR_DMS_FOLDER, 'data');
[REGULAR_DMS_FOLDER, DM_DATA_FOLDER].forEach(folder => {
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
    console.log(' Gemini AI initialized successfully');
  }
} catch (error) {
  console.log('️  Gemini AI not configured, conditional logic disabled');
}
const airtable = new AirtableIntegration();
let airtableEnabled = false;
try {
  airtableEnabled = airtable.initialize();
  if (airtableEnabled) {
    console.log(' Airtable integration enabled');
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
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      return JSON.parse(data);
    }
    return {
      runs: [],
      lastRunId: 0
    };
  } catch (error) {
    console.log(`️  Error loading state: ${error.message}`);
    return {
      runs: [],
      lastRunId: 0
    };
  }
}
function saveRunRecord(conversations, hasNewMessages = true) {
  try {
    const state = loadState();
    const newRunId = state.lastRunId + 1;
    const newRunRecord = {
      runId: newRunId,
      timestamp: new Date().toISOString(),
      totalConversations: conversations.length,
      hasNewMessages: hasNewMessages,
      conversations: conversations.map(conv => ({
        username: conv.username,
        displayName: conv.displayName,
        lastMessage: conv.lastMessage,
        timestamp: conv.timestamp
      }))
    };
    state.runs.push(newRunRecord);
    state.lastRunId = newRunId;
    state.lastRun = new Date().toISOString();
    if (state.runs.length > 10) {
      state.runs = state.runs.slice(-10);
    }
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2));
    console.log(` Run record saved: Run ${newRunId} with ${conversations.length} conversations`);
    return newRunId;
  } catch (error) {
    console.log(` Error saving run record: ${error.message}`);
    return null;
  }
}
function isFirstRun() {
  const state = loadState();
  return !state.runs || state.runs.length === 0;
}
function getLastRunRecord() {
  const state = loadState();
  if (!state.runs || state.runs.length === 0) {
    return null;
  }
  return state.runs[state.runs.length - 1];
}
function compareRuns(currentConversations, previousRunRecord) {
  if (!previousRunRecord) {
    return {
      newConversations: currentConversations,
      updatedConversations: [],
      unchangedConversations: []
    };
  }
  const previousConversations = previousRunRecord.conversations;
  const newConversations = [];
  const updatedConversations = [];
  const unchangedConversations = [];
  const previousMap = new Map();
  previousConversations.forEach(conv => {
    previousMap.set(conv.username, conv);
  });
  currentConversations.forEach(currentConv => {
    const previousConv = previousMap.get(currentConv.username);
    if (!previousConv) {
      newConversations.push(currentConv);
    } else if (previousConv.lastMessage !== currentConv.lastMessage) {
      updatedConversations.push({
        ...currentConv,
        previousMessage: previousConv.lastMessage
      });
    } else {
      unchangedConversations.push(currentConv);
    }
  });
  return {
    newConversations,
    updatedConversations,
    unchangedConversations
  };
}
function loadCleanedFlow() {
  try {
    const filename = 'cleaned-dm-flow.json';
    if (fs.existsSync(filename)) {
      const data = fs.readFileSync(filename, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.log(`️  Error loading cleaned flow: ${error.message}`);
    return [];
  }
}
function getNextMessageId() {
  const cleanedFlow = loadCleanedFlow();
  if (cleanedFlow.length === 0) {
    return 1;
  }
  const maxId = Math.max(...cleanedFlow.map(msg => msg.id));
  return maxId + 1;
}
function appendToCleanedFlow(newMessages) {
  try {
    const existingFlow = loadCleanedFlow();
    let nextId = getNextMessageId();
    const newEntries = newMessages.map(msg => ({
      id: nextId++,
      name: msg.displayName,
      username: msg.username,
      message: msg.lastMessage,
      timestamp: msg.timestamp,
      detectedAt: new Date().toISOString()
    }));
    const updatedFlow = [...existingFlow, ...newEntries];
    const filename = 'cleaned-dm-flow.json';
    fs.writeFileSync(filename, JSON.stringify(updatedFlow, null, 2));
    console.log(` Appended ${newEntries.length} new messages to cleaned flow`);
    newEntries.forEach(entry => {
      console.log(`    #${entry.id} @${entry.username}: "${entry.message.substring(0, 50)}${entry.message.length > 50 ? '...' : ''}"`);
    });
    return newEntries.length;
  } catch (error) {
    console.log(` Error appending to cleaned flow: ${error.message}`);
    return 0;
  }
}
function saveComparisonToState(runComparison, currentRunId, previousRunId) {
  try {
    const state = loadState();
    if (!state.comparison) {
      state.comparison = {};
    }
    state.comparison.lastComparison = {
      timestamp: new Date().toISOString(),
      currentRun: currentRunId,
      previousRun: previousRunId,
      stats: {
        totalNew: runComparison.newConversations.length,
        totalUpdated: runComparison.updatedConversations.length,
        totalUnchanged: runComparison.unchangedConversations.length
      }
    };
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2));
    console.log(` Comparison stats saved to dm_state.json`);
  } catch (error) {
    console.log(` Error saving comparison to state: ${error.message}`);
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
    slowMo: parseBoolEnv('SLOW', true) ? 250 : 0
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
  console.log('⏳ The script will wait for you to complete the login process...');
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
        console.log(`⏳ Still on login page... (${loginAttempts}/${maxAttempts})`);
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
async function scrapeDMs() {
  console.log(' Starting X.com DM scraper with AI-powered conditional logic...');
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
    console.log('⏳ Waiting for messages to load...');
    await page.waitForSelector('[data-testid="conversation"]', {
      timeout: 20000
    }).catch(() => {});
    await page.waitForTimeout(2000);
    const firstRun = isFirstRun();
    console.log(firstRun ? ' First run detected - will scrape all conversations' : ' Subsequent run - checking for new messages first');
    let shouldProceed = true;
    if (!firstRun) {
      console.log(' Checking for unread messages using fast DOM-based detection...');
      const detectionStrategies = [];
      const blueDotSelectors = ['.css-175oi2r.r-sdzlij.r-lrvibr.r-615f2u.r-u8s1d.r-3sxh79.r-1xc7w19.r-1phboty.r-rs99b7.r-l5o3uw.r-1or9b2r.r-1lg5ma5.r-5soawk', '.css-175oi2r.r-sdzlij.r-lrvibr.r-615f2u.r-u8s1d.r-3sxh79.r-11mg6pl.r-1phboty.r-rs99b7.r-l5o3uw.r-1or9b2r.r-1lg5ma5.r-5soawk', 'div[aria-label=""][class*="r-sdzlij"][class*="r-lrvibr"][class*="r-615f2u"][class*="r-5soawk"]', 'div[aria-label=""].css-175oi2r[class*="r-sdzlij"][class*="r-lrvibr"]'];
      let blueDotCount = 0;
      for (const selector of blueDotSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(` Found ${count} potential blue dots with selector: ${selector}`);
          blueDotCount += count;
        }
      }
      detectionStrategies.push({
        name: 'Blue Dot Detection',
        count: blueDotCount
      });
      let conversationsWithBlueDots = 0;
      for (const blueDotSelector of blueDotSelectors) {
        const convWithDots = await page.locator(`[data-testid="conversation"]:has(${blueDotSelector})`).count();
        if (convWithDots > 0) {
          console.log(` Found ${convWithDots} conversations containing blue dots (${blueDotSelector})`);
          conversationsWithBlueDots += convWithDots;
        }
      }
      detectionStrategies.push({
        name: 'Conversations with Blue Dots',
        count: conversationsWithBlueDots
      });
      const allConversations = await page.locator('[data-testid="conversation"]').all();
      console.log(` DEBUG: Found ${allConversations.length} total conversations`);
      for (let i = 0; i < Math.min(3, allConversations.length); i++) {
        const conv = allConversations[i];
        const innerHTML = await conv.innerHTML();
        const textContent = await conv.textContent();
        console.log(` DEBUG Conversation ${i + 1}:`);
        console.log(`  Text: ${textContent?.substring(0, 100)}...`);
        console.log(`  HTML length: ${innerHTML.length} chars`);
        const smallDivs = await conv.locator('div[aria-label=""]').count();
        console.log(`  Small divs with empty aria-label: ${smallDivs}`);
      }
      const totalUnreadIndicators = blueDotCount + conversationsWithBlueDots;
      const findings = {
        strategies: detectionStrategies,
        totalUnreadIndicators: totalUnreadIndicators,
        hasUnreadMessages: totalUnreadIndicators > 0,
        totalConversations: allConversations.length
      };
      console.log(' DOM Detection Results:', JSON.stringify(findings, null, 2));
      if (totalUnreadIndicators === 0) {
        console.log(' No unread messages detected via DOM inspection');
        console.log(' Skipping scraping - no new messages found');
        return {
          hasNewMessages: false,
          message: 'No unread messages detected via DOM inspection',
          findings
        };
      }
      console.log(` Found ${totalUnreadIndicators} unread indicator(s) - proceeding with scraping`);
      shouldProceed = true;
    }
    console.log(' Looking for DM conversations...');
    const dmSelectors = ['[data-testid="conversation"]', '[data-testid="dmConversation"]', 'a[href*="/messages/"]', '[role="listitem"]'];
    let conversations = [];
    for (const selector of dmSelectors) {
      conversations = await page.locator(selector).all();
      if (conversations.length > 0) {
        console.log(` Found ${conversations.length} conversations using selector: ${selector}`);
        break;
      }
    }
    if (conversations.length === 0) {
      console.log(' No DM conversations found.');
      return {
        hasNewMessages: false,
        message: 'No conversations found'
      };
    }
    const dmData = [];
    console.log(` Processing ${conversations.length} conversations...`);
    for (let i = 0; i < conversations.length; i++) {
      try {
        console.log(`\n Processing conversation ${i + 1}/${conversations.length}...`);
        let username = '';
        let displayName = '';
        const conversationItem = conversations[i];
        const usernameElement = conversationItem.locator('[data-testid="UserName"], span, a').first();
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
        const displayNameElement = conversationItem.locator('span').first();
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
        if (!username) {
          const fullText = await conversationItem.textContent();
          console.log(` Full conversation item text: "${fullText}"`);
          const usernameMatch = fullText.match(/@(\w+)/);
          if (usernameMatch) {
            username = usernameMatch[1];
            console.log(` Found username from full text: @${username}`);
          }
          const lines = fullText.split('\n').filter(line => line.trim());
          console.log(` Parsed ${lines.length} lines:`);
          lines.forEach((line, idx) => {
            console.log(`  Line ${idx + 1}: "${line.trim()}"`);
          });
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine && cleanLine.length > 0 && cleanLine.length < 50 && !cleanLine.includes('@') && !cleanLine.includes('keyboard shortcuts') && !cleanLine.includes('View') && !cleanLine.includes('press question mark') && !cleanLine.includes('Thank you') && !cleanLine.includes('Hello') && !cleanLine.includes('You sent') && !cleanLine.match(/\d{1,2}\s+[A-Za-z]{3}/)) {
              if (!displayName) {
                displayName = cleanLine;
                console.log(` Found display name from line: "${displayName}"`);
                break;
              }
            }
          }
        }
        await conversationItem.click();
        await page.waitForTimeout(2000);
        if (!displayName || !username) {
          console.log(' Trying to extract additional info from conversation header...');
          const usernameSelectors = ['[data-testid="UserName"]', '[data-testid="conversationHeader"] span', '[data-testid="conversationHeader"] h1', '[data-testid="conversationHeader"] [role="heading"]', 'h1[role="heading"]', '[role="heading"]', '[data-testid="primaryColumn"] h1', '[data-testid="primaryColumn"] [role="heading"]', 'header h1', 'header [role="heading"]'];
          for (const selector of usernameSelectors) {
            const element = page.locator(selector).first();
            if ((await element.count()) > 0) {
              const text = await element.textContent();
              console.log(` Selector "${selector}" found: "${text}"`);
              if (text && text.trim()) {
                if (!displayName) {
                  const headerText = text.trim();
                  const cleanHeaderName = headerText.replace(/[]/g, '').replace(/verified/i, '').trim();
                  if (cleanHeaderName && cleanHeaderName !== username && !cleanHeaderName.includes('@')) {
                    displayName = cleanHeaderName;
                    console.log(` Found display name from header: "${displayName}"`);
                  }
                }
                break;
              }
            } else {
              console.log(` Selector "${selector}" not found`);
            }
          }
        }
        if (!username) {
          const pageTitle = await page.title();
          if (pageTitle && !pageTitle.includes('Twitter') && !pageTitle.includes('X.com')) {
            const nameMatch = pageTitle.trim().match(/^(.+?)\s*(@\w+)?$/);
            if (nameMatch) {
              if (!displayName) {
                displayName = nameMatch[1].trim();
              }
              if (nameMatch[2]) {
                username = nameMatch[2].replace(/^@/, '');
              }
              console.log(` Found info from page title: ${displayName}, username: ${username}`);
            } else {
              if (!username) {
                username = pageTitle.replace(/^@/, '').trim();
              }
              console.log(` Found username from page title: ${username}`);
            }
          }
        }
        if (!username) {
          const currentUrl = page.url();
          const urlMatch = currentUrl.match(/\/messages\/([^\/\?]+)/);
          if (urlMatch && urlMatch[1]) {
            const urlUsername = urlMatch[1].replace(/^@/, '');
            username = urlUsername;
            console.log(` Found username from URL: ${username}`);
          }
        }
        if (!username) {
          username = `Unknown_${i + 1}`;
          console.log(`️  Could not extract username, using fallback: ${username}`);
        }
        if (!displayName) {
          displayName = username;
        }
        username = username.trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
        displayName = displayName.trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
        let lastMessage = '';
        const messageSelectors = ['[data-testid="tweetText"]', '[data-testid="messageText"]', '[role="article"] p', '.message-content'];
        for (const selector of messageSelectors) {
          const messages = await page.locator(selector).all();
          if (messages.length > 0) {
            const lastMessageElement = messages[messages.length - 1];
            lastMessage = (await lastMessageElement.textContent()) || '';
            break;
          }
        }
        if (!lastMessage) lastMessage = 'No message content found';
        lastMessage = lastMessage.trim().replace(/\s+/g, ' ').substring(0, 500);
        const timestamp = new Date().toISOString();
        dmData.push({
          username,
          displayName,
          lastMessage,
          timestamp
        });
        console.log(` Username: ${username}`);
        console.log(` Display Name: ${displayName}`);
        console.log(` Last message: ${lastMessage.substring(0, 100)}${lastMessage.length > 100 ? '...' : ''}`);
        await page.goBack();
        await page.waitForTimeout(1500);
        conversations = await page.locator(dmSelectors[0]).all();
      } catch (error) {
        console.log(` Error processing conversation ${i + 1}: ${error.message}`);
        continue;
      }
    }
    const outputData = {
      timestamp: new Date().toISOString(),
      isFirstRun: firstRun,
      totalConversations: dmData.length,
      conversations: dmData,
      metadata: {
        scrapedAt: new Date().toISOString(),
        userAgent: 'scrape-dms.js',
        hasNewMessages: shouldProceed
      }
    };
    if (dmData.length > 0) {
      const previousRunRecord = getLastRunRecord();
      const currentRunId = saveRunRecord(dmData, true);
      if (firstRun) {
        console.log('\n First run detected - adding all messages to cleaned flow');
        const appendedCount = appendToCleanedFlow(dmData);
        console.log('\n First Run Summary:');
        console.log(`    Run ID: ${currentRunId} (first run)`);
        console.log(`    Total conversations: ${dmData.length}`);
        console.log(`    Messages added to cleaned flow: ${appendedCount}`);
        if (airtableEnabled && dmData.length > 0) {
          try {
            console.log(`\n Uploading ${dmData.length} messages to Airtable...`);
            await airtable.uploadDMData(dmData, 'messages');
            console.log(' Successfully uploaded to Airtable');
          } catch (error) {
            console.error(' Failed to upload to Airtable:', error.message);
            console.log(' Data is still saved locally in JSON files');
          }
        }
      } else {
        const runComparison = compareRuns(dmData, previousRunRecord);
        const messagesToAppend = [...runComparison.newConversations, ...runComparison.updatedConversations];
        const appendedCount = appendToCleanedFlow(messagesToAppend);
        saveComparisonToState(runComparison, currentRunId, previousRunRecord?.runId);
        console.log('\n Run Summary:');
        console.log(`    Run ID: ${currentRunId} (comparing with run ${previousRunRecord?.runId})`);
        console.log(`    Total conversations: ${dmData.length}`);
        console.log(`    New conversations: ${runComparison.newConversations.length}`);
        console.log(`    Updated conversations: ${runComparison.updatedConversations.length}`);
        console.log(`    Unchanged conversations: ${runComparison.unchangedConversations.length}`);
        console.log(`    Messages added to cleaned flow: ${appendedCount}`);
        if (airtableEnabled && messagesToAppend.length > 0) {
          try {
            console.log(`\n Uploading ${messagesToAppend.length} new/updated messages to Airtable...`);
            await airtable.uploadDMData(messagesToAppend, 'messages');
            console.log(' Successfully uploaded to Airtable');
          } catch (error) {
            console.error(' Failed to upload to Airtable:', error.message);
            console.log(' Data is still saved locally in JSON files');
          }
        }
      }
      const filename = `dm_data_${Date.now()}.json`;
      const filePath = path.resolve(DM_DATA_FOLDER, filename);
      fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2));
      console.log(`\n Full data backup saved to: ${filePath}`);
      return {
        ...outputData,
        runId: currentRunId,
        isFirstRun: firstRun
      };
    } else {
      console.log(' No data collected to save.');
      const currentRunId = saveRunRecord([], true);
      return {
        hasNewMessages: false,
        message: 'No data collected',
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
X.com DM Scraper with AI-Powered Conditional Logic

Usage:
  node scrape-dms.js [options]

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
  - First run: Scrapes all conversations and saves to JSON
  - Subsequent runs: Uses fast DOM-based detection to only scrape if unread messages detected
  - DOM detection looks for blue dot indicators and unread conversation markers
  - Much faster than AI analysis - no API calls or screenshot processing needed
  - Saves state in dm_state.json to track runs
  - Outputs structured JSON data instead of CSV
  - Optional Gemini AI configuration available in config.json

Files Created:
  - regular-dms/data/dm_data_[timestamp].json - Scraped conversation data
  - dm_state.json - State tracking for conditional logic
  - auth-state.json - Saved login session
  - regular-dms/screenshots/ - Optional screenshot folder (no longer used for unread detection)

Notes:
  - Uses fast DOM-based unread detection - no AI API key required
  - The script saves login state to auth-state.json so you don't need to log in every time
  - You can paste cookies via X_AUTH_TOKEN/X_CT0 or X_COOKIES. Successful login is saved to auth-state.json
  - Screenshots are no longer needed for unread detection, making the process much faster
`);
  process.exit(0);
}
scrapeDMs().catch(console.error);