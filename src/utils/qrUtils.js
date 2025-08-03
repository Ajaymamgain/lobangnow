// Utilities for QR code onboarding
import { putIntoDynamoDB } from './dynamoDbUtils.js';

/**
 * Extract QR data from message text
 * @param {string} messageText - The text content of the WhatsApp message
 * @returns {Object|null} - Extracted QR data or null if not a QR code message
 */
export function extractQRData(messageText) {
  if (!messageText || typeof messageText !== 'string') {
    return null;
  }
  
  // Check if it's a special prefix format for onboarding
  if (messageText.startsWith('WHCONNECT:')) {
    const parts = messageText.substring('WHCONNECT:'.length).split(':');
    if (parts.length >= 2) {
      return {
        action: 'whatsapp_auth',
        sessionId: parts[0],
        storeId: parts[1],
        timestamp: parseInt(parts[2] || Date.now(), 10)
      };
    }
  }
  
  return null;
}

/**
 * Process an onboarding QR code scan
 * @param {string} senderNumber - The WhatsApp number that scanned the QR
 * @param {Object} qrData - The extracted QR data
 * @param {Object} botConfig - Bot configuration
 * @returns {Promise<boolean>} - Success status
 */
export async function processQROnboarding(senderNumber, qrData, botConfig) {
  try {
    console.log(`[QR Onboarding] Processing QR code scan from ${senderNumber}:`, qrData);
    
    // Store the mapping in whatsapptoken table
    const whatsappData = {
      storeId: qrData.storeId,
      whatsappNumber: senderNumber,
      createdAt: Date.now().toString(),
      status: 'active'
    };
    
    // Use the existing table name from environment or default
    const WHATSAPP_TOKEN_TABLE = process.env.WHATSAPP_TOKEN_TABLE || 'whatsapptoken';
    await putIntoDynamoDB(WHATSAPP_TOKEN_TABLE, whatsappData);
    
    // Return success
    return true;
  } catch (error) {
    console.error('[QR Onboarding] Error processing QR code scan:', error);
    return false;
  }
}
