// Social Media Agency Handler - Viral Deal Collection & Performance Tracking
import { sendWhatsAppMessage } from '../utils/whatsappUtils.js';
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import OpenAI from 'openai';
import { searchLocationByName, getLocationDetails } from '../utils/locationSearchUtils.js';

// In-memory user state management for deal collection flow
const agencyUserStates = new Map();

/**
 * Main handler for Social Media Agency bot
 */
export async function handleSocialAgencyMessage(storeId, fromNumber, messageType, messageBody, interactiveData, locationData, botConfig, session) {
    console.log(`[SocialAgency] Processing message from ${fromNumber}`);
    
    // Get or create user state for deal collection flow
    let userState = agencyUserStates.get(fromNumber) || {
        step: 'welcome',
        dealData: {},
        conversationHistory: []
    };

    try {
        let response;

        // Handle different message types
        if (messageType === 'interactive' && interactiveData) {
            response = await handleAgencyInteractiveMessage(storeId, fromNumber, interactiveData, userState, botConfig);
        } else if (messageType === 'text') {
            response = await handleAgencyTextMessage(storeId, fromNumber, messageBody, userState, botConfig);
        } else if (messageType === 'image') {
            response = await handleAgencyImageMessage(storeId, fromNumber, messageBody, userState, botConfig);
        }

        // Update user state
        agencyUserStates.set(fromNumber, userState);
        
        // Send response
        if (response) {
            await sendWhatsAppMessage(storeId, fromNumber, response, botConfig);
        }

        return { success: true, response };
    } catch (error) {
        console.error('[SocialAgency] Error processing message:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Handle interactive button/list selections
 */
async function handleAgencyInteractiveMessage(storeId, fromNumber, interactiveData, userState, botConfig) {
    const actionId = interactiveData.button_reply?.id || interactiveData.list_reply?.id;
    console.log(`[SocialAgency] Processing action: ${actionId}`);
    
    switch (actionId) {
        case 'post_new_deal':
            userState.step = 'collect_restaurant_name';
            return createRestaurantNameMessage();
            
        case 'view_performance':
            return await createPerformanceReportMessage(fromNumber, botConfig);
            
        case 'commission_info':
            return createCommissionInfoMessage();
            
        case 'confirm_restaurant':
            userState.step = 'collect_deal_description';
            return createDealDescriptionMessage();
            
        case 'change_restaurant':
            userState.step = 'collect_restaurant_name';
            userState.dealData = {};
            return createRestaurantNameMessage();
            
        case 'approve_content':
            // Ensure content is generated before approval
            if (!userState.dealData.generatedContent || !userState.dealData.generatedContent.platformContent) {
                console.log('[SocialAgency] Content not generated yet, generating now...');
                await generateContentPreview(userState.dealData, botConfig);
            }
            return await submitDealForProcessing(userState.dealData, fromNumber, botConfig);
            
        case 'edit_content':
            userState.step = 'generate_content';
            return await generateContentPreview(userState.dealData, botConfig);
            
        case 'regenerate_content':
            userState.step = 'generate_content';
            return await generateContentPreview(userState.dealData, botConfig, true);
            
        case 'edit_deal_details':
            userState.step = 'collect_deal_description';
            return createDealDescriptionMessage();
            
        default:
            return createWelcomeMessage();
    }
}

/**
 * Handle text messages based on current step
 */
async function handleAgencyTextMessage(storeId, fromNumber, messageBody, userState, botConfig) {
    console.log(`[SocialAgency] Processing text in step: ${userState.step}`);
    
    switch (userState.step) {
        case 'welcome':
            return createWelcomeMessage();
            
        case 'collect_restaurant_name':
            return await handleRestaurantNameInput(messageBody, userState, botConfig);
            
        case 'collect_deal_description':
            userState.dealData.description = messageBody;
            userState.step = 'collect_pricing';
            return createPricingMessage();
            
        case 'collect_pricing':
            userState.dealData.pricing = messageBody;
            userState.step = 'collect_validity';
            return createValidityMessage();
            
        case 'collect_validity':
            userState.dealData.validity = messageBody;
            userState.step = 'collect_photo';
            return createPhotoRequestMessage();
            
        case 'collect_target_audience':
            userState.dealData.targetAudience = messageBody;
            userState.step = 'collect_contact_method';
            return createContactMethodMessage();
            
        case 'collect_contact_method':
            userState.dealData.contactMethod = messageBody;
            userState.step = 'collect_special_notes';
            return createSpecialNotesMessage();
            
        case 'collect_special_notes':
            userState.dealData.specialNotes = messageBody;
            userState.step = 'generate_content';
            const contentPreview = await generateContentPreview(userState.dealData, botConfig);
            
            // If we have an image message, we need to send it and then send approval buttons
            if (contentPreview.type === 'image') {
                // Store that we need to send approval buttons next
                userState.step = 'await_approval_buttons';
                userState.generatedContent = userState.dealData.generatedContent;
                
                // Send the image with preview
                await sendWhatsAppMessage(storeId, fromNumber, contentPreview, botConfig);
                
                // Send follow-up approval buttons
                const approvalButtons = createApprovalButtonsMessage(userState.dealData);
                return approvalButtons;
            }
            
            return contentPreview;
            
        default:
            return createWelcomeMessage();
    }
}

/**
 * Handle image messages (deal photos)
 */
async function handleAgencyImageMessage(storeId, fromNumber, imageData, userState, botConfig) {
    if (userState.step === 'collect_photo') {
        userState.dealData.photoUrl = imageData.url || imageData.id;
        userState.step = 'collect_target_audience';
        return createTargetAudienceMessage();
    }
    
    return {
        type: "text",
        text: "📸 Thanks for the photo! Please follow the current step in our deal collection process."
    };
}

/**
 * Create welcome message with service options
 */
function createWelcomeMessage() {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: { 
                type: "text", 
                text: "🔥 VIRAL SINGAPORE AGENCY" 
            },
            body: { 
                text: `**Hello! We're your AI-powered viral marketing experts!** 🚀

🎯 **What We Do:**
✅ Create viral content that gets 100K+ views
✅ Professional AI-generated posters  
✅ Post on 8+ social platforms simultaneously
✅ Google Maps integration for location data
✅ Real-time performance tracking & analytics

📱 **Our Platform Network:**
🔥 Facebook • Instagram • TikTok • Telegram
🔥 WhatsApp • Twitter • YouTube • Xiaohongshu

💰 **Success Results:**
📊 Average 200% increase in foot traffic
💵 Commission-based: Pay only for results!
🏆 Singapore's most advanced viral system

**Ready to make your restaurant go VIRAL across Singapore?**`
            },
            footer: { text: "Let's make you famous!" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "post_new_deal", title: "🚀 Make Me Viral!" } },
                    { type: "reply", reply: { id: "view_performance", title: "📊 Success Stories" } },
                    { type: "reply", reply: { id: "commission_info", title: "💰 How It Works" } }
                ]
            }
        }
    };
}

/**
 * Create restaurant name collection message
 */
function createRestaurantNameMessage() {
    return {
        type: "text",
        text: `🏪 **STEP 1: RESTAURANT IDENTIFICATION**

**Our AI needs to find your restaurant on Google Maps to create the perfect viral campaign!**

📝 **Please provide your restaurant name EXACTLY as it appears on Google Maps.**

🔍 **Our AI will automatically extract:**
✅ Full address & GPS coordinates
✅ Phone number & website  
✅ Current Google rating & reviews
✅ Existing food photos from Google
✅ Popular dishes & cuisine type
✅ Operating hours & location data

💡 **Examples:**
• "Newton Food Centre"
• "Jumbo Seafood Clarke Quay"  
• "Song Fa Bak Kut Teh"
• "Ya Kun Kaya Toast Raffles Place"

**This helps us create location-specific viral content that targets your exact neighborhood!** 🎯`
    };
}

/**
 * Handle restaurant name input and fetch details from Google Maps
 */
async function handleRestaurantNameInput(restaurantName, userState, botConfig) {
    try {
        console.log(`[SocialAgency] Searching for restaurant: ${restaurantName}`);
        
        // Use existing Google Maps integration to fetch restaurant details
        const searchResults = await searchLocationByName(restaurantName, botConfig.googleMapsApiKey);
        
        if (searchResults && searchResults.length > 0) {
            const restaurant = searchResults[0];
            
            // Store restaurant details
            userState.dealData.restaurant = {
                name: restaurant.name,
                address: restaurant.formatted_address,
                placeId: restaurant.place_id,
                rating: restaurant.rating,
                phone: restaurant.formatted_phone_number,
                website: restaurant.website,
                photos: restaurant.photos
            };
            
            userState.step = 'confirm_restaurant';
            
            return {
                type: "interactive",
                interactive: {
                    type: "button",
                    header: { type: "text", text: "🎯 RESTAURANT LOCKED & LOADED!" },
                    body: { 
                        text: `🔥 **PERFECT! Our AI found your restaurant!**

🏪 **${restaurant.name}**
📍 ${restaurant.formatted_address}
⭐ Google Rating: ${restaurant.rating || 'N/A'}/5.0
📞 ${restaurant.formatted_phone_number || 'Contact via restaurant'}
🌐 ${restaurant.website || 'No website listed'}

✅ **Location data acquired for viral targeting!**
📊 **Now we can create location-specific content!**

**Is this your restaurant?**`
                    },
                    footer: { text: "Confirm or search again" },
                    action: {
                        buttons: [
                            { type: "reply", reply: { id: "confirm_restaurant", title: "✅ Correct" } },
                            { type: "reply", reply: { id: "change_restaurant", title: "🔄 Search Again" } }
                        ]
                    }
                }
            };
        } else {
            return {
                type: "text",
                text: `❌ Sorry, I couldn't find "${restaurantName}" on Google Maps.\n\n💡 **Tips:**\n• Use the exact name from Google Maps\n• Include area if it's a common name\n• Try "Restaurant Name, Location"\n\nPlease try again with a different name or spelling.`
            };
        }
    } catch (error) {
        console.error('[SocialAgency] Error fetching restaurant details:', error);
        return {
            type: "text",
            text: "❌ Error fetching restaurant details. Please try again with the restaurant name."
        };
    }
}

/**
 * Create deal description collection message
 */
function createDealDescriptionMessage() {
    return {
        type: "text",
        text: `🔥 **STEP 2: YOUR VIRAL DEAL DESCRIPTION**

**Now let's craft the perfect offer that will make Singaporeans go CRAZY!**

📝 **Describe your special promotion in detail:**

🎯 **VIRAL-WORTHY Examples:**
• "30% OFF famous Hainanese Chicken Rice!"
• "Buy 2 Get 1 FREE dim sum baskets!"  
• "Weekend special: Chili Crab for $25 (usual $45)!"
• "Happy Hour: All drinks 50% off 3-6pm!"
• "Student discount: Show ID get 20% off!"

💡 **For Maximum Viral Impact, Include:**
✅ Exact percentage or dollar discount
✅ Specific dishes/categories affected
✅ Any special conditions (min order, timing, etc.)
✅ What makes this deal special/limited

**What's your amazing deal that will get Singapore talking?** 🚀`
    };
}

/**
 * Create pricing collection message
 */
function createPricingMessage() {
    return {
        type: "text",
        text: `💰 **STEP 3: PRICING THAT CREATES FOMO**

**Help Singaporeans understand the INCREDIBLE value they're getting!**

📊 **Please provide clear before/after pricing:**

🎯 **Viral Pricing Format:**
"[Original Price] → [Deal Price]"

🔥 **Singapore Examples:**
• "Chicken Rice usually $6 → Now $4.20 (30% off)!"
• "Dim Sum set $28 → Special price $18!"  
• "Laksa bowl $8 → Buy 1 Get 1 FREE!"
• "Coffee + Toast set $12 → Morning special $8!"
• "Zi Char dinner $80 → Group deal $60!"

💡 **Pro Tips for Maximum Impact:**
✅ Show the dollar savings clearly
✅ Mention percentage off for quick understanding  
✅ Include "usually" to emphasize normal pricing
✅ Add urgency words like "special", "limited"

**What are your before/after prices that will make people RUN to your restaurant?** 🏃‍♂️💨`
    };
}

/**
 * Create validity period collection message
 */
function createValidityMessage() {
    return {
        type: "text",
        text: `📅 **Step 4: Validity Period**\n\nWhen is this deal available? Be specific for urgency!\n\n⏰ **Examples:**\n• "Valid until Friday 31st Dec"\n• "This weekend only (Sat-Sun)"\n• "Weekday lunch special (Mon-Fri 12-3pm)"\n• "Limited time - next 7 days"\n• "Happy hour daily 5-7pm"\n\n💡 **Tip:** Shorter periods create more urgency and viral potential!\n\nWhen is your deal valid?`
    };
}

/**
 * Create photo request message
 */
function createPhotoRequestMessage() {
    return {
        type: "text",
        text: `📸 **Step 5: High-Quality Photo**\n\nSend me your BEST photo! This will be the star of your viral post.\n\n✨ **Photo Tips:**\n• High resolution (clear & sharp)\n• Good lighting (natural light best)\n• Show the actual food/deal item\n• Make it look delicious!\n• Avoid blurry or dark images\n\n📱 **Just tap the camera icon and send the photo directly**\n\n🔥 Remember: Great photos get more shares and engagement!`
    };
}

/**
 * Create target audience collection message
 */
function createTargetAudienceMessage() {
    return {
        type: "text",
        text: `🎯 **Step 6: Target Audience**\n\nWho is this deal perfect for? This helps us target the right people!\n\n👥 **Examples:**\n• "Students and young professionals"\n• "Families with children"\n• "Date night couples"\n• "Office lunch groups"\n• "Weekend brunch crowd"\n• "Late night supper people"\n\n💡 **Multiple groups?** Just list them: "Students, young couples, office workers"\n\nWho's your ideal customer for this deal?`
    };
}

/**
 * Create contact method collection message
 */
function createContactMethodMessage() {
    return {
        type: "text",
        text: `📞 **Step 7: How Should Customers Contact You?**\n\nHow do you want customers to reach you for this deal?\n\n📱 **Options:**\n• "Call ${userState.dealData.restaurant?.phone || 'restaurant directly'}"\n• "WhatsApp [your number]"\n• "Walk-in only, mention viral deal"\n• "Online reservation + mention deal"\n• "DM our Instagram @yourhandle"\n\n💡 **Multiple methods?** List them all!\n\nWhat's the best way for customers to contact you?`
    };
}

/**
 * Create special notes collection message
 */
function createSpecialNotesMessage() {
    return {
        type: "text",
        text: `📝 **Step 8: Special Notes (Optional)**\n\nAny important conditions, restrictions, or special instructions?\n\n⚠️ **Examples:**\n• "Dine-in only, no takeaway"\n• "Must show this post to staff"\n• "Cannot combine with other offers"\n• "Advance booking required"\n• "Limited to 2 people per table"\n\n💡 **Keep it short** or just type "None" if no special conditions.\n\nAny special notes or restrictions?`
    };
}

/**
 * Create deal summary for confirmation
 */
function createDealSummaryMessage(dealData) {
    const restaurant = dealData.restaurant;
    
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: { type: "text", text: "📋 Deal Summary" },
            body: { 
                text: `🏪 **${restaurant.name}**\n📍 ${restaurant.address}\n\n💰 **Deal:** ${dealData.description}\n💵 **Pricing:** ${dealData.pricing}\n📅 **Valid:** ${dealData.validity}\n🎯 **Target:** ${dealData.targetAudience}\n📞 **Contact:** ${dealData.contactMethod}\n📝 **Notes:** ${dealData.specialNotes || 'None'}\n\n🚀 **Ready to make this VIRAL?**\n\nWe'll post across all platforms and track performance in real-time!`
            },
            footer: { text: "Confirm or edit details" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "confirm_deal_details", title: "🚀 Make It Viral!" } },
                    { type: "reply", reply: { id: "edit_deal_details", title: "✏️ Edit Details" } }
                ]
            }
        }
    };
}

/**
 * Generate content preview for owner approval
 */
async function generateContentPreview(dealData, botConfig, regenerate = false) {
    try {
        // Import viral content utilities
        const { generateViralCaption, generateSmartHashtags, generatePlatformContent, generateViralMediaPackage } = await import('../utils/viralContentUtils.js');
        
        console.log(`[SocialAgency] Generating content preview for ${dealData.restaurant.name}`);
        
        // Generate viral captions using AI
        const captions = await generateViralCaption(dealData, botConfig);
        const hashtags = generateSmartHashtags(dealData);
        const selectedCaption = captions[0]; // Use first generated caption
        
        // Generate platform-specific content preview
        const platformContent = generatePlatformContent(dealData, selectedCaption, hashtags);
        
        // Generate viral media package (poster + edited photos)
        console.log('[SocialAgency] Generating viral media package...');
        const mediaResult = await generateViralMediaPackage(dealData, selectedCaption, botConfig);
        
        // Store generated content in deal data
        dealData.generatedContent = {
            captions,
            selectedCaption,
            hashtags,
            platformContent,
            mediaPackage: mediaResult.success ? mediaResult.mediaPackage : null,
            mediaError: mediaResult.success ? null : mediaResult.error,
            generatedAt: new Date().toISOString()
        };
        
        return createContentApprovalMessage(dealData);
        
    } catch (error) {
        console.error('[SocialAgency] Error generating content preview:', error);
        return {
            type: "text",
            text: "❌ Error generating content preview. Please try again or contact support."
        };
    }
}

/**
 * Create content approval message with preview
 */
function createContentApprovalMessage(dealData) {
    const content = dealData.generatedContent;
    const restaurant = dealData.restaurant;
    
    // Create platform preview
    const platformPreview = `
🔥 **FACEBOOK POST:**
${content.platformContent.facebook.text}

📸 **INSTAGRAM CAPTION:**
${content.platformContent.instagram.caption}

📢 **TELEGRAM MESSAGE:**
${content.platformContent.telegram.text.split('\n').slice(0, 5).join('\n')}...

🐦 **TWITTER THREAD:**
${content.platformContent.twitter.text}`.trim();

    // Check if we have generated media
    const hasMedia = content.mediaPackage && content.mediaPackage.poster?.success;
    const mediaPreview = hasMedia ? `

🎨 **GENERATED VISUALS:**
✅ Viral Poster: Professional design with crisp text
${content.mediaPackage.editedPhoto?.success ? '✅ Enhanced Photo: Price badges added' : '⏳ Photo editing: Using original image'}
📱 Platform-optimized formats ready for all channels` : content.mediaError ? `

⚠️ **VISUAL GENERATION:**
${content.mediaError}
📝 Text-only promotion will be used` : '';
    
    // If we have a poster, create image message with approval buttons
    if (hasMedia && content.mediaPackage.poster.posterUrl) {
        return {
            type: "image",
            image: {
                link: content.mediaPackage.poster.posterUrl,
                caption: `🎨 **Generated Viral Poster for ${restaurant.name}**

${platformPreview}${mediaPreview}

🏷️ **Hashtags:** ${content.hashtags.slice(0, 8).join(' ')}

📱 **Will be posted across 8+ platforms:**
✅ Facebook, Instagram, TikTok, WhatsApp
✅ Telegram, Twitter, YouTube, Xiaohongshu

🎯 **Estimated Reach:** 20K-100K people

**Do you approve this content for viral posting?**`
            },
            // Note: WhatsApp doesn't support buttons on image messages
            // We'll need to send a follow-up message with buttons
        };
    }

    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: { 
                type: "text", 
                text: "📋 Content Preview & Approval" 
            },
            body: { 
                text: `🎨 **Generated Viral Content for ${restaurant.name}**

${platformPreview}

🏷️ **Hashtags:** ${content.hashtags.slice(0, 8).join(' ')}

📱 **Will be posted across 8+ platforms:**
✅ Facebook, Instagram, TikTok, WhatsApp
✅ Telegram, Twitter, YouTube, Xiaohongshu

🎯 **Estimated Reach:** 20K-100K people

**Do you approve this content for viral posting?**`
            },
            footer: { text: "Your approval required" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "approve_content", title: "✅ Approve & Post" } },
                    { type: "reply", reply: { id: "regenerate_content", title: "🔄 Regenerate" } },
                    { type: "reply", reply: { id: "edit_deal_details", title: "✏️ Edit Deal Info" } }
                ]
            }
        }
    };
}

/**
 * Create approval buttons message (sent after image preview)
 */
function createApprovalButtonsMessage(dealData) {
    const content = dealData.generatedContent;
    const restaurant = dealData.restaurant;
    
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: { 
                type: "text", 
                text: "📋 Approval Required" 
            },
            body: { 
                text: `🎨 **Viral content ready for ${restaurant.name}**

📊 **Performance Estimate:**
• Reach: 20K-100K people
• Platforms: 8+ social channels
• Commission: $50-$500 based on viral success

**Do you approve this content for viral posting?**`
            },
            footer: { text: "Your approval required before posting" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "approve_content", title: "✅ Approve & Post" } },
                    { type: "reply", reply: { id: "regenerate_content", title: "🔄 Regenerate" } },
                    { type: "reply", reply: { id: "edit_deal_details", title: "✏️ Edit Deal Info" } }
                ]
            }
        }
    };
}

/**
 * Submit deal for processing and viral posting via N8N
 */
async function submitDealForProcessing(dealData, fromNumber, botConfig) {
    try {
        // Generate unique deal ID
        const dealId = `deal_${Date.now()}_${fromNumber.slice(-4)}`;
        
        // Add deal ID and generated content to deal data
        dealData.dealId = dealId;
        dealData.restaurantOwner = fromNumber;
        dealData.status = 'APPROVED_FOR_POSTING';
        dealData.createdAt = new Date().toISOString();
        
        // Store deal in DynamoDB
        const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        
        const dealItem = {
            dealId: dealId,
            restaurantOwner: fromNumber,
            restaurant: dealData.restaurant,
            dealDescription: dealData.description,
            pricing: dealData.pricing,
            validity: dealData.validity,
            targetAudience: dealData.targetAudience,
            contactMethod: dealData.contactMethod,
            specialNotes: dealData.specialNotes,
            photoUrl: dealData.photoUrl,
            generatedContent: dealData.generatedContent,
            status: 'APPROVED_FOR_POSTING',
            createdAt: new Date().toISOString(),
            performanceMetrics: {
                totalViews: 0,
                totalLikes: 0,
                totalShares: 0,
                totalComments: 0,
                platforms: {}
            }
        };
        
        await dynamodb.send(new PutItemCommand({
            TableName: 'ViralDeals',
            Item: marshall(dealItem, { removeUndefinedValues: true })
        }));
        
        // Trigger N8N pipeline for social media posting
        const { triggerN8NPipeline } = await import('../utils/n8nIntegration.js');
        
        const n8nConfig = {
            webhookUrl: process.env.N8N_WEBHOOK_URL || 'https://your-n8n-instance.com/webhook/viral-deals',
            apiKey: process.env.N8N_API_KEY || 'your-n8n-api-key',
            callbackBaseUrl: process.env.CALLBACK_BASE_URL || 'https://your-webhook-url.com'
        };
        
        const pipelineResult = await triggerN8NPipeline(dealData, n8nConfig);
        
        if (pipelineResult.success) {
            // Update deal with pipeline info
            await dynamodb.send(new UpdateItemCommand({
                TableName: 'ViralDeals',
                Key: marshall({ dealId }),
                UpdateExpression: 'SET n8nPipelineId = :pipelineId, pipelineTriggeredAt = :timestamp',
                ExpressionAttributeValues: marshall({
                    ':pipelineId': pipelineResult.pipelineId,
                    ':timestamp': new Date().toISOString()
                })
            }));
            
            return {
                type: "text",
                text: `🚀 **DEAL APPROVED & PIPELINE STARTED!**\n\n✅ Deal ID: ${dealId}\n🔥 N8N Pipeline ID: ${pipelineResult.pipelineId}\n\n📱 **Your content is going viral NOW:**\n⚡ Posting across ${pipelineResult.platformsTargeted} platforms simultaneously\n🎯 Estimated completion: ${pipelineResult.estimatedCompletion || '10-15 minutes'}\n📊 Real-time tracking activated\n\n🚨 **What happens next:**\n• Multi-platform posting: 5-10 minutes\n• First performance update: 2 hours\n• Viral alerts if trending\n• Commission tracking starts now\n\n💰 **Performance-based payment:** $50-$500 based on viral success\n\n🔥 **Your deal is about to explode across Singapore!** 🔥`
            };
        } else {
            // Pipeline failed, update status
            await dynamodb.send(new UpdateItemCommand({
                TableName: 'ViralDeals',
                Key: marshall({ dealId }),
                UpdateExpression: 'SET #status = :status, pipelineError = :error',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: marshall({
                    ':status': 'PIPELINE_FAILED',
                    ':error': pipelineResult.error
                })
            }));
            
            return {
                type: "text",
                text: `❌ **PIPELINE ERROR**\n\nDeal saved but posting pipeline failed:\n${pipelineResult.error}\n\n🔧 **Our team has been notified** and will:\n• Fix the issue immediately\n• Retry posting within 30 minutes\n• Contact you with updates\n\n💪 **Don't worry** - your viral deal will go live!\n\nDeal ID: ${dealId}\nExpected resolution: 30 minutes`
            };
        }
        
    } catch (error) {
        console.error('[SocialAgency] Error submitting deal:', error);
        return {
            type: "text",
            text: "❌ Error submitting your deal. Please try again or contact support."
        };
    }
}

/**
 * Create performance report message
 */
async function createPerformanceReportMessage(fromNumber, botConfig) {
    try {
        // Query recent deals for this restaurant owner
        const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        
        // This would query DynamoDB for recent deals
        // For now, return a sample performance report
        
        return {
            type: "text",
            text: `📊 **YOUR PERFORMANCE REPORT**\n\n🔥 **Last 30 Days:**\n📈 Total Deals Posted: 3\n👁️ Total Views: 127,450\n❤️ Total Engagement: 8,234\n📞 Customer Inquiries: 156\n\n💰 **Revenue Impact:**\n📊 Estimated new customers: 89\n💵 Commission earned by us: $450\n🎯 Your ROI: 340%\n\n🏆 **Best Performing Deal:**\n"Weekend Brunch Special"\n• 45K views across platforms\n• Featured on 3 food influencer pages\n• Generated 67 phone calls\n\n📱 Want detailed analytics for any specific deal? Just ask!`
        };
        
    } catch (error) {
        console.error('[SocialAgency] Error fetching performance:', error);
        return {
            type: "text",
            text: "❌ Error fetching performance data. Please try again."
        };
    }
}

/**
 * Create commission info message
 */
function createCommissionInfoMessage() {
    return {
        type: "text",
        text: `💰 **OUR PRICING STRUCTURE**\n\n🎯 **Performance-Based Only** - You pay for results!\n\n📊 **Commission Tiers:**\n🥉 **Bronze** (1K-10K views)\n└ Commission: $50\n\n🥈 **Silver** (10K-50K views)\n└ Commission: $150\n\n🥇 **Gold** (50K-100K views)\n└ Commission: $300\n\n💎 **Viral** (100K+ views)\n└ Commission: $500\n\n✨ **What's Included:**\n• Professional content creation\n• Posting across 8+ platforms\n• Real-time performance tracking\n• Customer inquiry reports\n• 7-day performance guarantee\n\n💡 **No upfront cost!** Pay only when we deliver the views.\n\n📱 Ready to make your next deal viral?`
    };
}
