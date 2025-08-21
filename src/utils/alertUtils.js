// Daily Deal Alert Management Utilities
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Create a daily deal alert for a user
 */
export async function createDailyAlert(userData) {
    try {
        const tableName = process.env.ALERT_TABLE_NAME || 'store-ai-bot-dev-alerts';
        
        const alertId = uuidv4();
        const now = Date.now();
        
        // Use the storeId from WhatsApp store tokens table
        const storeId = userData.storeId;
        
        const alert = {
            alertId: alertId,
            userId: userData.userId,
            phoneNumber: userData.phoneNumber,
            storeId: storeId, // This should match the storeId in WhatsappStoreTokens table
            location: userData.location,
            category: userData.category,
            preferredTime: userData.preferredTime || '09:00', // Default to 9 AM
            timezone: userData.timezone || 'Asia/Singapore',
            isActive: true,
            lastSent: null,
            nextSendTime: calculateNextSendTime(userData.preferredTime || '09:00'),
            createdAt: now,
            updatedAt: now,
            ttl: Math.floor(now / 1000) + (365 * 24 * 60 * 60), // 1 year TTL
            messageCount: 0,
            maxMessages: 30 // Limit to 30 messages per alert
        };

        const command = new PutCommand({
            TableName: tableName,
            Item: alert
        });

        await docClient.send(command);
        console.log(`[AlertUtils] Created daily alert: ${alertId} for user: ${userData.phoneNumber}`);
        
        return alert;
        
    } catch (error) {
        console.error('[AlertUtils] Error creating daily alert:', error);
        throw error;
    }
}

/**
 * Get user's active alerts
 */
export async function getUserAlerts(userId, storeId) {
    try {
        const tableName = process.env.ALERT_TABLE_NAME || 'store-ai-bot-dev-alerts';
        
        const command = new QueryCommand({
            TableName: tableName,
            IndexName: 'UserStoreIndex',
            KeyConditionExpression: 'userId = :userId AND storeId = :storeId',
            FilterExpression: 'isActive = :isActive',
            ExpressionAttributeValues: {
                ':userId': userId,
                ':storeId': storeId,
                ':isActive': true
            }
        });

        const response = await docClient.send(command);
        
        console.log(`[AlertUtils] Found ${response.Items?.length || 0} active alerts for user: ${userId}`);
        return response.Items || [];
        
    } catch (error) {
        console.error('[AlertUtils] Error getting user alerts:', error);
        throw error;
    }
}

/**
 * Get alerts ready to be sent (within 24-hour window)
 */
export async function getAlertsToSend() {
    try {
        const tableName = process.env.ALERT_TABLE_NAME || 'store-ai-bot-dev-alerts';
        const now = Date.now();
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
        
        const command = new QueryCommand({
            TableName: tableName,
            IndexName: 'NextSendTimeIndex',
            KeyConditionExpression: 'nextSendTime BETWEEN :start AND :end',
            FilterExpression: 'isActive = :isActive AND messageCount < :maxMessages',
            ExpressionAttributeValues: {
                ':start': twentyFourHoursAgo,
                ':end': now,
                ':isActive': true,
                ':maxMessages': 30
            }
        });

        const response = await docClient.send(command);
        
        console.log(`[AlertUtils] Found ${response.Items?.length || 0} alerts ready to send`);
        return response.Items || [];
        
    } catch (error) {
        console.error('[AlertUtils] Error getting alerts to send:', error);
        throw error;
    }
}

/**
 * Update alert after sending
 */
export async function updateAlertAfterSend(alertId, messageCount) {
    try {
        const tableName = process.env.ALERT_TABLE_NAME || 'store-ai-bot-dev-alerts';
        const now = Date.now();
        
        const command = new UpdateCommand({
            TableName: tableName,
            Key: { alertId },
            UpdateExpression: 'SET lastSent = :lastSent, nextSendTime = :nextSendTime, messageCount = :messageCount, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':lastSent': now,
                ':nextSendTime': calculateNextSendTime(null, now), // Calculate next day
                ':messageCount': messageCount + 1,
                ':updatedAt': now
            }
        });

        await docClient.send(command);
        console.log(`[AlertUtils] Updated alert: ${alertId} after sending`);
        
    } catch (error) {
        console.error('[AlertUtils] Error updating alert after send:', error);
        throw error;
    }
}

/**
 * Deactivate an alert
 */
export async function deactivateAlert(alertId) {
    try {
        const tableName = process.env.ALERT_TABLE_NAME || 'store-ai-bot-dev-alerts';
        
        const command = new UpdateCommand({
            TableName: tableName,
            Key: { alertId },
            UpdateExpression: 'SET isActive = :isActive, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':isActive': false,
                ':updatedAt': Date.now()
            }
        });

        await docClient.send(command);
        console.log(`[AlertUtils] Deactivated alert: ${alertId}`);
        
    } catch (error) {
        console.error('[AlertUtils] Error deactivating alert:', error);
        throw error;
    }
}

/**
 * Calculate next send time based on preferred time
 */
function calculateNextSendTime(preferredTime, baseTime = null) {
    const now = baseTime || Date.now();
    const today = new Date(now);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Parse preferred time (format: "HH:MM")
    const [hours, minutes] = preferredTime.split(':').map(Number);
    tomorrow.setHours(hours, minutes, 0, 0);
    
    return tomorrow.getTime();
}

/**
 * Create alert setup message
 */
export function createAlertSetupMessage() {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: "🔔 Daily Deal Alerts"
            },
            body: {
                text: `Want to get the best deals delivered daily?\n\n🎯 *How it works:*\n• Choose your location and category\n• Set your preferred time (9 AM - 8 PM)\n• Get top 5 deals every day\n• Easy to pause or change anytime\n\n⏰ *Available times:*\n9:00 AM, 12:00 PM, 3:00 PM, 6:00 PM, 8:00 PM`
            },
            footer: {
                text: "Never miss the best deals! 🚀"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "setup_alert",
                            title: "🔔 Setup Alert"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "manage_alerts",
                            title: "⚙️ Manage Alerts"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "back_to_deals",
                            title: "🔙 Back"
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Create alert time selection message
 */
export function createAlertTimeSelectionMessage() {
    return {
        type: "interactive",
        interactive: {
            type: "list",
            header: {
                type: "text",
                text: "⏰ Choose Alert Time"
            },
            body: {
                text: "When would you like to receive your daily deals?\n\nSelect your preferred time:"
            },
            footer: {
                text: "You can change this anytime"
            },
            action: {
                button: "Select Time",
                sections: [
                    {
                        title: "Morning",
                        rows: [
                            {
                                id: "alert_time_09:00",
                                title: "9:00 AM",
                                description: "Start your day with great deals"
                            }
                        ]
                    },
                    {
                        title: "Afternoon",
                        rows: [
                            {
                                id: "alert_time_12:00",
                                title: "12:00 PM",
                                description: "Lunch break deals"
                            },
                            {
                                id: "alert_time_15:00",
                                title: "3:00 PM",
                                description: "Afternoon pick-me-up"
                            }
                        ]
                    },
                    {
                        title: "Evening",
                        rows: [
                            {
                                id: "alert_time_18:00",
                                title: "6:00 PM",
                                description: "After work deals"
                            },
                            {
                                id: "alert_time_20:00",
                                title: "8:00 PM",
                                description: "Evening relaxation"
                            }
                        ]
                    }
                ]
            }
        }
    };
}

/**
 * Create alert confirmation message
 */
export function createAlertConfirmationMessage(alertData) {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: "✅ Alert Created!"
            },
            body: {
                text: `🎉 Your daily deal alert is now active!\n\n📍 *Location:* ${alertData.location.displayName}\n🎯 *Category:* ${alertData.category}\n⏰ *Time:* ${alertData.preferredTime}\n\nYou'll receive top 5 ${alertData.category} deals every day at ${alertData.preferredTime}.\n\n💡 *Manage your alerts anytime by typing "manage alerts"*`
            },
            footer: {
                text: "Happy deal hunting! 🚀"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "setup_another_alert",
                            title: "🔔 Setup Another"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "manage_alerts",
                            title: "⚙️ Manage Alerts"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "back_to_deals",
                            title: "🔙 Back"
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Create alert management message
 */
export async function createAlertManagementMessage(userId, storeId) {
    try {
        const alerts = await getUserAlerts(userId, storeId);
        
        if (alerts.length === 0) {
            return {
                type: "interactive",
                interactive: {
                    type: "button",
                    header: {
                        type: "text",
                        text: "⚙️ Manage Alerts"
                    },
                    body: {
                        text: "You don't have any active alerts yet.\n\n🔔 *Setup your first alert to get daily deals!*"
                    },
                    footer: {
                        text: "Never miss the best deals"
                    },
                    action: {
                        buttons: [
                            {
                                type: "reply",
                                reply: {
                                    id: "setup_alert",
                                    title: "🔔 Setup Alert"
                                }
                            },
                            {
                                type: "reply",
                                reply: {
                                    id: "back_to_deals",
                                    title: "🔙 Back"
                                }
                            }
                        ]
                    }
                }
            };
        }
        
        let bodyText = `You have ${alerts.length} active alert(s):\n\n`;
        
        alerts.forEach((alert, index) => {
            bodyText += `${index + 1}. ${alert.category} deals\n`;
            bodyText += `   📍 ${alert.location.displayName}\n`;
            bodyText += `   ⏰ ${alert.preferredTime}\n\n`;
        });
        
        bodyText += "What would you like to do?";
        
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: "⚙️ Manage Alerts"
                },
                body: {
                    text: bodyText
                },
                footer: {
                    text: "Manage your daily deal alerts"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "pause_all_alerts",
                                title: "⏸️ Pause All"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "setup_alert",
                                title: "🔔 Add Alert"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "back_to_deals",
                                title: "🔙 Back"
                            }
                        }
                    ]
                }
            }
        };
        
    } catch (error) {
        console.error('[AlertUtils] Error creating alert management message:', error);
        return {
            type: "text",
            text: {
                body: "❌ Sorry lah! Couldn't load your alerts right now."
            }
        };
    }
} 