# News Scraper Lambda Implementation

## Overview
Complete serverless microservice for scraping Tether.io news articles, deployed as JavaScript AWS Lambda with automated scheduling and S3 storage.

## File Structure
```
scripts/news_lambda/
├── news-scraper.js                    # JavaScript Lambda function
├── package.json                       # Node.js dependencies
├── deploy-js-lambda.sh                # Deployment automation
├── setup_lambda_role.sh               # IAM role setup
└── news_scraper_analysis.md           # This documentation
```

## Architecture Overview

### Serverless Microservice Design
- **Independent Lambda function** - completely separate from main backend
- **Daily automated execution** at 12am UTC via EventBridge
- **Zero container interaction** - no impact on EC2 instances
- **Direct S3 storage** - frontend reads JSON files directly
- **Automatic backup/fallback** - preserves previous data on failures

### Data Flow
```
EventBridge (cron) → Lambda → Tether.io → S3 → Frontend
                      ↓
                 CloudWatch Logs
```

### Cost Analysis
**Annual cost: Under $1**
- Lambda: ~$0.04/year (365 executions × 5 seconds × 128MB)
- S3: Negligible (small JSON files)
- EventBridge: Negligible (365 events)

## File Details

### 1. news-scraper.js - JavaScript Lambda Function
**Purpose**: Complete Node.js Lambda function for web scraping and S3 storage

**Key Functions**:
- `handler()` - Main Lambda entry point
- `scrapeNews()` - Core scraping logic
- `inspectHtmlStructure()` - Analyzes HTML for debugging
- `detectSelectors()` - Auto-detects CSS selectors for articles
- `backupCurrentData()` - Creates S3 backup before overwriting

**Features**:
- **Automated HTML inspection** - no manual selector updates needed
- **Dynamic selector detection** - adapts to site changes
- **Error handling** - falls back to existing data on failures
- **S3 backup system** - preserves previous articles
- **Comprehensive logging** - detailed debug output
- **Native AWS SDK** - uses @aws-sdk/client-s3

**Data Structure**:
```javascript
const article = {
    title: String,
    content: String,
    image_url: String,
    date: String,        // YYYY-MM-DD format
    url: String
};
```

**Dependencies**:
- `axios` - HTTP requests
- `cheerio` - HTML parsing (jQuery-like)
- `@aws-sdk/client-s3` - S3 operations

### 2. package.json - Node.js Configuration
**Purpose**: Defines dependencies and Node.js runtime requirements

**Key Dependencies**:
```json
{
  "axios": "^1.6.0",           // HTTP client
  "cheerio": "^1.0.0-rc.12",   // HTML parsing
  "@aws-sdk/client-s3": "^3.450.0"  // AWS S3 SDK
}
```

### 3. deploy-js-lambda.sh - Deployment Script
**Purpose**: Automated deployment of JavaScript Lambda function with scheduling

**Deployment Steps**:
1. **Install dependencies** - runs `npm install`
2. **Package creation** - creates ZIP with JS files and node_modules
3. **Lambda deployment** - creates/updates function
4. **EventBridge setup** - configures daily cron schedule (0 0 * * ? *)
5. **Permissions** - grants EventBridge invoke permissions
6. **Target linking** - connects schedule to Lambda function

**Usage**:
```bash
./deploy-js-lambda.sh your-bucket-name us-east-1
```

**Configuration**:
- Runtime: `nodejs18.x`
- Memory: 256MB
- Timeout: 300 seconds (5 minutes)
- Environment: `S3_BUCKET_NAME`

### 4. setup_lambda_role.sh - IAM Configuration
**Purpose**: Creates necessary IAM roles and policies for Lambda execution

**IAM Components**:
- **Execution Role**: `lambda-execution-role`
- **Trust Policy**: Allows Lambda service to assume role
- **Basic Execution Policy**: CloudWatch Logs access
- **S3 Policy**: Read/write access to `tether_news_scraper/*`

**Permissions**:
```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject", "s3:CopyObject"],
  "Resource": "arn:aws:s3:::bucket/tether_news_scraper/*"
}
```

## S3 Storage Structure
```
your-bucket/
└── tether_news_scraper/
    ├── latest-articles.json     # Current articles (frontend reads)
    └── backup-articles.json     # Previous articles (fallback)
```

## Deployment Process

### Prerequisites
- AWS CLI configured with appropriate permissions
- Rust toolchain with `x86_64-unknown-linux-gnu` target
- Existing S3 bucket

### Step-by-Step Deployment

1. **Setup IAM Role** (one-time):
   ```bash
   cd scripts/news_lambda
   ./setup_lambda_role.sh your-bucket-name
   ```

2. **Deploy JavaScript Lambda Function**:
   ```bash
   ./deploy-js-lambda.sh your-bucket-name us-east-1
   ```

3. **Verify Deployment**:
   ```bash
   aws lambda invoke --function-name plether-news-scraper response.json
   ```

### Monitoring
- **CloudWatch Logs**: `/aws/lambda/plether-news-scraper`
- **EventBridge Rules**: `plether-news-scraper-daily`
- **S3 Objects**: Monitor file timestamps and sizes

## Error Handling

### Failure Scenarios
1. **Scraping fails**: Existing data remains unchanged
2. **No articles found**: Returns error, keeps previous data
3. **S3 upload fails**: Lambda reports error, data not overwritten
4. **Selector detection fails**: Falls back to default selectors

### Recovery
- **Automatic**: Previous data remains available in S3
- **Manual**: Invoke Lambda function manually for immediate retry
- **Debugging**: Check CloudWatch logs for detailed error information

## Frontend Integration

### Multiple Data Sources
**Option 1: Direct S3 Access**
```javascript
fetch('https://admiend-plether-06-14-2025-2-20250614022549-28a681cc.s3.amazonaws.com/tether_news_scraper/latest-articles.json')
  .then(response => response.json())
  .then(articles => {
    // Display latest 2 Tether news articles
  });
```

**Option 2: GitHub Raw Access**
```javascript
fetch('https://raw.githubusercontent.com/ScottFeichter/admiend-plether-06-14-2025-2/main/data/latest-articles.json')
  .then(response => response.json())
  .then(articles => {
    // Display latest 2 Tether news articles
  });
```

### Data Format
```json
[
  {
    "title": "Article Title",
    "content": "Article excerpt...",
    "image_url": "https://...",
    "date": "2025-07-29",
    "url": "https://tether.io/news/article-url"
  }
]
```

## GitHub Integration

### Dual Repository Setup
- **Main Project**: `ScottFeichter/admiend-plether-06-14-2025-2`
  - Token: Fine-grained, Contents write permission
  - Files: `data/latest-articles.json`, `data/articles-YYYY-MM-DD.json`
- **Scraper Microservice**: `ScottFeichter/scraper-news-plether-06-14-2025-2`
  - Token: Fine-grained, Contents write permission  
  - Files: `latest-articles.json`

### Environment Variables
```bash
GITHUB_TOKEN=github_pat_xxx  # Main project repo token
SCRAPER_TOKEN=github_pat_yyy # Scraper repo token
GITHUB_REPO=ScottFeichter/admiend-plether-06-14-2025-2
```

## Maintenance

### Updates
- **Code changes**: Re-run deployment script
- **Schedule changes**: Modify cron expression in deploy script
- **Bucket changes**: Update environment variable

### Monitoring
- **Daily execution**: Check CloudWatch Events
- **Success rate**: Monitor Lambda metrics
- **Data freshness**: Verify S3 file timestamps

## Security Considerations

- **Minimal permissions**: IAM role limited to specific S3 paths
- **No secrets**: No API keys or credentials required
- **Network isolation**: Lambda runs in AWS VPC
- **Audit trail**: All actions logged in CloudWatch

## Performance

- **Execution time**: ~5 seconds typical
- **Memory usage**: <128MB typical
- **Network**: Single HTTP request to tether.io
- **Storage**: <1KB JSON output

## Troubleshooting

### Common Issues
1. **No articles found**: CSS selectors need updating for tether.io structure
2. **Permission errors**: Verify IAM role setup completed
3. **Schedule not working**: Check EventBridge rule and targets
4. **S3 access denied**: Confirm bucket name and permissions
5. **Node.js version warnings**: Lambda uses Node.js 18.x (warnings are non-critical)

### Debug Commands
```bash
# Check Lambda function
aws lambda get-function --function-name plether-news-scraper

# View recent logs
aws logs describe-log-streams --log-group-name /aws/lambda/plether-news-scraper

# Test manually
aws lambda invoke --function-name plether-news-scraper response.json

# View logs in real-time
aws logs tail /aws/lambda/plether-news-scraper --follow
```

## Current Status

### ✅ Fully Operational
- **Lambda Function**: `plether-news-scraper` 
- **Runtime**: Node.js 18.x
- **Schedule**: Daily at 12:00 AM UTC (4:00 PM PST / 5:00 PM PDT)
- **S3 Output**: `s3://admiend-plether-06-14-2025-2-20250614022549-28a681cc/tether_news_scraper/latest-articles.json`
- **EventBridge Rule**: `plether-news-scraper-daily`
- **GitHub Integration**: Commits to both repositories automatically

### ✅ Automated Workflow
**Every day at midnight UTC:**
1. Scrapes 2 latest articles from tether.io/news
2. Stores in S3 bucket with backup
3. Commits to main project repo: `ScottFeichter/admiend-plether-06-14-2025-2`
   - `data/latest-articles.json` - Current articles
   - `data/articles-YYYY-MM-DD.json` - Timestamped archive
4. Commits to scraper repo: `ScottFeichter/scraper-news-plether-06-14-2025-2`
   - `latest-articles.json` - Current articles

### 🔄 Local Sync
```bash
git pull origin main  # Updates latest-articles.json automatically
```

## Line-by-Line Analysis

### Dependencies (Lines 1-5)
- **Line 1**: `reqwest` for HTTP requests
- **Line 2**: `scraper` for HTML parsing and CSS selector support
- **Line 3**: `serde` for serialization/deserialization with derive macros
- **Line 4**: `aws_sdk_s3` for AWS S3 operations
- **Line 5**: `chrono` for date/time handling

### Data Structure (Lines 7-14)
- **Line 7**: Derive macros for Article struct - enables serialization, deserialization, and debug printing
- **Lines 8-14**: Article struct fields:
  - `title`: Article headline as String
  - `content`: Article body/excerpt as String  
  - `image_url`: URL to article image as String
  - `date`: Publication date as String
  - `url`: Article URL as String

### HTML Inspection Function (Lines 16-35)
- **Line 16**: Function to analyze HTML structure for debugging
- **Lines 17-19**: Print header and first 1000 characters of HTML
- **Line 21**: Parse HTML into document for analysis
- **Lines 23-27**: Array of common article container CSS patterns
- **Lines 29-35**: Loop through patterns, count matches, and report findings

### Selector Detection Function (Lines 37-50)
- **Line 37**: Function to automatically detect appropriate CSS selectors
- **Line 38**: Parse HTML document
- **Lines 40-41**: Array of common article container patterns to try
- **Line 42**: Default to "article" selector
- **Lines 44-49**: Test each pattern and use first match found
- **Line 50**: Return tuple of detected selectors (article, title, image, content)

### Main Scraper Function (Lines 52-121)
- **Line 52**: Public async function for Lambda deployment
- **Line 53**: HTTP GET request to tether.io/news
- **Lines 55-56**: Call HTML inspection function for debugging
- **Line 58**: Parse HTML document
- **Lines 60-62**: Auto-detect selectors and print which ones are being used
- **Lines 64-67**: Parse detected selectors into Selector objects
- **Line 69**: Initialize empty articles vector
- **Lines 71-95**: Article extraction loop:
  - Extract and trim title text
  - Extract image src attribute
  - Extract and trim content text
  - Extract article URL from anchor tags
  - Only add articles with non-empty titles
- **Line 97**: Print count of scraped articles
- **Lines 99-101**: Create S3 client and serialize articles to JSON
- **Lines 103-108**: Store JSON data in S3 bucket
- **Lines 110-111**: Print success message and return

## Key Features
- **Automated HTML Inspection**: Analyzes page structure without manual intervention
- **Dynamic Selector Detection**: Automatically finds appropriate CSS selectors
- **Robust Data Extraction**: Trims whitespace and validates content
- **Lambda-Ready**: Public function suitable for AWS Lambda deployment
- **Debug Output**: Provides detailed logging for troubleshooting
- **Error Handling**: Comprehensive error handling throughout

## Deployment Status
- **Architecture**: Serverless microservice (AWS Lambda)
- **Scheduling**: EventBridge rule for daily 12am UTC execution
- **Container Independence**: Zero interaction with EC2 containers
- **Cost**: Under $1 annually
- **Data Access**: Frontend reads directly from S3 + GitHub repos
- **Error Handling**: Automatic fallback to previous data on failure
- **GitHub Integration**: Dual repository commits with separate tokens

## Implementation Checklist
- [x] Create Lambda deployment script
- [x] Set up EventBridge scheduling rule
- [x] Configure S3 bucket structure
- [x] Update S3 bucket name from placeholder
- [x] Test Lambda function independently
- [x] Verify frontend S3 access to news data
- [x] Configure GitHub API integration
- [x] Set up dual repository commits
- [x] Test automated workflow end-to-end