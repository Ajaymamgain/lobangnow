// Enhanced Webhook Handler with Improved Session Management
import { createOrContinueSession, updateSessionState, logOutboundMessage, getConversationHistory, SESSION_STATES } from '../utils/sessionManager.js';
import { handleLobangLahMessage } from './lobangLahHandler.js';
import { getBotConfig } from '../utils/dynamoDbUtils.js';

/**
 * Enhanced webhook handler with improved session management
 */
export async function handleEnhancedWebhook(event) {
    console.log('[EnhancedWebhook] Processing webhook event');
    
    try {
        // Parse the webhook event
        const body = JSON.parse(event.body);
        const entry = body.entry?.[0];
        const change = entry?.changes?.[0];
        const message = change?.value?.messages?.[0];
        
        if (!message) {
            console.log('[EnhancedWebhook] No message found in webhook');
            return {
                statusCode: 200,
                body: JSON.stringify({ status: 'ok', message: 'No message to process' })
            };
        }
        
        // Extract message details
        const phoneNumber = message.from;
        const messageId = message.id;
        const messageType = message.type;
        const timestamp = message.timestamp;
        
        console.log(`[EnhancedWebhook] Processing ${messageType} message from ${phoneNumber}`);
        
        // Get bot configuration
        const storeId = 'cmanyfn1e0001jl04j3k45mz5'; // Your store ID
        const botConfig = await getBotConfig(storeId);
        
        if (!botConfig) {
            console.error('[EnhancedWebhook] Failed to get bot configuration');
            return {
                statusCode: 500,
                body: JSON.stringify({ status: 'error', message: 'Bot configuration not found' })
            };
        }
        
        // Extract message content based on type
        let messageText, interactiveData, locationData;
        
        switch (messageType) {
            case 'text':
                messageText = message.text?.body;
                break;
            case 'interactive':
                interactiveData = message.interactive;
                messageText = `[Interactive: ${interactiveData.button_reply?.id || interactiveData.list_reply?.id}]`;
                break;
            case 'location':
                locationData = message.location;
                messageText = `[Location: ${locationData.latitude}, ${locationData.longitude}]`;
                break;
            default:
                messageText = `[${messageType} message]`;
        }
        
        // Create or continue session and log inbound message
        const sessionInfo = await createOrContinueSession(
            phoneNumber, 
            messageId, 
            messageText, 
            'inbound'
        );
        
        console.log(`[EnhancedWebhook] Session info:`, {
            sessionId: sessionInfo.sessionId,
            currentState: sessionInfo.sessionState.currentState,
            isNewSession: !sessionInfo.sessionState.lastUpdated
        });
        
        // Get conversation history for context
        const conversationHistory = await getConversationHistory(
            phoneNumber, 
            sessionInfo.sessionId, 
            10
        );
        
        console.log(`[EnhancedWebhook] Conversation history: ${conversationHistory.length} messages`);
        
        // Process message through LobangLah handler
        const response = await handleLobangLahMessage(
            storeId,
            phoneNumber,
            messageText,
            messageType,
            botConfig,
            interactiveData,
            locationData
        );
        
        // If we have a response, log it as outbound
        if (response) {
            const responseText = extractResponseText(response);
            const responseMessageId = `outbound_${Date.now()}`;
            
            await logOutboundMessage(
                phoneNumber,
                sessionInfo.sessionId,
                responseMessageId,
                responseText,
                sessionInfo.sessionState
            );
        }
        
        // Update session state based on message processing
        const newState = determineNewState(messageType, interactiveData, sessionInfo.sessionState.currentState);
        if (newState !== sessionInfo.sessionState.currentState) {
            await updateSessionState(phoneNumber, sessionInfo.sessionId, newState, {
                lastMessageType: messageType,
                lastMessageText: messageText
            });
        }
        
        console.log(`[EnhancedWebhook] Successfully processed message from ${phoneNumber}`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                status: 'ok', 
                sessionId: sessionInfo.sessionId,
                state: newState
            })
        };
        
    } catch (error) {
        console.error('[EnhancedWebhook] Error processing webhook:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                status: 'error', 
                message: 'Internal server error',
                error: error.message 
            })
        };
    }
}

/**
 * Extract text content from response object
 */
function extractResponseText(response) {
    if (typeof response === 'string') {
        return response;
    }
    
    if (response.text?.body) {
        return response.text.body;
    }
    
    if (response.interactive?.body?.text) {
        return response.interactive.body.text;
    }
    
    return '[Response message]';
}

/**
 * Determine new session state based on message and current state
 */
function determineNewState(messageType, interactiveData, currentState) {
    // State machine logic
    switch (currentState) {
        case SESSION_STATES.START:
            if (messageType === 'text' || messageType === 'interactive') {
                return SESSION_STATES.ASK_LOCATION;
            }
            break;
            
        case SESSION_STATES.ASK_LOCATION:
            if (messageType === 'location') {
                return SESSION_STATES.LOCATION_RECEIVED;
            }
            if (messageType === 'interactive' && interactiveData?.button_reply?.id === 'share_location_prompt') {
                return SESSION_STATES.ASK_LOCATION;
            }
            break;
            
        case SESSION_STATES.LOCATION_RECEIVED:
            return SESSION_STATES.ASK_CATEGORY;
            
        case SESSION_STATES.ASK_CATEGORY:
            if (messageType === 'interactive' && interactiveData?.button_reply?.id?.startsWith('search_')) {
                return SESSION_STATES.SEARCHING_DEALS;
            }
            break;
            
        case SESSION_STATES.SEARCHING_DEALS:
            return SESSION_STATES.SHOWING_DEALS;
            
        case SESSION_STATES.SHOWING_DEALS:
            if (messageType === 'interactive') {
                const actionId = interactiveData?.button_reply?.id || interactiveData?.list_reply?.id;
                if (actionId === 'setup_alert') {
                    return SESSION_STATES.ALERT_SETUP;
                }
                if (actionId === 'change_location') {
                    return SESSION_STATES.ASK_LOCATION;
                }
                return SESSION_STATES.DEAL_INTERACTION;
            }
            break;
            
        case SESSION_STATES.DEAL_INTERACTION:
            if (messageType === 'interactive' && interactiveData?.button_reply?.id === 'what_else') {
                return SESSION_STATES.START;
            }
            break;
            
        case SESSION_STATES.ALERT_SETUP:
            return SESSION_STATES.END;
    }
    
    return currentState; // Keep current state if no transition applies
}

/**
 * Verify webhook signature (for security)
 */
export function verifyWebhookSignature(event, verifyToken) {
    const signature = event.headers['x-hub-signature-256'];
    if (!signature) {
        console.warn('[EnhancedWebhook] No signature found in webhook');
        return false;
    }
    
    // Implement signature verification logic here
    // This is a simplified version - you should implement proper HMAC verification
    return true;
} 