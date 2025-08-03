// LobangLah Reminder System Utilities
import { DynamoDBClient, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';

/**
 * Save a reminder to DynamoDB
 */
export async function saveReminder(phoneNumber, dealData, reminderTime, reminderTitle) {
    try {
        const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        const tableName = 'store-ai-bot-dev-reminders';
        
        const reminderId = uuidv4();
        const currentTime = new Date().toISOString();
        const reminderTimeISO = new Date(reminderTime).toISOString();
        
        // Calculate TTL (48 hours from creation for cleanup)
        const ttl = Math.floor(Date.now() / 1000) + (48 * 60 * 60);
        
        const reminderItem = {
            reminderId: reminderId,
            phoneNumber: phoneNumber,
            reminderTime: reminderTimeISO,
            reminderTitle: reminderTitle,
            dealData: dealData,
            status: 'pending', // pending, sent, cancelled
            createdAt: currentTime,
            ttl: ttl
        };
        
        const putParams = {
            TableName: tableName,
            Item: marshall(reminderItem)
        };
        
        await dynamoClient.send(new PutItemCommand(putParams));
        console.log(`[ReminderUtils] Saved reminder: ${reminderId} for ${phoneNumber} at ${reminderTimeISO}`);
        
        return reminderId;
        
    } catch (error) {
        console.error('[ReminderUtils] Error saving reminder:', error);
        return null;
    }
}

/**
 * Get pending reminders that need to be sent
 */
export async function getPendingReminders() {
    try {
        const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        const tableName = 'store-ai-bot-dev-reminders';
        
        const currentTime = new Date().toISOString();
        
        // Scan for pending reminders that are due
        const scanParams = {
            TableName: tableName,
            FilterExpression: '#status = :status AND reminderTime <= :currentTime',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: marshall({
                ':status': 'pending',
                ':currentTime': currentTime
            })
        };
        
        const scanCommand = new ScanCommand(scanParams);
        const result = await dynamoClient.send(scanCommand);
        
        if (!result.Items || result.Items.length === 0) {
            return [];
        }
        
        const pendingReminders = result.Items.map(item => unmarshall(item));
        console.log(`[ReminderUtils] Found ${pendingReminders.length} pending reminders`);
        
        return pendingReminders;
        
    } catch (error) {
        console.error('[ReminderUtils] Error getting pending reminders:', error);
        return [];
    }
}

/**
 * Mark reminder as sent
 */
export async function markReminderAsSent(reminderId) {
    try {
        const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        const tableName = 'store-ai-bot-dev-reminders';
        
        const updateParams = {
            TableName: tableName,
            Key: marshall({ reminderId: reminderId }),
            UpdateExpression: 'SET #status = :status, sentAt = :sentAt',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: marshall({
                ':status': 'sent',
                ':sentAt': new Date().toISOString()
            })
        };
        
        const { UpdateItemCommand } = await import('@aws-sdk/client-dynamodb');
        await dynamoClient.send(new UpdateItemCommand(updateParams));
        console.log(`[ReminderUtils] Marked reminder ${reminderId} as sent`);
        
    } catch (error) {
        console.error('[ReminderUtils] Error marking reminder as sent:', error);
    }
}

/**
 * Create reminder setup message
 */
export function createReminderSetupMessage(dealData) {
    const businessName = dealData.businessName || dealData.restaurant || dealData.store || dealData.title;
    const offer = dealData.offer || dealData.discount || 'Special Deal';
    
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: "⏰ Set Deal Reminder"
            },
            body: {
                text: `🎯 **${businessName}**\n💰 ${offer}\n\n⏰ **Set a reminder for this deal!**\n\nI can remind you about this amazing deal within the next 24 hours. Just tell me:\n\n📅 **When**: What time would you like to be reminded?\n📝 **Title**: Custom reminder message (optional)\n\n*Example: "Remind me in 2 hours" or "Remind me at 7 PM about dinner deal"*`
            },
            footer: {
                text: "🔔 LobangLah Reminder Service"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: `set_reminder_${dealData.dealId || 'deal'}`,
                            title: "⏰ Set Reminder"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "skip_reminder",
                            title: "⏭️ Skip"
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Create reminder notification message
 */
export function createReminderNotificationMessage(reminderData) {
    const dealData = reminderData.dealData;
    const businessName = dealData.businessName || dealData.restaurant || dealData.store || dealData.title;
    const offer = dealData.offer || dealData.discount || 'Special Deal';
    const address = dealData.address || 'Singapore';
    const dealLink = dealData.dealLink || dealData.link || dealData.source;
    
    let messageText = `🔔 **REMINDER: ${reminderData.reminderTitle || 'Deal Alert'}**\n\n`;
    messageText += `🎯 **${businessName}**\n`;
    messageText += `💰 **${offer}**\n`;
    messageText += `📍 **${address}**\n\n`;
    
    if (dealData.description) {
        messageText += `📋 **Details**: ${dealData.description}\n\n`;
    }
    
    if (dealLink) {
        messageText += `🔗 **Link**: ${dealLink}\n\n`;
    }
    
    messageText += `⏰ *Reminder set for: ${new Date(reminderData.reminderTime).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })} SGT*\n\n`;
    messageText += `🎆 **LobangLah** - Never miss a great deal!`;
    
    return {
        type: "text",
        text: {
            body: messageText
        }
    };
}

/**
 * Parse reminder time from user input
 */
export function parseReminderTime(userInput) {
    const now = new Date();
    const input = userInput.toLowerCase().trim();
    
    // Handle "in X hours" format
    const hoursMatch = input.match(/in (\d+) hours?/);
    if (hoursMatch) {
        const hours = parseInt(hoursMatch[1]);
        if (hours <= 24) {
            const reminderTime = new Date(now.getTime() + (hours * 60 * 60 * 1000));
            return reminderTime;
        }
    }
    
    // Handle "in X minutes" format
    const minutesMatch = input.match(/in (\d+) minutes?/);
    if (minutesMatch) {
        const minutes = parseInt(minutesMatch[1]);
        if (minutes <= 1440) { // 24 hours in minutes
            const reminderTime = new Date(now.getTime() + (minutes * 60 * 1000));
            return reminderTime;
        }
    }
    
    // Handle "at X PM/AM" format
    const timeMatch = input.match(/at (\d{1,2}):?(\d{0,2})\s*(am|pm)/);
    if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2] || '0');
        const period = timeMatch[3];
        
        if (period === 'pm' && hours !== 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;
        
        const reminderTime = new Date(now);
        reminderTime.setHours(hours, minutes, 0, 0);
        
        // If the time has passed today, set for tomorrow
        if (reminderTime <= now) {
            reminderTime.setDate(reminderTime.getDate() + 1);
        }
        
        // Check if within 24 hours
        if (reminderTime.getTime() - now.getTime() <= 24 * 60 * 60 * 1000) {
            return reminderTime;
        }
    }
    
    return null; // Could not parse or exceeds 24 hours
}
