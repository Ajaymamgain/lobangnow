// LobangLah WhatsApp Deals Bot Handler
import { searchDealsWithOpenAI, createWelcomeMessage, createLocationMessage, saveUserProfile, getUserProfile, searchMoreDealsFromDynamoDB, createInteractiveSearchingMessage, getSharedDealIds, createIndividualDealMessages, addSharedDealIds } from '../utils/dealsUtils.js';
import { createCatalogDealsMessage, cleanupOldDealsFromCatalog } from '../utils/catalogUtils.js';
// Removed verifyDealsWithDeepSeek import as DeepSeek verification is now skipped
import { enhanceDealsWithPhotos, createEnhancedDealMessages } from '../utils/enhancedDealUtils.js';
import { resolveLocationAndWeather, searchNearbyPlaces } from '../utils/googleLocationUtils.js';
import { sendWhatsAppMessage } from '../utils/whatsappUtils.js';
import { generateAndSendSticker } from '../utils/stickerUtils.js';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import OpenAI from 'openai';

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

        // Send response if we have one (with deduplication)
        if (response) {
            await sendLobangLahMessage(storeId, fromNumber, response, botConfig, session);
        }
        
        // Update session timestamp and save to DynamoDB with user state
        session.lastInteraction = 'lobanglah_deals';
        session.timestamp = Date.now();
        await updateSession(storeId, fromNumber, session);

        console.log(`[LobangLah] Successfully processed message from ${fromNumber}`);
        return true; // Indicate successful handling to webhook

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
 * Handle text messages
 */
async function handleTextMessage(storeId, fromNumber, messageBody, userState, botConfig, session) {
    console.log(`[LobangLah] Processing text message: "${messageBody}"`);
    
    // Add user message to conversation history
    session.conversation.push({ role: 'user', content: messageBody });
    
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
    
    // For non-chat mode, generate dynamic interactive welcome message using OpenAI
    console.log(`[LobangLah] User sent text message outside of chat mode: "${messageBody}"`);
    
    try {
        // Generate personalized welcome message using OpenAI
        const welcomeMessage = createConsistentWelcomeMessage(messageBody);
        return welcomeMessage;
    } catch (error) {
        console.error(`[LobangLah] Error generating welcome message:`, error);
        // Fallback to interactive message without OpenAI
        return createInteractiveWelcomeMessage(messageBody);
    }
}

/**
 * Handle interactive messages (button/list selections)
 */
async function handleInteractiveMessage(storeId, fromNumber, interactiveData, userState, botConfig, session) {
    const actionId = interactiveData.button_reply?.id || interactiveData.list_reply?.id;
    console.log(`[LobangLah] Processing interactive action: ${actionId}`);
    
    // Add user interaction to conversation history
    session.conversation.push({ role: 'user', content: `Selected: ${actionId}` });
    
    // Handle new welcome message buttons
    if (actionId === 'share_location_prompt') {
        console.log(`[LobangLah] User clicked share location from welcome message`);
        return {
            type: "text",
            text: {
                body: "📍 *Share Your Location*\n\nTo find amazing deals near you:\n\n🎯 **Option 1: Current Location**\n1️⃣ Tap the 📎 attachment icon\n2️⃣ Select 'Location'\n3️⃣ Choose 'Send your current location'\n\n🔍 **Option 2: Search for a Place**\n1️⃣ Tap the 📎 attachment icon\n2️⃣ Select 'Location'\n3️⃣ Tap the search bar at the top\n4️⃣ Type any location (e.g., 'Orchard Road', 'Marina Bay')\n5️⃣ Select from results and send\n\n✨ This helps me find the most accurate deals in your chosen area!"
            }
        };
    }
    
    if (actionId === 'how_it_works') {
        console.log(`[LobangLah] User clicked how it works from welcome message`);
        return {
            type: 'interactive',
            interactive: {
                type: 'button',
                header: {
                    type: 'text',
                    text: '❓ How LobangLah Works'
                },
                body: {
                    text: "🤖 **AI-Powered Deal Discovery**\n\n1️⃣ **Share Location**: Send your GPS location or search for any place\n2️⃣ **Get Weather**: I'll show current weather + hourly forecast\n3️⃣ **Choose Category**: Food, Fashion, or Groceries\n4️⃣ **AI Search**: I search thousands of deals using advanced AI\n5️⃣ **Get Results**: Receive 5 best deals with images, directions & details\n6️⃣ **Chat AI**: Ask questions about deals for personalized recommendations\n\n🎯 **Smart Features:**\n• Weather-aware suggestions (indoor/outdoor)\n• Real-time deal verification\n• Social media deal discovery\n• Interactive deal exploration\n\n🚀 Ready to start saving?"
                },
                footer: {
                    text: '🎯 LobangLah - Your Smart Deal Hunter'
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
                                id: 'about_lobangLah',
                                title: '🎯 About Us'
                            }
                        }
                    ]
                }
            }
        };
    }
    
    if (actionId === 'about_lobangLah') {
        console.log(`[LobangLah] User clicked about us from welcome message`);
        return {
            type: 'interactive',
            interactive: {
                type: 'button',
                header: {
                    type: 'text',
                    text: '🎯 About LobangLah'
                },
                body: {
                    text: "🇸🇬 **Singapore's Smartest Deal Discovery Platform**\n\n🤖 **What We Do:**\n• AI-powered deal aggregation across Singapore\n• Real-time weather integration for smart recommendations\n• Social media deal discovery (Instagram, Facebook, TikTok, Reddit)\n• Location-based deal matching\n\n🎯 **Our Mission:**\nHelp Singaporeans save money by finding the best deals near them using cutting-edge AI technology and real-time data.\n\n🚀 **Why Choose LobangLah:**\n✅ Thousands of verified deals\n✅ Weather-aware recommendations\n✅ Instant deal discovery\n✅ Interactive chat support\n✅ Always up-to-date offers\n\n💡 **'Lobang'** means 'good deal' in Singaporean slang - and that's exactly what we deliver!"
                },
                footer: {
                    text: '🚀 Powered by Advanced AI Technology'
                },
                action: {
                    buttons: [
                        {
                            type: 'reply',
                            reply: {
                                id: 'share_location_prompt',
                                title: '📍 Start Saving'
                            }
                        },
                        {
                            type: 'reply',
                            reply: {
                                id: 'how_it_works',
                                title: '❓ How It Works'
                            }
                        }
                    ]
                }
            }
        };
    }
    
    // Handle location request buttons
    if (actionId === 'send_location') {
        console.log(`[LobangLah] User requested to send location`);
        return {
            type: "text",
            text: {
                body: "📍 Please share your current location by tapping the 📎 attachment icon and selecting 'Location'.\n\nThis will help me find the best deals near you! 🎯"
            }
        };
    }
    
    // Handle new location + weather category selection buttons
    if (actionId === 'search_food_deals' || actionId === 'search_fashion_deals' || actionId === 'search_all_deals') {
        // Determine category from button ID
        let category;
        if (actionId === 'search_food_deals') {
            category = 'food';
        } else if (actionId === 'search_fashion_deals') {
            category = 'fashion';
        } else {
            category = 'all';
        }
        
        userState.category = category;
        console.log(`[LobangLah] Category selected from location confirmation: ${category}`);
        
        // Location should already be set from the location confirmation flow
        if (userState.location) {
            console.log(`[LobangLah] Starting deal search for ${category} near ${userState.location.displayName}`);

            // NEW: Search for nearby places using Google Places API with detailed info including photos
            const googleMapsApiKey = botConfig?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
            if (googleMapsApiKey && userState.location.latitude && userState.location.longitude && category !== 'all') {
                // Fetch detailed place information including photos
                const detailedNearbyPlaces = await searchNearbyPlaces(
                    userState.location.latitude,
                    userState.location.longitude,
                    category,
                    googleMapsApiKey,
                    true // includeDetails = true to get photos and other data
                );
                
                // Store both detailed places and simple names for backward compatibility
                userState.nearbyPlacesDetailed = detailedNearbyPlaces;
                userState.nearbyPlaces = detailedNearbyPlaces.map(place => place.name);
                
                console.log(`[LobangLah] Found ${detailedNearbyPlaces.length} nearby places with photos to enhance search.`);
                console.log(`[LobangLah] Places with photos: ${detailedNearbyPlaces.filter(p => p.photos.length > 0).length}`);
            }
            
            // New flow: 1. OpenAI Search, 2. DeepSeek Verification, 3. Photo Enhancement
            console.log(`[LobangLah] 🚀 Starting new deal flow for ${userState.category} near ${userState.location.description}`);

            // Step 1: Search for deals with OpenAI
            const potentialDeals = await searchDealsWithOpenAI(userState.location, userState.category, botConfig, userState.nearbyPlacesDetailed || []);
            
            if (!potentialDeals || potentialDeals.length === 0) {
                console.log('[LobangLah] OpenAI found no deals.');
                const noDealsMessage = {
                    type: "text",
                    text: {
                        body: `😢 Sorry, I couldn't find any ${userState.category} deals near ${userState.location.description} right now. Please try another category or location!`
                    }
                };
                await sendWhatsAppMessage(storeId, fromNumber, noDealsMessage, botConfig);
                return;
            }

            console.log(`[LobangLah] OpenAI found ${potentialDeals.length} potential deals. Skipping DeepSeek verification as requested.`);

            // Step 2: Skip DeepSeek verification and use OpenAI deals directly
            console.log(`[LobangLah] Using ${potentialDeals.length} deals directly from OpenAI. Now enhancing with photos.`);

            // Step 3: Enhance OpenAI deals with photos (no verification step)
            const finalDeals = enhanceDealsWithPhotos(potentialDeals, userState.nearbyPlacesDetailed || [], botConfig.googleMapsApiKey);

            if (finalDeals && finalDeals.length > 0) {
                // Add deal IDs to session to prevent duplicates
                addSharedDealIds(session, finalDeals);

                // Store deals in user state for chat context
                userState.lastDeals = finalDeals;
                userState.step = 'deals_shown';

                // Send enhanced messages with photos
                const dealMessages = await createEnhancedDealMessages(finalDeals, userState.category, botConfig);
                for (const dealMessage of dealMessages) {
                    await sendWhatsAppMessage(storeId, fromNumber, dealMessage, botConfig);
                }
            } else {
                // No deals found after verification and enhancement
                const noDealsMessage = {
                    type: "text",
                    text: {
                        body: `😢 Sorry, I couldn't find any verifiable ${userState.category} deals near ${userState.location.description} right now. Please try another category or location!`
                    }
                };
                await sendWhatsAppMessage(storeId, fromNumber, noDealsMessage, botConfig);
            }
        } else {
            // This shouldn't happen, but handle gracefully
            console.error(`[LobangLah] Category selected but no location data available`);
            return {
                type: "text",
                text: {
                    body: "❌ Location data not found. Please share your location again to continue."
                }
            };
        }
    }
    
    // Handle legacy category selection buttons (including those with location context)
    if (actionId === 'food_deals' || actionId === 'clothes_deals' || actionId === 'groceries_deals' ||
        actionId.startsWith('food_deals_') || actionId.startsWith('clothes_deals_') || actionId.startsWith('groceries_deals_')) {
        
        // Determine category from button ID
        let category;
        if (actionId === 'food_deals' || actionId.startsWith('food_deals_')) {
            category = 'food';
        } else if (actionId === 'groceries_deals' || actionId.startsWith('groceries_deals_')) {
            category = 'groceries';
        } else {
            category = 'clothes';
        }
        
        userState.category = category;
        console.log(`[LobangLah] Category selected: ${category}`);
        
        // Check if we have location already set (from the new flow)
        if (userState.location) {
            console.log(`[LobangLah] Location already set, searching for deals...`);
            
            // Send interactive searching message using OpenAI
            const searchingMessage = await createInteractiveSearchingMessage(userState.location, category, botConfig);
            await sendLobangLahMessage(storeId, fromNumber, searchingMessage, botConfig, session);
            
            // Then search for deals and send results
            return await searchAndSendDeals(storeId, fromNumber, userState, botConfig, session);
        }
        
        // Fallback: if somehow category was selected without location, ask for location
        console.log(`[LobangLah] Category selected but no location set, requesting location`);
        userState.step = 'awaiting_location';
        return {
            type: "interactive",
            interactive: {
                type: "button",
                body: {
                    text: `Great! You've selected ${category === 'food' ? '🍕 Food' : category === 'groceries' ? '🛒 Groceries' : '👕 Fashion'} deals.\n\nNow I need to know your location to find the best deals near you! 📍`
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "send_location",
                                title: "📍 Share Location"
                            }
                        }
                    ]
                }
            }
        };
        
    } else if (actionId && actionId.startsWith('deal_')) {
        // Deal selected
        const dealIndex = parseInt(actionId.replace('deal_', '')) - 1;
        
        if (userState.lastDeals && userState.lastDeals[dealIndex]) {
            const selectedDeal = userState.lastDeals[dealIndex];
            console.log(`[LobangLah] Deal selected:`, selectedDeal.title);
            
            // Store selected deal for future actions
            userState.selectedDeal = selectedDeal;
            userState.step = 'deal_selected';
            
            return createLocationMessage(selectedDeal);
        }
    } else if (actionId.startsWith('get_directions_')) {
        // Handle indexed direction buttons (get_directions_0, get_directions_1, etc.)
        const dealIndex = parseInt(actionId.replace('get_directions_', ''));
        console.log(`[LobangLah] *** DIRECTIONS BUTTON CLICKED ***`);
        console.log(`[LobangLah] Action ID: ${actionId}`);
        console.log(`[LobangLah] Deal Index: ${dealIndex}`);
        console.log(`[LobangLah] Has lastDeals: ${!!userState.lastDeals}`);
        console.log(`[LobangLah] LastDeals length: ${userState.lastDeals?.length || 0}`);
        
        if (userState.lastDeals && userState.lastDeals[dealIndex]) {
            const deal = userState.lastDeals[dealIndex];
            const address = deal.address || deal.location || 'Address not available';
            const businessName = deal.businessName || deal.restaurant || deal.store || deal.title;
            
            console.log(`[LobangLah] Found deal for directions: ${businessName}`);
            console.log(`[LobangLah] Deal address: ${address}`);
            console.log(`[LobangLah] Deal coordinates: ${deal.latitude}, ${deal.longitude}`);
            console.log(`[LobangLah] Sending location for deal ${dealIndex}: ${businessName}`);
            
            // Send location message with coordinates if available
            if (deal.latitude && deal.longitude) {
                return {
                    type: "location",
                    location: {
                        latitude: parseFloat(deal.latitude),
                        longitude: parseFloat(deal.longitude),
                        name: businessName,
                        address: address
                    }
                };
            } else {
                // Fallback: Send text message with address and Google Maps link
                console.log(`[LobangLah] No coordinates available, sending Google Maps link`);
                const encodedAddress = encodeURIComponent(address);
                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}&utm_source=LobangLah&utm_medium=whatsapp&utm_campaign=deals`;
                console.log(`[LobangLah] Generated Maps URL: ${mapsUrl}`);
                
                return {
                    type: "text",
                    text: {
                        body: `📍 *${businessName}*\n\n🏢 *Address:*\n${address}\n\n🗺️ *Get Directions:*\n${mapsUrl}\n\n💡 Tap the link above to open in Google Maps and get directions!\n\n🎯 *LobangLah*`
                    }
                };
            }
        } else {
            console.log(`[LobangLah] *** DIRECTIONS FAILED - NO DEAL FOUND ***`);
            console.log(`[LobangLah] Deal Index: ${dealIndex}`);
            console.log(`[LobangLah] LastDeals: ${JSON.stringify(userState.lastDeals, null, 2)}`);
            console.log(`[LobangLah] User State: ${JSON.stringify(userState, null, 2)}`);
            console.log(`[LobangLah] Session: ${JSON.stringify(session, null, 2)}`);
            return {
                type: "text",
                text: {
                    body: `❌ *Deal Not Found*\n\nSorry, I couldn't find the deal you're looking for directions to. Please try searching for deals again.\n\n🎯 *LobangLah*`
                }
            };
        }
    } else if (actionId.startsWith('share_deal_')) {
        // Handle indexed share buttons (share_deal_0, share_deal_1, etc.)
        const dealIndex = parseInt(actionId.replace('share_deal_', ''));
        
        if (userState.lastDeals && userState.lastDeals[dealIndex]) {
            const deal = userState.lastDeals[dealIndex];
            const businessName = deal.businessName || deal.restaurant || deal.store || deal.title;
            const address = deal.address || deal.location;
            const offer = deal.offer || deal.discount || 'Special Deal';
            const validity = deal.validity || 'Limited time';
            
            const shareText = `🔥 *Amazing Deal Alert!*\n\n🏢 *${businessName}*\n💰 *${offer}*\n📍 ${address}\n⏰ ${validity}\n\n🚀 Found via LobangLah - Singapore's Best Deals Bot!`;
            
            return {
                type: "text",
                text: {
                    body: `📤 *Deal Shared!*\n\nHere's the deal info you can copy and share:\n\n${shareText}\n\n💡 Tip: Long press this message to copy and share with friends!`
                }
            };
        }
    } else if (actionId.startsWith('call_business_')) {
        // Handle indexed call buttons (call_business_0, call_business_1, etc.)
        const dealIndex = parseInt(actionId.replace('call_business_', ''));
        
        if (userState.lastDeals && userState.lastDeals[dealIndex]) {
            const deal = userState.lastDeals[dealIndex];
            const businessName = deal.businessName || deal.restaurant || deal.store || deal.title;
            const contact = deal.contact || deal.phone;
            
            if (contact) {
                
                return {
                    type: "text",
                    text: {
                        body: `📞 *Call ${businessName}*\n\n📱 *Phone:* ${contact}\n\n💡 Tap and hold the phone number above to call directly!\n\n🎯 *LobangLah*`
                    }
                };
            } else {
                return {
                    type: "text",
                    text: {
                        body: `📞 *Contact Info Not Available*\n\nSorry, I don't have contact information for ${businessName}.\n\n💡 Try searching for them online or visiting their location directly.\n\n🎯 *LobangLah*`
                    }
                };
            }
        }
    } else if (actionId.startsWith('set_reminder_')) {
        // Handle indexed set reminder buttons
        const dealIndex = parseInt(actionId.replace('set_reminder_', ''));
        console.log(`[LobangLah] *** SET REMINDER BUTTON CLICKED ***`);
        console.log(`[LobangLah] Action ID: ${actionId}`);
        console.log(`[LobangLah] Deal Index: ${dealIndex}`);
        console.log(`[LobangLah] Has lastDeals: ${!!userState.lastDeals}`);
        console.log(`[LobangLah] LastDeals length: ${userState.lastDeals?.length || 0}`);
        console.log(`[LobangLah] User State: ${JSON.stringify(userState, null, 2)}`);
        console.log(`[LobangLah] Session: ${JSON.stringify(session, null, 2)}`);
        
        if (userState.lastDeals && userState.lastDeals[dealIndex]) {
            const deal = userState.lastDeals[dealIndex];
            const businessName = deal.businessName || deal.restaurant || deal.store || deal.title || 'this deal';
            console.log(`[LobangLah] Found deal for reminder: ${businessName}`);
            userState.step = 'waiting_reminder_time';
            userState.reminderDeal = deal;
            userState.reminderDealIndex = dealIndex;
            
            return {
                type: "interactive",
                interactive: {
                    type: "button",
                    header: {
                        type: "text",
                        text: "⏰ Set Reminder"
                    },
                    body: {
                        text: `🔔 *Set Reminder for ${businessName}*\n\nWhen would you like to be reminded about this deal?\n\n⏰ Choose a time within the next 24 hours:\n\n• In 1 hour\n• In 2 hours\n• In 4 hours\n• Custom time (reply with text like "in 3 hours" or "at 7 PM")`
                    },
                    footer: {
                        text: "🎯 LobangLah Reminder System"
                    },
                    action: {
                        buttons: [
                            {
                                type: "reply",
                                reply: {
                                    id: "reminder_1hour",
                                    title: "⏰ In 1 Hour"
                                }
                            },
                            {
                                type: "reply",
                                reply: {
                                    id: "reminder_2hours",
                                    title: "⏰ In 2 Hours"
                                }
                            },
                            {
                                type: "reply",
                                reply: {
                                    id: "reminder_4hours",
                                    title: "⏰ In 4 Hours"
                                }
                            }
                        ]
                    }
                }
            };
        }
    } else if (actionId.startsWith('reminder_')) {
        // Handle reminder time selection
        console.log(`[LobangLah] *** REMINDER TIME SELECTED ***`);
        console.log(`[LobangLah] Action ID: ${actionId}`);
        console.log(`[LobangLah] Has reminderDeal: ${!!userState.reminderDeal}`);
        
        if (userState.reminderDeal) {
            const businessName = userState.reminderDeal.businessName || userState.reminderDeal.restaurant || userState.reminderDeal.store || userState.reminderDeal.title;
            console.log(`[LobangLah] Setting reminder for: ${businessName}`);
            let reminderTime;
            let timeText;
            
            if (actionId === 'reminder_1hour') {
                reminderTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
                timeText = '1 hour';
            } else if (actionId === 'reminder_2hours') {
                reminderTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
                timeText = '2 hours';
            } else if (actionId === 'reminder_4hours') {
                reminderTime = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours from now
                timeText = '4 hours';
            }
            
            // Save reminder to DynamoDB
            console.log(`[LobangLah] Attempting to save reminder to DynamoDB...`);
            console.log(`[LobangLah] Reminder time: ${reminderTime.toISOString()}`);
            try {
                const { saveReminderToDynamoDB } = await import('../utils/reminderUtils.js');
                await saveReminderToDynamoDB({
                    userId: fromNumber,
                    dealData: userState.reminderDeal,
                    reminderTime: reminderTime,
                    title: `${businessName} Deal Reminder`,
                    storeId: storeId
                });
                
                console.log(`[LobangLah] ✅ Reminder saved successfully for ${businessName} in ${timeText}`);
                
                // Reset reminder state
                userState.step = 'deals_shown';
                delete userState.reminderDeal;
                delete userState.reminderDealIndex;
                
                return {
                    type: "text",
                    text: {
                        body: `⏰ *Reminder Set Successfully!*\n\n🔔 You'll be reminded about **${businessName}** in ${timeText}.\n\n📅 Reminder Time: ${reminderTime.toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })} SGT\n\n✅ We'll send you a WhatsApp message when it's time!\n\n🎯 *LobangLah*`
                    }
                };
            } catch (error) {
                console.error('[LobangLah] ❌ Error saving reminder:', error);
                console.error('[LobangLah] Error details:', error.message);
                console.error('[LobangLah] Error stack:', error.stack);
                return {
                    type: "text",
                    text: {
                        body: `❌ *Error Setting Reminder*\n\nSorry, there was an issue setting your reminder. Please try again later.\n\nError: ${error.message}\n\n🎯 *LobangLah*`
                    }
                };
            }
        } else {
            console.log(`[LobangLah] *** REMINDER TIME SELECTION FAILED - NO REMINDER DEAL ***`);
            console.log(`[LobangLah] User state step: ${userState.step}`);
            return {
                type: "text",
                text: {
                    body: `❌ *Reminder Setup Error*\n\nSorry, I couldn't find the deal you want to set a reminder for. Please try clicking the reminder button again.\n\n🎯 *LobangLah*`
                }
            };
        }
    } else if (actionId === 'chat_ai_deals') {
        // Chat AI about deals action - engage ChatGPT to discuss the deals
        console.log(`[LobangLah] *** CHAT AI BUTTON CLICKED ***`);
        console.log(`[LobangLah] Action ID: ${actionId}`);
        
        // Debug: Log current userState to identify missing data
        console.log(`[LobangLah] Chat AI activation - userState check:`, {
            hasLastDeals: !!userState.lastDeals,
            dealsCount: userState.lastDeals?.length || 0,
            hasLocation: !!userState.location,
            hasCategory: !!userState.category,
            step: userState.step,
            userStateKeys: Object.keys(userState || {})
        });
        
        console.log(`[LobangLah] Session check:`, {
            hasSession: !!session,
            hasUserState: !!session?.userState,
            sessionKeys: Object.keys(session || {})
        });
        
        // Try to restore from session if userState is missing data
        if ((!userState.lastDeals || !userState.location) && session.userState) {
            console.log(`[LobangLah] Restoring missing data from session:`, {
                sessionHasDeals: !!session.userState.lastDeals,
                sessionHasLocation: !!session.userState.location,
                sessionHasCategory: !!session.userState.category
            });
            
            // Restore missing data from session
            userState.lastDeals = userState.lastDeals || session.userState.lastDeals;
            userState.location = userState.location || session.userState.location;
            userState.category = userState.category || session.userState.category;
        }
        
        // Chat AI functionality has been removed as requested by user
        return {
            type: "text",
            text: {
                body: "🚫 Chat AI feature has been disabled. Please use the deal buttons for directions, reminders, and sharing."
            }
        };
        
    } else if (actionId === 'more_deals') {
        // More deals action - search for additional deals from DynamoDB
        if (userState.category && userState.location) {
            const categoryName = userState.category === 'food' ? 'food' : 
                               userState.category === 'groceries' ? 'groceries' : 'fashion';
            const locationName = userState.location.displayName || userState.location.description || userState.location.name || 'your area';
            
            console.log(`[LobangLah] Searching for more ${userState.category} deals near ${locationName}...`);
            console.log(`[LobangLah] Currently excluding ${(userState.lastDeals || []).length} already shown deals`);
            
            // Send "searching" message to let user know we're working
            await sendLobangLahMessage(storeId, fromNumber, {
                type: "text",
                text: {
                    body: `🔍 *Searching for More ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Deals*\n\nLooking for additional deals near ${locationName}...\n\nPlease wait a moment! ⏳`
                }
            }, botConfig, session);
            
            // Get current deals to exclude from new search
            const excludeDeals = userState.lastDeals || [];
            
            // Search for more deals from DynamoDB
            const { searchMoreDealsFromDynamoDB } = await import('../utils/dealsUtils.js');
            const moreDeals = await searchMoreDealsFromDynamoDB(
                userState.location, 
                userState.category, 
                excludeDeals, 
                5 // Get up to 5 more deals
            );
            
            if (moreDeals && moreDeals.length > 0) {
                console.log(`[LobangLah] Found ${moreDeals.length} additional unique deals`);
                
                // Send confirmation message
                await sendLobangLahMessage(storeId, fromNumber, {
                    type: "text",
                    text: {
                        body: `✅ *Found ${moreDeals.length} More ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Deals!*\n\nHere are additional deals I haven't shown you yet:`
                    }
                }, botConfig, session);
                
                // Create catalog-based deal messages for the additional deals
                const moreDealMessages = await createCatalogDealsMessage(moreDeals, userState.category, botConfig);
                
                // Update user state with combined deals (ensure no duplicates)
                const allDeals = [...(userState.lastDeals || []), ...moreDeals];
                userState.lastDeals = allDeals;
                
                console.log(`[LobangLah] Total deals shown to user: ${allDeals.length}`);
                
                // Send the additional deal messages
                for (const dealMessage of moreDealMessages) {
                    await sendLobangLahMessage(storeId, fromNumber, dealMessage, botConfig, session);
                }
                
                // Update chat context for AI conversations
                if (userState.chatContext) {
                    userState.chatContext.deals = allDeals;
                }
                
                return null; // Already sent messages above
            } else {
                const categoryName = userState.category === 'food' ? 'food' : 
                                   userState.category === 'groceries' ? 'groceries' : 'fashion';
                const locationName = userState.location.description || userState.location.name || 'your area';
                
                return {
                    type: "text",
                    text: {
                        body: `🔍 *No More Deals Found*\n\n😔 I've already shown you all the available ${categoryName} deals near ${locationName}.\n\n💡 *Try:*\n• Search in a different area (share new location)\n• Try a different category\n• Chat with me about the current deals\n\n🎆 *LobangLah* - Always finding the best deals!`
                    }
                };
            }
        } else {
            return {
                type: "text",
                text: {
                    body: "🔍 To find more deals, please first search for deals by sharing your location! 📍"
                }
            };
        }
    } else if (actionId === 'share_deals') {
        // Share all deals action
        if (userState.lastDeals && userState.lastDeals.length > 0) {
            const categoryName = userState.category === 'food' ? 'Food' : 'Fashion';
            const locationName = userState.location.description || userState.location.name;
            
            let shareText = `🔥 *${userState.lastDeals.length} Amazing ${categoryName} Deals Near ${locationName}!*\n\n`;
            
            userState.lastDeals.slice(0, 5).forEach((deal, index) => {
                const businessName = deal.businessName || deal.restaurant || deal.store || deal.title;
                const offer = deal.offer || deal.discount || 'Special Deal';
                const address = deal.address || deal.location;
                
                shareText += `${index + 1}. *${businessName}*\n`;
                shareText += `   💰 ${offer}\n`;
                shareText += `   📍 ${address}\n\n`;
            });
            
            shareText += `🚀 Shared via LobangLah - Singapore's Best Deals Bot!`;
            
            return {
                type: "text",
                text: {
                    body: `📤 *Deals Shared!*\n\nHere's the complete deal list you can copy and share:\n\n${shareText}\n\n💡 Tip: Long press this message to copy and share with friends!`
                }
            };
        } else {
            return {
                type: "text",
                text: {
                    body: "📤 No deals to share yet! Please search for deals first by sharing your location. 📍"
                }
            };
        }
    } else if (actionId === 'more_deals') {
        // Legacy support for old more_deals button
        if (userState.category && userState.location) {
            console.log(`[LobangLah] Fetching more ${userState.category} deals for ${userState.location.description}`);
            return await searchAndSendMoreDeals(fromNumber, userState, botConfig, session);
        } else {
            userState.step = 'welcome';
            return createWelcomeMessage();
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
        // Get Google Maps API key from botConfig
        const googleMapsApiKey = botConfig?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyAEickHlx5T4alk1Cu5ks-EzF8xzyxoTDQ';
        
        console.log(`[LobangLah] API Key Sources:`, {
            fromBotConfigMapsKey: botConfig?.googleMapsApiKey ? 'EXISTS' : 'MISSING',
            fromEnvVar: process.env.GOOGLE_MAPS_API_KEY ? 'EXISTS' : 'MISSING',
            finalKeyLength: googleMapsApiKey ? googleMapsApiKey.length : 0
        });
        
        if (!googleMapsApiKey) {
            throw new Error('Google Maps API key not configured');
        }
        
        console.log(`[LobangLah] Resolving location and weather for: ${locationData.latitude}, ${locationData.longitude}`);
        
        // Use Google Maps + Weather API to get complete location data
        const locationResult = await resolveLocationAndWeather(
            locationData.latitude,
            locationData.longitude,
            botConfig.googleMapsApiKey
        );
        
        if (!locationResult.isValid) {
            throw new Error(locationResult.error || 'Failed to resolve location');
        }
        
        // CRITICAL: Clear previous location context to prevent session caching issues
        // Reset deals, chat context, and shared deal IDs when new location is shared
        console.log(`[LobangLah] NEW LOCATION SHARED - Clearing previous session context`);
        
        // Clear previous deals and chat context
        if (userState.deals) {
            console.log(`[LobangLah] Clearing ${userState.deals.length} previous deals from old location`);
            delete userState.deals;
        }
        if (userState.chatContext) {
            console.log(`[LobangLah] Clearing previous chat context from old location`);
            delete userState.chatContext;
        }
        
        // Reset shared deal IDs to prevent showing deals from previous location
        if (session.sharedDealIds && session.sharedDealIds.length > 0) {
            console.log(`[LobangLah] Clearing ${session.sharedDealIds.length} shared deal IDs from previous location`);
            session.sharedDealIds = [];
        }
        
        // Reset category selection to force user to choose again for new location
        if (userState.category) {
            console.log(`[LobangLah] Resetting category selection for new location`);
            delete userState.category;
        }
        
        // Store complete location data in user state (locationResult is now flattened)
        userState.location = {
            type: 'gps',
            latitude: locationResult.latitude || locationResult.coordinates?.lat,
            longitude: locationResult.longitude || locationResult.coordinates?.lng,
            displayName: locationResult.displayName,
            formattedAddress: locationResult.formattedAddress,
            area: locationResult.area,
            postalCode: locationResult.postalCode,
            fullLocationContext: locationResult.fullLocationContext,
            weather: locationResult.weather,
            source: 'google_maps_weather'
        };
        userState.step = 'location_confirmed';
        
        console.log(`[LobangLah] Location resolved: ${locationResult.displayName} (${locationResult.area})`);
        
        // Create OpenAI-generated interactive message with location and weather details
        const interactiveMessage = await generateLocationWeatherMessage(locationResult, botConfig);
        
        await sendLobangLahMessage(storeId, fromNumber, interactiveMessage, botConfig, session);
        
        // Add location context to conversation for OpenAI analysis
        session.conversation.push({ 
            role: 'assistant', 
            content: `Location confirmed: ${locationResult.displayName}, ${locationResult.area}. Weather: ${locationResult.weather?.displayText || 'unavailable'}. Ready to search for deals.` 
        });
        
        // Save updated session
        session.userState = userState;
        session.lastInteraction = 'location_confirmed';
        session.timestamp = Date.now();
        await updateSession(storeId, fromNumber, session);
        
        // Location processing complete - no return value needed
        
    } catch (error) {
        console.error(`[LobangLah] Error resolving location:`, error);
        
        // Fallback: send error message
        await sendLobangLahMessage(storeId, fromNumber, {
            type: "text",
            text: {
                body: `❌ *Unable to resolve location*\n\n${error.message}\n\nPlease try sharing your location again or make sure you're in Singapore.`
            }
        }, botConfig, session);
        
        return false;
    }
}

/**
 * Generate OpenAI-powered location and weather message that's relevant to the user
 */
async function generateLocationWeatherMessage(locationResult, botConfig) {
    try {
        const openAIApiKey = botConfig?.openAiApiKey || botConfig?.openAIApiKey || botConfig?.openai_api_key || process.env.OPENAI_API_KEY;
        
        if (!openAIApiKey) {
            console.log('[LobangLah] No OpenAI API key found, using fallback location message');
            return createFallbackLocationWeatherMessage(locationResult);
        }
        
        const openai = new OpenAI({ apiKey: openAIApiKey });
        
        // Build context for OpenAI
        const locationContext = `${locationResult.displayName}, ${locationResult.area || 'Singapore'}`;
        const weatherContext = locationResult.weather?.isValid 
            ? `Current weather: ${locationResult.weather.displayText}` 
            : 'Weather information unavailable';
        
        const hourlyContext = locationResult.hourlyForecast?.isValid && locationResult.hourlyForecast.hourlyForecast?.length > 0
            ? `Hourly forecast for rest of day (${locationResult.hourlyForecast.hoursRemaining}h remaining): ${locationResult.hourlyForecast.hourlyForecast.slice(0, 3).map(h => h.displayText).join(', ')}`
            : 'No hourly forecast available';
        
        const prompt = `You are LobangLah, Singapore's smartest AI deal discovery assistant. A user just shared their location and you've confirmed it.

Location: ${locationContext}
${weatherContext}
${hourlyContext}

Generate a warm, engaging message that:
1. Confirms their location in a friendly way
2. Mentions the current weather and what it means for deal hunting
3. If there's hourly forecast, mention how it affects their day/deals
4. Suggests what type of deals might be perfect for this weather/location
5. Encourages them to choose a category to start finding deals
6. Keep it conversational, helpful, and under 120 words
7. Use emojis appropriately
8. End with encouraging them to pick a deal category

Make it feel personal and relevant to their specific location and weather conditions.`;
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150,
            temperature: 0.7
        });
        
        const aiLocationText = response.choices[0].message.content.trim();
        
        console.log(`[LobangLah] Generated AI location/weather message: ${aiLocationText.substring(0, 80)}...`);
        
        return {
            type: 'interactive',
            interactive: {
                type: 'button',
                header: {
                    type: 'text',
                    text: '🎯 Location & Weather Confirmed'
                },
                body: {
                    text: aiLocationText
                },
                footer: {
                    text: 'Choose what type of deals you want to find'
                },
                action: {
                    buttons: [
                        {
                            type: 'reply',
                            reply: {
                                id: 'search_food_deals',
                                title: '🍽️ Food Deals'
                            }
                        },
                        {
                            type: 'reply',
                            reply: {
                                id: 'search_fashion_deals',
                                title: '👕 Fashion Deals'
                            }
                        },
                        {
                            type: 'reply',
                            reply: {
                                id: 'search_groceries_deals',
                                title: '🛒 Groceries'
                            }
                        }
                    ]
                }
            }
        };
        
    } catch (error) {
        console.error('[LobangLah] Error generating AI location/weather message:', error);
        return createFallbackLocationWeatherMessage(locationResult);
    }
}

/**
 * Create fallback location and weather message when OpenAI is not available
 */
function createFallbackLocationWeatherMessage(locationResult) {
    // Build location details
    let locationText = `📍 *Location Confirmed*\n${locationResult.displayName}`;
    
    if (locationResult.area && locationResult.area !== locationResult.displayName) {
        locationText += `\n📍 Area: ${locationResult.area}`;
    }
    
    // Add weather information if available
    if (locationResult.weather && locationResult.weather.isValid) {
        const weather = locationResult.weather;
        locationText += `\n\n${weather.emoji} *Current Weather*\n${weather.displayText}`;
        
        // Add hourly forecast for the rest of the day if available
        if (locationResult.hourlyForecast && locationResult.hourlyForecast.isValid) {
            const forecast = locationResult.hourlyForecast;
            if (forecast.hourlyForecast && forecast.hourlyForecast.length > 0) {
                locationText += `\n\n⏰ *Rest of Today (${forecast.hoursRemaining}h remaining)*`;
                
                // Show next 3-4 hours
                const hoursToShow = Math.min(forecast.hourlyForecast.length, 4);
                const forecastItems = forecast.hourlyForecast.slice(0, hoursToShow);
                
                forecastItems.forEach(hour => {
                    locationText += `\n${hour.displayText}`;
                });
                
                if (forecast.hourlyForecast.length > hoursToShow) {
                    locationText += `\n...and ${forecast.hourlyForecast.length - hoursToShow} more hours`;
                }
            }
        }
    } else if (locationResult.weatherError) {
        locationText += `\n\n🌤️ *Weather*\nUnable to get weather info`;
    }
    
    locationText += `\n\n🎯 Ready to find the best deals for you!`;
    
    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            header: {
                type: 'text',
                text: '🎯 Location & Weather Confirmed'
            },
            body: {
                text: locationText
            },
            footer: {
                text: 'Choose what type of deals you want to find'
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: 'search_food_deals',
                            title: '🍽️ Food Deals'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'search_fashion_deals',
                            title: '👕 Fashion Deals'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'search_groceries_deals',
                            title: '🛒 Groceries'
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Search for deals and send results
 */
async function searchAndSendDeals(storeId, fromNumber, userState, botConfig, session) {
    try {
        console.log(`[LobangLah] Searching for ${userState.category} deals near ${userState.location.description}`);
        
        // Send location/weather-aware sticker during deal search to keep user engaged
        console.log(`[LobangLah] Sending location/weather-aware sticker during deal search...`);
        const weatherData = userState.location?.weather || null;
        const locationData = userState.location || null;
        
        // Send personalized sticker asynchronously (don't wait for it)
        generateAndSendSticker(storeId, fromNumber, 'deals', botConfig, weatherData, locationData)
            .then(sent => {
                if (sent) {
                    console.log(`[LobangLah] Location/weather-aware sticker sent successfully during deal search`);
                } else {
                    console.log(`[LobangLah] Sticker sending failed (non-critical)`);
                }
            })
            .catch(error => {
                console.log(`[LobangLah] Sticker send failed (non-critical): ${error.message}`);
            });
        
        // Add search activity to conversation history
        const searchMessage = `Searching for ${userState.category} deals near ${userState.location.description}`;
        session.conversation.push({ role: 'assistant', content: searchMessage });
        
        // ALWAYS fetch fresh deals - no caching logic
        console.log(`[LobangLah] === FRESH DEAL SEARCH START ===`);
        console.log(`[LobangLah] Category: ${userState.category}`);
        console.log(`[LobangLah] Location Data:`, JSON.stringify({
            description: userState.location.description,
            displayName: userState.location.displayName,
            area: userState.location.area,
            postalCode: userState.location.postalCode,
            coordinates: { lat: userState.location.latitude, lng: userState.location.longitude },
            source: userState.location.source
        }, null, 2));
        console.log(`[LobangLah] Fetching FRESH deals (no cache) for ${userState.category} near ${userState.location.description}`);
        
        const deals = await searchDealsWithOpenAI(userState.location, userState.category, botConfig, userState.nearbyPlacesDetailed || []);
        
        if (deals && deals.length > 0) {
            console.log(`[LobangLah] Successfully found ${deals.length} deals, sending individual messages...`);
            
            // Track these deals as shown in the session
            const dealIds = deals.map(deal => deal.id || deal.title);
            session.shownDeals.push(...dealIds);
            
            // Store deals for selection (no location caching)
            userState.lastDeals = deals;
            userState.step = 'deals_shown';
            
            // Save user profile
            await saveUserProfile(fromNumber, {
                lastCategory: userState.category,
                lastLocation: userState.location,
                searchCount: (await getUserProfile(fromNumber))?.searchCount + 1 || 1
            });
            
            console.log(`[LobangLah] Found ${deals.length} deals for ${fromNumber}, total shown deals: ${session.shownDeals.length}`);
            
            // Create complete interactive deal messages with full details
            console.log(`[LobangLah] Creating COMPLETE interactive deal messages for category: ${userState.category}`);
            const dealMessages = await createIndividualDealMessages(deals, userState.category, botConfig);
            console.log(`[LobangLah] Created ${dealMessages.length} complete deal messages`);
            
            // Send each complete deal message with conversation tracking
            for (let i = 0; i < dealMessages.length; i++) {
                const message = dealMessages[i];
                
                try {
                    // Add bot message to conversation history for complete deal message
                    const dealTitle = message.dealData?.businessName || message.dealData?.title || `Deal ${i + 1}`;
                    const conversationEntry = `Showed complete deal: ${dealTitle} with full details and interactive buttons`;
                    session.conversation.push({ role: 'assistant', content: conversationEntry });
                    
                    // Send the complete deal message
                    await sendLobangLahMessage(storeId, fromNumber, message, botConfig, session);
                    
                    // Add small delay between messages to ensure proper delivery
                    if (i < dealMessages.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                    
                    console.log(`[LobangLah] Sent complete deal message ${i + 1}/${dealMessages.length}: ${dealTitle}`);
                    
                } catch (error) {
                    console.error(`[LobangLah] Error sending deal message ${i + 1}:`, error);
                    // Continue with next message even if one fails
                }
            }
            
            // Save user state to session for persistence
            session.userState = userState;
            session.lastInteraction = 'deals_shown';
            session.timestamp = Date.now();
            
            console.log(`[LobangLah] Saving session after sending deals:`, {
                hasLastDeals: !!session.userState.lastDeals,
                dealsCount: session.userState.lastDeals?.length || 0,
                hasLocation: !!session.userState.location,
                hasCategory: !!session.userState.category,
                step: session.userState.step,
                conversationLength: session.conversation?.length || 0
            });
            
            // Update session in DynamoDB
            await updateSession(storeId, fromNumber, session);
            console.log(`[LobangLah] Session saved successfully after sending ${catalogMessages.length} deals`);
            
            // Return null since we've already sent all messages
            return null;
            
        } else {
            console.log(`[LobangLah] No deals found for ${fromNumber}`);
            return {
                type: "text",
                text: { 
                    body: `🔍 I searched Instagram, Facebook, TikTok & web for ${userState.category} deals near ${userState.location.description} but couldn't find any active offers right now.\n\n💡 Try:\n• Different location\n• Other category\n• Check back later\n\n🔍 Source: AI Web Search | LobangLah 🎯` 
                }
            };
        }
        
    } catch (error) {
        console.error(`[LobangLah] Error searching for deals:`, error);
        console.error(`[LobangLah] Error stack:`, error.stack);
        console.error(`[LobangLah] User state:`, JSON.stringify(userState, null, 2));
        return {
            type: "text",
            text: { body: "Sorry, I had trouble finding deals right now. Please try again! 😅" }
        };
    }
}
