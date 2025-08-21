# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WhatsApp AI bot system for Singapore with two main functions:
1. **LobangLah Bot**: Helps users find local deals and offers through search
2. **Viral Social Agency Bot**: Enables business owners to submit deals for viral social media promotion via N8N workflow

The system uses AWS Serverless Framework, integrates with multiple APIs (OpenAI, Google Places, Replicate), and manages state across multiple DynamoDB tables including ViralDeals for business-submitted content.

## Development Commands

### Deployment
- `npm run deploy:dev` - Deploy to AWS dev environment
- `npm run remove:dev` - Remove dev environment resources

### Testing
- Run tests using Jest: `npx jest` (test configuration in package.json)
- `npm run test:poster` - Test AI poster generation with Flux Schnell model
- No specific test scripts defined, tests run from the root directory

## Architecture

### Core Architecture
- **Serverless Framework**: AWS Lambda functions with API Gateway
- **Primary Region**: ap-southeast-1 (Singapore)
- **Runtime**: Node.js 20.x with ES modules (type: "module" in package.json)
- **Build Tool**: serverless-esbuild for bundling

### Main Handler Flow
1. `webhook.js` - Primary webhook entry point, handles WhatsApp API verification and message routing
2. `enhancedWebhookHandler.js` - Enhanced session-aware message processing
3. `lobangLahHandler.js` - Consumer deals search bot logic
4. `socialAgencyHandler.js` - Business owner deal submission and viral content collection
5. Additional specialized handlers for daily alerts, N8N callbacks, etc.

### Key Data Tables (DynamoDB)
- `store-ai-bot-dev-sessions` - Basic session storage
- `store-ai-bot-dev-enhanced-sessions` - Advanced session management with conversation history
- `store-ai-bot-dev-deals` - Deal storage with location/category indexes
- `store-ai-bot-dev-restaurants` - Restaurant details with place IDs
- `store-ai-bot-dev-alerts` - User alert preferences
- `WhatsappStoreTokens` (us-east-1) - API keys and bot configurations
- `ViralDeals`, `LobangLahUsers`, etc. - Additional Singapore-specific tables

### Session Management
- Uses enhanced session manager (`sessionManager.js`) with state machine pattern
- Session states: START → ASK_LOCATION → LOCATION_RECEIVED → ASK_CATEGORY → SEARCHING_DEALS → SHOWING_DEALS → DEAL_INTERACTION
- Supports conversation history tracking and context preservation

### API Integrations
- **OpenAI**: Chat completions and deal analysis (key stored in WhatsappStoreTokens table)
- **Google Places**: Location search and restaurant details
- **Replicate**: AI image generation for stickers and deal posters (upgraded to Flux Schnell model)
- **WhatsApp Business API**: Message sending and interactive buttons

## Key Utils Modules

### Core Functionality
- `sessionManager.js` - Enhanced session state management and conversation history
- `dealsUtils.js` - Deal search, OpenAI integration, welcome/category messages
- `dynamoDbUtils.js` - Database operations, session management, bot config retrieval
- `whatsappUtils.js` - WhatsApp API message sending utilities

### Location & Search
- `locationSearchUtils.js` - AI-enhanced location name resolution
- `googleLocationUtils.js` - Google Places integration for location/weather
- `googleMenuUtils.js` - Restaurant menu retrieval from Google Places

### Singapore-Specific Features
- `singaporeFeatures.js` - Singapore slang, weather recommendations, localized content
- `singaporeStickers.js` - Singapore-themed sticker generation
- `singaporeAnalytics.js` - Usage analytics for Singapore users

### Advanced Features
- `enhancedDealUtils.js` - Deal photo enhancement and rich formatting
- `dealPosterUtils.js` - AI-powered poster generation using Flux Schnell with text overlays
- `alertUtils.js` - Daily deal alert system
- `viralContentScraper.js` - Social media viral content discovery
- `socialMediaUtils.js` - Social media integration and content management

## Environment Variables & Configuration

### Required Environment Variables (from serverless.yml)
- `WHATSAPP_API_VERSION` - WhatsApp API version (v19.0)
- `POS_FASTAPI_BASE_URL` - POS system integration endpoint
- `WEBHOOK_VERIFY_TOKEN` - WhatsApp webhook verification token
- `REPLICATE_API_TOKEN` - Replicate API token for Flux Schnell AI poster generation
- `S3_POSTER_BUCKET` or `S3_BUCKET` - S3 bucket for uploading generated posters
- `S3_PUBLIC_URL` - Public URL base for S3/CloudFront (optional, defaults to S3 direct URLs)

### Bot Configuration
- Bot configurations (including OpenAI API keys) are stored in DynamoDB `WhatsappStoreTokens` table
- Store ID: 'cmanyfn1e0001jl04j3k45mz5'
- Configuration retrieved via `getBotConfig(storeId)` from `dynamoDbUtils.js`

## Working with the Codebase

### Message Processing Flow
1. Webhook receives WhatsApp message
2. Enhanced webhook handler creates/continues session
3. Message routed to appropriate handler based on content/state
4. Response generated using OpenAI/location APIs
5. Response sent via WhatsApp API with session state update

### Adding New Features
- Follow existing handler pattern in `src/handlers/`
- Use session manager for state persistence
- Leverage existing utils for common operations (DB, WhatsApp, OpenAI)
- Singapore-specific features should use `singaporeFeatures.js` utilities

### Database Patterns
- All tables use pay-per-request billing
- TTL enabled where appropriate for automatic cleanup
- GSI patterns for location/category and timestamp-based queries
- Session data includes conversation history for AI context

### Testing WhatsApp Integration
- Use `/test-webhook` endpoint for webhook credential verification
- Test messages via WhatsApp Business API
- Monitor CloudWatch logs for debugging

## AI Viral Poster Generation (NEW)
The system now features AI-powered viral poster generation for business-submitted deals:

### WhatsApp Business Flow (Corrected)
1. **Business owners** submit deals via WhatsApp messages to `socialAgencyHandler.js`
2. **Deal details collected** through WhatsApp conversational flow (restaurant, deal, pricing, validity, etc.)
3. **AI poster generated immediately** in WhatsApp flow using OpenAI → Flux Schnell → Canvas text overlay
4. **Business owner approves** poster and content via WhatsApp before submission
5. **Deal stored** in ViralDeals table with generated content and poster URLs
6. **N8N triggered** for viral social media posting with ready-to-use poster attachments

### Features
- **Flux Schnell Model**: Fast, high-quality image generation via Replicate API
- **Viral Text Overlays**: Eye-catching social media optimized text with "VIRAL DEAL" badges
- **Multiple Viral Styles**: Singapore, modern, vibrant, elegant, foodie, trendy styles
- **Canvas Integration**: HTML5 Canvas for professional text rendering
- **Smart Style Selection**: Automatic style selection based on restaurant type and deal category

### Key Functions in WhatsApp Flow
- `generateViralMediaPackage()` - Main function in `viralContentUtils.js` that coordinates the entire pipeline
- `generateViralDealPoster()` - Canvas text overlay functionality from `dealPosterUtils.js`
- `triggerN8NPipeline()` - N8N integration for viral posting (poster already generated)
- OpenAI → Flux Schnell → Canvas pipeline integrated into existing WhatsApp message flow

### WhatsApp Integration Points
- **socialAgencyHandler.js line 483**: Calls `generateViralMediaPackage()` during deal submission
- **viralContentUtils.js**: Enhanced to use OpenAI → Flux Schnell instead of OpenAI direct image gen
- **N8N receives**: Complete deal data with poster URLs ready for immediate social media posting
- **No poster generation in N8N**: All poster work happens in WhatsApp flow for user approval

### Dependencies
- `canvas` package for text overlay rendering
- Replicate API token for Flux Schnell model access
- N8N webhook integration for social media pipeline
- ViralDeals DynamoDB table for deal storage

## Singapore Context
This bot is specifically designed for Singapore users with:
- Singapore slang integration (`singaporeSlang` in singaporeFeatures.js)
- Weather-based deal recommendations
- Local location understanding (MRT stations, districts)
- Singapore-themed sticker generation and poster styles
- Local business integration patterns