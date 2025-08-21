// Enhanced Session Manager for WhatsApp Bot
import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });

// Session States for State Machine
export const SESSION_STATES = {
    START: 'start',
    ASK_LOCATION: 'ask_location',
    LOCATION_RECEIVED: 'location_received',
    ASK_CATEGORY: 'ask_category',
    SEARCHING_DEALS: 'searching_deals',
    SHOWING_DEALS: 'showing_deals',
    DEAL_INTERACTION: 'deal_interaction',
    ALERT_SETUP: 'alert_setup',
    END: 'end'
};

/**
 * Get the latest session for a phone number
 */
export async function getLatestSession(phoneNumber) {
    const tableName = process.env.ENHANCED_SESSION_TABLE_NAME || 'store-ai-bot-dev-enhanced-sessions';
    
    try {
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'phoneNumber = :p',
            ExpressionAttributeValues: { ':p': { S: phoneNumber } },
            ScanIndexForward: false, // latest first
            Limit: 1
        }));

        if (result.Items && result.Items.length > 0) {
            const session = unmarshall(result.Items[0]);
            console.log(`[SessionManager] Found latest session for ${phoneNumber}: ${session.sessionId}`);
            return session;
        } else {
            console.log(`[SessionManager] No session found for ${phoneNumber}`);
            return null;
        }
    } catch (error) {
        console.error(`[SessionManager] Error getting latest session for ${phoneNumber}:`, error);
        return null;
    }
}

/**
 * Create a new session or continue existing session
 */
export async function createOrContinueSession(phoneNumber, messageId, messageText, direction = 'inbound') {
    const tableName = process.env.ENHANCED_SESSION_TABLE_NAME || 'store-ai-bot-dev-enhanced-sessions';
    const timestamp = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 86400; // 24 hours
    
    // Get latest session to decide whether to continue or start new
    const latestSession = await getLatestSession(phoneNumber);
    
    let sessionId, sessionState;
    
    if (latestSession && shouldContinueSession(latestSession, messageText)) {
        // Continue existing session
        sessionId = latestSession.sessionId;
        sessionState = latestSession.sessionState || { currentState: SESSION_STATES.START };
        console.log(`[SessionManager] Continuing session ${sessionId} for ${phoneNumber}`);
    } else {
        // Start new session
        sessionId = uuidv4();
        sessionState = { currentState: SESSION_STATES.START };
        console.log(`[SessionManager] Starting new session ${sessionId} for ${phoneNumber}`);
    }
    
    // Log the message
    const messageItem = {
        phoneNumber: { S: phoneNumber },
        sessionId: { S: sessionId },
        messageId: { S: messageId },
        timestamp: { S: timestamp },
        direction: { S: direction },
        text: { S: messageText || '' },
        sessionState: { M: marshall(sessionState) },
        ttl: { N: ttl.toString() }
    };
    
    try {
        await client.send(new PutItemCommand({
            TableName: tableName,
            Item: messageItem
        }));
        
        console.log(`[SessionManager] Logged ${direction} message for session ${sessionId}`);
        return { sessionId, sessionState, timestamp };
    } catch (error) {
        console.error(`[SessionManager] Error logging message:`, error);
        throw error;
    }
}

/**
 * Update session state
 */
export async function updateSessionState(phoneNumber, sessionId, newState, additionalData = {}) {
    const tableName = process.env.ENHANCED_SESSION_TABLE_NAME || 'store-ai-bot-dev-enhanced-sessions';
    const timestamp = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 86400;
    
    // Get current session state
    const currentSession = await getLatestSession(phoneNumber);
    let sessionState = currentSession?.sessionState || { currentState: SESSION_STATES.START };
    
    // Update state
    sessionState = {
        ...sessionState,
        currentState: newState,
        lastUpdated: timestamp,
        ...additionalData
    };
    
    // Log state update as a system message
    const stateUpdateItem = {
        phoneNumber: { S: phoneNumber },
        sessionId: { S: sessionId },
        messageId: { S: `state_${Date.now()}` },
        timestamp: { S: timestamp },
        direction: { S: 'system' },
        text: { S: `State changed to: ${newState}` },
        sessionState: { M: marshall(sessionState) },
        ttl: { N: ttl.toString() }
    };
    
    try {
        await client.send(new PutItemCommand({
            TableName: tableName,
            Item: stateUpdateItem
        }));
        
        console.log(`[SessionManager] Updated session state to ${newState} for ${phoneNumber}`);
        return sessionState;
    } catch (error) {
        console.error(`[SessionManager] Error updating session state:`, error);
        throw error;
    }
}

/**
 * Log outbound message
 */
export async function logOutboundMessage(phoneNumber, sessionId, messageId, messageText, sessionState) {
    const tableName = process.env.ENHANCED_SESSION_TABLE_NAME || 'store-ai-bot-dev-enhanced-sessions';
    const timestamp = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 86400;
    
    const outboundItem = {
        phoneNumber: { S: phoneNumber },
        sessionId: { S: sessionId },
        messageId: { S: messageId },
        timestamp: { S: timestamp },
        direction: { S: 'outbound' },
        text: { S: messageText || '' },
        sessionState: { M: marshall(sessionState) },
        ttl: { N: ttl.toString() }
    };
    
    try {
        await client.send(new PutItemCommand({
            TableName: tableName,
            Item: outboundItem
        }));
        
        console.log(`[SessionManager] Logged outbound message for session ${sessionId}`);
    } catch (error) {
        console.error(`[SessionManager] Error logging outbound message:`, error);
        // Don't throw error for logging failures
    }
}

/**
 * Get conversation history for a session
 */
export async function getConversationHistory(phoneNumber, sessionId, limit = 20) {
    const tableName = process.env.ENHANCED_SESSION_TABLE_NAME || 'store-ai-bot-dev-enhanced-sessions';
    
    try {
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'phoneNumber = :p AND sessionId = :s',
            ExpressionAttributeValues: {
                ':p': { S: phoneNumber },
                ':s': { S: sessionId }
            },
            ScanIndexForward: true, // chronological order
            Limit: limit
        }));
        
        if (result.Items) {
            const messages = result.Items.map(item => unmarshall(item));
            return messages.filter(msg => msg.direction !== 'system'); // Exclude system messages
        }
        
        return [];
    } catch (error) {
        console.error(`[SessionManager] Error getting conversation history:`, error);
        return [];
    }
}

/**
 * Determine if we should continue the existing session or start a new one
 */
function shouldContinueSession(session, messageText) {
    const lastMessageTime = new Date(session.timestamp);
    const now = new Date();
    const timeDiff = now - lastMessageTime;
    
    // Continue session if:
    // 1. Less than 30 minutes have passed since last message
    // 2. Message is not a restart command
    // 3. Session is not in END state
    
    const isRecent = timeDiff < 30 * 60 * 1000; // 30 minutes
    const isRestartCommand = messageText?.toLowerCase().includes('restart') || 
                            messageText?.toLowerCase().includes('start over') ||
                            messageText?.toLowerCase().includes('new session');
    const isEndState = session.sessionState?.currentState === SESSION_STATES.END;
    
    return isRecent && !isRestartCommand && !isEndState;
}

/**
 * Get session statistics
 */
export async function getSessionStats(phoneNumber) {
    const tableName = process.env.ENHANCED_SESSION_TABLE_NAME || 'store-ai-bot-dev-enhanced-sessions';
    
    try {
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'phoneNumber = :p',
            ExpressionAttributeValues: { ':p': { S: phoneNumber } },
            ScanIndexForward: false
        }));
        
        if (result.Items) {
            const sessions = result.Items.map(item => unmarshall(item));
            const uniqueSessions = [...new Set(sessions.map(s => s.sessionId))];
            
            return {
                totalMessages: sessions.length,
                uniqueSessions: uniqueSessions.length,
                lastActivity: sessions[0]?.timestamp,
                currentState: sessions[0]?.sessionState?.currentState
            };
        }
        
        return { totalMessages: 0, uniqueSessions: 0, lastActivity: null, currentState: null };
    } catch (error) {
        console.error(`[SessionManager] Error getting session stats:`, error);
        return { totalMessages: 0, uniqueSessions: 0, lastActivity: null, currentState: null };
    }
} 