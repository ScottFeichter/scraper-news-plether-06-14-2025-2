#!/bin/bash

# Setup IAM role for Lambda news scraper
set -e

ROLE_NAME="lambda-execution-role"
POLICY_NAME="lambda-s3-policy"
S3_BUCKET_NAME="${1:-your-existing-bucket}"

echo "🔐 Setting up IAM role for Lambda..."

# Create trust policy
cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create IAM role
if aws iam get-role --role-name $ROLE_NAME >/dev/null 2>&1; then
    echo "Role $ROLE_NAME already exists"
else
    echo "Creating IAM role: $ROLE_NAME"
    aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document file://trust-policy.json
fi

# Attach basic Lambda execution policy
aws iam attach-role-policy \
    --role-name $ROLE_NAME \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Create S3 access policy
cat > s3-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:CopyObject"
      ],
      "Resource": "arn:aws:s3:::$S3_BUCKET_NAME/tether_news_scraper/*"
    }
  ]
}
EOF

# Create and attach S3 policy
if aws iam get-policy --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/$POLICY_NAME" >/dev/null 2>&1; then
    echo "Policy $POLICY_NAME already exists"
else
    echo "Creating S3 access policy: $POLICY_NAME"
    aws iam create-policy \
        --policy-name $POLICY_NAME \
        --policy-document file://s3-policy.json
fi

aws iam attach-role-policy \
    --role-name $ROLE_NAME \
    --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/$POLICY_NAME"

# Cleanup
rm trust-policy.json s3-policy.json

echo "✅ IAM role setup complete!"
echo "Role ARN: arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/$ROLE_NAME"