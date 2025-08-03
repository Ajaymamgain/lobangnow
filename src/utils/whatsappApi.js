// src/utils/whatsappApi.js
import axios from 'axios';
import { getBotConfig } from './dynamoDbUtils.js'; // Added .js extension for explicit ESM import

async function getWhatsAppConfig(storeId = process.env.STORE_ID || 'defaultStore') {

  try {
    const botConfig = await getBotConfig(storeId);
    if (!botConfig) {
      console.error(`[WhatsAppAPI] Bot config not found for storeId: ${storeId}. Cannot retrieve WhatsApp credentials.`);
      throw new Error(`WhatsApp credentials not configured for store ${storeId}.`);
    }

    const token = botConfig.whatsappToken;
    const phoneNoId = botConfig.whatsappPhoneNumberId;
    const appSecret = botConfig.whatsappAppSecret; // For webhook signature validation
    const verifyToken = botConfig.verifyToken; // For GET webhook verification

    if (!token || !phoneNoId) {
      console.error(`[WhatsAppAPI] Essential WhatsApp credentials (API token or Phone ID) are missing from bot config for storeId: ${storeId}.`);
      throw new Error('WhatsApp API token or Phone ID not configured in bot settings.');
    }
    
    const config = {
      token,
      phoneNoId,
      appSecret, 
      verifyToken,
      version: process.env.WHATSAPP_API_VERSION || "v19.0",
    };
    return config;
  } catch (error) {
    console.error(`[WhatsAppAPI] Failed to fetch WhatsApp configuration for storeId ${storeId}:`, error.message);
    throw error; 
  }
}

async function sendWhatsAppMessage(to, message, storeId) { 
  let config;
  try {
    config = await getWhatsAppConfig(storeId);
  } catch (error) {
    console.error(`[WhatsAppAPI] Cannot send WhatsApp message to ${to} for store ${storeId} due to configuration error: ${error.message}`);
    return false;
  }

  const url = `https://graph.facebook.com/${config.version}/${config.phoneNoId}/messages`;
  const headers = {
    'Authorization': `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  };

  // Construct the base payload for WhatsApp API
  let finalApiPayload = {
    messaging_product: "whatsapp",
    to: to,
    // 'type' and specific message content will be added by the switch
  };

  const messageType = message.type || 'text'; // Default to text if type is not specified

  switch (messageType) {
    case 'text':
      let bodyContent = message.text;
      if (typeof bodyContent !== 'string' || bodyContent.trim() === '') {
        console.warn(`[WhatsAppAPI Store: ${storeId}] message.text was not a valid string or was empty. Original: '${message.text}'. Using fallback.`);
        bodyContent = '(No text content to display)'; 
      }
      finalApiPayload.type = 'text';
      finalApiPayload.text = { body: bodyContent };
      break;

    case 'image':
      finalApiPayload.type = 'image';
      if (message.link) {
        finalApiPayload.image = { link: message.link };
      } else if (message.id) {
        finalApiPayload.image = { id: message.id };
      } else {
        console.error(`[WhatsAppAPI Store: ${storeId}] Message type is 'image' but no link or id provided.`);
        finalApiPayload.type = 'text'; // Fallback to text
        finalApiPayload.text = { body: message.caption || "I tried to send an image, but its content was missing." };
        break;
      }
      if (message.caption) finalApiPayload.image.caption = message.caption;
      break;

    case 'document':
      finalApiPayload.type = 'document';
      if (message.link) { // Support sending document by link
        finalApiPayload.document = { link: message.link };
      } else if (message.id) {
        finalApiPayload.document = { id: message.id };
      } else {
        console.error(`[WhatsAppAPI Store: ${storeId}] Message type is 'document' but no link or id provided.`);
        finalApiPayload.type = 'text'; // Fallback to text
        finalApiPayload.text = { body: message.caption || "I tried to send a document, but its content was missing." };
        break;
      }
      if (message.caption) finalApiPayload.document.caption = message.caption;
      if (message.filename) finalApiPayload.document.filename = message.filename;
      break;

    case 'audio':
      finalApiPayload.type = 'audio';
      if (message.link) { // Support sending audio by link
        finalApiPayload.audio = { link: message.link };
      } else if (message.id) {
        finalApiPayload.audio = { id: message.id };
      } else {
        console.error(`[WhatsAppAPI Store: ${storeId}] Message type is 'audio' but no link or id provided.`);
        // No fallback to text here as audio often doesn't have a meaningful text alternative from AI
        return false; 
      }
      break;

    case 'video':
      finalApiPayload.type = 'video';
      if (message.link) { // Support sending video by link
        finalApiPayload.video = { link: message.link };
      } else if (message.id) {
        finalApiPayload.video = { id: message.id };
      } else {
        console.error(`[WhatsAppAPI Store: ${storeId}] Message type is 'video' but no link or id provided.`);
        finalApiPayload.type = 'text'; // Fallback to text
        finalApiPayload.text = { body: message.caption || "I tried to send a video, but its content was missing." };
        break;
      }
      if (message.caption) finalApiPayload.video.caption = message.caption;
      break;

    case 'interactive': // For reply buttons, list messages, etc.
      finalApiPayload.type = 'interactive';
      if (message.interactivePayload) {
        finalApiPayload.interactive = message.interactivePayload; // AI must provide the full interactive object
      } else {
        console.error(`[WhatsAppAPI Store: ${storeId}] Message type is 'interactive' but no interactivePayload provided.`);
        return false; // Cannot send interactive without payload
      }
      break;

    // TODO: Add cases for 'contacts', 'location' as needed when AI is prompted for them.
    // case 'contacts':
    //   finalApiPayload.type = 'contacts';
    //   finalApiPayload.contacts = message.contactsPayload; // AI must provide this structure
    //   break;
    // case 'location':
    //   finalApiPayload.type = 'location';
    //   finalApiPayload.location = message.locationPayload; // AI must provide this structure
    //   break;

    default:
      console.error(`[WhatsAppAPI Store: ${storeId}] Unsupported message type: '${messageType}'.`);
      // Fallback to sending a text message if message.text is available, otherwise fail
      if (message.text) {
        finalApiPayload.type = 'text';
        finalApiPayload.text = { body: `(Unsupported message type: ${messageType}) ${message.text}` };
      } else {
        return false; // Cannot send if type is unknown and no fallback text
      }
      break;
  }

  try {
    console.log(`[WhatsAppAPI] Sending WhatsApp message to ${to} for store ${storeId}:`, JSON.stringify(finalApiPayload, null, 2));
    await axios.post(url, finalApiPayload, { headers });
    console.log(`[WhatsAppAPI] WhatsApp message sent successfully to ${to} for store ${storeId}.`);
    return true;
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`[WhatsAppAPI] Error sending WhatsApp message to ${to} for store ${storeId}:`, errorMsg);
    if (error.response && error.response.data && error.response.data.error) {
      console.error(`[WhatsAppAPI] WhatsApp API Error Details (Store: ${storeId}):`, JSON.stringify(error.response.data.error));
    }
    return false;
  }
}

async function sendWhatsAppTemplateMessage(to, templateName, languageCode, components, storeId) {
  let config;
  try {
    config = await getWhatsAppConfig(storeId);
  } catch (error) {
    console.error(`[WhatsAppAPI] Cannot send WhatsApp template message to ${to} for store ${storeId} due to configuration error: ${error.message}`);
    return false;
  }

  const url = `https://graph.facebook.com/${config.version}/${config.phoneNoId}/messages`;
  const headers = {
    'Authorization': `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  };

  const payload = {
    messaging_product: "whatsapp",
    to: to,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      components: components || [],
    },
  };

  try {
    console.log(`[WhatsAppAPI] Sending WhatsApp template message to ${to} for store ${storeId}:`, JSON.stringify(payload));
    await axios.post(url, payload, { headers });
    console.log(`[WhatsAppAPI] WhatsApp template message sent successfully to ${to} for store ${storeId}.`);
    return true;
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`[WhatsAppAPI] Error sending WhatsApp template message to ${to} for store ${storeId}:`, errorMsg);
    if (error.response && error.response.data && error.response.data.error) {
      console.error(`[WhatsAppAPI] WhatsApp API Error Details (Template, Store: ${storeId}):`, JSON.stringify(error.response.data.error));
    }
    return false;
  }
}

export {
  sendWhatsAppMessage,
  sendWhatsAppTemplateMessage,
  getWhatsAppConfig, 
};
