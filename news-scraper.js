const axios = require('axios');
const cheerio = require('cheerio');
const { S3Client, PutObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { logResponse } = require('./logger');
const { cleanupOldMessages } = require('./discord-cleanup');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'admiend-plether-06-14-2025-2-20250614022549-28a681cc';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // format: 'username/repo-name'
const SCRAPER_TOKEN = process.env.SCRAPER_TOKEN;
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1399843121306669178/ZIkScwU9Jx06lT8-6R8Ylkf1kBSY1Z7Q3gXofmVWR38baot1uRrB3_7WDo_4dU-jh6Me';

// Inspect HTML structure for debugging
function inspectHtmlStructure(html) {
    console.log('=== HTML STRUCTURE ANALYSIS ===');
    console.log('First 1000 characters:');
    console.log(html.substring(0, 1000));
    
    const $ = cheerio.load(html);
    
    // Common article container patterns
    const patterns = [
        'article', '.post', '.news-item', '.article', '.entry', '.blog-post',
        '[class*="post"]', '[class*="article"]', '[class*="news"]'
    ];
    
    patterns.forEach(pattern => {
        const count = $(pattern).length;
        if (count > 0) {
            console.log(`Found ${count} elements matching: ${pattern}`);
        }
    });
}

// Auto-detect CSS selectors
function detectSelectors(html) {
    const $ = cheerio.load(html);
    
    return {
        article: '.article-item',
        title: '.article-title',
        image: '.img-article',
        content: '.article-preview p'
    };
}

// Backup current data before overwriting
async function backupCurrentData() {
    try {
        const copyCommand = new CopyObjectCommand({
            Bucket: BUCKET_NAME,
            CopySource: `${BUCKET_NAME}/tether_news_scraper/latest-articles.json`,
            Key: 'tether_news_scraper/backup-articles.json'
        });
        
        await s3Client.send(copyCommand);
        console.log('Current data backed up successfully');
    } catch (error) {
        console.log('No existing data to backup (first run)');
    }
}

// Commit files to GitHub repository
async function commitToGitHub(articles) {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
        console.log('GitHub integration not configured - skipping repo update');
        return;
    }

    try {
        const timestamp = new Date().toISOString().split('T')[0];
        const articlesJson = JSON.stringify(articles, null, 2);
        
        // Get current file SHA if it exists
        let sha = null;
        try {
            const existingFile = await axios.get(
                `https://api.github.com/repos/${GITHUB_REPO}/contents/data/latest-articles.json`,
                { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
            );
            sha = existingFile.data.sha;
        } catch (error) {
            console.log('File does not exist yet, creating new file');
        }

        // Commit latest articles
        const commitData = {
            message: `Update news articles - ${timestamp}`,
            content: Buffer.from(articlesJson).toString('base64'),
            ...(sha && { sha })
        };

        await axios.put(
            `https://api.github.com/repos/${GITHUB_REPO}/contents/data/latest-articles.json`,
            commitData,
            { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
        );

        // Also create timestamped file
        await axios.put(
            `https://api.github.com/repos/${GITHUB_REPO}/contents/data/articles-${timestamp}.json`,
            {
                message: `Archive news articles - ${timestamp}`,
                content: Buffer.from(articlesJson).toString('base64')
            },
            { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
        );

        console.log('Successfully committed to GitHub repository');
    } catch (error) {
        console.error('Failed to commit to GitHub:', error.message);
    }
}

// Commit to scraper microservice repo
async function commitToScraperRepo(articles) {
    if (!SCRAPER_TOKEN) {
        console.log('Scraper token not configured - skipping scraper repo update');
        return;
    }

    try {
        const timestamp = new Date().toISOString().split('T')[0];
        const articlesJson = JSON.stringify(articles, null, 2);
        const scraperRepo = 'ScottFeichter/scraper-news-plether-06-14-2025-2';
        
        // Get current file SHA if it exists
        let sha = null;
        try {
            const existingFile = await axios.get(
                `https://api.github.com/repos/${scraperRepo}/contents/latest-articles.json`,
                { headers: { Authorization: `token ${SCRAPER_TOKEN}` } }
            );
            sha = existingFile.data.sha;
        } catch (error) {
            console.log('Scraper repo file does not exist yet, creating new file');
        }

        // Commit latest articles to scraper repo
        const commitData = {
            message: `Update scraped articles - ${timestamp}`,
            content: Buffer.from(articlesJson).toString('base64'),
            ...(sha && { sha })
        };

        await axios.put(
            `https://api.github.com/repos/${scraperRepo}/contents/latest-articles.json`,
            commitData,
            { headers: { Authorization: `token ${SCRAPER_TOKEN}` } }
        );

        console.log('Successfully committed to scraper microservice repository');
    } catch (error) {
        console.error('Failed to commit to scraper repo:', error.message);
    }
}

// Send Discord notification
async function sendDiscordNotification(success, articlesCount, error = null) {
    try {
        const timestamp = new Date().toISOString();
        const color = success ? 0x00ff00 : 0xff0000; // Green for success, red for error
        
        const embed = {
            title: success ? '✅ News Scraper Success' : '❌ News Scraper Failed',
            color: color,
            fields: [
                { name: 'Status', value: success ? 'Completed successfully' : 'Failed', inline: true },
                { name: 'Articles', value: articlesCount.toString(), inline: true },
                { name: 'Timestamp', value: timestamp, inline: false }
            ]
        };
        
        if (error) {
            embed.fields.push({ name: 'Error', value: error, inline: false });
        }
        
        await axios.post(DISCORD_WEBHOOK, {
            embeds: [embed]
        });
        
        console.log('Discord notification sent');
    } catch (error) {
        console.error('Failed to send Discord notification:', error.message);
    }
}

// Main scraping function
async function scrapeNews() {
    try {
        // Fetch HTML from Tether.io
        console.log('Fetching HTML from https://tether.io/news/');
        const response = await axios.get('https://tether.io/news/', {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TetherNewsScraper/1.0)'
            }
        });
        
        const html = response.data;
        
        // Inspect HTML structure for debugging
        inspectHtmlStructure(html);
        
        // Auto-detect selectors
        const selectors = detectSelectors(html);
        console.log('Using selectors:', selectors);
        
        const $ = cheerio.load(html);
        const articles = [];
        
        // Extract articles (limit to 2)
        $(selectors.article).slice(0, 2).each((index, element) => {
            const $element = $(element);
            
            const title = $element.find(selectors.title).first().text().trim();
            const imageUrl = $element.find(selectors.image).first().attr('src') || '';
            const rawContent = $element.find(selectors.content).first().text().trim();
            const url = $element.find('.article-more').first().attr('href') || '';
            
            // Extract date from beginning of content (e.g., "24 July 2025 —")
            const dateMatch = rawContent.match(/^([^—–-]+[—–-])\s*(.*)$/);
            let articleDate = '';
            let content = rawContent;
            
            if (dateMatch) {
                articleDate = dateMatch[1].trim(); // "24 July 2025 —"
                content = dateMatch[2].trim(); // Rest of content without date
            }
            
            if (title) {
                articles.push({
                    title,
                    content,
                    image_url: imageUrl,
                    date: articleDate,
                    url
                });
            }
        });
        
        console.log(`Scraped ${articles.length} articles`);
        
        if (articles.length === 0) {
            throw new Error('No articles found - keeping existing data');
        }
        
        // Backup current data before overwriting
        await backupCurrentData();
        
        // Store in S3
        const putCommand = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: 'tether_news_scraper/latest-articles.json',
            Body: JSON.stringify(articles, null, 2),
            ContentType: 'application/json'
        });
        
        await s3Client.send(putCommand);
        console.log('Articles stored in S3 at tether_news_scraper/latest-articles.json');
        
        // Commit to both GitHub repositories
        await commitToGitHub(articles);
        await commitToScraperRepo(articles);
        
        // Send Discord notification
        await sendDiscordNotification(true, articles.length);
        
        const result = {
            success: true,
            articlesCount: articles.length,
            articles
        };
        
        // Log successful response
        logResponse(true, result);
        
        return result;
        
    } catch (error) {
        console.error('Scraping failed:', error.message);
        
        // Log failed response
        logResponse(false, null, error);
        
        // Send Discord notification for scraping failure
        await sendDiscordNotification(false, 0, error.message);
        
        throw error;
    }
}

// Lambda handler
exports.handler = async (event, context) => {
    console.log('Starting Tether news scraper...');
    
    // Run Discord cleanup before scraping
    await cleanupOldMessages();
    
    try {
        const result = await scrapeNews();
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'News scraping completed successfully',
                requestId: context.awsRequestId,
                articlesCount: result.articlesCount,
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('Lambda execution failed:', error);
        
        // Log failed response
        logResponse(false, null, error);
        
        // Send Discord notification for failure
        await sendDiscordNotification(false, 0, error.message);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'News scraping failed',
                error: error.message,
                requestId: context.awsRequestId,
                timestamp: new Date().toISOString()
            })
        };
    }
};