const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'scraper.log');

function logResponse(success, data, error = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        success,
        ...(success ? { articlesCount: data.articlesCount, articles: data.articles } : {}),
        ...(error && { error: error.message || error })
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
        fs.appendFileSync(LOG_FILE, logLine);
        console.log(`Log entry added: ${success ? 'SUCCESS' : 'FAILURE'} at ${timestamp}`);
    } catch (logError) {
        console.error('Failed to write to log file:', logError.message);
    }
}

module.exports = { logResponse };