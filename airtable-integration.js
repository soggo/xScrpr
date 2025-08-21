const Airtable = require('airtable');
const fs = require('fs');
class AirtableIntegration {
  constructor() {
    this.config = this.loadConfig();
    this.base = null;
    this.initialized = false;
  }
  loadConfig() {
    try {
      const configPath = './airtable-config.json';
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
      return null;
    } catch (error) {
      console.error('Error loading Airtable config:', error);
      return null;
    }
  }
  initialize() {
    if (!this.config) {
      console.error('Airtable config not found. Please create airtable-config.json');
      return false;
    }
    if (!this.config.apiKey || !this.config.baseId || !this.config.messageTableId) {
      console.error('Missing required Airtable configuration. Check airtable-config.json');
      return false;
    }
    if (!this.config.messageRequestsTableId) {
      console.warn('️  messageRequestsTableId not configured, message requests will use regular table');
    }
    try {
      Airtable.configure({
        endpointUrl: 'https://api.airtable.com',
        apiKey: this.config.apiKey
      });
      this.base = Airtable.base(this.config.baseId);
      this.initialized = true;
      console.log('Airtable integration initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing Airtable:', error);
      return false;
    }
  }
  async uploadDMData(dmData, dataType = 'messages') {
    if (!this.initialized && !this.initialize()) {
      throw new Error('Airtable not initialized');
    }
    if (!Array.isArray(dmData)) {
      dmData = [dmData];
    }
    let tableId;
    if (dataType === 'message_requests' && this.config.messageRequestsTableId) {
      tableId = this.config.messageRequestsTableId;
      console.log(' Using message requests table for upload');
    } else {
      tableId = this.config.messageTableId;
      if (dataType === 'message_requests') {
        console.log('️  Message requests table not configured, using regular messages table');
      } else {
        console.log(' Using regular messages table for upload');
      }
    }
    try {
      const records = dmData.map(dm => ({
        fields: {
          'Name': dm.displayName || dm.name,
          'Username': dm.username,
          'Message': dm.message || dm.lastMessage || dm.firstMessage,
          'Timestamp': new Date(dm.timestamp).toISOString()
        }
      }));
      const batches = [];
      for (let i = 0; i < records.length; i += 10) {
        batches.push(records.slice(i, i + 10));
      }
      const results = [];
      for (const batch of batches) {
        console.log(`Uploading batch of ${batch.length} ${dataType} records to Airtable...`);
        const result = await this.base(tableId).create(batch);
        results.push(...result);
        if (batches.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      console.log(`Successfully uploaded ${results.length} ${dataType} records to Airtable`);
      return results;
    } catch (error) {
      console.error(`Error uploading ${dataType} to Airtable:`, error);
      throw error;
    }
  }
  async uploadSingleDM(dm, dataType = 'messages') {
    if (!this.initialized && !this.initialize()) {
      throw new Error('Airtable not initialized');
    }
    let tableId;
    if (dataType === 'message_requests' && this.config.messageRequestsTableId) {
      tableId = this.config.messageRequestsTableId;
    } else {
      tableId = this.config.messageTableId;
    }
    try {
      const record = {
        fields: {
          'Name': dm.displayName || dm.name,
          'Username': dm.username,
          'Message': dm.message || dm.lastMessage || dm.firstMessage,
          'Timestamp': new Date(dm.timestamp).toISOString()
        }
      };
      console.log(`Uploading single ${dataType === 'message_requests' ? 'message request' : 'DM'} from ${dm.username} to Airtable...`);
      const result = await this.base(tableId).create([record]);
      console.log(`Successfully uploaded ${dataType === 'message_requests' ? 'message request' : 'DM'} to Airtable`);
      return result[0];
    } catch (error) {
      console.error(`Error uploading single ${dataType === 'message_requests' ? 'message request' : 'DM'} to Airtable:`, error);
      throw error;
    }
  }
  async testConnection(dataType = 'messages') {
    if (!this.initialized && !this.initialize()) {
      return false;
    }
    let tableId;
    if (dataType === 'message_requests' && this.config.messageRequestsTableId) {
      tableId = this.config.messageRequestsTableId;
    } else {
      tableId = this.config.messageTableId;
    }
    try {
      console.log(`Testing Airtable connection for ${dataType} table...`);
      const records = await this.base(tableId).select({
        maxRecords: 1
      }).firstPage();
      console.log(`Airtable ${dataType} table connection test successful`);
      return true;
    } catch (error) {
      console.error(`Airtable ${dataType} table connection test failed:`, error);
      return false;
    }
  }
  async getRecordCount(dataType = 'messages') {
    if (!this.initialized && !this.initialize()) {
      return 0;
    }
    let tableId;
    if (dataType === 'message_requests' && this.config.messageRequestsTableId) {
      tableId = this.config.messageRequestsTableId;
    } else {
      tableId = this.config.messageTableId;
    }
    try {
      const records = await this.base(tableId).select().all();
      return records.length;
    } catch (error) {
      console.error(`Error getting ${dataType} record count:`, error);
      return 0;
    }
  }
}
module.exports = AirtableIntegration;