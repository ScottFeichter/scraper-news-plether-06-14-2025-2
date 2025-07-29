#!/bin/bash

# Sync S3 news data to local repo
BUCKET="admiend-plether-06-14-2025-2-20250614022549-28a681cc"
LOCAL_DIR="./data"

echo "📥 Syncing S3 data to local repo..."

# Create data directory if it doesn't exist
mkdir -p $LOCAL_DIR

# Download latest articles
aws s3 cp s3://$BUCKET/tether_news_scraper/latest-articles.json $LOCAL_DIR/
aws s3 cp s3://$BUCKET/tether_news_scraper/backup-articles.json $LOCAL_DIR/

echo "✅ Sync complete!"
echo "Files downloaded to: $LOCAL_DIR/"