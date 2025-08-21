// LobangLah WhatsApp Deals Bot Handler
import { searchDealsWithOpenAI, createWelcomeMessage, createLocationMessage, saveUserProfile, getUserProfile, searchMoreDealsFromDynamoDB, createInteractiveSearchingMessage, getSharedDealIds, addSharedDealIds } from '../utils/dealsUtils.js';
import { createCatalogDealsMessage, cleanupOldDealsFromCatalog } from '../utils/catalogUtils.js';
// Removed verifyDealsWithDeepSeek import as DeepSeek verification is now skipped
import { enhanceDealsWithPhotos, createEnhancedDealMessages } from '../utils/enhancedDealUtils.js';
import { resolveLocationAndWeather, searchNearbyPlaces } from '../utils/googleLocationUtils.js';
import { sendWhatsAppMessage } from '../utils/whatsappUtils.js';
import { generateAndSendSticker } from '../utils/stickerUtils.js';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import OpenAI from 'openai';
import { getSingaporeErrorMessage, getSingaporeSuccessMessage, getWeatherBasedRecommendations, singaporeSlang, generateAISingaporeContent } from '../utils/singaporeFeatures.js';
import { searchLocationByName, getLocationDetails, enhanceLocationSearchWithAI, createLocationSearchMessage, createLocationSearchPrompt, createPopularLocationsMessage } from '../utils/locationSearchUtils.js';
import { getRestaurantMenu, createMenuMessage } from '../utils/googleMenuUtils.js';
import { createIndividualDealMessages, createTopDealsMessage, createNavigationOptionsMessage, createContactUsMessage, createWhatElseMessage, createMenuRequestMessage, handleMenuButtonClick } from '../utils/dealNavigationUtils.js';
import { createDailyAlert, getUserAlerts, createAlertSetupMessage, createAlertTimeSelectionMessage, createAlertConfirmationMessage, createAlertManagementMessage, deactivateAlert } from '../utils/alertUtils.js';

// In-memory user state management (for conversation flow)
const userStates = new Map();

/**
 * Generate AI chat response about deals using OpenAI with full conversation history
 */
async function generateChatResponse(userQuestion, chatContext, botConfig, conversationHistory = []) {
    try {
        // Use the same API key retrieval pattern as webhook.js
        const openAIApiKey = botConfig?.openAiApiKey || botConfig?.openAIApiKey || botConfig?.openai_api_key || process.env.OPENAI_API_KEY;
        
        console.log('[LobangLah] generateChatResponse - API key check:', {
            openAiApiKey: botConfig?.openAiApiKey ? 'EXISTS' : 'MISSING',
            openAIApiKey: botConfig?.openAIApiKey ? 'EXISTS' : 'MISSING',
            openai_api_key: botConfig?.openai_api_key ? 'EXISTS' : 'MISSING',
            envKey: process.env.OPENAI_API_KEY ? 'EXISTS' : 'MISSING',
            finalKey: openAIApiKey ? 'FOUND' : 'NOT_FOUND'
        });
        
        if (!openAIApiKey) {
            console.error('[LobangLah] No OpenAI API key found in botConfig or environment variables');
            console.error('[LobangLah] botConfig structure:', JSON.stringify(botConfig, null, 2));
            throw new Error('OpenAI API key not configured');
        }
        
        console.log('[LobangLah] OpenAI API key found successfully');
        console.log('[LobangLah] API key length:', openAIApiKey?.length || 0);
        
        const openai = new OpenAI({
            apiKey: openAIApiKey
        });
        
        // Format deals information for AI context
        const dealsInfo = chatContext.deals.map((deal, index) => {
            const businessName = deal.businessName || deal.restaurant || deal.store || deal.title;
            const offer = deal.offer || deal.discount || 'Special Deal';
            const address = deal.address || deal.location || 'Address not available';
            const validity = deal.validity || 'Limited time';
            const description = deal.description || '';
            
            return `${index + 1}. ${businessName}\n   Offer: ${offer}\n   Location: ${address}\n   Validity: ${validity}\n   Description: ${description}`;
        }).join('\n\n');
        
        // Format conversation history for context
        const recentConversation = conversationHistory.slice(-10).map(msg => {
            return `${msg.role === 'user' ? 'User' : 'Bot'}: ${msg.content}`;
        }).join('\n');
        
        const systemPrompt = `You are a helpful AI assistant for LobangLah, a Singapore deals bot. You are chatting with a user about ${chatContext.category} deals near ${chatContext.location}.

Here are the ${chatContext.deals.length} deals I just showed the user:

${dealsInfo}

Recent conversation context:
${recentConversation}

Please answer the user's question about these deals in a helpful, friendly, and personalized way based on our conversation history. Focus only on the deals listed above. Use emojis to make your response engaging. Keep responses under 500 characters to fit WhatsApp limits.

If the user asks about:
- Best value: Compare offers and recommend based on savings
- Closest location: Recommend based on addresses shown
- Specific business: Provide details about that business
- Family-friendly: Consider meal sizes, variety, etc.
- Recommendations: Give personalized suggestions based on conversation
- Previous questions: Reference what we discussed before

Always end with a helpful suggestion like asking if they want directions or more details about a specific deal.`;
        
        // Build messages array with conversation history
        const messages = [
            { role: "system", content: systemPrompt }
        ];
        
        // Add recent conversation history (last 5 exchanges)
        const recentMessages = conversationHistory.slice(-10).filter(msg => 
            msg.role === 'user' && !msg.content.includes('[Selected:') && !msg.content.includes('[Shared location:')
        );
        
        recentMessages.forEach(msg => {
            messages.push({ role: msg.role, content: msg.content });
        });
        
        // Add current user question
        messages.push({ role: "user", content: userQuestion });
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            max_tokens: 200,
            temperature: 0.7
        });
        
        let response = completion.choices[0]?.message?.content || "I'm not sure how to help with that. Could you ask about a specific deal?";
        
        // Ensure response fits WhatsApp limits
        if (response.length > 500) {
            response = response.substring(0, 497) + '...';
        }
        
        return `🤖 ${response}\n\n💡 Ask me more about these deals or share a new location to search elsewhere!`;
        
    } catch (error) {
        console.error('[LobangLah] Error generating chat response:', error);
        return `🤖 Sorry, I had trouble processing your question about ${chatContext.category} deals near ${chatContext.location}.\n\n💬 Please try asking in a simpler way, like:\n• "Which is the best deal?"\n• "Tell me about deal #1"\n• "What's the cheapest option?"\n\n🎯 I'm here to help with your ${chatContext.category} deals!`;
    }
}

/**
 * Get session from DynamoDB
 */
async function getSession(storeId, userId) {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
    const sessionId = `${storeId}-${userId}`;
    
    let tableName = 'LobangLahUsers';
    
    try {
        let params = {
            TableName: tableName,
            Key: marshall({ phone_number: userId }, { removeUndefinedValues: true })
        };
        
        let result;
        try {
            result = await client.send(new GetItemCommand(params));
        } catch (permissionError) {
            if (permissionError.name === 'AccessDeniedException') {
                console.log(`[LobangLah] LobangLahUsers access denied, falling back to SESSION_TABLE_NAME`);
                tableName = process.env.SESSION_TABLE_NAME || `store-ai-bot-dev-sessions`;
                params = {
                    TableName: tableName,
                    Key: marshall({ sessionId }, { removeUndefinedValues: true })
                };
                result = await client.send(new GetItemCommand(params));
            } else {
                throw permissionError;
            }
        }
        
        if (result && result.Item) {
            const session = unmarshall(result.Item);
            return {
                conversation: session.conversation || [],
                sentMessages: session.sentMessages || [],
                lastInteraction: session.lastInteraction || 'lobanglah_deals',
                timestamp: session.timestamp || Date.now(),
                userState: session.userState || {},
                sharedDealIds: session.sharedDealIds || []
            };
        } else {
            console.log(`[LobangLah] No session found for ${userId}, creating new session`);
            return { conversation: [], sentMessages: [], userState: {}, sharedDealIds: [] };
        }
    } catch (error) {
        console.error(`[LobangLah] Error getting session:`, error);
        return { conversation: [], sentMessages: [], userState: {}, sharedDealIds: [] };
    }
}

/**
 * Update session in DynamoDB
 */
async function updateSession(storeId, userId, session) {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
    const sessionId = `${storeId}-${userId}`;
    const ttl = Math.floor(Date.now() / 1000) + (parseInt(process.env.SESSION_TTL_HOURS || '24', 10) * 60 * 60);
    
    let tableName = 'LobangLahUsers';
    
    // Limit conversation history to last 20 messages
    if (session.conversation && session.conversation.length > 20) {
        session.conversation = session.conversation.slice(-20);
    }
    
    // Limit sent messages to last 50 messages
    if (session.sentMessages && session.sentMessages.length > 50) {
        session.sentMessages = session.sentMessages.slice(-50);
    }
    
    // Limit shared deal IDs to last 200 deals (prevent unlimited growth)
    if (session.sharedDealIds && session.sharedDealIds.length > 200) {
        session.sharedDealIds = session.sharedDealIds.slice(-200);
    }
    
    try {
        // Clean up undefined values from session data
        const cleanUserState = session.userState ? JSON.parse(JSON.stringify(session.userState)) : {};
        const cleanConversation = session.conversation ? session.conversation.filter(msg => msg && msg.role && msg.content) : [];
        const cleanSentMessages = session.sentMessages ? session.sentMessages.filter(msg => msg) : [];
        const cleanSharedDealIds = session.sharedDealIds ? session.sharedDealIds.filter(dealId => dealId) : [];
        
        const itemToPut = {
            phone_number: userId,
            sessionId: sessionId,
            conversation: cleanConversation,
            sentMessages: cleanSentMessages,
            lastInteraction: session.lastInteraction || 'lobanglah_deals',
            timestamp: session.timestamp || Date.now(),
            userState: cleanUserState,
            sharedDealIds: cleanSharedDealIds,
            ttl: ttl
        };
        
        let params = {
            TableName: tableName,
            Item: marshall(itemToPut, { removeUndefinedValues: true })
        };
        
        try {
            await client.send(new PutItemCommand(params));
            console.log(`[LobangLah] Session updated for ${userId} in ${tableName}`);
        } catch (permissionError) {
            if (permissionError.name === 'AccessDeniedException') {
                console.log(`[LobangLah] LobangLahUsers write access denied, falling back to SESSION_TABLE_NAME`);
                tableName = process.env.SESSION_TABLE_NAME || `store-ai-bot-dev-sessions`;
                
                // For fallback table, use sessionId as key instead of phone_number
                const fallbackItem = {
                    sessionId: sessionId,
                    conversation: cleanConversation,
                    sentMessages: cleanSentMessages,
                    lastInteraction: session.lastInteraction || 'lobanglah_deals',
                    timestamp: session.timestamp || Date.now(),
                    userState: cleanUserState,
                    sharedDealIds: cleanSharedDealIds,
                    ttl: ttl
                };
                
                params = {
                    TableName: tableName,
                    Item: marshall(fallbackItem, { removeUndefinedValues: true })
                };
                await client.send(new PutItemCommand(params));
                console.log(`[LobangLah] Session updated for ${userId} in fallback table ${tableName}`);
            } else {
                throw permissionError;
            }
        }
    } catch (error) {
        console.error(`[LobangLah] Error updating session:`, error);
    }
}

/**
 * Send WhatsApp message with deduplication
 */
async function sendLobangLahMessage(storeId, fromNumber, message, botConfig, session) {
    try {
        // Send the message using the imported function
        await sendWhatsAppMessage(storeId, fromNumber, message, botConfig);
        
        // Track the sent message in session
        const messageRecord = {
            hash: JSON.stringify(message),
            timestamp: Date.now(),
            type: message.type
        };
        
        if (!session.sentMessages) {
            session.sentMessages = [];
        }
        session.sentMessages.push(messageRecord);
        
        // Add to conversation history
        if (!session.conversation) {
            session.conversation = [];
        }
        
        if (message.type === 'text') {
            session.conversation.push({ role: 'assistant', content: message.text.body });
        } else if (message.type === 'interactive') {
            session.conversation.push({ role: 'assistant', content: `[Sent interactive message: ${message.interactive.body?.text || 'Interactive message'}]` });
        }
        
        console.log(`[LobangLah] Message sent and tracked for ${fromNumber}`);
        // Message sent successfully - no return value needed
    } catch (error) {
        console.error(`[LobangLah] Error sending message:`, error);
        // Error occurred - no return value needed
    }
}

/**
 * Search and send more deals using dealId tracking for deduplication
 */
async function searchAndSendMoreDeals(fromNumber, userState, botConfig, session) {
    try {
        const sharedDealIds = getSharedDealIds(session);
        console.log(`[LobangLah] Searching for more ${userState.category} deals, excluding ${sharedDealIds.length} previously shared dealIds`);
        
        // Send immediate acknowledgment
        const acknowledgmentMessage = {
            type: "text",
            text: {
                body: "🔍 Searching for more amazing deals... This may take a moment! ⏳"
            }
        };
        
        await sendWhatsAppMessage(userState.storeId, fromNumber, acknowledgmentMessage, botConfig);
        
        // Search for new deals using dealId-based deduplication
        const deals = await searchMoreDealsFromDynamoDB(
            userState.location,
            userState.category,
            sharedDealIds, // Pass shared dealIds for exclusion
            5 // maxResults
        );
        
        if (deals && deals.length > 0) {
            // Track these new deals as shared using dealId
            addSharedDealIds(session, deals);
            
            // Store deals in user state for chat context
            userState.lastDeals = deals;
            userState.step = 'deals_shown';
            
            // Save user state to session for persistence
            session.userState = userState;
            session.lastInteraction = 'deals_shown';
            session.timestamp = Date.now();
            
            console.log(`[LobangLah] Saving session with user state:`, {
                hasLastDeals: !!session.userState.lastDeals,
                dealsCount: session.userState.lastDeals?.length || 0,
                hasLocation: !!session.userState.location,
                hasCategory: !!session.userState.category,
                step: session.userState.step,
                sharedDealIdsCount: session.sharedDealIds?.length || 0
            });
            
            // Update session in DynamoDB
            await updateSession(userState.storeId, fromNumber, session);
            
            // Send catalog-based product list message (single message with all deals)
            const catalogMessages = await createCatalogDealsMessage(deals, userState.category, botConfig);
            for (const catalogMessage of catalogMessages) {
                await sendWhatsAppMessage(userState.storeId, fromNumber, catalogMessage, botConfig);
            }
            
            
            // Optional: Clean up old deals from catalog to prevent clutter
            cleanupOldDealsFromCatalog(botConfig).catch(error => {
                console.warn('[LobangLah] Catalog cleanup failed:', error);
            });
            
            console.log(`[LobangLah] Successfully sent ${catalogMessages.length} catalog deal messages and saved session`);
            return null; // Return null since we've sent multiple messages
        } else {
            console.log(`[LobangLah] No new deals found`);
            return {
                type: "text",
                text: {
                    body: "😅 Sorry, I couldn't find any new deals at the moment. You've already seen all the best deals available!\n\n💡 Try searching in a different category or check back later for fresh deals!"
                }
            };
        }
    } catch (error) {
        console.error(`[LobangLah] Error searching for more deals:`, error);
        return {
            type: "text",
            text: {
                body: "😅 Sorry, I had trouble finding more deals. Please try again in a moment!"
            }
        };
    }
}

/**
 * Check if a message should trigger LobangLah
 * For LobangLah store, always return true (acts as deals provider for any message)
 */
export function isLobangLahMessage() {
    // Always trigger for LobangLah store - acts as deals provider by default
    return true;
}

/**
 * Main LobangLah message handler
 */
export async function handleLobangLahMessage(storeId, fromNumber, messageBody, messageType, botConfig, interactiveData = null, locationData = null) {
    console.log(`[LobangLah] Handling message from ${fromNumber}, type: ${messageType}, store: ${storeId}`);
    
    try {
        // Get session from DynamoDB for chat history and deduplication
        const session = await getSession(storeId, fromNumber);
        
        // Initialize shown deals tracking if not exists
        if (!session.shownDeals) {
            session.shownDeals = [];
        }
        
        // Add user message to conversation history
        if (messageType === 'text' && messageBody) {
            session.conversation.push({ role: 'user', content: messageBody });
        } else if (messageType === 'interactive' && interactiveData) {
            const actionId = interactiveData.button_reply?.id || interactiveData.list_reply?.id;
            session.conversation.push({ role: 'user', content: `[Selected: ${actionId}]` });
        } else if (messageType === 'location' && locationData) {
            session.conversation.push({ role: 'user', content: `[Shared location: ${locationData.latitude}, ${locationData.longitude}]` });
        }
        
        // Get or initialize user state (restore from persistent session if available)
        let userState = userStates.get(fromNumber) || session.userState || {
            step: 'welcome',
            category: null,
            location: null,
            lastSearchLocation: null,
            lastDeals: null,
            chatContext: null,
            selectedDeal: null
        };
        
        // If we restored from session, update user state
        if (session.userState && !userStates.has(fromNumber)) {
            console.log(`[LobangLah] Restored user state from session for ${fromNumber}:`, {
                step: userState.step,
                category: userState.category,
                location: userState.location,
                locationName: userState.location?.name || userState.location?.description || userState.location?.displayName,
                hasDeals: !!userState.lastDeals,
                dealsCount: userState.lastDeals?.length || 0,
                hasChatContext: !!userState.chatContext
            });
            userStates.set(fromNumber, userState);
        }
        
        // Additional debugging for location issues
        console.log(`[LobangLah] Current user state for ${fromNumber}:`, {
            step: userState.step,
            category: userState.category,
            hasLocation: !!userState.location,
            locationData: userState.location,
            hasDeals: !!userState.lastDeals,
            dealsCount: userState.lastDeals?.length || 0
        });

        let response;

        // Handle different message types
        if (messageType === 'interactive' && interactiveData) {
            response = await handleInteractiveMessage(storeId, fromNumber, interactiveData, userState, botConfig, session);
        } else if (messageType === 'location' && locationData) {
            response = await handleLocationMessage(storeId, fromNumber, locationData, userState, botConfig, session);
        } else if (messageType === 'text') {
            response = await handleTextMessage(storeId, fromNumber, messageBody, userState, botConfig, session);
        }

        // Update user state in memory
        userStates.set(fromNumber, userState);
        
        // Save user state to persistent session for context preservation
        session.userState = {
            step: userState.step,
            category: userState.category,
            location: userState.location,
            lastSearchLocation: userState.lastSearchLocation,
            lastDeals: userState.lastDeals,
            chatContext: userState.chatContext,
            selectedDeal: userState.selectedDeal
        };

        // Update session timestamp and save to DynamoDB with user state
        session.lastInteraction = 'lobanglah_deals';
        session.timestamp = Date.now();
        await updateSession(storeId, fromNumber, session);

        // Handle array of messages (individual deal messages)
        if (Array.isArray(response)) {
            console.log(`[LobangLah] Sending ${response.length} individual messages`);
            for (const message of response) {
                await sendLobangLahMessage(storeId, fromNumber, message, botConfig, session);
            }
            return response; // Return the array for testing
        }

        // Handle single message
        if (response) {
            console.log(`[LobangLah] Sending single message`);
            await sendLobangLahMessage(storeId, fromNumber, response, botConfig, session);
        }

        console.log(`[LobangLah] Successfully processed message from ${fromNumber}`);
        return response; // Return the actual response

    } catch (error) {
        console.error(`[LobangLah] Error handling message from ${fromNumber}:`, error);
        
        // Send error message to user
        await sendWhatsAppMessage(storeId, fromNumber, {
            type: "text",
            text: { body: "Sorry, I encountered an error. Please try again! 😅" }
        }, botConfig);
        
        return false;
    }
}

/**
 * Create consistent, high-quality welcome message (no OpenAI generation to avoid changes)
 */
function createConsistentWelcomeMessage(userMessage) {
    // Personalize greeting based on user message
    let personalizedGreeting = "Hi there! 👋";
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
        personalizedGreeting = "Hello! Great to meet you! 👋";
    } else if (lowerMessage.includes('good morning')) {
        personalizedGreeting = "Good morning! Hope you're having a wonderful day! 🌅";
    } else if (lowerMessage.includes('good afternoon')) {
        personalizedGreeting = "Good afternoon! Perfect timing for some deal hunting! ☀️";
    } else if (lowerMessage.includes('good evening')) {
        personalizedGreeting = "Good evening! Let's find you some amazing deals! 🌆";
    } else if (lowerMessage.includes('help')) {
        personalizedGreeting = "I'm here to help you find the best deals! 🤝";
    }
    
    const welcomeText = `${personalizedGreeting}\n\nI'm your personal AI deal hunter from **LobangLah** - Singapore's smartest deal discovery platform! 🤖\n\n🎯 **What I offer:**\n• AI-powered search across thousands of deals\n• Real-time weather + hourly forecasts\n• Location-based recommendations\n• Food, fashion, groceries & more!\n\n📍 **Ready to start saving?** Share your location and I'll find amazing deals nearby with today's weather forecast!`;
    
    console.log(`[LobangLah] Using consistent welcome message with personalized greeting`);
    
    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            header: {
                type: 'text',
                text: '🎯 Welcome to LobangLah!'
            },
            body: {
                text: welcomeText
            },
            footer: {
                text: '🚀 Singapore\'s Smartest Deal Discovery Platform'
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: 'share_location_prompt',
                            title: '📍 Share Location'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'how_it_works',
                            title: '❓ How It Works'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'about_lobangLah',
                            title: '🎯 About Us'
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Create interactive welcome message without OpenAI (fallback)
 */
function createInteractiveWelcomeMessage(userMessage) {
    // Personalize based on common greetings
    let personalizedGreeting = "Hi there! 👋";
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
        personalizedGreeting = "Hello! Great to meet you! 👋";
    } else if (lowerMessage.includes('good morning')) {
        personalizedGreeting = "Good morning! Hope you're having a wonderful day! 🌅";
    } else if (lowerMessage.includes('good afternoon')) {
        personalizedGreeting = "Good afternoon! Perfect timing for some deal hunting! ☀️";
    } else if (lowerMessage.includes('good evening')) {
        personalizedGreeting = "Good evening! Let's find you some amazing deals! 🌆";
    } else if (lowerMessage.includes('help')) {
        personalizedGreeting = "I'm here to help you find the best deals! 🤝";
    }
    
    const welcomeText = `${personalizedGreeting}\n\nI'm your personal AI deal hunter from **LobangLah** - Singapore's smartest deal discovery platform! 🤖\n\n🎯 **What I offer:**\n• AI-powered search across thousands of deals\n• Real-time weather + hourly forecasts for today\n• Location-based recommendations\n• Food, fashion, groceries & more!\n\n📍 **Ready to start saving?** Share your location and I'll find amazing deals nearby with today's weather forecast!`;
    
    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            header: {
                type: 'text',
                text: '🎯 Welcome to LobangLah!'
            },
            body: {
                text: welcomeText
            },
            footer: {
                text: '🚀 Singapore\'s Smartest Deal Discovery Platform'
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: 'share_location_prompt',
                            title: '📍 Share'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'search_location_prompt',
                            title: '🔍 Search by Name'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'popular_places',
                            title: '🏢 Popular Places'
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Handle interactive messages (button/list selections)
 */
async function handleInteractiveMessage(storeId, fromNumber, interactiveData, userState, botConfig, session) {
    const actionId = interactiveData.button_reply?.id || interactiveData.list_reply?.id;
    console.log(`[LobangLah] Processing interactive action: ${actionId}`);
    
    // Add user interaction to conversation history
    session.conversation.push({ role: 'user', content: `Selected: ${actionId}` });
    
    // Handle location sharing prompt
    if (actionId === 'share_location_prompt') {
        console.log(`[LobangLah] User clicked share location from welcome message`);
        return {
            type: "text",
            text: {
                body: "📍 Please share your location to find amazing deals near you!"
            }
        };
    }
    
    // Handle how it works
    if (actionId === 'how_it_works') {
        return {
            type: "text",
            text: {
                body: "🤖 **How LobangLah Works:**\n\n1️⃣ **Share Location** - Tell us where you are\n2️⃣ **Choose Category** - Food, fashion, events, etc.\n3️⃣ **Get Deals** - AI finds the best deals nearby\n4️⃣ **Chat & Explore** - Ask questions about deals\n\n🎯 **Smart Features:**\n• Real-time weather integration\n• Location-based recommendations\n• Deal deduplication (no repeats!)\n• Interactive catalog messages\n\n📍 Ready to start? Share your location!"
            }
        };
    }
    
    // Handle about us
    if (actionId === 'about_lobangLah') {
        return {
            type: "text",
            text: {
                body: "🎯 **About LobangLah:**\n\nWe're Singapore's smartest deal discovery platform! 🤖\n\n**What makes us special:**\n• AI-powered deal search\n• Real-time location & weather\n• Restaurant deduplication\n• Interactive WhatsApp experience\n\n💡 **Lobang** = Singaporean slang for 'good deal'\n\n📍 Let's find you some amazing lobangs!"
            }
        };
    }
    
    // Handle search location prompt
    if (actionId === 'search_location_prompt') {
        userState.step = 'waiting_for_location_name';
        return {
            type: "text",
            text: {
                body: "🔍 **Search by Location Name**\n\nType the name of any Singapore location:\n\n📍 Examples:\n• Orchard Road\n• Marina Bay Sands\n• Bugis Junction\n• Tampines Mall\n• Jurong Point\n\n🌍 **Singapore locations only**"
            }
        };
    }
    
    // Handle popular places
    if (actionId === 'popular_places') {
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: "🏢 Popular Singapore Locations"
                },
                body: {
                    text: "Choose a popular location to find deals:"
                },
                footer: {
                    text: "Select your preferred area"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "popular_orchard_road",
                                title: "🛍️ Orchard Road"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "popular_marina_bay",
                                title: "🌆 Marina Bay"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "popular_bugis",
                                title: "🏪 Bugis"
                            }
                        }
                    ]
                }
            }
        };
    }
    
    // Handle popular location selections
    if (actionId.startsWith('popular_')) {
        const locationName = actionId.replace('popular_', '').replace(/_/g, ' ');
        console.log(`[LobangLah] User selected popular location: ${locationName}`);
        
        // Search for this popular location
        const googleMapsApiKey = botConfig?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
        if (!googleMapsApiKey) {
            console.log(`[LobangLah] No Google Maps API key found for popular location: ${locationName}`);
            return {
                type: "text",
                text: {
                    body: "❌ Sorry lah! Location service not available. Please try sharing your GPS location instead."
                }
            };
        }
        
        console.log(`[LobangLah] Enhancing location name with AI: ${locationName}`);
        // Enhance the location name with AI
        const enhancedLocationName = await enhanceLocationSearchWithAI(locationName, botConfig);
        console.log(`[LobangLah] Enhanced location name: ${enhancedLocationName}`);
        
        console.log(`[LobangLah] Searching for location: ${enhancedLocationName}`);
        const suggestions = await searchLocationByName(enhancedLocationName, googleMapsApiKey, botConfig);
        console.log(`[LobangLah] Found ${suggestions.length} suggestions for ${enhancedLocationName}`);
        
        if (suggestions.length === 0) {
            console.log(`[LobangLah] No suggestions found for popular location: ${locationName}`);
            return {
                type: "text",
                text: {
                    body: `❌ Sorry lah! Couldn't find "${locationName}" in Singapore. Please try another location or share your GPS location.`
                }
            };
        }
        
        // Use the first suggestion
        const selectedSuggestion = suggestions[0];
        console.log(`[LobangLah] Selected suggestion: ${selectedSuggestion.description}`);
        
        console.log(`[LobangLah] Getting location details for placeId: ${selectedSuggestion.placeId}`);
        const locationDetails = await getLocationDetails(selectedSuggestion.placeId, googleMapsApiKey);
        
        if (!locationDetails) {
            console.log(`[LobangLah] No location details found for placeId: ${selectedSuggestion.placeId}`);
            return {
                type: "text",
                text: {
                    body: "❌ Sorry lah! Couldn't get location details. Please try again or share your GPS location."
                }
            };
        }
        
        console.log(`[LobangLah] Location details found: ${locationDetails.name}`);
        
        // Store location in user state
        userState.location = {
            type: 'popular_selected',
            placeId: locationDetails.placeId,
            displayName: locationDetails.name,
            formattedAddress: locationDetails.formattedAddress,
            latitude: locationDetails.latitude,
            longitude: locationDetails.longitude,
            area: locationDetails.area,
            source: 'popular_location'
        };
        userState.step = 'location_confirmed';
        
        console.log(`[LobangLah] Creating consolidated message for popular location`);
        // Create a more interactive message with location confirmation and category selection
        const consolidatedMessage = {
            type: 'interactive',
            interactive: {
                type: 'button',
                header: {
                    type: 'text',
                    text: `📍 ${locationDetails.name}`
                },
                body: {
                    text: `🎉 Great choice! I found ${locationDetails.name} in ${locationDetails.area || 'Singapore'}.\n\nWhat kind of amazing deals should I find for you today?`
                },
                footer: {
                    text: 'Choose your deal category'
                },
                action: {
                    buttons: [
                        {
                            type: 'reply',
                            reply: {
                                id: 'search_food_deals',
                                title: '🍽️ Food & Dining'
                            }
                        },
                        {
                            type: 'reply',
                            reply: {
                                id: 'search_events_deals',
                                title: '🎉 Events'
                            }
                        },
                        {
                            type: 'reply',
                            reply: {
                                id: 'search_fashion_deals',
                                title: '👗 Fashion'
                            }
                        }
                    ]
                }
            }
        };
        
        // Save session
        session.userState = userState;
        session.lastInteraction = 'location_confirmed';
        session.timestamp = Date.now();
        await updateSession(storeId, fromNumber, session);
        
        return consolidatedMessage;
    }
    
    // Handle deal category selections
    if (actionId.startsWith('search_') && actionId.endsWith('_deals')) {
        const category = actionId.replace('search_', '').replace('_deals', '');
        console.log(`[LobangLah] User selected category: ${category}`);
        
        if (!userState.location) {
            return {
                type: "text",
                text: {
                    body: "❌ Please share your location first to find deals near you!"
                }
            };
        }
        
        userState.category = category;
        userState.step = 'searching_deals';
        
        // Save session
        session.userState = userState;
        session.lastInteraction = 'category_selected';
        session.timestamp = Date.now();
        await updateSession(storeId, fromNumber, session);
        
        // Search and send deals
        return await searchAndSendDeals(storeId, fromNumber, userState, botConfig, session);
    }
    
    // Handle more deals request
    if (actionId === 'more_deals') {
        console.log(`[LobangLah] User requested more deals`);
        return await searchAndSendMoreDeals(fromNumber, userState, botConfig, session);
    }
    
    // Handle chat AI button
    if (actionId === 'chat_ai') {
        console.log(`[LobangLah] User clicked Chat AI button`);
        
        if (!userState.lastDeals || userState.lastDeals.length === 0) {
            return {
                type: "text",
                text: {
                    body: "❌ No deals available to chat about. Please search for deals first!"
                }
            };
        }
        
        userState.step = 'chat_mode';
        userState.chatContext = {
            deals: userState.lastDeals,
            location: userState.location.displayName || userState.location.name || 'your location',
            category: userState.category
        };
        userState.chatStartTime = Date.now();
        userState.chatInteractionCount = 0;
        
        // Save session
        session.userState = userState;
        session.lastInteraction = 'chat_mode_started';
        session.timestamp = Date.now();
        await updateSession(storeId, fromNumber, session);
        
        return {
            type: "text",
            text: {
                body: `🤖 **Chat AI Mode Activated!**\n\nI'm ready to help you with your ${userState.category} deals near ${userState.chatContext.location}!\n\n💬 **Ask me anything:**\n• "Which deal is best value?"\n• "Tell me about the first deal"\n• "What's closest to me?"\n• "Show me directions"\n• "More deals please"\n\n🎯 I'll help you make the best choice!\n\n💡 Type "exit chat" to end chat mode.`
            }
        };
    }
    
    // Handle setup daily alert button
    if (actionId === 'setup_alert') {
        console.log(`[LobangLah] User clicked setup alert button`);
        
        if (!userState.location || !userState.category) {
            return {
                type: "text",
                text: {
                    body: "❌ Please search for deals first to set up daily alerts!"
                }
            };
        }
        
        userState.step = 'alert_setup';
        
        // Save session
        session.userState = userState;
        session.lastInteraction = 'alert_setup_started';
        session.timestamp = Date.now();
        await updateSession(storeId, fromNumber, session);
        
        return createAlertSetupMessage();
    }
    
    // Handle alert time selection
    if (actionId.startsWith('alert_time_')) {
        const time = actionId.replace('alert_time_', '');
        console.log(`[LobangLah] User selected alert time: ${time}`);
        
        userState.preferredTime = time;
        userState.step = 'alert_confirmation';
        
        // Save session
        session.userState = userState;
        session.lastInteraction = 'alert_time_selected';
        session.timestamp = Date.now();
        await updateSession(storeId, fromNumber, session);
        
        return createAlertConfirmationMessage({
            location: userState.location,
            category: userState.category,
            preferredTime: time,
            phoneNumber: fromNumber,
            storeId: storeId
        });
    }
    
    // Handle alert confirmation
    if (actionId === 'confirm_alert') {
        console.log(`[LobangLah] User confirmed alert setup`);
        
        try {
            // Create the daily alert
            const alertData = {
                userId: fromNumber,
                phoneNumber: fromNumber,
                storeId: storeId,
                location: userState.location,
                category: userState.category,
                preferredTime: userState.preferredTime || '09:00',
                timezone: 'Asia/Singapore'
            };
            
            const alert = await createDailyAlert(alertData);
            
            userState.step = 'alert_created';
            
            // Save session
            session.userState = userState;
            session.lastInteraction = 'alert_created';
            session.timestamp = Date.now();
            await updateSession(storeId, fromNumber, session);
            
            return {
                type: "text",
                text: {
                    body: `🔔 **Daily Alert Created!**\n\n✅ You'll receive daily ${userState.category} deals near ${userState.location.displayName} at ${userState.preferredTime}.\n\n📱 **Alert Details:**\n• Location: ${userState.location.displayName}\n• Category: ${userState.category}\n• Time: ${userState.preferredTime}\n• Status: Active\n\n💡 Type "manage alerts" to view or modify your alerts.`
                }
            };
            
        } catch (error) {
            console.error(`[LobangLah] Error creating alert:`, error);
            return {
                type: "text",
                text: {
                    body: "❌ Sorry lah! I had trouble setting up your daily alert. Please try again later."
                }
            };
        }
    }
    
    // Handle manage alerts
    if (actionId === 'manage_alerts') {
        console.log(`[LobangLah] User clicked manage alerts`);
        
        try {
            const alerts = await getUserAlerts(fromNumber, storeId);
            
            if (alerts.length === 0) {
                return {
                    type: "text",
                    text: {
                        body: "📱 **No Active Alerts**\n\nYou don't have any daily alerts set up yet.\n\n💡 To create an alert:\n1. Search for deals in your preferred location\n2. Click 'Set Daily Alert' button\n3. Choose your preferred time\n\n🔔 Daily alerts will send you the best deals automatically!"
                    }
                };
            }
            
            return await createAlertManagementMessage(fromNumber, storeId);
            
        } catch (error) {
            console.error(`[LobangLah] Error getting user alerts:`, error);
            return {
                type: "text",
                text: {
                    body: "❌ Sorry lah! I had trouble loading your alerts. Please try again later."
                }
            };
        }
    }
    
    // Handle deactivate alert
    if (actionId.startsWith('deactivate_alert_')) {
        const alertId = actionId.replace('deactivate_alert_', '');
        console.log(`[LobangLah] User deactivating alert: ${alertId}`);
        
        try {
            await deactivateAlert(alertId);
            
            return {
                type: "text",
                text: {
                    body: "🔕 **Alert Deactivated**\n\n✅ Your daily alert has been turned off.\n\n💡 You can set up new alerts anytime by searching for deals and clicking 'Set Daily Alert'."
                }
            };
            
        } catch (error) {
            console.error(`[LobangLah] Error deactivating alert:`, error);
            return {
                type: "text",
                text: {
                    body: "❌ Sorry lah! I had trouble deactivating your alert. Please try again later."
                }
            };
        }
    }
    
    // Handle location selection from search results
    if (actionId.startsWith('select_location_')) {
        const placeId = actionId.replace('select_location_', '');
        console.log(`[LobangLah] User selected location with placeId: ${placeId}`);
        
        const googleMapsApiKey = botConfig?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
        if (!googleMapsApiKey) {
            return {
                type: "text",
                text: {
                    body: "❌ Sorry lah! Location service not available. Please try sharing your GPS location instead."
                }
            };
        }
        
        try {
            const locationDetails = await getLocationDetails(placeId, googleMapsApiKey);
            
            if (!locationDetails) {
                return {
                    type: "text",
                    text: {
                        body: "❌ Sorry lah! Couldn't get location details. Please try again."
                    }
                };
            }
            
            // Store location in user state
            userState.location = {
                type: 'search_selected',
                placeId: locationDetails.placeId,
                displayName: locationDetails.name,
                formattedAddress: locationDetails.formattedAddress,
                latitude: locationDetails.latitude,
                longitude: locationDetails.longitude,
                area: locationDetails.area,
                source: 'location_search'
            };
            userState.step = 'location_confirmed';
            
            // Create category selection message
            const categoryMessage = {
                type: 'interactive',
                interactive: {
                    type: 'button',
                    header: {
                        type: 'text',
                        text: `📍 ${locationDetails.name}`
                    },
                    body: {
                        text: `🎉 Perfect! I found ${locationDetails.name} in ${locationDetails.area || 'Singapore'}.\n\nWhat kind of amazing deals should I find for you today?`
                    },
                    footer: {
                        text: 'Choose your deal category'
                    },
                    action: {
                        buttons: [
                            {
                                type: 'reply',
                                reply: {
                                    id: 'search_food_deals',
                                    title: '🍽️ Food & Dining'
                                }
                            },
                            {
                                type: 'reply',
                                reply: {
                                    id: 'search_events_deals',
                                    title: '🎉 Events'
                                }
                            },
                            {
                                type: 'reply',
                                reply: {
                                    id: 'search_fashion_deals',
                                    title: '👗 Fashion'
                                }
                            }
                        ]
                    }
                }
            };
            
            // Save session
            session.userState = userState;
            session.lastInteraction = 'location_confirmed';
            session.timestamp = Date.now();
            await updateSession(storeId, fromNumber, session);
            
            return categoryMessage;
            
        } catch (error) {
            console.error(`[LobangLah] Error getting location details:`, error);
            return {
                type: "text",
                text: {
                    body: "❌ Sorry lah! I had trouble getting location details. Please try again or share your GPS location."
                }
            };
        }
    }
    
    // Default: Show welcome message
    return createWelcomeMessage();
}

/**
 * Handle location messages with Google Maps + Weather integration
 */
async function handleLocationMessage(storeId, fromNumber, locationData, userState, botConfig, session) {
    console.log(`[LobangLah] Processing location message with Google + Weather:`, locationData);
    
    // Add user location to conversation history
    session.conversation.push({ role: 'user', content: `Shared location: ${locationData.latitude}, ${locationData.longitude}` });
    
    try {
        // Get location details from Google Maps API
        const googleMapsApiKey = botConfig?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
        let locationResult = null;
        
        if (googleMapsApiKey) {
            try {
                // Reverse geocode to get location name
                const { searchNearbyPlaces } = await import('../utils/googleLocationUtils.js');
                const nearbyPlaces = await searchNearbyPlaces(locationData.latitude, locationData.longitude, googleMapsApiKey);
                
                if (nearbyPlaces && nearbyPlaces.length > 0) {
                    const nearestPlace = nearbyPlaces[0];
                    locationResult = {
                        displayName: nearestPlace.displayName?.text || nearestPlace.displayName || 'Your Location',
                        latitude: locationData.latitude,
                        longitude: locationData.longitude,
                        area: nearestPlace.area || 'Singapore',
                        source: 'gps_with_google'
                    };
                }
            } catch (error) {
                console.log(`[LobangLah] Google Maps API error, using basic location:`, error.message);
            }
        }
        
        // Fallback to basic location if Google Maps fails
        if (!locationResult) {
            locationResult = {
                displayName: 'Your Location',
                latitude: locationData.latitude,
                longitude: locationData.longitude,
                area: 'Singapore',
                source: 'gps_basic'
            };
        }
        
        // Store location in user state
        userState.location = {
            type: 'gps',
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            displayName: locationResult.displayName,
            area: locationResult.area,
            source: 'gps'
        };
        userState.step = 'location_confirmed';
        
        console.log(`[LobangLah] Location stored: ${locationResult.displayName} (${locationData.latitude}, ${locationData.longitude})`);
        
        // Generate location weather message
        const locationWeatherMessage = await generateLocationWeatherMessage(locationResult, botConfig);
        
        // Create category selection message
        const categoryMessage = {
            type: 'interactive',
            interactive: {
                type: 'button',
                header: {
                    type: 'text',
                    text: `📍 ${locationResult.displayName}`
                },
                body: {
                    text: `🎉 Location confirmed! I found ${locationResult.displayName} in ${locationResult.area}.\n\nWhat kind of amazing deals should I find for you today?`
                },
                footer: {
                    text: 'Choose your deal category'
                },
                action: {
                    buttons: [
                        {
                            type: 'reply',
                            reply: {
                                id: 'search_food_deals',
                                title: '🍽️ Food & Dining'
                            }
                        },
                        {
                            type: 'reply',
                            reply: {
                                id: 'search_events_deals',
                                title: '🎉 Events'
                            }
                        },
                        {
                            type: 'reply',
                            reply: {
                                id: 'search_fashion_deals',
                                title: '👗 Fashion'
                            }
                        }
                    ]
                }
            }
        };
        
        // Save session
        session.userState = userState;
        session.lastInteraction = 'location_confirmed';
        session.timestamp = Date.now();
        await updateSession(storeId, fromNumber, session);
        
        return categoryMessage;
        
    } catch (error) {
        console.error(`[LobangLah] Error handling location message:`, error);
        return {
            type: "text",
            text: {
                body: "❌ Sorry, I had trouble processing your location. Please try again!"
            }
        };
    }
}

/**
 * Generate location weather message
 */
async function generateLocationWeatherMessage(locationResult, botConfig) {
    try {
        // Try to get weather data
        const weatherApiKey = botConfig?.weatherApiKey || process.env.WEATHER_API_KEY;
        if (weatherApiKey && locationResult.latitude && locationResult.longitude) {
            try {
                const { getWeatherData } = await import('../utils/weatherUtils.js');
                const weatherData = await getWeatherData(locationResult.latitude, locationResult.longitude, weatherApiKey);
                
                if (weatherData) {
                    return {
                        type: "text",
                        text: {
                            body: `📍 **Location:** ${locationResult.displayName}\n🌡️ **Weather:** ${weatherData.current.temp_c}°C, ${weatherData.current.condition.text}\n💨 **Wind:** ${weatherData.current.wind_kph} km/h\n💧 **Humidity:** ${weatherData.current.humidity}%\n\n🎯 Perfect weather for deal hunting!`
                        }
                    };
                }
            } catch (error) {
                console.log(`[LobangLah] Weather API error, using fallback:`, error.message);
            }
        }
        
        // Fallback without weather
        return createFallbackLocationWeatherMessage(locationResult);
        
    } catch (error) {
        console.error(`[LobangLah] Error generating location weather message:`, error);
        return createFallbackLocationWeatherMessage(locationResult);
    }
}

/**
 * Create fallback location weather message
 */
function createFallbackLocationWeatherMessage(locationResult) {
    return {
        type: "text",
        text: {
            body: `📍 **Location confirmed:** ${locationResult.displayName}\n\n🎯 Ready to find amazing deals near you!`
        }
    };
}

/**
 * Search and send deals
 */
async function searchAndSendDeals(storeId, fromNumber, userState, botConfig, session) {
    try {
        console.log(`[LobangLah] Searching for ${userState.category} deals near ${userState.location.displayName}`);
        
        // Send immediate acknowledgment
        const acknowledgmentMessage = {
            type: "text",
            text: {
                body: "🔍 Searching for amazing deals... This may take a moment! ⏳"
            }
        };
        
        await sendWhatsAppMessage(storeId, fromNumber, acknowledgmentMessage, botConfig);
        
        // Search for deals using OpenAI and Google Places
        const { searchDealsWithOpenAI } = await import('../utils/dealsUtils.js');
        const deals = await searchDealsWithOpenAI(userState.location, userState.category, botConfig);
        
        if (deals && deals.length > 0) {
            // Store deals in user state for chat context
            userState.lastDeals = deals;
            userState.step = 'deals_shown';
            
            // Save user state to session for persistence
            session.userState = userState;
            session.lastInteraction = 'deals_shown';
            session.timestamp = Date.now();
            
            console.log(`[LobangLah] Saving session with user state:`, {
                hasLastDeals: !!session.userState.lastDeals,
                dealsCount: session.userState.lastDeals?.length || 0,
                hasLocation: !!session.userState.location,
                hasCategory: !!session.userState.category,
                step: session.userState.step
            });
            
            // Update session in DynamoDB
            await updateSession(storeId, fromNumber, session);
            
            // Create catalog-based product list message (single message with all deals)
            const { createCatalogDealsMessage } = await import('../utils/catalogUtils.js');
            const catalogMessages = await createCatalogDealsMessage(deals, userState.category, botConfig);
            
            for (const catalogMessage of catalogMessages) {
                await sendWhatsAppMessage(storeId, fromNumber, catalogMessage, botConfig);
            }
            
            
            // Send follow-up interactive message
            const followUpMessage = {
                type: 'interactive',
                interactive: {
                    type: 'button',
                    header: {
                        type: 'text',
                        text: `🎉 Found ${deals.length} ${userState.category} deals!`
                    },
                    body: {
                        text: `I found ${deals.length} amazing ${userState.category} deals near ${userState.location.displayName}!\n\n💬 Want to chat about these deals, find more, or set up daily alerts?`
                    },
                    footer: {
                        text: 'Choose an option'
                    },
                    action: {
                        buttons: [
                            {
                                type: 'reply',
                                reply: {
                                    id: 'chat_ai',
                                    title: '🤖 Chat AI'
                                }
                            },
                            {
                                type: 'reply',
                                reply: {
                                    id: 'more_deals',
                                    title: '🔍 More Deals'
                                }
                            },
                            {
                                type: 'reply',
                                reply: {
                                    id: 'setup_alert',
                                    title: '🔔 Set Daily Alert'
                                }
                            }
                        ]
                    }
                }
            };
            
            await sendWhatsAppMessage(storeId, fromNumber, followUpMessage, botConfig);
            
            console.log(`[LobangLah] Successfully sent ${catalogMessages.length} catalog deal messages and follow-up`);
            return null; // Return null since we've sent multiple messages
        } else {
            console.log(`[LobangLah] No deals found`);
            return {
                type: "text",
                text: {
                    body: "😅 Sorry, I couldn't find any deals at the moment. Please try a different category or location!"
                }
            };
        }
    } catch (error) {
        console.error(`[LobangLah] Error searching deals:`, error);
        return {
            type: "text",
            text: {
                body: "❌ Sorry, I had trouble searching for deals. Please try again in a moment!"
            }
        };
    }
}

/**
 * Handle text messages
 */
async function handleTextMessage(storeId, fromNumber, messageBody, userState, botConfig, session) {
    console.log(`[LobangLah] Processing text message: "${messageBody}"`);
    
    // Add user message to conversation history
    session.conversation.push({ role: 'user', content: messageBody });
    
    // Check if this is a genuine first message or a continuation
    const isFirstMessage = session.conversation.length <= 1;
    const isGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|sup|yo|greetings)$/i.test(messageBody.trim());
    
    // If this is a first message with a greeting, show welcome message regardless of state
    if (isFirstMessage && isGreeting) {
        console.log(`[LobangLah] First greeting message detected: "${messageBody}"`);
        userState.step = 'welcome';
        return createConsistentWelcomeMessage(messageBody);
    }
    
    // If user sends a greeting and has been inactive for a while, reset to welcome
    if (isGreeting && userState.step !== 'welcome') {
        const lastActivity = session.timestamp || 0;
        const timeSinceLastActivity = Date.now() - lastActivity;
        const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
        
        if (timeSinceLastActivity > thirtyMinutes) {
            console.log(`[LobangLah] User greeting after ${Math.round(timeSinceLastActivity / 60000)} minutes, resetting to welcome`);
            userState.step = 'welcome';
            userState.location = null;
            userState.category = null;
            userState.lastDeals = null;
            userState.chatContext = null;
            return createConsistentWelcomeMessage(messageBody);
        }
    }
    
    // Handle popular locations prompt response
    if (userState.step === 'popular_locations_prompt') {
        console.log(`[LobangLah] Processing popular locations response: "${messageBody}"`);
        
        // Treat any text as a location search when in popular locations flow
        userState.step = 'location_search';
        
        // Enhance the search query with AI
        const enhancedQuery = await enhanceLocationSearchWithAI(messageBody, botConfig);
        console.log(`[LobangLah] Enhanced query: "${enhancedQuery}"`);
        
        // Search for locations
        const googleMapsApiKey = botConfig?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
        if (!googleMapsApiKey) {
            return {
                type: "text",
                text: {
                    body: "❌ Sorry lah! Location service not available. Please try sharing your GPS location instead."
                }
            };
        }
        
        console.log(`[LobangLah] Searching for location: "${enhancedQuery}"`);
        let suggestions;
        try {
            suggestions = await searchLocationByName(enhancedQuery, googleMapsApiKey, botConfig);
            console.log(`[LobangLah] Found ${suggestions.length} suggestions`);
        } catch (error) {
            if (error.message === 'Location not in Singapore') {
                return {
                    type: "interactive",
                    interactive: {
                        type: "button",
                        header: {
                            type: "text",
                            text: "🌍 Singapore Only"
                        },
                        body: {
                            text: `📍 "${messageBody}" is not a Singapore location.\n\n🌍 **This bot only works in Singapore.**\n\nPlease try a Singapore location or share your GPS location.`
                        },
                        footer: {
                            text: "Choose an option"
                        },
                        action: {
                            buttons: [
                                {
                                    type: "reply",
                                    reply: {
                                        id: "share_location_prompt",
                                        title: "📍 Share"
                                    }
                                },
                                {
                                    type: "reply",
                                    reply: {
                                        id: "search_location_prompt",
                                        title: "🔍 Search"
                                    }
                                },
                                {
                                    type: "reply",
                                    reply: {
                                        id: "popular_places",
                                        title: "🏢 Popular Places"
                                    }
                                }
                            ]
                        }
                    }
                };
            }
            throw error;
        }
        
        if (suggestions.length === 0) {
            return {
                type: "interactive",
                interactive: {
                    type: "button",
                    header: {
                        type: "text",
                        text: "🔍 Location Not Found"
                    },
                    body: {
                        text: `❌ Sorry lah! Couldn't find "${messageBody}" in Singapore.\n\n🌍 **This bot only works in Singapore.**\n\nPlease try a different approach.`
                    },
                    footer: {
                        text: "Choose an option"
                    },
                    action: {
                        buttons: [
                            {
                                type: "reply",
                                reply: {
                                    id: "share_location_prompt",
                                    title: "📍 Share"
                                }
                            },
                            {
                                type: "reply",
                                reply: {
                                    id: "search_location_prompt",
                                    title: "🔍 Search"
                                }
                            },
                            {
                                type: "reply",
                                reply: {
                                    id: "popular_places",
                                    title: "🏢 Popular Places"
                                }
                            }
                        ]
                    }
                }
            };
        }
        
        // Create search results message
        const { createLocationSearchMessage } = await import('../utils/locationSearchUtils.js');
        const searchMessage = createLocationSearchMessage(enhancedQuery, suggestions);
        
        // Add to conversation history
        session.conversation.push({ role: 'assistant', content: `Searching for: ${enhancedQuery}` });
        
        // Save session
        session.userState = userState;
        session.lastInteraction = 'location_search_results';
        session.timestamp = Date.now();
        await updateSession(storeId, fromNumber, session);
        
        return searchMessage;
    }
    
    // Handle waiting for location name input (from search_location_text button)
    if (userState.step === 'waiting_for_location_name') {
        console.log(`[LobangLah] Processing location name input: "${messageBody}"`);
        
        // Clear the search session
        userState.searchSession = null;
        userState.step = 'location_search';
        
        // Enhance the search query with AI
        const enhancedQuery = await enhanceLocationSearchWithAI(messageBody, botConfig);
        console.log(`[LobangLah] Enhanced query: "${enhancedQuery}"`);
        
        // Search for locations using combination of AI and Google Maps API
        const googleMapsApiKey = botConfig?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
        if (!googleMapsApiKey) {
            return {
                type: "text",
                text: {
                    body: "❌ Sorry lah! Location service not available. Please try sharing your GPS location instead."
                }
            };
        }
        
        console.log(`[LobangLah] Searching for location: "${enhancedQuery}"`);
        let suggestions;
        try {
            suggestions = await searchLocationByName(enhancedQuery, googleMapsApiKey, botConfig);
            console.log(`[LobangLah] Found ${suggestions.length} suggestions`);
        } catch (error) {
            if (error.message === 'Location not in Singapore') {
                return {
                    type: "interactive",
                    interactive: {
                        type: "button",
                        header: {
                            type: "text",
                            text: "🌍 Singapore Only"
                        },
                        body: {
                            text: `📍 "${messageBody}" is not a Singapore location.\n\n🌍 **This bot only works in Singapore.**\n\nPlease try a Singapore location or share your GPS location.`
                        },
                        footer: {
                            text: "Choose an option"
                        },
                        action: {
                            buttons: [
                                {
                                    type: "reply",
                                    reply: {
                                        id: "share_location_prompt",
                                        title: "📍 Share"
                                    }
                                },
                                {
                                    type: "reply",
                                    reply: {
                                        id: "search_location_prompt",
                                        title: "🔍 Search"
                                    }
                                },
                                {
                                    type: "reply",
                                    reply: {
                                        id: "popular_places",
                                        title: "🏢 Popular Places"
                                    }
                                }
                            ]
                        }
                    }
                };
            }
            throw error;
        }
        
        if (suggestions.length === 0) {
            return {
                type: "interactive",
                interactive: {
                    type: "button",
                    header: {
                        type: "text",
                        text: "🔍 Location Not Found"
                    },
                    body: {
                        text: `❌ Sorry lah! Couldn't find "${messageBody}" in Singapore.\n\n🌍 **This bot only works in Singapore.**\n\nPlease try a different approach.`
                    },
                    footer: {
                        text: "Choose an option"
                    },
                    action: {
                        buttons: [
                            {
                                type: "reply",
                                reply: {
                                    id: "share_location_prompt",
                                    title: "📍 Share"
                                }
                            },
                            {
                                type: "reply",
                                reply: {
                                    id: "search_location_prompt",
                                    title: "🔍 Search"
                                }
                            },
                            {
                                type: "reply",
                                reply: {
                                    id: "popular_places",
                                    title: "🏢 Popular Places"
                                }
                            }
                        ]
                    }
                }
            };
        }
        
        // Create search results message
        const { createLocationSearchMessage } = await import('../utils/locationSearchUtils.js');
        const searchMessage = createLocationSearchMessage(enhancedQuery, suggestions);
        
        // Add to conversation history
        session.conversation.push({ role: 'assistant', content: `Searching for: ${enhancedQuery}` });
        
        // Save session
        session.userState = userState;
        session.lastInteraction = 'location_search_results';
        session.timestamp = Date.now();
        await updateSession(storeId, fromNumber, session);
        
        return searchMessage;
    }
    
    // Handle general location search queries (only when not in a specific session)
    if ((userState.step === 'welcome' || userState.step === 'location_search') && !userState.searchSession) {
        console.log(`[LobangLah] Processing general location search query: "${messageBody}"`);
        
        // Check if this looks like a location search (more comprehensive)
        const locationKeywords = [
            'orchard', 'marina', 'chinatown', 'bugis', 'tampines', 'jurong', 'woodlands', 
            'mall', 'shopping', 'restaurant', 'food', 'area', 'place', 'location', 'street',
            'road', 'avenue', 'junction', 'plaza', 'center', 'centre', 'terminal', 'station',
            'mrt', 'lrt', 'bus', 'park', 'garden', 'beach', 'harbour', 'harbor', 'bay',
            'river', 'bridge', 'tower', 'building', 'hotel', 'resort', 'club', 'bar',
            'cafe', 'coffee', 'tea', 'bakery', 'market', 'hawker', 'food court', 'deals',
            'discount', 'offer', 'promotion', 'sale', 'cheap', 'budget', 'save', 'lobang'
        ];
        
        const isLocationQuery = locationKeywords.some(keyword => messageBody.toLowerCase().includes(keyword)) || 
                               (messageBody.length > 2 && messageBody.length < 100 && 
                                !messageBody.toLowerCase().includes('hello') && 
                                !messageBody.toLowerCase().includes('hi') && 
                                !messageBody.toLowerCase().includes('help'));
        
        if (isLocationQuery) {
            console.log(`[LobangLah] Detected location search query: "${messageBody}"`);
            userState.step = 'location_search';
            
            // Enhance the search query with AI
            const enhancedQuery = await enhanceLocationSearchWithAI(messageBody, botConfig);
            console.log(`[LobangLah] Enhanced query: "${enhancedQuery}"`);
            
            // Search for locations
            const googleMapsApiKey = botConfig?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
            if (!googleMapsApiKey) {
                console.log(`[LobangLah] No Google Maps API key found`);
                return {
                    type: "text",
                    text: {
                        body: "❌ Sorry lah! Location service not available. Please try sharing your GPS location instead."
                    }
                };
            }
            
            try {
                const suggestions = await searchLocationByName(enhancedQuery, googleMapsApiKey, botConfig);
                console.log(`[LobangLah] Found ${suggestions.length} suggestions for "${enhancedQuery}"`);
                
                if (suggestions.length === 0) {
                    return {
                        type: "interactive",
                        interactive: {
                            type: "button",
                            header: {
                                type: "text",
                                text: "🔍 Location Not Found"
                            },
                            body: {
                                text: `❌ Sorry lah! Couldn't find "${messageBody}" in Singapore.\n\n🌍 **This bot only works in Singapore.**\n\nPlease try a different approach.`
                            },
                            footer: {
                                text: "Choose an option"
                            },
                            action: {
                                buttons: [
                                    {
                                        type: "reply",
                                        reply: {
                                            id: "share_location_prompt",
                                            title: "📍 Share"
                                        }
                                    },
                                    {
                                        type: "reply",
                                        reply: {
                                            id: "search_location_prompt",
                                            title: "🔍 Search"
                                        }
                                    },
                                    {
                                        type: "reply",
                                        reply: {
                                            id: "popular_places",
                                            title: "🏢 Popular Places"
                                        }
                                    }
                                ]
                            }
                        }
                    };
                }
                
                // Create location search results message
                const { createLocationSearchMessage } = await import('../utils/locationSearchUtils.js');
                const locationMessage = createLocationSearchMessage(enhancedQuery, suggestions);
                
                // Save session
                session.userState = userState;
                session.lastInteraction = 'location_search_results';
                session.timestamp = Date.now();
                await updateSession(storeId, fromNumber, session);
                
                return locationMessage;
                
            } catch (error) {
                if (error.message === 'Location not in Singapore') {
                    return {
                        type: "interactive",
                        interactive: {
                            type: "button",
                            header: {
                                type: "text",
                                text: "🌍 Singapore Only"
                            },
                            body: {
                                text: `📍 "${messageBody}" is not a Singapore location.\n\n🌍 **This bot only works in Singapore.**\n\nPlease try a Singapore location or share your GPS location.`
                            },
                            footer: {
                                text: "Choose an option"
                            },
                            action: {
                                buttons: [
                                    {
                                        type: "reply",
                                        reply: {
                                            id: "share_location_prompt",
                                            title: "📍 Share"
                                        }
                                    },
                                    {
                                        type: "reply",
                                        reply: {
                                            id: "search_location_prompt",
                                            title: "🔍 Search"
                                        }
                                    },
                                    {
                                        type: "reply",
                                        reply: {
                                            id: "popular_places",
                                            title: "🏢 Popular Places"
                                        }
                                    }
                                ]
                            }
                        }
                    };
                }
                throw error;
            }
        }
    }
    
    // Handle chat mode - user is asking questions about deals
    if (userState.step === 'chat_mode' && userState.chatContext) {
        console.log(`[LobangLah] Processing chat mode question about deals: "${messageBody}"`);
        
        // Increment interaction counter
        userState.chatInteractionCount = (userState.chatInteractionCount || 0) + 1;
        console.log(`[LobangLah] Chat interaction count: ${userState.chatInteractionCount}/10`);
        
        // Check if we've reached 10 interactions - restart chat
        if (userState.chatInteractionCount >= 10) {
            console.log(`[LobangLah] Reached 10 interactions, restarting chat session`);
            
            // Reset user state to start fresh
            userState.step = 'welcome';
            userState.category = null;
            userState.location = null;
            userState.lastDeals = null;
            userState.chatContext = null;
            userState.chatInteractionCount = 0;
            
            // Clear conversation history for fresh start
            session.conversation = [];
            
            // Import createWelcomeMessage from dealsUtils
            const { createWelcomeMessage } = await import('../utils/dealsUtils.js');
            const welcomeMessage = createWelcomeMessage();
            
            // Add restart message to conversation
            const restartText = "🔄 *Chat Session Restarted*\n\nYou've had 10 interactions! Let's start fresh to find you the best deals.";
            session.conversation.push({ role: 'assistant', content: restartText });
            
            return {
                type: "text",
                text: {
                    body: `${restartText}\n\n${welcomeMessage.text.body}`
                }
            };
        }
        
        const normalizedMessage = messageBody.toLowerCase().trim();
        
        // Check if user is asking about location or directions
        if (normalizedMessage.includes('direction') || normalizedMessage.includes('directions') ||
            normalizedMessage.includes('location') || normalizedMessage.includes('where is') ||
            normalizedMessage.includes('how to get') || normalizedMessage.includes('address') ||
            normalizedMessage.includes('navigate') || normalizedMessage.includes('map') ||
            normalizedMessage.includes('route') || normalizedMessage.includes('way to') ||
            normalizedMessage.includes('find the place') || normalizedMessage.includes('go there')) {
            
            console.log(`[LobangLah] User asking about location/directions in chat mode`);
            
            // Try to extract which deal they're asking about
            let targetDeal = null;
            const deals = userState.chatContext.deals || [];
            
            // Check if user mentioned a specific deal number or business name
            for (let i = 0; i < deals.length; i++) {
                const deal = deals[i];
                const businessName = (deal.businessName || deal.restaurant || deal.store || deal.title || '').toLowerCase();
                const dealNumber = `deal ${i + 1}`;
                const firstDeal = i === 0 && (normalizedMessage.includes('first') || normalizedMessage.includes('1st'));
                const secondDeal = i === 1 && (normalizedMessage.includes('second') || normalizedMessage.includes('2nd'));
                const thirdDeal = i === 2 && (normalizedMessage.includes('third') || normalizedMessage.includes('3rd'));
                
                if (normalizedMessage.includes(businessName) || normalizedMessage.includes(dealNumber) ||
                    firstDeal || secondDeal || thirdDeal) {
                    targetDeal = deal;
                    break;
                }
            }
            
            // If no specific deal mentioned, use the first deal
            if (!targetDeal && deals.length > 0) {
                targetDeal = deals[0];
            }
            
            if (targetDeal) {
                console.log(`[LobangLah] Sending location message for deal: ${targetDeal.businessName || targetDeal.restaurant || targetDeal.store}`);
                
                // Import createLocationMessage from dealsUtils
                const { createLocationMessage } = await import('../utils/dealsUtils.js');
                const locationMessage = createLocationMessage(targetDeal);
                
                // Add response to conversation history
                const responseText = `📍 Here's the location for ${targetDeal.businessName || targetDeal.restaurant || targetDeal.store || 'this deal'}!`;
                session.conversation.push({ role: 'assistant', content: responseText });
                
                return locationMessage;
            } else {
                // No deals available, provide general response
                const noLocationMessage = `📍 I'd love to help with directions, but I need to know which deal you're interested in!\n\n💬 Try asking like:\n• "Directions to the first deal"\n• "Where is [business name]?"\n• "How to get to deal #2"`;
                
                session.conversation.push({ role: 'assistant', content: noLocationMessage });
                
                return {
                    type: "text",
                    text: {
                        body: noLocationMessage
                    }
                };
            }
        }
        
        // Check if user wants more deals
        if (normalizedMessage.includes('more deals') || normalizedMessage.includes('show more') || 
            normalizedMessage.includes('additional deals') || normalizedMessage.includes('other deals') ||
            normalizedMessage.includes('find more') || normalizedMessage.includes('more options')) {
            
            console.log(`[LobangLah] User requesting more deals from DynamoDB`);
            
            try {
                // Search for more unique deals from DynamoDB
                const moreDeals = await searchMoreDealsFromDynamoDB(
                    userState.location,
                    userState.category,
                    userState.lastDeals || [],
                    5 // Get up to 5 more deals
                );
                
                if (moreDeals && moreDeals.length > 0) {
                    console.log(`[LobangLah] Found ${moreDeals.length} additional deals from DynamoDB`);
                    
                    // Update user state with new deals
                    userState.lastDeals = [...(userState.lastDeals || []), ...moreDeals];
                    userState.chatContext.deals = [...userState.chatContext.deals, ...moreDeals.slice(0, 3)];
                    
                    // Create catalog-based deal messages for the new deals
                    const moreDealMessages = await createCatalogDealsMessage(moreDeals, userState.category, botConfig);
                    
                    // Send the new deals
                    for (const dealMessage of moreDealMessages) {
                        await sendWhatsAppMessage(storeId, fromNumber, dealMessage, botConfig);
                    }
                    
                    const summaryMessage = `🎉 Found ${moreDeals.length} additional ${userState.category} deals near ${userState.chatContext.location}!\n\n💬 Ask me about these new deals or continue chatting about all your options!`;
                    
                    session.conversation.push({ role: 'assistant', content: summaryMessage });
                    
                    return {
                        type: "text",
                        text: {
                            body: summaryMessage
                        }
                    };
                } else {
                    const noMoreDealsMessage = `😔 Sorry, I couldn't find any additional ${userState.category} deals near ${userState.chatContext.location} that aren't already shown.\n\n💡 Try searching in a different area by sharing a new location, or ask me about the current deals!`;
                    
                    session.conversation.push({ role: 'assistant', content: noMoreDealsMessage });
                    
                    return {
                        type: "text",
                        text: {
                            body: noMoreDealsMessage
                        }
                    };
                }
            } catch (error) {
                console.error(`[LobangLah] Error searching for more deals:`, error);
                const errorMessage = `🔍 I had trouble finding more deals right now. Let me help you with the current ${userState.category} deals instead!\n\n💬 Ask me which deal is best value, closest to you, or any other questions!`;
                
                session.conversation.push({ role: 'assistant', content: errorMessage });
                
                return {
                    type: "text",
                    text: {
                        body: errorMessage
                    }
                };
            }
        }
        
        // Check if user wants to exit chat mode or restart the flow
        if (normalizedMessage.includes('exit chat') || normalizedMessage.includes('stop chat') || 
            normalizedMessage.includes('end chat') || normalizedMessage === 'exit' || normalizedMessage === 'stop') {
            
            userState.step = 'deals_shown';
            userState.chatContext = null;
            userState.chatStartTime = null;
            userState.chatTimeoutWarned = false;
            
            return {
                type: "text",
                text: {
                    body: "👋 Chat mode ended! You can search for new deals by sharing your location or click the Chat AI button again to resume chatting about your current deals."
                }
            };
        }
        
        // Check if user wants to restart the main flow
        if (normalizedMessage.includes('new search') || normalizedMessage.includes('restart') || 
            normalizedMessage.includes('main menu') || normalizedMessage.includes('start over') ||
            normalizedMessage.includes('new deals') || normalizedMessage.includes('change category') ||
            normalizedMessage.includes('different category') || normalizedMessage.includes('search again') ||
            normalizedMessage.includes('fresh start') || normalizedMessage.includes('begin again') ||
            normalizedMessage === 'menu' || normalizedMessage === 'home' || normalizedMessage === 'reset') {
            
            console.log(`[LobangLah] User requesting to restart main flow from chat mode`);
            
            // Reset user state to start fresh
            userState.step = 'waiting_for_location';
            userState.category = null;
            userState.location = null;
            userState.lastDeals = null;
            userState.chatContext = null;
            userState.chatStartTime = null;
            userState.chatTimeoutWarned = false;
            
            // Clear conversation history for fresh start
            session.conversation = [];
            
            // Import createWelcomeMessage from dealsUtils
            const { createWelcomeMessage } = await import('../utils/dealsUtils.js');
            return createWelcomeMessage();
        }
        
        // Check if user wants to search in a different location
        if (normalizedMessage.includes('new location') || normalizedMessage.includes('different location') ||
            normalizedMessage.includes('change location') || normalizedMessage.includes('another area') ||
            normalizedMessage.includes('different area') || normalizedMessage.includes('new area')) {
            
            console.log(`[LobangLah] User requesting to change location from chat mode`);
            
            // Reset location but keep category
            userState.step = 'waiting_for_location';
            userState.location = null;
            userState.lastDeals = null;
            userState.chatContext = null;
            userState.chatStartTime = null;
            userState.chatTimeoutWarned = false;
            
            const categoryName = userState.category === 'food' ? 'food' : 
                               userState.category === 'clothes' ? 'fashion' : 
                               userState.category === 'groceries' ? 'groceries' : 'deals';
            
            return {
                type: "text",
                text: {
                    body: `🔄 *Location Change Requested*\n\nLet's find ${categoryName} deals in a new area!\n\n📍 Please share your location to search for ${categoryName} deals near you.\n\n💡 Tap the 📎 attachment icon → Location → Send your current location`
                }
            };
        }
        
        try {
            // Pass full conversation history for personalized responses
            const chatResponse = await generateChatResponse(messageBody, userState.chatContext, botConfig, session.conversation);
            
            // Add user question and bot response to conversation history
            session.conversation.push({ role: 'assistant', content: chatResponse });
            
            return {
                type: "text",
                text: {
                    body: chatResponse
                }
            };
        } catch (error) {
            console.error(`[LobangLah] Error generating chat response:`, error);
            // Maintain session context - don't ask for postal code again
            const errorResponse = `🤖 Sorry, I had trouble understanding your question about the ${userState.chatContext.category} deals near ${userState.chatContext.location}.\n\n💬 Please try asking again in a different way, like:\n• "Which deal is best value?"\n• "Tell me about the first deal"\n• "What's closest to me?"\n\n🎯 I'm ready to help with your ${userState.chatContext.category} deals!\n\n💡 Type "exit chat" to end chat mode.`;
            
            // Add error response to conversation history
            session.conversation.push({ role: 'assistant', content: errorResponse });
            
            return {
                type: "text",
                text: {
                    body: errorResponse
                }
            };
        }
    }
    
    // For non-chat mode, treat any text as a potential location search for deal finding
    console.log(`[LobangLah] User sent text message outside of chat mode: "${messageBody}"`);
    
    // Check if this looks like a location search or general query
    const locationKeywords = [
        'orchard', 'marina', 'chinatown', 'bugis', 'tampines', 'jurong', 'woodlands', 
        'mall', 'shopping', 'restaurant', 'food', 'area', 'place', 'location', 'street',
        'road', 'avenue', 'junction', 'plaza', 'center', 'centre', 'terminal', 'station',
        'mrt', 'lrt', 'bus', 'park', 'garden', 'beach', 'harbour', 'harbor', 'bay',
        'river', 'bridge', 'tower', 'building', 'hotel', 'resort', 'club', 'bar',
        'cafe', 'coffee', 'tea', 'bakery', 'market', 'hawker', 'food court', 'deals',
        'discount', 'offer', 'promotion', 'sale', 'cheap', 'budget', 'save', 'lobang'
    ];
    
    const isLocationQuery = locationKeywords.some(keyword => messageBody.toLowerCase().includes(keyword)) || 
                           (messageBody.length > 2 && messageBody.length < 100 && 
                            !messageBody.toLowerCase().includes('hello') && 
                            !messageBody.toLowerCase().includes('hi') && 
                            !messageBody.toLowerCase().includes('help'));
    
    if (isLocationQuery) {
        console.log(`[LobangLah] Treating text as location search for deal finding: "${messageBody}"`);
        userState.step = 'location_search';
        
        // Enhance the search query with AI
        const enhancedQuery = await enhanceLocationSearchWithAI(messageBody, botConfig);
        console.log(`[LobangLah] Enhanced query: "${enhancedQuery}"`);
        
        // Search for locations
        const googleMapsApiKey = botConfig?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
        if (!googleMapsApiKey) {
            console.log(`[LobangLah] No Google Maps API key found`);
            return {
                type: "text",
                text: {
                    body: "❌ Sorry lah! Location service not available. Please try sharing your GPS location instead."
                }
            };
        }
        
        try {
            const suggestions = await searchLocationByName(enhancedQuery, googleMapsApiKey, botConfig);
            console.log(`[LobangLah] Found ${suggestions.length} suggestions for "${enhancedQuery}"`);
            
            if (suggestions.length === 0) {
                return {
                    type: "interactive",
                    interactive: {
                        type: "button",
                        header: {
                            type: "text",
                            text: "🔍 Location Not Found"
                        },
                        body: {
                            text: `❌ Sorry lah! Couldn't find "${messageBody}" in Singapore.\n\n🌍 **This bot only works in Singapore.**\n\nPlease try a different approach.`
                        },
                        footer: {
                            text: "Choose an option"
                        },
                        action: {
                            buttons: [
                                {
                                    type: "reply",
                                    reply: {
                                        id: "share_location_prompt",
                                        title: "📍 Share"
                                    }
                                },
                                {
                                    type: "reply",
                                    reply: {
                                        id: "search_location_prompt",
                                        title: "🔍 Search"
                                    }
                                },
                                {
                                    type: "reply",
                                    reply: {
                                        id: "popular_places",
                                        title: "🏢 Popular Places"
                                    }
                                }
                            ]
                        }
                    }
                };
            }
            
            // Create location search results message
            const { createLocationSearchMessage } = await import('../utils/locationSearchUtils.js');
            const locationMessage = createLocationSearchMessage(enhancedQuery, suggestions);
            
            // Save session
            session.userState = userState;
            session.lastInteraction = 'location_search_results';
            session.timestamp = Date.now();
            await updateSession(storeId, fromNumber, session);
            
            return locationMessage;
            
        } catch (error) {
            if (error.message === 'Location not in Singapore') {
                return {
                    type: "interactive",
                    interactive: {
                        type: "button",
                        header: {
                            type: "text",
                            text: "🌍 Singapore Only"
                        },
                        body: {
                            text: `📍 "${messageBody}" is not a Singapore location.\n\n🌍 **This bot only works in Singapore.**\n\nPlease try a Singapore location or share your GPS location.`
                        },
                        footer: {
                            text: "Choose an option"
                        },
                        action: {
                            buttons: [
                                {
                                    type: "reply",
                                    reply: {
                                        id: "share_location_prompt",
                                        title: "📍 Share"
                                    }
                                },
                                {
                                    type: "reply",
                                    reply: {
                                        id: "search_location_prompt",
                                        title: "🔍 Search"
                                    }
                                },
                                {
                                    type: "reply",
                                    reply: {
                                        id: "popular_places",
                                        title: "🏢 Popular Places"
                                    }
                                }
                            ]
                        }
                    }
                };
            }
            throw error;
        }
    } else {
        // If it's not a location query, show the welcome message
        console.log(`[LobangLah] Text not recognized as location search, showing welcome message`);
        try {
            const welcomeMessage = createConsistentWelcomeMessage(messageBody);
            return welcomeMessage;
        } catch (error) {
            console.error(`[LobangLah] Error generating welcome message:`, error);
            return createInteractiveWelcomeMessage(messageBody);
        }
    }
}
