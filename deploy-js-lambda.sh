#!/bin/bash

# JavaScript News Scraper Lambda Deployment Script
set -e

LAMBDA_FUNCTION_NAME="plether-news-scraper"
S3_BUCKET_NAME="${1:-admiend-plether-06-14-2025-2-20250614022549-28a681cc}"
AWS_REGION="${2:-us-east-1}"
GITHUB_TOKEN="${3:-}"
GITHUB_REPO="${4:-}"

echo "🚀 Deploying JavaScript News Scraper Lambda..."
echo "Function: $LAMBDA_FUNCTION_NAME"
echo "S3 Bucket: $S3_BUCKET_NAME"
echo "Region: $AWS_REGION"

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# Create deployment package
echo "📦 Creating deployment package..."
zip -r lambda-deployment.zip news-scraper.js node_modules/ package.json

# Create or update Lambda function
echo "☁️ Deploying to AWS Lambda..."
if aws lambda get-function --function-name $LAMBDA_FUNCTION_NAME --region $AWS_REGION >/dev/null 2>&1; then
    echo "Updating existing Lambda function..."
    aws lambda update-function-code \
        --function-name $LAMBDA_FUNCTION_NAME \
        --zip-file fileb://lambda-deployment.zip \
        --region $AWS_REGION
else
    echo "Creating new Lambda function..."
    aws lambda create-function \
        --function-name $LAMBDA_FUNCTION_NAME \
        --runtime nodejs18.x \
        --role arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/lambda-execution-role \
        --handler news-scraper.handler \
        --zip-file fileb://lambda-deployment.zip \
        --timeout 300 \
        --memory-size 256 \
        --environment Variables="{S3_BUCKET_NAME=$S3_BUCKET_NAME,GITHUB_TOKEN=$GITHUB_TOKEN,GITHUB_REPO=$GITHUB_REPO}" \
        --region $AWS_REGION
fi

# Create EventBridge rule for daily execution
echo "⏰ Setting up daily schedule..."
aws events put-rule \
    --name "plether-news-scraper-daily" \
    --schedule-expression "cron(0 0 * * ? *)" \
    --description "Daily news scraper at 12am UTC" \
    --region $AWS_REGION

# Add Lambda permission for EventBridge
aws lambda add-permission \
    --function-name $LAMBDA_FUNCTION_NAME \
    --statement-id "allow-eventbridge" \
    --action "lambda:InvokeFunction" \
    --principal events.amazonaws.com \
    --source-arn "arn:aws:events:$AWS_REGION:$(aws sts get-caller-identity --query Account --output text):rule/plether-news-scraper-daily" \
    --region $AWS_REGION 2>/dev/null || echo "Permission already exists"

# Connect EventBridge rule to Lambda
aws events put-targets \
    --rule "plether-news-scraper-daily" \
    --targets "Id"="1","Arn"="arn:aws:lambda:$AWS_REGION:$(aws sts get-caller-identity --query Account --output text):function:$LAMBDA_FUNCTION_NAME" \
    --region $AWS_REGION

# Cleanup
rm lambda-deployment.zip

echo "✅ Deployment complete!"
echo "📊 Lambda function: $LAMBDA_FUNCTION_NAME"
echo "📅 Schedule: Daily at 12:00 AM UTC"
echo "📁 S3 output: s3://$S3_BUCKET_NAME/tether_news_scraper/latest-articles.json"
echo ""
echo "To test manually: aws lambda invoke --function-name $LAMBDA_FUNCTION_NAME response.json"