const axios = require('axios');
const cheerio = require('cheerio');
const { S3Client, PutObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'your-existing-bucket';

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
    
    // Try common article container patterns
    const articlePatterns = ['article', '.post', '.news-item', '.article', '.entry'];
    let articleSelector = 'article';
    
    for (const pattern of articlePatterns) {
        if ($(pattern).length > 0) {
            articleSelector = pattern;
            break;
        }
    }
    
    return {
        article: articleSelector,
        title: 'h1, h2, h3',
        image: 'img',
        content: 'p'
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
            const content = $element.find(selectors.content).first().text().trim();
            const url = $element.find('a').first().attr('href') || '';
            
            if (title) {
                articles.push({
                    title,
                    content,
                    image_url: imageUrl,
                    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
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
        
        return {
            success: true,
            articlesCount: articles.length,
            articles
        };
        
    } catch (error) {
        console.error('Scraping failed:', error.message);
        throw error;
    }
}

// Lambda handler
exports.handler = async (event, context) => {
    console.log('Starting Tether news scraper...');
    
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