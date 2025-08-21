#!/usr/bin/env node
const {
  spawn
} = require('child_process');
const fs = require('fs');
const path = require('path');
const DEFAULT_CONFIG = {
  checkInterval: 14400000,
  maxRetries: 3,
  retryDelay: 30000,
  logFile: 'daemon.log'
};
class TwitterDMDaemon {
  constructor() {
    this.config = this.loadConfig();
    this.running = false;
    this.intervalId = null;
    this.retryCount = 0;
    this.pidFile = 'daemon.pid';
    this.logFile = this.config.logFile || DEFAULT_CONFIG.logFile;
  }
  loadConfig() {
    try {
      if (fs.existsSync('config.json')) {
        const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        return {
          ...DEFAULT_CONFIG,
          ...config.autonomous
        };
      }
    } catch (error) {
      this.log('️  Could not load config, using defaults');
    }
    return DEFAULT_CONFIG;
  }
  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    if (!process.env.DAEMON_BACKGROUND) {
      console.log(logMessage);
    }
    try {
      fs.appendFileSync(this.logFile, logMessage + '\n');
    } catch (error) {}
  }
  async runScrapers() {
    return new Promise((resolve, reject) => {
      this.log(' Starting scraper run...');
      const child = spawn('node', ['run-both-scrapers.js'], {
        stdio: process.env.DAEMON_BACKGROUND ? 'ignore' : 'inherit',
        cwd: process.cwd()
      });
      child.on('close', code => {
        if (code === 0) {
          this.log(' Scraper run completed successfully');
          this.retryCount = 0;
          resolve();
        } else {
          this.log(` Scraper run failed with exit code ${code}`);
          reject(new Error(`Scraper failed with exit code ${code}`));
        }
      });
      child.on('error', error => {
        this.log(` Error running scrapers: ${error.message}`);
        reject(error);
      });
    });
  }
  async scheduledRun() {
    try {
      await this.runScrapers();
    } catch (error) {
      this.retryCount++;
      this.log(`️  Run failed (attempt ${this.retryCount}/${this.config.maxRetries}): ${error.message}`);
      if (this.retryCount < this.config.maxRetries) {
        this.log(`⏳ Retrying in ${this.config.retryDelay / 1000} seconds...`);
        setTimeout(() => this.scheduledRun(), this.config.retryDelay);
      } else {
        this.log(' Max retries exceeded. Continuing with normal schedule...');
        this.retryCount = 0;
      }
    }
  }
  start() {
    if (this.isRunning()) {
      this.log('️  Daemon is already running');
      return false;
    }
    this.log(' Starting Twitter DM Fetcher daemon...');
    this.log(` Check interval: ${this.config.checkInterval / 3600000} hours`);
    this.log(` Max retries: ${this.config.maxRetries}`);
    fs.writeFileSync(this.pidFile, process.pid.toString());
    this.running = true;
    this.log(' Running initial check...');
    this.scheduledRun();
    this.intervalId = setInterval(() => {
      this.scheduledRun();
    }, this.config.checkInterval);
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
    this.log(' Daemon started successfully');
    return true;
  }
  stop() {
    if (!this.running) {
      this.log('️  Daemon is not running');
      return false;
    }
    this.log(' Stopping Twitter DM Fetcher daemon...');
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    try {
      if (fs.existsSync(this.pidFile)) {
        fs.unlinkSync(this.pidFile);
      }
    } catch (error) {
      this.log(`️  Could not remove PID file: ${error.message}`);
    }
    this.log(' Daemon stopped');
    return true;
  }
  status() {
    const running = this.isRunning();
    if (running) {
      const pid = this.getPid();
      this.log(` Daemon is running (PID: ${pid})`);
      this.log(` Log file: ${this.logFile}`);
      this.log(` Check interval: ${this.config.checkInterval / 3600000} hours`);
    } else {
      this.log(' Daemon is not running');
    }
    return running;
  }
  isRunning() {
    if (!fs.existsSync(this.pidFile)) {
      return false;
    }
    try {
      const pid = parseInt(fs.readFileSync(this.pidFile, 'utf8'));
      process.kill(pid, 0);
      return true;
    } catch (error) {
      try {
        fs.unlinkSync(this.pidFile);
      } catch (cleanupError) {}
      return false;
    }
  }
  getPid() {
    if (fs.existsSync(this.pidFile)) {
      return parseInt(fs.readFileSync(this.pidFile, 'utf8'));
    }
    return null;
  }
  logs() {
    if (fs.existsSync(this.logFile)) {
      console.log(fs.readFileSync(this.logFile, 'utf8'));
    } else {
      console.log('No log file found');
    }
  }
}
const args = process.argv.slice(2);
const daemon = new TwitterDMDaemon();
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Twitter DM Fetcher Daemon
Usage:
  node daemon.js <command> [options]
Commands:
  start     Start the daemon in the background
  stop      Stop the running daemon
  status    Check if daemon is running
  logs      Show daemon logs
  restart   Stop and start the daemon
Options:
  --foreground   Run in foreground (don't detach)
  --help, -h     Show this help message
Configuration:
  Edit config.json to change check intervals and retry settings:
  {
    "autonomous": {
      "checkInterval": 14400000,  
      "maxRetries": 3,            
      "retryDelay": 30000         
    }
  }
Examples:
  node daemon.js start          # Start daemon in background
  node daemon.js start --foreground  # Run in foreground
  node daemon.js status         # Check if running
  node daemon.js stop           # Stop daemon
  node daemon.js logs           # View logs
`);
  process.exit(0);
}
const command = args[0] || 'start';
switch (command) {
  case 'start':
    if (args.includes('--foreground')) {
      daemon.start();
      process.on('SIGINT', () => {
        daemon.stop();
        process.exit(0);
      });
    } else {
      if (daemon.isRunning()) {
        console.log('️  Daemon is already running. Use "status" to check or "stop" to stop it.');
        process.exit(1);
      }
      console.log(' Starting daemon in background...');
      const child = spawn('node', [__filename, 'start', '--foreground'], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          DAEMON_BACKGROUND: 'true'
        }
      });
      child.unref();
      setTimeout(() => {
        if (daemon.isRunning()) {
          console.log(' Daemon started successfully');
          console.log(' Use "npm run daemon:status" to check status');
          console.log(' Use "npm run daemon:stop" to stop');
          console.log(' Use "npm run daemon:logs" to view logs');
        } else {
          console.log(' Failed to start daemon');
          process.exit(1);
        }
      }, 2000);
    }
    break;
  case 'stop':
    if (daemon.stop()) {
      console.log(' Daemon stopped successfully');
    } else {
      console.log('️  Daemon was not running');
    }
    break;
  case 'status':
    daemon.status();
    break;
  case 'logs':
    daemon.logs();
    break;
  case 'restart':
    console.log(' Restarting daemon...');
    daemon.stop();
    setTimeout(() => {
      const child = spawn('node', [__filename, 'start'], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      console.log(' Daemon restarted');
    }, 2000);
    break;
  default:
    console.log(` Unknown command: ${command}`);
    console.log('Use --help for usage information');
    process.exit(1);
}