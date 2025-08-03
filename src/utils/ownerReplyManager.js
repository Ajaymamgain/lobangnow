// Owner Reply Manager utility for WhatsApp AI Bot
// Handles one-way owner messages to customers
import { sendWhatsAppMessage } from './whatsappUtils.js';
import { getBotConfig } from './dynamoDbUtils.js';

/**
 * Creates a minimal botConfig object using the provided botConfig, DynamoDB config, or environment variables as fallback
 * @param {object} sourceBotConfig - Original botConfig to extract values from if available
 * @param {string} storeId - Store ID for fetching config from DynamoDB if needed
 * @returns {Promise<object>} A minimal botConfig object with WhatsApp credentials
 */
async function createMinimalBotConfig(sourceBotConfig = null, storeId = null) {
    // First try to get values from the provided botConfig
    let token = sourceBotConfig?.whatsappToken;
    let phoneId = sourceBotConfig?.whatsappPhoneNumberId;
    
    // If not found and we have a storeId, try fetching from DynamoDB
    if ((!token || !phoneId) && storeId) {
        try {
            console.log(`[OwnerReplyManager] Getting WhatsApp credentials from DynamoDB for store ${storeId}`);
            const dbConfig = await getBotConfig(storeId);
            
            if (dbConfig) {
                token = token || dbConfig.whatsappToken;
                phoneId = phoneId || dbConfig.whatsappPhoneNumberId;
                
                console.log(`[OwnerReplyManager] DynamoDB config: token=${token ? 'present' : 'missing'}, phoneId=${phoneId ? 'present' : 'missing'}`);
            } else {
                console.warn(`[OwnerReplyManager] No config found in DynamoDB for store ${storeId}`);
            }
        } catch (error) {
            console.error(`[OwnerReplyManager] Failed to fetch bot config from DynamoDB:`, error);
        }
    }
    
    // Finally fall back to environment variables
    token = token || process.env.WHATSAPP_API_TOKEN;
    phoneId = phoneId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    
    console.log(`[OwnerReplyManager] Final config: token=${token ? 'present' : 'missing'}, phoneId=${phoneId ? 'present' : 'missing'}`);
    
    return {
        whatsappToken: token,
        whatsappPhoneNumberId: phoneId
    };
}

/**
 * Sends a one-way message from the store owner to a customer
 * @param {string} storeId - The store ID
 * @param {string} customerPhone - The customer's phone number
 * @param {string} message - The message to send
 * @param {string} orderId - The order ID associated with the message
 * @param {string} orderNumber - The user-friendly order number (optional)
 * @param {object} botConfig - Optional bot configuration with WhatsApp credentials
 * @param {boolean} interactive - Whether to include interactive buttons (default: false)
 * @param {object} storeInfo - Store information including location and timings
 * @returns {Promise<boolean>} - True if message was sent successfully
 */
async function sendOwnerMessageToCustomer(storeId, customerPhone, message, orderId, orderNumber = null, botConfig = null, interactive = false, storeInfo = null) {
    console.log(`[OwnerReplyManager] Sending owner message to customer ${customerPhone} for order ${orderId}`);
    
    try {
        // Ensure we have valid WhatsApp credentials
        const effectiveBotConfig = await createMinimalBotConfig(botConfig, storeId);
        
        if (!effectiveBotConfig.whatsappToken || !effectiveBotConfig.whatsappPhoneNumberId) {
            console.error(`[OwnerReplyManager] Missing WhatsApp credentials for store ${storeId}`);
            return false;
        }
        
        // Format message with order context
        const displayOrderId = orderNumber || orderId.substring(0, 8);
        let formattedMessage = `Message from store regarding your order #${displayOrderId}:\n\n${message}`;
        
        // Add store information if provided
        if (storeInfo) {
            formattedMessage += "\n\n📍 Store Location: " + (storeInfo.location || "Contact store for details");
            formattedMessage += "\n⏰ Collection Hours: " + (storeInfo.hours || "Contact store for details");
        }
        
        if (interactive) {
            // Send interactive message with buttons
            console.log(`[OwnerReplyManager] Sending interactive message to customer ${customerPhone} for order ${orderId}`); 
            const response = await sendWhatsAppMessage(storeId, customerPhone, {
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: {
                        text: formattedMessage
                    },
                    action: {
                        buttons: [
                            {
                                type: 'reply',
                                reply: {
                                    id: `customer_response_${orderId}`,
                                    title: 'Send Message to Store'
                                }
                            }
                        ]
                    }
                }
            }, effectiveBotConfig);
            
            // Check for null or error response from WhatsApp API
            if (!response) {
                console.error(`[OwnerReplyManager] WhatsApp API call failed for customer ${customerPhone} - null response`); 
                throw new Error('WhatsApp API call failed - null response');
            }
            console.log(`[OwnerReplyManager] WhatsApp API response for customer message:`, JSON.stringify(response));
        } else {
            // Send regular text message
            console.log(`[OwnerReplyManager] Sending regular text message to customer ${customerPhone} for order ${orderId}`);
            const response = await sendWhatsAppMessage(storeId, customerPhone, {
                type: 'text',
                text: { body: formattedMessage }
            }, effectiveBotConfig);
            
            // Check for null or error response from WhatsApp API
            if (!response) {
                console.error(`[OwnerReplyManager] WhatsApp API call failed for customer ${customerPhone} - null response`);
                throw new Error('WhatsApp API call failed - null response');
            }
            console.log(`[OwnerReplyManager] WhatsApp API response for customer message:`, JSON.stringify(response));
        }
        
        console.log(`[OwnerReplyManager] Successfully sent owner message to customer ${customerPhone}`);
        return true;
    } catch (error) {
        console.error(`[OwnerReplyManager] Failed to send owner message to customer: ${error.message}`);
        return false;
    }
}

/**
 * Simplified handleOwnerReply function that maintains compatibility with webhook.js
 * This version does not handle any chat - it always returns { handled: false }
 * @param {object} message - The incoming WhatsApp message object.
 * @param {object} session - The user's session object.
 * @param {object} context - The context object containing storeId, from, botConfig.
 * @returns {object} An object containing { handled: false, session: object }.
 */
async function handleOwnerReply(message, session, context) {
    const { storeId, from } = context;
    console.log(`[OwnerReplyManager] [storeId: ${storeId}] Bypassing owner-reply handling for ${from}`);
    // Always return not handled since we've removed the chat functionality
    return { handled: false, session };
}

// Export the one-way messaging functions
export {
    sendOwnerMessageToCustomer,
    createMinimalBotConfig,
    handleOwnerReply
};
