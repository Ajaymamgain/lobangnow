# WhatsApp AI Bot - Multi-Store Support

This serverless application provides WhatsApp AI chatbot functionality with multi-store support.

## Features

- **Dynamic Multi-Store Support**: A single webhook endpoint handles messages for multiple WhatsApp Business accounts and stores
- **Owner Number Suppression**: Messages from store owners bypass AI processing
- **Product Catalog Integration**: Show products and process orders via WhatsApp
- **Invoice Generation**: Create and send invoices directly through WhatsApp
- **OpenAI Integration**: Natural language processing for customer interactions

## Architecture

- AWS Lambda for serverless execution
- DynamoDB for data storage (sessions, store configurations)
- S3 for business context and other assets
- WhatsApp Business API for messaging

## Environment Variables

- `WEBHOOK_VERIFY_TOKEN`: Token for WhatsApp webhook verification
- `SESSION_TABLE_NAME`: DynamoDB table for storing conversation sessions
- `AWS_REGION`: AWS region for Lambda and most DynamoDB tables
- `S3_CONTEXT_BUCKET`: Default S3 bucket for business context
- `S3_CONTEXT_KEY`: Default S3 key for business context
- `POS_FASTAPI_BASE_URL`: URL for the POS FastAPI backend

## WhatsApp Phone Number ID to Store Mapping

The application uses a DynamoDB table named `WhatsappStoreTokens` in the `us-east-1` region to map WhatsApp phone number IDs to store IDs:

```
{
  "storeId": "store-123",
  "whatsappPhoneNumberId": "1234567890",
  "whatsappToken": "your-token-here",
  "whatsappAppSecret": "your-app-secret-here",
  "ownerNumber": "1234567890"  // Optional: If set, messages from this number bypass AI processing
}
```

## Webhook Handler Logic

1. **Verification (GET)**: Validates the webhook using the `WEBHOOK_VERIFY_TOKEN` environment variable
2. **Message Processing (POST)**:
   - Extracts WhatsApp Phone Number ID from incoming message
   - Looks up storeId from WhatsappStoreTokens table
   - Checks if sender is the store owner (ownerNumber)
   - Processes messages differently based on message type and sender:
     - Owner messages: No AI or product responses
     - Customer interactive messages: Processes buttons/list selections
     - Customer text messages: Processes with keyword detection or OpenAI

## Deployment

```bash
# Deploy to AWS
cd store-ai-bot
npm install
serverless deploy
```

## Meta Webhook Configuration

When configuring the webhook in the Meta Developer Dashboard:
1. Use the API Gateway URL (without any path parameters): `https://xxx.execute-api.region.amazonaws.com/dev/webhook`
2. Set the verify token to match `WEBHOOK_VERIFY_TOKEN` in your Lambda configuration
3. Subscribe to message webhooks
