import axios from 'axios';

// Helper function to send WhatsApp message
export async function sendWhatsAppMessage(storeId, phoneNumber, message, botConfig) {
  console.log(`[storeId: ${storeId}] sendWhatsAppMessage TOP: phoneNumber: ${phoneNumber}, message:`, JSON.stringify(message, null, 2), 'botConfig keys:', botConfig ? Object.keys(botConfig) : 'null');
  
  // Validate botConfig
  if (!botConfig || !botConfig.whatsappToken || !botConfig.whatsappPhoneNumberId) {
    console.error(`[storeId: ${storeId}] WhatsApp token or Phone Number ID is missing in botConfig. Cannot send message.`);
    return null; // Exit if essential config is missing
  }
  
  // Validate and format phone number
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    console.error(`[storeId: ${storeId}] Invalid phone number: ${phoneNumber}. Must be a string.`);
    return null;
  }
  
  // Format phone number to WhatsApp requirements (international format without '+' prefix)
  let formattedPhone = phoneNumber.trim().replace(/\s+/g, '');
  if (formattedPhone.startsWith('+')) {
    formattedPhone = formattedPhone.substring(1); // Remove the + prefix
  } else if (!formattedPhone.match(/^\d{10,15}$/)) {
    // If it doesn't start with + and isn't just 10-15 digits, likely incorrect format
    console.error(`[storeId: ${storeId}] Phone number may be incorrectly formatted: ${formattedPhone}`);
    // Continue anyway but log the warning
  }
  
  console.log(`[storeId: ${storeId}] Using formatted phone: ${formattedPhone} (original: ${phoneNumber})`);
  

  const whatsappApiUrl = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v19.0'}/${botConfig.whatsappPhoneNumberId}/messages`;
  
  // Construct the base payload
  let payload = {
    messaging_product: "whatsapp",
    to: formattedPhone, // Use the properly formatted phone number
    // 'type' and specific message content will be added by the switch or if/else block
  };

  // Determine message type and construct specific payload part
  const messageType = message.type || 'text'; // Default to text if type is not specified
  console.log(`[storeId: ${storeId}] sendWhatsAppMessage: Determined messageType: ${messageType}`);

  switch (messageType) {
    case 'text':
      let textBody;
      
      // Check all possible formats of text messages
      if (message.text && typeof message.text.body === 'string') {
        // Standard format: { type: 'text', text: { body: 'message' } }
        textBody = message.text.body;
        console.log(`[storeId: ${storeId}] Using text.body format: "${textBody.substring(0, 50)}${textBody.length > 50 ? '...' : ''}"`);
      } else if (typeof message.text === 'string') {
        // Shorthand format: { type: 'text', text: 'message' }
        textBody = message.text;
        console.log(`[storeId: ${storeId}] Using direct text string format: "${textBody.substring(0, 50)}${textBody.length > 50 ? '...' : ''}"`);
      } else if (message.body && typeof message.body === 'string') {
        // Alternative format: { type: 'text', body: 'message' }
        textBody = message.body;
        console.log(`[storeId: ${storeId}] Using body property format: "${textBody.substring(0, 50)}${textBody.length > 50 ? '...' : ''}"`);
      } else {
        console.warn(`[storeId: ${storeId}] Cannot determine text message format. Original message:`, JSON.stringify(message));
        textBody = '(No text content to display)'; // Fallback
      }

      if (!textBody || textBody.trim() === '') {
        console.warn(`[storeId: ${storeId}] Empty text body after processing. Using fallback body.`);
        textBody = '(No text content to display)';
      }
      
      payload.type = 'text';
      payload.text = { body: textBody.substring(0, 4096) };
      console.log(`[storeId: ${storeId}] Final text payload set: ${JSON.stringify(payload.text)}`);
      
      // Optional: Add preview_url handling if needed from message.text.preview_url
      if (message.text && typeof message.text.preview_url === 'boolean') {
        payload.text.preview_url = message.text.preview_url;
      }
      break;
    
    case 'image':
      if (message.image && (message.image.link || message.image.id)) {
        payload.type = 'image';
        payload.image = message.image.id ? { id: message.image.id } : { link: message.image.link };
        if (message.image.caption) {
          payload.image.caption = message.image.caption.substring(0,1024);
        }
      } else {
        console.error(`[storeId: ${storeId}] Invalid image message format:`, message);
        return;
      }
      break;

    case 'audio':
      if (message.audio && (message.audio.link || message.audio.id)) {
        payload.type = 'audio';
        payload.audio = message.audio.id ? { id: message.audio.id } : { link: message.audio.link };
      } else {
        console.error(`[storeId: ${storeId}] Invalid audio message format:`, message);
        return;
      }
      break;

    case 'document':
      if (message.document && (message.document.link || message.document.id)) {
        payload.type = 'document';
        payload.document = {}; // Initialize document object
        if (message.document.id) payload.document.id = message.document.id;
        else payload.document.link = message.document.link;
        // Caption and filename are part of the document object according to WhatsApp docs
        if (message.document.caption) payload.document.caption = message.document.caption.substring(0,1024);
        if (message.document.filename) payload.document.filename = message.document.filename;
      } else {
        console.error(`[storeId: ${storeId}] Invalid document message format:`, message);
        return;
      }
      break;

    case 'video':
      if (message.video && (message.video.link || message.video.id)) {
        payload.type = 'video';
        payload.video = message.video.id ? { id: message.video.id } : { link: message.video.link };
        if (message.video.caption) {
          payload.video.caption = message.video.caption.substring(0,1024);
        }
      } else {
        console.error(`[storeId: ${storeId}] Invalid video message format:`, message);
        return;
      }
      break;
    
    case 'sticker':
      if (message.sticker && (message.sticker.link || message.sticker.id)) {
        payload.type = 'sticker';
        payload.sticker = message.sticker.id ? { id: message.sticker.id } : { link: message.sticker.link };
      } else {
        console.error(`[storeId: ${storeId}] Invalid sticker message format:`, message);
        return;
      }
      break;

    case 'location':
      if (message.location && typeof message.location.latitude === 'number' && typeof message.location.longitude === 'number') {
        payload.type = 'location';
        payload.location = {
          latitude: message.location.latitude,
          longitude: message.location.longitude,
        };
        if (message.location.name) payload.location.name = message.location.name;
        if (message.location.address) payload.location.address = message.location.address;
      } else {
        console.error(`[storeId: ${storeId}] Invalid location message format:`, message);
        return;
      }
      break;

    case 'contacts':
      if (message.contacts && Array.isArray(message.contacts) && message.contacts.length > 0) {
        payload.type = 'contacts';
        payload.contacts = message.contacts;
      } else {
        console.error(`[storeId: ${storeId}] Invalid contacts message format:`, message);
        return;
      }
      break;

    case 'interactive': // Interactive messages (buttons, lists, products) are handled here
      if (message.interactive) {
        payload.type = 'interactive';
        payload.interactive = message.interactive;
      } else {
        console.error(`[storeId: ${storeId}] Invalid interactive message format:`, message);
        return;
      }
      break;

    case 'template':
      if (message.template && message.template.name && message.template.language) {
        payload.type = 'template';
        payload.template = message.template;
      } else {
        console.error(`[storeId: ${storeId}] Invalid template message format:`, message);
        return;
      }
      break;
    
    case 'reaction':
      if (message.reaction && message.reaction.message_id && message.reaction.emoji) {
        payload.type = 'reaction';
        payload.reaction = {
            message_id: message.reaction.message_id,
            emoji: message.reaction.emoji
        };
      } else {
        console.error(`[storeId: ${storeId}] Invalid reaction message format:`, message);
        return;
      }
      break;

    default:
      console.error(`[storeId: ${storeId}] Unknown message type: '${messageType}'. Original message object:`, JSON.stringify(message, null, 2));
      return;
  }

  // Log before the final check that might cause an abort
  console.log(`[storeId: ${storeId}] sendWhatsAppMessage: After switch, before final type check. Payload so far:`, JSON.stringify(payload, null, 2), `messageType was: ${messageType}`);

  if (!payload.type && messageType !== 'text') {
    console.error(`[storeId: ${storeId}] Payload type not set for non-text message (type: ${messageType}). Aborting sendWhatsAppMessage. Final Payload:`, JSON.stringify(payload), `Original message.type was: ${message.type}`);
    return;
  }

  console.log(`[storeId: ${storeId}] Sending WhatsApp message to ${phoneNumber}. Payload:`, JSON.stringify(payload, null, 2));

  try {
    console.log(`[storeId: ${storeId}] FINAL API CALL: URL=${whatsappApiUrl}, Token=${botConfig.whatsappToken ? 'present' : 'missing'}, PhoneID=${botConfig.whatsappPhoneNumberId}, Message Type=${payload.type}`);
    
    // Verify the token and phoneID are actually strings before sending
    if (typeof botConfig.whatsappToken !== 'string' || botConfig.whatsappToken.trim() === '') {
      console.error(`[storeId: ${storeId}] WhatsApp token is not a valid string: ${typeof botConfig.whatsappToken}`);
      return null;
    }
    
    const response = await axios.post(
      whatsappApiUrl,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${botConfig.whatsappToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log(`[storeId: ${storeId}] Message sent successfully to ${phoneNumber}. Response:`, JSON.stringify(response.data));
    return response.data;
    
  } catch (error) {
    // Enhanced error reporting
    if (error.response) {
      console.error(`[storeId: ${storeId}] WhatsApp API error sending message to ${phoneNumber}:`);
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Data: ${JSON.stringify(error.response.data)}`);
      console.error(`  Headers: ${JSON.stringify(error.response.headers)}`);
    } else if (error.request) {
      console.error(`[storeId: ${storeId}] No response received from WhatsApp API when sending to ${phoneNumber}:`, error.request);
    } else {
      console.error(`[storeId: ${storeId}] Error setting up WhatsApp API request to ${phoneNumber}:`, error.message);
    }
    
    console.error(`[storeId: ${storeId}] Original payload that failed:`, JSON.stringify(payload));
    
    // Fallback to text message if the rich message fails
    if (messageType !== 'text' && message.text) {
      console.log(`[storeId: ${storeId}] Attempting fallback to text message`);
      return sendWhatsAppMessage(storeId, phoneNumber, { 
        type: 'text', 
        text: message.text && message.text.body ? message.text : { body: JSON.stringify(message.text) }
      }, botConfig);
    }
    // Return null instead of throwing to prevent crashes
    console.error(`[storeId: ${storeId}] No fallback available, WhatsApp message could not be sent to ${phoneNumber}`);
    return null;
  }
}
