// Daily Alerts Handler for Cron Job
import { getAlertsToSend, updateAlertAfterSend } from '../utils/alertUtils.js';
import { getBotConfig } from '../utils/dynamoDbUtils.js';
// Remove the import since searchAndSendDeals is not exported
import { createTopDealsMessage } from '../utils/dealNavigationUtils.js';
import { sendWhatsAppMessage } from '../utils/whatsappUtils.js';
import { sendDailyRemindersToOwners } from './dailyDealHandler.js';

/**
 * Handler for daily deal alerts cron job
 */
export async function handleDailyAlerts(event, context) {
    try {
        console.log('[DailyAlerts] Starting daily alerts processing...');
        
        // First, send daily reminders to restaurant owners
        console.log('[DailyAlerts] Starting daily reminders for restaurant owners...');
        
        // Get default bot config for reminders (since we need it for OpenAI)
        const defaultBotConfig = await getBotConfig('default') || {
            openAiApiKey: process.env.OPENAI_API_KEY,
            whatsappToken: process.env.WHATSAPP_TOKEN,
            whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID
        };
        
        const reminderResult = await sendDailyRemindersToOwners(defaultBotConfig);
        console.log('[DailyAlerts] Daily reminders result:', reminderResult);
        
        // Get all alerts ready to be sent (within 24-hour window)
        const alertsToSend = await getAlertsToSend();
        
        if (alertsToSend.length === 0) {
            console.log('[DailyAlerts] No alerts ready to send');
            return {
                statusCode: 200,
                body: JSON.stringify({ 
                    message: 'Daily reminders and alerts processed',
                    reminders: reminderResult,
                    alerts: 'No alerts ready to send'
                })
            };
        }
        
        console.log(`[DailyAlerts] Processing ${alertsToSend.length} alerts`);
        
        let successCount = 0;
        let errorCount = 0;
        
        // Process each alert
        for (const alert of alertsToSend) {
            try {
                console.log(`[DailyAlerts] Processing alert: ${alert.alertId} for user: ${alert.phoneNumber}`);
                
                // Get bot config for the store
                const botConfig = await getBotConfig(alert.storeId);
                if (!botConfig) {
                    console.error(`[DailyAlerts] No bot config found for store: ${alert.storeId}`);
                    errorCount++;
                    continue;
                }
                
                // Create user state for deal search
                const userState = {
                    location: alert.location,
                    category: alert.category,
                    step: 'alert_triggered'
                };
                
                // Search for deals using the searchDealsForAlert function
                const deals = await searchDealsForAlert(userState, botConfig);
                
                if (deals && deals.length > 0) {
                    // Create top 5 deals message
                    const topDealsMessage = createTopDealsMessage(deals, alert.category, alert.location);
                    
                    // Add alert-specific navigation options
                    const alertNavigationMessage = createAlertNavigationMessage(alert);
                    
                    // Send the messages
                    await sendWhatsAppMessage(
                        alert.storeId,
                        alert.phoneNumber,
                        topDealsMessage,
                        botConfig
                    );
                    
                    // Small delay between messages
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    await sendWhatsAppMessage(
                        alert.storeId,
                        alert.phoneNumber,
                        alertNavigationMessage,
                        botConfig
                    );
                    
                    // Update alert after successful send
                    await updateAlertAfterSend(alert.alertId, alert.messageCount);
                    
                    console.log(`[DailyAlerts] Successfully sent alert: ${alert.alertId}`);
                    successCount++;
                    
                } else {
                    // Send "no deals found" message
                    const noDealsMessage = {
                        type: "text",
                        text: {
                            body: `🔍 *Daily Alert - No Deals Found*\n\nSorry lah! No ${alert.category} deals found near ${alert.location.displayName} today.\n\n💡 Try:\n• Different location\n• Other category\n• Check back tomorrow\n\n🔔 Your daily alert is still active!`
                        }
                    };
                    
                    await sendWhatsAppMessage(
                        alert.storeId,
                        alert.phoneNumber,
                        noDealsMessage,
                        botConfig
                    );
                    
                    // Update alert after successful send (even for no deals)
                    await updateAlertAfterSend(alert.alertId, alert.messageCount);
                    
                    console.log(`[DailyAlerts] Sent no deals message for alert: ${alert.alertId}`);
                    successCount++;
                }
                
            } catch (error) {
                console.error(`[DailyAlerts] Error processing alert ${alert.alertId}:`, error);
                errorCount++;
            }
        }
        
        console.log(`[DailyAlerts] Daily processing completed. Alerts - Success: ${successCount}, Errors: ${errorCount}`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Daily reminders and alerts processed successfully',
                reminders: reminderResult,
                alerts: {
                    total: alertsToSend.length,
                    success: successCount,
                    errors: errorCount
                }
            })
        };
        
    } catch (error) {
        console.error('[DailyAlerts] Error in daily alerts handler:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
}

/**
 * Search for deals for a specific alert
 */
async function searchDealsForAlert(userState, botConfig) {
    try {
        console.log(`[DailyAlerts] Searching for ${userState.category} deals near ${userState.location.displayName}`);
        
        // Import deal search function
        const { searchDealsWithOpenAI } = await import('../utils/dealsUtils.js');
        
        // Search for deals
        const deals = await searchDealsWithOpenAI(userState.location, userState.category, botConfig);
        
        if (deals && deals.length > 0) {
            console.log(`[DailyAlerts] Found ${deals.length} deals for alert`);
            
            // Enhance deals with photos if possible
            try {
                const { enhanceDealsWithPhotos } = await import('../utils/enhancedDealUtils.js');
                const enhancedDeals = await enhanceDealsWithPhotos(deals, [], botConfig.googleMapsApiKey);
                return enhancedDeals;
            } catch (enhanceError) {
                console.error('[DailyAlerts] Error enhancing deals:', enhanceError);
                return deals; // Return original deals if enhancement fails
            }
        } else {
            console.log('[DailyAlerts] No deals found for alert');
            return [];
        }
        
    } catch (error) {
        console.error('[DailyAlerts] Error searching deals for alert:', error);
        return [];
    }
}

/**
 * Create alert-specific navigation message
 */
function createAlertNavigationMessage(alert) {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: "🔔 Daily Alert Options"
            },
            body: {
                text: `Your daily ${alert.category} deals alert!\n\nWhat would you like to do?\n\n💡 *Quick Actions:*\n• Search for more deals\n• Change location\n• Manage your alerts`
            },
            footer: {
                text: "Your daily deal hunter at work! 🕵️"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "search_more_deals",
                            title: "✨ More"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "change_location",
                            title: "📍 New"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "manage_alerts",
                            title: "⚙️ Manage Alerts"
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Test function for manual alert triggering
 */
export async function testDailyAlert(alertId) {
    try {
        console.log(`[DailyAlerts] Testing alert: ${alertId}`);
        
        // This would be used for testing specific alerts
        // Implementation would be similar to handleDailyAlerts but for a specific alert
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Test alert processed' })
        };
        
    } catch (error) {
        console.error('[DailyAlerts] Error in test alert:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
} 