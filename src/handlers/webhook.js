// WhatsApp webhook handler in Node.js
// Forcing redeploy for ES module package.json change.
// Attempting forced redeploy to resolve ES module issue - 2025-06-19
const crypto = require('crypto'); // For signature validation
const { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
// Using native fetch instead of axios/node-fetch
const OpenAI = require('openai'); // OpenAI v4+ with CommonJS
const { processAction } = require('./actionProcessor.js');
const { getStoreProducts, getProductByName } = require('../utils/dynamoDbUtils.js'); // Added getStoreProducts and getProductByName
const { getRecentCustomers, formatRecentCustomersMessage } = require('../utils/ownerDashboard.js');
const { executeGetInvoice } = require('../utils/invoiceUtils.js');
const { sendWhatsAppMessage } = require('../utils/whatsappUtils.js');
// const { handleOwnerReply } = require('../utils/ownerReplyManager.js'); // DISABLED - not needed for LobangLah
const { 
    isPriceSensitive,
    getDiscountPrompt,
    sendDiscountApprovalRequest,
    handleDiscountResponse,
    createTodaysOfferMessage,
    handleTodaysOfferClick,
    handleProductSelection,
    handleTodaysOfferDiscount,
    handleAcceptDiscountOffer
} = require('../utils/discountUtils.js');
const { handleLobangLahMessage, isLobangLahMessage } = require('./lobangLahHandler.js');
const { handleSocialAgencyMessage } = require('./socialAgencyHandler.js');
const { handleDailyDealMessage } = require('./dailyDealHandler.js');

// QR-related imports removed as per user request

// NEW: Generate fresh webhook credentials for testing
function generateFreshWebhookCredentials() {
  const webhookSecret = crypto.randomBytes(32).toString('hex'); // 64 character hex string
  const verifyToken = crypto.randomBytes(16).toString('hex'); // 32 character hex string
  
  console.log('🆕 Generated fresh webhook credentials:');
  console.log(`🔑 Webhook Secret: ${webhookSecret}`);
  console.log(`🔐 Verify Token: ${verifyToken}`);
  
  return { webhookSecret, verifyToken };
}

// NEW: Test webhook endpoint with fresh credentials
async function handleTestWebhook(event) {
  console.log('🧪 Processing test webhook request');
  
  // Use the correct whatsappAppSecret that Meta is actually using for signature validation
  const whatsappAppSecret = "41a1282f73264393b446731d67416b31"; // This is what Meta is using
  const verifyToken = "pasarnext";   // Keep the verify token as pasarnext
  
  console.log('🔄 Using correct webhook credentials:');
  console.log(`🔑 WhatsApp App Secret: ${whatsappAppSecret} (for signature validation)`);
  console.log(`🔐 Verify Token: ${verifyToken} (for verification requests)`);
  
  // Store these in DynamoDB for the current store
  try {
    const storeId = 'cmanyfn1e0001jl04j3k45mz5'; // Your store ID
    const tableName = "WhatsappStoreTokens";
    const tableRegion = "us-east-1";
    const dynamoClient = new DynamoDBClient({ region: tableRegion });
    
    // Update the webhook credentials
    const updateParams = {
      TableName: tableName,
      Key: marshall({ storeId: storeId }),
      UpdateExpression: "SET whatsappAppSecret = :secret, verifyToken = :token, updatedAt = :timestamp",
      ExpressionAttributeValues: marshall({
        ":secret": whatsappAppSecret,
        ":token": verifyToken,
        ":timestamp": new Date().toISOString()
      })
    };
    
    await dynamoClient.send(new UpdateItemCommand(updateParams));
    console.log(`✅ Updated DynamoDB with correct webhook credentials for store: ${storeId}`);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: "Webhook credentials updated with correct Meta configuration!",
        whatsappAppSecret: whatsappAppSecret,
        verifyToken: verifyToken,
        instructions: [
          "✅ WhatsApp App Secret set to '41a1282f73264393b446731d67416b31' (for signature validation)",
          "✅ Verify token set to 'pasarnext' (for verification requests)",
          "Now send a WhatsApp message to test the webhook!"
        ]
      })
    };
    
  } catch (error) {
    console.error('❌ Error updating DynamoDB:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: "Failed to update DynamoDB",
        whatsappAppSecret: whatsappAppSecret,
        verifyToken: verifyToken
      })
    };
  }
}

// Function to extract the WhatsApp Phone Number ID from the webhook payload
function extractWhatsAppPhoneId(event) {
  try {
    if (event.body) {
      const body = JSON.parse(event.body);
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      return value?.metadata?.phone_number_id;
    }
    return null;
  } catch (error) {
    console.error('Error extracting WhatsApp Phone Number ID:', error);
    return null;
  }
}

// Helper function to get storeId and ownerNumber from the WhatsApp Phone Number ID using WhatsappStoreTokens table
async function getStoreIdFromPhoneId(whatsappPhoneNumberId) {
  if (!whatsappPhoneNumberId) {
    console.error("No WhatsApp Phone Number ID provided to lookup");
    return null;
  }

  try {
    const tableName = "WhatsappStoreTokens";
    const tableRegion = "us-east-1";
    const dynamoClient = new DynamoDBClient({ region: tableRegion });
    
    // Scan the table to find an entry where whatsappPhoneNumberId matches
    // Note: In a production environment with many stores, consider creating a GSI on whatsappPhoneNumberId
    const scanParams = {
      TableName: tableName,
      FilterExpression: "whatsappPhoneNumberId = :phoneId",
      ExpressionAttributeValues: marshall({ ":phoneId": whatsappPhoneNumberId }),
    };
    
    console.log(`Looking up store for WhatsApp Phone ID: ${whatsappPhoneNumberId}`);
    const { Items } = await dynamoClient.send(new ScanCommand(scanParams));
    
    if (!Items || Items.length === 0) {
      console.log(`No store mapping found for WhatsApp Phone ID: ${whatsappPhoneNumberId}`);
      return null;
    }
    
    // If multiple matches are found, use the first one (ideally, there should be only one)
    const mapping = unmarshall(Items[0]);
    console.log(`Found store ID: ${mapping.storeId} for WhatsApp Phone ID: ${whatsappPhoneNumberId}`);
    return {
      storeId: mapping.storeId,
      ownerNumber: mapping.ownerNumber || null
    };
  } catch (error) {
    console.error('Error getting store ID from phone ID:', error);
    return null;
  }
}

// Helper function to get store-specific webhook settings from WhatsappStoreTokens table
async function getStoreWebhookSettings(storeId) {
  if (!storeId) {
    console.error("No storeId provided to getStoreWebhookSettings");
    return null;
  }

  try {
    const tableName = "WhatsappStoreTokens";
    const tableRegion = "us-east-1";
    const dynamoClient = new DynamoDBClient({ region: tableRegion });
    
    const getParams = {
      TableName: tableName,
      Key: marshall({ storeId: storeId }),
    };
    
    console.log(`Getting webhook settings for store: ${storeId}`);
    const { Item } = await dynamoClient.send(new GetItemCommand(getParams));
    
    if (!Item) {
      console.log(`No webhook settings found for store: ${storeId}`);
      return null;
    }
    
    const settings = unmarshall(Item);
    console.log(`Found webhook settings for store: ${storeId}`);
    
    // Debug: Log all available fields
    console.log(`[storeId: ${storeId}] Available webhook settings fields:`, Object.keys(settings));
    console.log(`[storeId: ${storeId}] webhookSecret value:`, settings.webhookSecret);
    console.log(`[storeId: ${storeId}] whatsappAppSecret value:`, settings.whatsappAppSecret);
    
    return {
      webhookSecret: settings.whatsappAppSecret || settings.webhookSecret,  // Use whatsappAppSecret as primary, fallback to webhookSecret
      verifyToken: settings.verifyToken
    };
  } catch (error) {
    console.error('Error getting store webhook settings:', error);
    return null;
  }
}

// Helper function to handle webhook verification (GET request)
async function handleGetRequest(event, verificationToken = "default_token") {
  console.log('Processing GET request for webhook verification');
  
  // Extract query parameters for verification
  const queryParams = event.queryStringParameters || {};
  const mode = queryParams['hub.mode'];
  const challenge = queryParams['hub.challenge'];
  const token = queryParams['hub.verify_token'];
  
  console.log(`Verification request: mode=${mode}, token=${token}, challenge=${challenge}`);
  
  // Use the passed verificationToken
  if (mode === 'subscribe' && token === verificationToken) {
    console.log('Webhook verified successfully');
    return {
      statusCode: 200,
      body: challenge,
    };
  } else {
    console.error(`Failed webhook verification: mode=${mode}, token=${token}`);
    return {
      statusCode: 403,
      body: JSON.stringify({ status: "error", message: "Verification failed" }),
    };
  }
}

// Function to get response from OpenAI API
async function getOpenAIResponse(storeId, userMessage, conversationHistory, botConfig, businessContext) {
  // Handle both camelCase (from code) and snake_case (from DB) for robustness
  // Prioritize 'openAiApiKey' (actual DB schema), then fall back to other common variants
  let openAIApiKeyFromConfig = botConfig.openAiApiKey || botConfig.openAIApiKey || botConfig.openai_api_key;

  console.log(`[storeId: ${storeId}] Full botConfig received in getOpenAIResponse:`, JSON.stringify(botConfig, null, 2)); // DEBUG LOG

  if (!openAIApiKeyFromConfig) {
    console.error(`[storeId: ${storeId}] OpenAI API key is missing in botConfig.`);
    return { text: "I'm currently unable to process your request due to a configuration issue." };
  }

  const openAIClient = new OpenAI({ apiKey: openAIApiKeyFromConfig });

  const products = await getStoreProducts(storeId, 20); // Fetch products for context
  const productListForPrompt = products.length > 0 
    ? products.map(p => `- ${p.name} (ID: ${p.productId}, Price: ${p.price}, Stock: ${p.stockQuantity || 'N/A'})`).join('\n')
    : 'No products currently listed. You can ask about general services.';

    const tools = [
      {
        type: "function",
        function: {
          name: "send_location_message",
          description: "Sends a WhatsApp location message. Use ONLY when the user explicitly asks for the store's location AND latitude, longitude, name, and address are available in Business Information.",
          parameters: {
            type: "object",
            properties: {
              latitude: { type: "number", description: "Latitude of the store." },
              longitude: { type: "number", description: "Longitude of the store." },
              name: { type: "string", description: "Name of the store/location." },
              address: { type: "string", description: "Address of the store/location." },
            },
            required: ["latitude", "longitude", "name", "address"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_store_products",
          description: "Get a list of available products. Use when the user asks to see products, browse, or asks what's available. Can be filtered by category if the user specifies one that seems valid based on product names or business context.",
          parameters: {
            type: "object",
            properties: {
              categoryName: { type: "string", description: "Optional: Category to filter products by." },
              limit: { type: "number", description: "Max products to return. Default 10." },
            },
            required: [],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "display_product_info",
          description: "Displays detailed info for a specific product. Use when the user asks about a particular product by name or ID, or if you are recommending a specific product.",
          parameters: {
            type: "object",
            properties: {
              productId: { type: "string", description: "The ID of the product to display." },
              introductoryText: { type: "string", description: "Optional: Short intro text from you before the product card." },
            },
            required: ["productId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "execute_get_order_history",
          description: "Retrieves the customer's order history. Use ONLY when the user explicitly asks about their past orders, order status, or order history.",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      {
        type: "function",
        function: {
          name: "execute_get_invoice",
          description: "Retrieves a specific invoice by order ID. Use ONLY when the user explicitly requests an invoice for a particular order ID they provide or you have identified from previous context.",
          parameters: {
            type: "object",
            properties: {
              orderId: { type: "string", description: "The ID of the order for the invoice." },
            },
            required: ["orderId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "suggest_view_all_products",
          description: "Suggests or initiates showing the main product catalog or a general list. Use when the user expresses general interest in products, asks to see 'everything', or if you decide it's a good time to showcase the range after a query that doesn't lead to a specific product.",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      {
        type: "function",
        function: {
          name: "initiate_purchase",
          description: "Initiates a purchase for a specific product. Use when the user explicitly states they want to buy or purchase a product, specifying the product name and optionally the quantity.",
          parameters: {
            type: "object",
            properties: {
              productName: { type: "string", description: "The name of the product the user wants to buy." },
              quantity: { type: "number", description: "The quantity of the product to buy. Defaults to 1 if not specified." },
            },
            required: ["productName"],
          },
        },
      },
    ];

    const systemMessageContent = `You are a friendly and enthusiastic AI Sales Superstar for our store! Your mission is to provide an outstanding, human-like customer experience. Your ONLY role is to assist customers by answering questions based STRICTLY on the information provided below.

    --- Core Directives ---
    1.  **Information Integrity:** You are FORBIDDEN from using any external knowledge. You MUST NOT make up any information, including product details, prices, policies, or services.
    2.  **Message Cadence:** You MUST NOT send multiple messages back-to-back. Always consolidate your response into a single, cohesive message. Wait for the user to reply before sending another message.
    3.  **Handling Limitations:** If a question cannot be answered using the 'Business Information' or 'Product Catalogue' below, you MUST respond politely and engagingly, for example: "That's a great question! While I don't have that specific detail right now, I can tell you all about [mention something relevant from product list or business info]! Or perhaps there's another product you're curious about? 😊"

    --- Your Persona: The Expert Sales Superstar ---
    1.  **Tone & Style:** You are a world-class sales representative. Your tone is confident, consultative, and incredibly helpful. You are a trusted advisor helping the customer make the best choice. Be warm, friendly, and enthusiastic, but also professional and knowledgeable.
    2.  **Proactive Guidance:** Don't just answer questions; anticipate customer needs. Frame information to highlight benefits. For example, instead of 'It has 8GB RAM', say 'With 8GB of RAM, it\'s perfect for smooth multitasking! ✨'. Always guide the conversation towards a helpful outcome.
    3.  **Expressiveness & Animation:**
        *   Use vibrant and positive language. Let your personality shine through!
        *   Incorporate emojis appropriately to make messages lively, convey emotion, and add visual appeal (e.g., ✨, 😊, 🛍️, 👍, 🎉). Use them thoughtfully to enhance the message, not clutter it.
        *   Utilize WhatsApp formatting to make your messages pop and for emphasis:
            *   \\\`*bold text*\\\` for important keywords, product names, or exciting news.
            *   \\\`_italic text_\\\` for highlighting features or subtle emphasis.
            *   You can even use \\\`~strikethrough~\\\` if, for example, the business information mentions a sale price (e.g., "Was $50, *now only $40!*").
    3.  **Natural & Engaging Interaction:**
        *   Vary your greetings, responses, and closing remarks. Avoid sounding repetitive.
        *   Ask clarifying questions if needed, just like a human would.
        *   Be proactively helpful if appropriate (e.g., "Our *SuperWidget X* is very popular! It pairs wonderfully with the *MegaAccessory Y*. Would you like to hear more about either?"), but ALWAYS base suggestions strictly on the provided information.
    4.  **Clarity & Conciseness:** While being engaging, ensure your messages are still clear and relatively concise. Aim for responses that are easy to read and digest on a mobile phone. Short, impactful sentences are often best.
    
    --- 🛠️ Using Your Tools 🛠️ ---
    You have several tools to help customers. Use them ONLY when appropriate and when the user's intent is clear. Always prioritize direct answers from Business Info or Product Catalogue if a tool isn't explicitly needed or a better fit.
    
    1.  **\`send_location_message\`**: 
        *   **When to Use**: ONLY if the user *explicitly asks for the store's location* (e.g., "Where are you located?", "What's your address?").
        *   **Requirement**: You MUST find \`storeLatitude\`, \`storeLongitude\`, \`storeName\`, AND \`storeAddress\` in the 'Business Information' section to use this tool. If any are missing, politely state you don't have the complete address details.
        *   **Action**: Call \`send_location_message\` with all four parameters. Do NOT describe the location in text if you use this tool.
    
    2.  **\`get_store_products\`**: 
        *   **When to Use**: When the user asks to see products (e.g., "What do you sell?", "Show me your items", "Browse products"). Also use if they ask for products in a specific \`categoryName\` that seems plausible from product names or business context.
        *   **Action**: Call \`get_store_products\`. You can suggest categories if appropriate. Default limit is 10 products.
    
    3.  **\`display_product_info\`**: 
        *   **When to Use**: When the user asks for details about a *specific product* (by name or ID from the catalogue) or if you are recommending a particular product to them.
        *   **Action**: Call \`display_product_info\` with the \`productId\`. You can add a brief \`introductoryText\`.
    
    4.  **\`execute_get_order_history\`**: 
        *   **When to Use**: ONLY if the user *explicitly asks about their past orders*, order history, or status of previous orders (e.g., "My past orders", "What did I order last time?").
        *   **Action**: Call \`execute_get_order_history\`.
    
    5.  **\`execute_get_invoice\`**: 
        *   **When to Use**: ONLY if the user *explicitly asks for an invoice* for a specific \`orderId\` they provide or that you've clearly identified in the conversation.
        *   **Action**: Call \`execute_get_invoice\` with the \`orderId\`.
    
    6.  **\`suggest_view_all_products\`**: 
        *   **When to Use**: When the user expresses general interest in seeing products (e.g., "What else do you have?"), asks to see 'everything', or if a specific query doesn't lead to a product and you want to offer a broader view.
        *   **Action**: Call \`suggest_view_all_products\`.
    
    **General Tool Usage Notes:**
    *   Do not offer tools proactively unless it's a natural fit for the conversation (e.g., after a product search, suggesting to display one). 
    *   If the user's query can be fully answered by text using the Business Info or Product Catalogue, prefer that over a tool unless the tool significantly enhances the experience (like showing a product card). 
    *   If a tool requires specific information (like \`orderId\` for invoice) and the user hasn't provided it, ask for it first before attempting to use the tool.
    
    --- Business Information ---
    ${businessContext || 'Welcome to our store! How can I brighten your day and help you find something amazing?'}
    
    --- Current Product Catalogue ---
    ${productListForPrompt}
    --------------------------
    `; // Make sure this closing backtick is the very end of the variable assignment.

  // === NEW: Convert stored conversation items into proper OpenAI messages ===
  const formattedHistory = conversationHistory.map(item => {
    if (item.role === 'system') {
      return { role: 'system', content: item.content };
    }
    if (item.role === 'user' || item.type === 'user') {
      const nonTextNote = item.message_type ? ` [Non-text message: ${item.message_type}]` : '';
      return {
        role: 'user',
        content: (item.text || item.content || '') + nonTextNote,
      };
    }
    if (item.role === 'assistant' || item.type === 'assistant') {
      const assistantMessage = {
        role: 'assistant',
        content: item.content || item.text, // content can be null if there are tool_calls
      };
      if (item.tool_calls) {
        assistantMessage.tool_calls = item.tool_calls;
      }
      // If content is undefined/null and there are no tool_calls, set content to empty string
      if (assistantMessage.content == null && !assistantMessage.tool_calls) {
        assistantMessage.content = "";
      }
      return assistantMessage;
    }
    if (item.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: item.tool_call_id,
        name: item.name, // Ensure 'name' is present in the conversation history item
        content: item.content, // Ensure 'content' is a string
      };
    }
    // Log unhandled item types for debugging
    // console.log(`[storeId: ${storeId}] Unhandled conversation item type in getOpenAIResponse:`, item);
    return null;
  }).filter(Boolean);

  // Build final messages array for OpenAI
  const messages = [
    { role: "system", content: systemMessageContent },
    ...formattedHistory,
    ...(userMessage !== null && userMessage !== undefined ? [{ role: "user", content: userMessage }] : []),
  ];

  // Validate and potentially truncate messages array if invalid tool call sequence is found
    for (let i = 0; i < messages.length; i++) {
      const currentMsg = messages[i];
      if (currentMsg.role === 'assistant' && currentMsg.tool_calls && currentMsg.tool_calls.length > 0) {
        const numToolCalls = currentMsg.tool_calls.length;
        const expectedToolCallIds = new Set(currentMsg.tool_calls.map(tc => tc.id));
        let actualToolResponsesFound = 0;
        let allResponsesMatchAndPresent = true;

        for (let j = 0; j < numToolCalls; j++) {
          const nextMsgIndex = i + 1 + j;
          if (nextMsgIndex >= messages.length || messages[nextMsgIndex].role !== 'tool') {
            allResponsesMatchAndPresent = false;
            break;
          }
          const toolMsg = messages[nextMsgIndex];
          if (!expectedToolCallIds.has(toolMsg.tool_call_id)) {
            allResponsesMatchAndPresent = false;
            break;
          }
          actualToolResponsesFound++;
        }

        if (!allResponsesMatchAndPresent || actualToolResponsesFound !== numToolCalls) {
          console.error(`[getOpenAIResponse DIAGNOSTIC] storeId: ${storeId}, INVALID HISTORY DETECTED at index ${i} for assistant tool_calls.`);
          console.error(`[getOpenAIResponse DIAGNOSTIC] Problematic assistant message:`, JSON.stringify(currentMsg));
          console.error(`[getOpenAIResponse DIAGNOSTIC] Original messages before truncation (length ${messages.length}):`, JSON.stringify(messages, null, 2));
          
          const originalUserMessageContent = (userMessage !== null && userMessage !== undefined) ? userMessage : null;
          messages.splice(i); // Remove from index i (the problematic assistant message) to the end

          console.warn(`[getOpenAIResponse DIAGNOSTIC] Messages array truncated to length ${messages.length}. New messages array:`, JSON.stringify(messages, null, 2));
          
          // If after truncation, only system prompt is left (or less), and there was an original new user message, re-add it.
          // Ensure system prompt is always first if present.
          if (messages.length === 0 && systemMessageContent) {
            messages.push({ role: "system", content: systemMessageContent });
          }
          if (messages.length <=1 && originalUserMessageContent) { 
            const lastMessageIsSystem = messages.length === 1 && messages[0].role === 'system';
            const needsUserMessage = messages.length === 0 || (lastMessageIsSystem && messages[0].content !== originalUserMessageContent);
            if (needsUserMessage) {
                 messages.push({ role: "user", content: originalUserMessageContent });
                 console.warn(`[getOpenAIResponse DIAGNOSTIC] Re-added current user message after truncation. Messages:`, JSON.stringify(messages, null, 2));
            }
          } else if (messages.length <= 1 && !originalUserMessageContent) {
            console.error(`[getOpenAIResponse DIAGNOSTIC] History truncated to system prompt (or less) and no new user message. OpenAI call might fail or yield poor results.`);
          }
          break; // Exit the validation loop as messages array has been modified.
        }
        i += numToolCalls; // If valid, skip past the tool messages in the outer loop
      }
    }

    console.log(`[getOpenAIResponse] storeId: ${storeId}, Sending ${messages.length} messages to OpenAI (potentially truncated) for user ${conversationHistory[0]?.userId || 'unknown'}. Last user message: ${userMessage}`);

  try {
    const completionParams = {
      model: botConfig.openaiModel || "gpt-4o-mini", // Use configured model or default to gpt-4o-mini
      messages: messages,
      tools: tools, // Pass the defined tools
      tool_choice: "auto", // Let OpenAI decide when to use tools
      temperature: parseFloat(botConfig.temperature) || 0.7, // Use configured temperature or default
    };
    console.log(`[storeId: ${storeId}] Sending to OpenAI with params:`, JSON.stringify(completionParams, null, 2));

    const response = await openAIClient.chat.completions.create(completionParams);
    console.log(`[storeId: ${storeId}] OpenAI completion received. Finish reason: ${response.choices[0].finish_reason}`);
    
    const responseMessage = response.choices[0]?.message;

    if (responseMessage) {
      // If OpenAI returns a message (could be content, tool_calls, or both)
      // return it directly. The main handler will process its properties.
      return responseMessage;
    }
    
    // This part is reached if response.choices[0].message is undefined or null
    console.error(`[storeId: ${storeId}] OpenAI response did not contain a message object (response.choices[0].message is falsy). Full API response:`, JSON.stringify(response, null, 2));
    return { content: "I encountered an issue interpreting the AI's response. Please try again." }; 
  } catch (error) {
    console.error(`[storeId: ${storeId}] Error calling OpenAI API:`, error);
    // Check for specific OpenAI error types if needed, e.g., authentication, rate limits
    let errorMessage = "I'm sorry, I encountered an error while trying to reach the AI. Please try again shortly.";
    if (error.status === 401) {
        errorMessage = "There's an issue with the AI service configuration (authentication). Please contact support.";
    } else if (error.status === 429) {
        errorMessage = "The AI service is currently busy. Please try again in a few moments.";
    }
    return { content: errorMessage }; 
  }
}

// Helper function to get session from DynamoDB (uses SESSION_TABLE_NAME, assumes it's in LAMBDA_REGION)
async function getSession(storeId, userId) {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' }); // Uses client for Lambda's region
  const sessionId = `${storeId}-${userId}`;
  if (!process.env.SESSION_TABLE_NAME) {
    console.error(`[storeId: ${storeId}] Critical Error: SESSION_TABLE_NAME env var not set for getSession.`);
    return [];
  }

  try {
    const params = {
      TableName: process.env.SESSION_TABLE_NAME,
      Key: marshall({ sessionId }), // Key needs to be marshalled
    };
    const { Item } = await client.send(new GetItemCommand(params));
    return Item ? unmarshall(Item).conversation : []; // Unmarshall and then access conversation
  } catch (error) {
    console.error(`[storeId: ${storeId}] Error getting session for ${sessionId} from ${process.env.AWS_REGION || 'ap-southeast-1'}:`, error);
    return []; // Return empty array on error
  }
}

// Helper function to update session in DynamoDB (uses SESSION_TABLE_NAME, assumes it's in LAMBDA_REGION)
async function updateSession(storeId, userId, conversation) {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' }); // Uses client for Lambda's region
  const sessionId = `${storeId}-${userId}`;
  const ttl = Math.floor(Date.now() / 1000) + (parseInt(process.env.SESSION_TTL_HOURS || '1', 10) * 60 * 60);
  if (!process.env.SESSION_TABLE_NAME) {
    console.error(`[storeId: ${storeId}] Critical Error: SESSION_TABLE_NAME env var not set for updateSession.`);
    return;
  }

  if (conversation.length > 10 * 2) {
    conversation = conversation.slice(conversation.length - 10 * 2);
  }

  try {
    const itemToPut = {
      sessionId: sessionId,
      conversation: conversation,
      ttl: ttl,
    };

    const params = {
      TableName: process.env.SESSION_TABLE_NAME,
      Item: marshall(itemToPut, { convertClassInstanceToMap: true }), // Marshall with URL support
    };
    await client.send(new PutItemCommand(params));
  } catch (error) {
    console.error(`[storeId: ${storeId}] Error updating session for ${sessionId} in ${process.env.AWS_REGION || 'ap-southeast-1'}:`, error);
  }
}

async function executeGetOrderHistory(storeId, customerWhatsappNumber, botConfig) {
  console.log(`[storeId: ${storeId}] EXECUTE_GET_ORDER_HISTORY called for ${customerWhatsappNumber}`);
  const fastapiBaseUrl = botConfig.posFastapiBaseUrl || process.env.POS_FASTAPI_BASE_URL;
  if (!fastapiBaseUrl) {
    console.error(`[storeId: ${storeId}] POS_FASTAPI_BASE_URL is not configured.`);
    await sendWhatsAppMessage(storeId, customerWhatsappNumber, { type: 'text', text: { body: "Sorry, I can't fetch order history right now due to a configuration issue." } }, botConfig);
    return "Order history fetch failed: Configuration error.";
  }

  try {
    // Build URL with query parameters
    const url = new URL(`${fastapiBaseUrl}/stores/${storeId}/orders/`);
    url.searchParams.append('customer_id', customerWhatsappNumber);
    url.searchParams.append('limit', '5');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`FastAPI error: ${response.status}`);
    }

    const responseData = await response.json();
    if (responseData && responseData.orders && responseData.orders.length > 0) {
      let messageBody = "Here are your last few orders:\n";
      responseData.orders.forEach(order => {
        const orderDate = new Date(order.created_at).toLocaleDateString();
        messageBody += `\nOrder ID: ${order.order_id}\nDate: ${orderDate}\nTotal: ${order.currency} ${order.total_amount}\nStatus: ${order.status}\n---`;
      });
      await sendWhatsAppMessage(storeId, customerWhatsappNumber, { type: 'text', text: { body: messageBody } }, botConfig);
      return `Displayed ${responseData.orders.length} orders.`;
    } else {
      await sendWhatsAppMessage(storeId, customerWhatsappNumber, { type: 'text', text: { body: "You have no recent orders, or I couldn't find any associated with your number." } }, botConfig);
      return "No orders found or error fetching orders.";
    }
  } catch (error) {
    console.error(`[storeId: ${storeId}] Error fetching order history from FastAPI:`, error.message);
    await sendWhatsAppMessage(storeId, customerWhatsappNumber, { type: 'text', text: { body: "Sorry, I encountered an error while fetching your order history." } }, botConfig);
    return "Error fetching order history.";
  }
}

module.exports.handler = async function(event) {
  console.log('[Webhook] FULL INCOMING EVENT:', JSON.stringify(event, null, 2));
  try {
    // --- Debugging: Log incoming event structure and httpMethod ---
    console.log('[DEBUG] Lambda invoked. Event keys:', Object.keys(event));
    // Correctly access HTTP method for Payload Format Version 2.0
    const httpMethod = event.requestContext?.http?.method;
    const path = event.rawPath || event.requestContext?.http?.path || '/webhook';
    console.log(`[DEBUG] Detected HTTP method: ${httpMethod}, path: ${path}`);
    // --- End Debugging ---

    // Handle test webhook route for generating fresh credentials
    if (path === '/test-webhook' && httpMethod === 'POST') {
      return handleTestWebhook(event);
    }

    // Handle webhook verification (GET request)
    if (httpMethod === 'GET') {
      const verificationToken = process.env.WEBHOOK_VERIFY_TOKEN || "whatsapp_verify_token";
      return handleGetRequest(event, verificationToken);
    }
    
    // Handle incoming messages (POST request)
    if (httpMethod === 'POST') {
      // Extract WhatsApp Phone Number ID from the payload
      const whatsappPhoneNumberId = extractWhatsAppPhoneId(event);

      if (!whatsappPhoneNumberId) {
        console.error("No WhatsApp Phone Number ID found in the message payload");
        return {
          statusCode: 400,
          body: JSON.stringify({ status: "error", message: "Invalid payload: missing WhatsApp Phone Number ID" }),
        };
      }
      
      // Look up the storeId based on the WhatsApp Phone Number ID
      let storeId;
      let ownerNumber = null;
      const storeInfo = await getStoreIdFromPhoneId(whatsappPhoneNumberId);
      if (storeInfo) {
        storeId = storeInfo.storeId;
        ownerNumber = storeInfo.ownerNumber;
        console.log(`Store lookup complete - storeId: ${storeId}, ownerNumber: ${ownerNumber ? ownerNumber : 'not set'}`);
      } else {
        console.error(`No store found for WhatsApp Phone Number ID: ${whatsappPhoneNumberId}`);
        return {
          statusCode: 404,
          body: JSON.stringify({ status: "error", message: "Store not found for this WhatsApp account" }),
        };
      }
      
      console.log(`Processing message for store ID: ${storeId}`);
      
      // Initialize DynamoDB client for broader scope (used in botConfig and deduplication)
      const tableName = "WhatsappStoreTokens";
      const tableRegion = "us-east-1";
      const tokenDocClient = new DynamoDBClient({ region: tableRegion });
      
      // Now that we have the storeId, fetch the bot configuration
      let botConfig;
      try {
        const params = {
          TableName: tableName,
          Key: marshall({ storeId }), // Key needs to be marshalled for GetItemCommand
        };

        console.log(`[storeId: ${storeId}] Fetching bot configuration from DynamoDB table ${tableName} in region ${tableRegion}`);
        const { Item } = await tokenDocClient.send(new GetItemCommand(params));
        
        if (Item) {
          botConfig = unmarshall(Item); // Unmarshall the item
          console.log(`[storeId: ${storeId}] Bot configuration fetched successfully for storeId: ${storeId}`);
        } else {
          console.log(`[storeId: ${storeId}] No bot configuration found for storeId: ${storeId}`);
          return {
            statusCode: 404,
            body: JSON.stringify({ status: "error", message: "Bot configuration not found for this store" }),
          };
        }
      } catch (configError) {
        console.error(`[storeId: ${storeId}] Failed to load bot configuration:`, configError);
        return {
          statusCode: 500,
          body: JSON.stringify({ status: "error", message: "Failed to load bot configuration" }),
        };
      }
      
      // Fetch business context from S3
      let businessContext = null; 
      // Determine S3 bucket and key: use store-specific from botConfig if available, else fallback to defaults
      const s3BucketToUse = botConfig.s3ContextBucket || process.env.S3_CONTEXT_BUCKET;
      const s3KeyToUse = botConfig.s3ContextKey || process.env.S3_CONTEXT_KEY;

      if (s3BucketToUse && s3KeyToUse) { 
        const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        const command = new GetObjectCommand({
          Bucket: s3BucketToUse,
          Key: s3KeyToUse,
        });
        try {
          const response = await s3Client.send(command);
          businessContext = await response.Body.transformToString();
          console.log(`[storeId: ${storeId}] Successfully loaded business context from S3: s3://${s3BucketToUse}/${s3KeyToUse}`);
        } catch (error) {
          console.error(`[storeId: ${storeId}] Error fetching business context from S3 (s3://${s3BucketToUse}/${s3KeyToUse}):`, error);
          // Non-fatal error, continue without business context
          businessContext = null;
        }
      } else {
        console.log(`[storeId: ${storeId}] No S3 bucket/key configured for business context. Proceeding without it.`);
      }
      
      // Now process the message based on the HTTP method and request body
      if (httpMethod === 'POST' && event.body) {
        const signature = event.headers['x-hub-signature-256'] || event.headers['X-Hub-Signature-256'];
        
        // Use botConfig.whatsappAppSecret directly for signature validation (as per working example)
        if (!botConfig.whatsappAppSecret) {
            console.error(`[storeId: ${storeId}] WhatsApp App Secret not configured for signature validation.`);
            return { statusCode: 500, body: 'Internal Server Error: App Secret missing' };
        }
        if (!signature) {
          console.warn(`[storeId: ${storeId}] Missing X-Hub-Signature-256 header. Cannot validate signature.`);
          // Depending on policy, might reject or proceed with caution (not recommended for production)
          // return { statusCode: 400, body: 'Missing signature header' };
        } else {
          // Add detailed debugging for signature calculation
          console.log(`[storeId: ${storeId}] DEBUG: Raw event.body type: ${typeof event.body}`);
          console.log(`[storeId: ${storeId}] DEBUG: Raw event.body length: ${event.body ? event.body.length : 'undefined'}`);
          console.log(`[storeId: ${storeId}] DEBUG: Raw event.body preview: ${event.body ? event.body.substring(0, 200) + '...' : 'undefined'}`);
          console.log(`[storeId: ${storeId}] DEBUG: WhatsApp App Secret being used: ${botConfig.whatsappAppSecret}`);
          console.log(`[storeId: ${storeId}] DEBUG: Signature header received: ${signature}`);
          
          const calculatedSignature = 'sha256=' + crypto.createHmac('sha256', botConfig.whatsappAppSecret).update(event.body).digest('hex');
          console.log(`[storeId: ${storeId}] DEBUG: Calculated signature: ${calculatedSignature}`);

          if (signature !== calculatedSignature) {
            console.error(`[storeId: ${storeId}] ERROR: Invalid webhook signature. Calculated (Expected): '${calculatedSignature}', Got (From Header): '${signature}'. WhatsApp App Secret used for calculation starts with: '${botConfig.whatsappAppSecret ? botConfig.whatsappAppSecret.substring(0,5) : 'NOT_FOUND'}...'`);
            return { statusCode: 403, body: JSON.stringify({ status: "error", message: "Invalid webhook signature." }) };
          }
        }
        
        console.log(`[storeId: ${storeId}] Webhook signature validated successfully.`);

        try {
      const body = JSON.parse(event.body);
      console.log('Processing POST request body (signature validated):', body);

      if (!body.object || body.object !== 'whatsapp_business_account' || !body.entry || !body.entry.length) {
        console.warn(`[storeId: ${storeId}] Invalid webhook notification format`);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Invalid webhook notification format' })
        };
      }

      // Process all entries
      for (const entry of body.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.value && change.value.messages && change.value.messages.length > 0) {
              let from; // Declare 'from' for this message processing scope
              let conversation; // Declare 'conversation' for this message processing scope
              try {

                const message = change.value.messages[0];
                from = message.from; // Assign to 'from' in the outer scope
                const messageType = message.type; // Initialize messageType here before using it
                const messageId = message.id; // WhatsApp message ID for deduplication
                
                // Check for duplicate messages using in-memory cache (avoid polluting store tokens table)
                const processedMessageKey = `${storeId}_${messageId}`;
                
                // Simple in-memory deduplication with TTL
                if (!global.processedMessages) {
                  global.processedMessages = new Map();
                }
                
                const now = Date.now();
                const existingMessage = global.processedMessages.get(processedMessageKey);
                
                if (existingMessage && (now - existingMessage.processedAt) < (24 * 60 * 60 * 1000)) {
                  console.log(`[storeId: ${storeId}] Message ${messageId} already processed, skipping`);
                  continue; // Skip this message as it's already been processed
                }
                
                // Mark message as being processed
                global.processedMessages.set(processedMessageKey, {
                  messageId: messageId,
                  processedAt: now
                });
                
                // Clean up old entries (keep only last 1000 entries)
                if (global.processedMessages.size > 1000) {
                  const entries = Array.from(global.processedMessages.entries());
                  entries.sort((a, b) => b[1].processedAt - a[1].processedAt);
                  global.processedMessages.clear();
                  entries.slice(0, 500).forEach(([key, value]) => {
                    global.processedMessages.set(key, value);
                  });
                }
                
                console.log(`[storeId: ${storeId}] Processing new message ${messageId} from ${from}`);
                
                
                // Check if the message is from the owner number (skip for LobangLah bot)
                const isFromOwner = ownerNumber && from === ownerNumber;
                if (isFromOwner && storeId !== 'cmanyfn1e0001jl04j3k45mz5') {
                  console.log(`[storeId: ${storeId}] Message received from owner number: ${from}. Will suppress OpenAI and product messages.`);
                  
                  // Only send the interactive dashboard for text messages, not for interactive button clicks
                  if (messageType === 'text') {
                    // Send special interactive message to the owner
                    const ownerInteractiveMessage = {
                      type: 'interactive',
                      interactive: {
                        type: 'button',
                        header: {
                          type: 'text',
                          text: 'Store Owner Dashboard'
                        },
                        body: {
                          text: `Hello Store Owner! How can I help you today with store management? Current time: ${new Date().toLocaleString()}`
                        },
                        footer: {
                          text: 'Select an option below'
                        },
                        action: {
                          buttons: [
                            {
                              type: 'reply',
                              reply: {
                                id: 'view_orders',
                                title: '📋 View Orders'
                              }
                            },
                            {
                              type: 'reply',
                              reply: {
                                id: 'view_customers',
                                title: '👥 View Customers'
                              }
                            },
                            {
                              type: 'reply',
                              reply: {
                                id: 'view_stats',
                                title: '📊 View Stats'
                              }
                            }
                          ]
                        }
                      }
                    };
                    
                    // Send the interactive message to the owner
                    await sendWhatsAppMessage(storeId, from, ownerInteractiveMessage, botConfig);
                    console.log(`[storeId: ${storeId}] Sent interactive message to owner: ${from}`);
                    
                    // Return early to prevent further processing
                    return {
                      statusCode: 200,
                      body: JSON.stringify({
                        status: 'success',
                        message: 'Owner message received and processed'
                      })
                    };
                  }
                  
                  // For interactive messages from owner, let them pass through to be processed normally
                  // This will allow button clicks to work without reshowing the dashboard
                  console.log(`[storeId: ${storeId}] Owner ${from} sent ${messageType} message. Processing normally.`);
                }
                
                // For viral agency bot, treat owner messages as regular user messages
                if (isFromOwner && storeId === 'cmanyfn1e0001jl04j3k45mz5') {
                  console.log(`[storeId: ${storeId}] Viral agency owner message from ${from}. Processing as regular user message.`);
                }
                
                const profileName = change.value.contacts?.[0]?.profile?.name || 'User';
                

                console.log(`[storeId: ${storeId}] Received message from ${profileName} (${from}) of type ${messageType}`);

                const sessionId = `${storeId}:${from}`;  // Create proper sessionId
                console.log(`[webhook] Getting session with sessionId ${sessionId}`);
                const session = await getSession(sessionId);
                
                // DISABLED: OwnerReplyManager not needed for LobangLah bot
                // const ownerReplyResult = await handleOwnerReply(message, session, { storeId, from, botConfig });
                // if (ownerReplyResult.handled) {
                //     ownerReplyResult.session.sessionId = sessionId;
                //     console.log(`[webhook] Updating session after owner reply handling: ${sessionId}`);
                //     await updateSession(ownerReplyResult.session);
                //     continue;
                // }

                // Continue with normal message processing flow
                let conversation = session.conversation || [];
                const context = { storeId, userPhone: from, botConfig, conversation, businessContext };

                // --- BEGIN MAIN MESSAGE TYPE HANDLING ---

                // 1. Handle Interactive Messages
                if (messageType === 'interactive' && message.interactive) {
                    console.log(`[storeId: ${storeId}] Processing interactive message:`, JSON.stringify(message.interactive));

                    // Special handling for DAILY DEAL VIRAL AGENCY (store ID: cmanyfn1e0001jl04j3k45mz5)
                    if (storeId === 'cmanyfn1e0001jl04j3k45mz5') {
                        console.log(`[DailyDeal] Detected DAILY DEAL AGENCY store, processing interactive message`);
                        
                        const response = await handleDailyDealMessage(
                            storeId,
                            from,
                            'interactive',
                            '',
                            message.interactive,
                            null,
                            botConfig,
                            session
                        );
                        
                        // ALWAYS handle viral agency messages exclusively - no fallback to other handlers
                        console.log(`[DailyDeal] Interactive message processed for ${from} (success: ${response.success})`);
                        
                        // Note: handleDailyDealMessage already sends the response internally
                        // We don't need to send it again here to avoid double-sending
                        if (response && response.response && response.response.type) {
                            console.log(`[DailyDeal] Daily deal response already sent by handler:`, response.response);
                        }
                        
                        // Use updated session data from daily deal handler
                        const updatedSession = response.session || session;
                        updatedSession.lastInteraction = 'daily_deal_agency';
                        updatedSession.timestamp = Date.now();
                        await updateSession(storeId, from, updatedSession);
                        continue; // Skip ALL other message processing for viral agency
                    }
                    
                    // Special handling for Social Media Agency bot (store ID: viral_agency_main)
                    if (storeId === 'viral_agency_main') {
                        console.log(`[SocialAgency] Detected Social Media Agency store, processing interactive message`);
                        
                        const response = await handleSocialAgencyMessage(
                            storeId,
                            from,
                            'interactive',
                            '',
                            message.interactive,
                            null,
                            botConfig,
                            session
                        );
                        
                        if (response.success) {
                            console.log(`[SocialAgency] Interactive message handled successfully for ${from}`);
                            // Update session to track agency interaction
                            session.lastInteraction = 'social_agency';
                            session.timestamp = Date.now();
                            await updateSession(storeId, from, session);
                            continue; // Skip regular message processing
                        }
                    }

                    const interactive = message.interactive;
                    const actionIdentifier = interactive.button_reply ? interactive.button_reply.id : (interactive.list_reply ? interactive.list_reply.id : null);

                    if (actionIdentifier) {
                        console.log(`[storeId: ${storeId}] Processing action from interactive reply: ${actionIdentifier}`);
                        conversation.push({ role: 'user', content: `[Selected: ${actionIdentifier}]` });

                        let actionResult;

                        // --- Action Routing for Interactive Replies ---
                        if (actionIdentifier.startsWith('view_product_details_')) {
                            const productId = actionIdentifier.substring('view_product_details_'.length);
                            console.log(`[Webhook] Extracted actionIdentifier from list reply: ${actionIdentifier}`);
                            actionResult = await processAction('VIEW_PRODUCT_DETAIL', { productId }, context);
                        } else if (actionIdentifier === 'view_order_history' || actionIdentifier === 'view_orders') {
                            actionResult = await processAction('GET_ORDER_HISTORY', {}, context);
                        } else if (actionIdentifier.startsWith('view_order_detail_')) {
                            console.log(`[Webhook] Extracted actionIdentifier from button reply: ${actionIdentifier}`);
                            actionResult = await processAction(actionIdentifier, {}, context); // actionProcessor handles the full ID
                        } else if (actionIdentifier.startsWith('contact_support_')) {
                            const orderId = actionIdentifier.substring('contact_support_'.length);
                            const supportMessage = `For support with order #${orderId}, please contact us at support@example.com or call our helpline.`;
                            actionResult = { success: true, message: 'Contact support info sent.', messagePayload: { type: 'text', text: { body: supportMessage } } };
                        } else if (actionIdentifier.startsWith('customer_response_')) {
                            const orderId = actionIdentifier.substring('customer_response_'.length);
                            console.log(`[Webhook] Customer ${from} clicked response button for order ${orderId}`);
                            
                            // Create a prompt for the customer to enter their message
                            const promptMessage = `Please type your message for the store regarding order #${orderId.substring(0, 8).toUpperCase()}. The store owner will be notified.`;
                            
                            // Store in session that we're waiting for a message for this order
                            session.awaitingCustomerMessageForOrder = orderId;
                            await updateSession(storeId, from, session);
                            
                            actionResult = { 
                                success: true, 
                                message: 'Customer response prompt sent.', 
                                messagePayload: { type: 'text', text: { body: promptMessage } } 
                            };
                        } else if (actionIdentifier === 'view_customers') {
                            console.log(`[Webhook] Owner ${from} requested to view recent customers`);
                            
                            // Check if this is indeed from the owner number for additional security
                            const isFromOwner = ownerNumber && from === ownerNumber;
                            if (!isFromOwner) {
                                actionResult = {
                                    success: false,
                                    message: 'Unauthorized access attempt',
                                    messagePayload: { type: 'text', text: { body: 'You are not authorized to access this information.' } }
                                };
                            } else {
                                // Fetch recent customers who ordered in the last 24 hours
                                const recentOrders = await getRecentCustomers(storeId, botConfig);
                                
                                // Format the message with customer details
                                const customerMessage = formatRecentCustomersMessage(recentOrders);
                                
                                actionResult = {
                                    success: true,
                                    message: 'Recent customers information sent to owner',
                                    messagePayload: { type: 'text', text: { body: customerMessage } }
                                };
                            }
                        } else if (actionIdentifier === 'view_stats') {
                            // Check if this is indeed from the owner number for additional security
                            const isFromOwner = ownerNumber && from === ownerNumber;
                            if (!isFromOwner) {
                                actionResult = {
                                    success: false,
                                    message: 'Unauthorized access attempt',
                                    messagePayload: { type: 'text', text: { body: 'You are not authorized to access this information.' } }
                                };
                            } else {
                                // Placeholder for store statistics functionality
                                const statsMessage = '*Store Statistics*\n\n' +
                                    'This feature is coming soon! It will show key metrics like:\n\n' +
                                    '- Total sales today\n' +
                                    '- Number of orders today\n' +
                                    '- Average order value\n' +
                                    '- Popular products\n\n' +
                                    'Check back soon for these insights!';
                                
                                actionResult = {
                                    success: true,
                                    message: 'Store statistics placeholder sent',
                                    messagePayload: { type: 'text', text: { body: statsMessage } }
                                };
                            }
                        } else if (actionIdentifier.startsWith('discount_')) {
                            // Handle discount response from owner
                            console.log(`[Webhook] Owner ${from} responded to discount request: ${actionIdentifier}`);
                            
                            // Check if this is indeed from the owner number for security
                            const isFromOwner = ownerNumber && from === ownerNumber;
                            if (!isFromOwner) {
                                actionResult = {
                                    success: false,
                                    message: 'Unauthorized discount action attempt',
                                    messagePayload: { type: 'text', text: { body: 'You are not authorized to perform this action.' } }
                                };
                            } else {
                                // Process the discount response
                                const discountResult = await handleDiscountResponse(storeId, ownerNumber, actionIdentifier, botConfig);
                                
                                actionResult = {
                                    success: discountResult.success,
                                    message: discountResult.message,
                                    // No message payload needed here as handleDiscountResponse sends messages directly
                                };
                            }
                        } else if (actionIdentifier === 'todays_offer') {
                            // Handle Today's Offer button click
                            console.log(`[Webhook] Customer ${from} clicked on Today's Offer button`);
                            
                            // Process the today's offer request
                            const offerResult = await handleTodaysOfferClick(storeId, ownerNumber, from, botConfig);
                            
                            actionResult = {
                                success: offerResult.success,
                                message: offerResult.message,
                                // No message payload needed here as handleTodaysOfferClick sends messages directly
                            };
                        } else if (actionIdentifier.startsWith('select_product_')) {
                            // Handle product selection from Today's Offer
                            console.log(`[Webhook] Customer ${from} selected a product: ${actionIdentifier}`);
                            
                            // Extract product ID from the button ID
                            // Format: select_product_productId
                            const productId = actionIdentifier.substring('select_product_'.length);
                            
                            if (productId) {
                                // Process the product selection
                                const result = await handleProductSelection(storeId, ownerNumber, from, productId, botConfig);
                                
                                actionResult = {
                                    success: result.success,
                                    message: result.message,
                                    // No message payload needed here as handleProductSelection sends messages directly
                                };
                            } else {
                                console.error(`[storeId: ${storeId}] Invalid product selection format: ${actionIdentifier}`);
                                actionResult = {
                                    success: false,
                                    message: 'Invalid product selection format'
                                };
                            }
                        } else if (actionIdentifier.startsWith('accept_discount_offer_')) {
                            // Handle customer accepting a discount offer by clicking Buy Now
                            console.log(`[Webhook] Customer ${from} accepted a discount offer: ${actionIdentifier}`);
                            
                            // Parse product ID and discount percentage from the button ID
                            // Format: accept_discount_offer_productId_discountPercentage
                            const parts = actionIdentifier.split('_');
                            if (parts.length >= 5) {
                                const productId = parts[3];
                                const discountPercentage = parseInt(parts[4], 10);
                                
                                if (productId && !isNaN(discountPercentage)) {
                                    // Create actual order with discount
                                    const orderResult = await handleAcceptDiscountOffer(storeId, from, productId, discountPercentage, botConfig);
                                    
                                    // No message payload needed as handleAcceptDiscountOffer handles messaging
                                    actionResult = {
                                        success: orderResult.success,
                                        message: orderResult.message || 'Processed discount offer acceptance'
                                    };
                                } else {
                                    console.error(`[storeId: ${storeId}] Invalid discount offer format: ${actionIdentifier}`);
                                    await sendWhatsAppMessage(storeId, from, {
                                        type: 'text',
                                        text: {
                                            body: `❌ Sorry, we couldn't process your order. Please try again or contact the store directly.`
                                        }
                                    }, botConfig);
                                    
                                    actionResult = {
                                        success: false,
                                        message: 'Invalid discount offer format'
                                    };
                                }
                            } else {
                                console.error(`[storeId: ${storeId}] Malformed discount offer ID: ${actionIdentifier}`);
                                actionResult = {
                                    success: false,
                                    message: 'Malformed discount offer ID'
                                };
                            }
                        } else if (actionIdentifier.startsWith('todays_offer_discount_')) {
                            // Handle Today's Offer discount selection from owner
                            console.log(`[Webhook] Owner ${from} selected a discount option: ${actionIdentifier}`);
                            
                            // Only process if coming from the owner number
                            if (from === ownerNumber) {
                                // Extract discount percentage and customer number from the button ID
                                // Format: todays_offer_discount_XX_customerNumber where XX is the percentage
                                const parts = actionIdentifier.split('_');
                                if (parts.length >= 4) {
                                    const discountPercentage = parseInt(parts[3], 10);
                                    const customerNumber = parts.slice(4).join('_');
                                    
                                    if (!isNaN(discountPercentage) && customerNumber) {
                                        const result = await handleTodaysOfferDiscount(storeId, customerNumber, discountPercentage, botConfig);
                                        
                                        if (result.success) {
                                            // Confirm to owner that discount was sent
                                            await sendWhatsAppMessage(storeId, from, {
                                                type: 'text',
                                                text: {
                                                    body: `✅ ${discountPercentage}% discount offer for ${result.product.name} has been sent to the customer.`
                                                }
                                            }, botConfig);
                                        } else {
                                            console.error(`[storeId: ${storeId}] Failed to process discount:`, result.message);
                                            await sendWhatsAppMessage(storeId, from, {
                                                type: 'text',
                                                text: {
                                                    body: `❌ Failed to process discount: ${result.message}`
                                                }
                                            }, botConfig);
                                        }
                                    }
                                }
                            } else {
                                console.warn(`[storeId: ${storeId}] Non-owner tried to send discount: ${from}`);
                            }
                            
                            actionResult = {
                                success: true,
                                // No message payload needed here as we send messages directly
                            };
                        } else {
                            // Fallback for other actions defined in actionProcessor (e.g., BUY_PRODUCT, CONFIRM_ORDER)
                            actionResult = await processAction(actionIdentifier, {}, context);
                        }
                        // --- End Action Routing ---

                        if (actionResult && actionResult.messagePayload) {
                            // This handles cases where actionProcessor returned a messagePayload,
                            // regardless of success or failure.
                            // The payload itself should be crafted by actionProcessor to be appropriate.
                            console.log(`[storeId: ${storeId}] Action '${actionIdentifier}' produced actionResult with messagePayload. Success: ${actionResult.success}. Sending payload. Full actionResult:`, JSON.stringify(actionResult));
                            if (Array.isArray(actionResult.messagePayload)) {
                                for (const msg of actionResult.messagePayload) {
                                    await sendWhatsAppMessage(storeId, from, msg, botConfig);
                                }
                            } else {
                                await sendWhatsAppMessage(storeId, from, actionResult.messagePayload, botConfig);
                            }
                            // Log to conversation history
                            const conversationMessage = actionResult.message || (actionResult.success ? `Action ${actionIdentifier} successful.` : `Action ${actionIdentifier} failed.`);
                            conversation.push({ role: 'assistant', content: `[Action: ${actionIdentifier}] ${conversationMessage}` });

                        } else if (actionResult && actionResult.message && !actionResult.messagePayload) {
                            // Action completed, might be success or failure, but no specific payload, only an internal message.
                            console.warn(`[storeId: ${storeId}] Action '${actionIdentifier}' produced actionResult with a message but no messagePayload. Success: ${actionResult.success}. Message: ${actionResult.message}. Full actionResult:`, JSON.stringify(actionResult));
                            const userFallbackMessage = actionResult.success ? actionResult.message : "Sorry, an issue occurred while processing your request. Please contact support if this persists.";
                            await sendWhatsAppMessage(storeId, from, { type: 'text', text: { body: userFallbackMessage } }, botConfig);
                            conversation.push({ role: 'assistant', content: `[Action: ${actionIdentifier}] ${actionResult.message}` });

                        } else {
                            // This means actionResult was null, undefined, or didn't have .messagePayload or .message
                            console.error(`[storeId: ${storeId}] Action '${actionIdentifier}' failed silently or actionResult was malformed/empty. actionResult:`, JSON.stringify(actionResult));
                            await sendWhatsAppMessage(storeId, from, { type: 'text', text: { body: "An error occurred while processing your request. Please try again later." } }, botConfig);
                            await sendWhatsAppMessage(storeId, from, { type: 'text', text: { body: "I'm sorry, I couldn't process that request due to an unexpected issue. Please try again." } }, botConfig);
                            conversation.push({ role: 'assistant', content: `[Action Failed: ${actionIdentifier}] Malformed or empty result.` });
                        }

                    } else {
                        console.warn(`[storeId: ${storeId}] Received interactive message with no actionable ID.`, message.interactive);
                    }

                // 2. Handle Text Messages
                } else if (messageType === 'text' && message.text && message.text.body) {
                    const currentMessageContent = message.text.body;
                    console.log(`[storeId: ${storeId}] Processing text message: "${currentMessageContent}"`);
                    
                    // Special handling for DAILY DEAL VIRAL AGENCY (store ID: cmanyfn1e0001jl04j3k45mz5)
                    if (storeId === 'cmanyfn1e0001jl04j3k45mz5') {
                        console.log(`[DailyDeal] Detected DAILY DEAL AGENCY store, processing text message`);
                        
                        const response = await handleDailyDealMessage(
                            storeId,
                            from,
                            'text',
                            currentMessageContent,
                            null,
                            null,
                            botConfig,
                            session
                        );
                        
                        // ALWAYS handle viral agency messages exclusively - no fallback to other handlers
                        console.log(`[DailyDeal] Text message processed for ${from} (success: ${response.success})`);
                        
                        // Note: handleDailyDealMessage already sends the response internally
                        // We don't need to send it again here to avoid double-sending
                        if (response && response.response && response.response.type) {
                            console.log(`[DailyDeal] Daily deal response already sent by handler:`, response.response);
                        }
                        
                        // Use updated session data from daily deal handler
                        const updatedSession = response.session || session;
                        updatedSession.lastInteraction = 'daily_deal_agency';
                        updatedSession.timestamp = Date.now();
                        await updateSession(storeId, from, updatedSession);
                        continue; // Skip ALL other message processing for viral agency
                    }
                    
                    // Special handling for Social Media Agency bot (store ID: viral_agency_main)
                    if (storeId === 'viral_agency_main') {
                        console.log(`[SocialAgency] Detected Social Media Agency store, processing text message`);
                        
                        const response = await handleSocialAgencyMessage(
                            storeId,
                            from,
                            'text',
                            currentMessageContent,
                            null,
                            null,
                            botConfig,
                            session
                        );
                        
                        if (response.success) {
                            console.log(`[SocialAgency] Text message handled successfully for ${from}`);
                            // Update session to track agency interaction
                            session.lastInteraction = 'social_agency';
                            session.timestamp = Date.now();
                            await updateSession(storeId, from, session);
                            continue; // Skip regular message processing
                        }
                    }
                    
                    // Check if we're waiting for a customer message to send to the store owner
                    if (session.awaitingCustomerMessageForOrder) {
                        const orderId = session.awaitingCustomerMessageForOrder;
                        console.log(`[Webhook] Received customer message for order ${orderId}: ${currentMessageContent}`);
                        
                        try {
                            // Get the order to retrieve store owner phone
                            const { getOrderById, updateOrderById } = require('../utils/dynamoDbUtils.js');
                            const order = await getOrderById(storeId, orderId);
                            
                            if (order && (order.owner_phone || order.ownerPhone)) {
                                // Store the customer message in the order
                                const customerMessages = order.customerMessages || [];
                                customerMessages.push({
                                    timestamp: new Date().toISOString(),
                                    message: currentMessageContent
                                });
                                
                                await updateOrderById(storeId, orderId, { customerMessages });
                                
                                // Send notification to store owner
                                const ownerPhone = order.owner_phone || order.ownerPhone;
                                const orderNumber = orderId.substring(0, 8).toUpperCase();
                                
                                await sendWhatsAppMessage(storeId, ownerPhone, {
                                    type: 'text',
                                    text: { body: `📩 New customer message for order #${orderNumber}:\n\n"${currentMessageContent}"` }
                                }, botConfig);
                                
                                // Clear the awaiting flag
                                delete session.awaitingCustomerMessageForOrder;
                                await updateSession(storeId, from, session);
                                
                                // Respond to the customer
                                await sendWhatsAppMessage(storeId, from, {
                                    type: 'text',
                                    text: { body: `✅ Thank you! Your message has been sent to the store owner.` }
                                }, botConfig);
                                
                                return { statusCode: 200, body: JSON.stringify({ success: true }) };
                            } else {
                                console.error(`[Webhook] Cannot forward customer message: no owner phone for order ${orderId}`);
                                
                                // Clear the awaiting flag
                                delete session.awaitingCustomerMessageForOrder;
                                await updateSession(storeId, from, session);
                                
                                // Inform the customer
                                await sendWhatsAppMessage(storeId, from, {
                                    type: 'text',
                                    text: { body: `❌ Sorry, we couldn't deliver your message to the store. Please try contacting them directly.` }
                                }, botConfig);
                                
                                return { statusCode: 200, body: JSON.stringify({ success: true }) };
                            }
                        } catch (error) {
                            console.error(`[Webhook] Error processing customer message: ${error}`);
                            
                            // Clear the awaiting flag even on error
                            delete session.awaitingCustomerMessageForOrder;
                            await updateSession(storeId, from, session);
                            
                            // Inform the customer
                            await sendWhatsAppMessage(storeId, from, {
                                type: 'text',
                                text: { body: `❌ Sorry, we couldn't deliver your message due to a technical error.` }
                            }, botConfig);
                            
                            return { statusCode: 200, body: JSON.stringify({ success: true }) };
                        }
                    }
                    
                    // Continue with normal message processing
                    conversation.push({ role: 'user', content: currentMessageContent });
                    
                    // Normalize message for keyword matching
                    const normalizedMessage = currentMessageContent.toLowerCase().trim();
                    
                    // --- Keyword-based Triggers ---
                    const productKeywords = ['products', 'menu', 'catalog', 'items', 'show products'];
                    const orderHistoryKeywords = ['order history', 'my orders', 'past orders'];
                    let keywordActionTaken = false;

                    // Check for price sensitivity first (prioritize this over other keyword triggers)
                    if (isPriceSensitive(currentMessageContent)) {
                        console.log(`[storeId: ${storeId}] Customer message indicates price sensitivity. Starting discount flow...`);
                        
                        // Determine if we should send interactive discount approval to owner
                        if (ownerNumber) {
                            // Simulate order details for the discount request
                            // In a real implementation, this would be the actual cart/order data
                            const sampleOrderItems = [
                                { name: "Sample Product 1", price: "99.99", quantity: 1, currency: "SGD" },
                                { name: "Sample Product 2", price: "49.99", quantity: 2, currency: "SGD" }
                            ];
                            
                            const orderDetails = {
                                items: sampleOrderItems,
                                total: 199.97, // Calculate this from items in production
                                currency: "SGD"
                            };
                            
                            // Send interactive discount approval request to the owner
                            const sent = await sendDiscountApprovalRequest(storeId, ownerNumber, from, orderDetails, botConfig);
                            
                            if (sent) {
                                console.log(`[storeId: ${storeId}] Sent discount approval request to owner ${ownerNumber}`);
                                
                                // Inform the customer that we're checking with the owner
                                await sendWhatsAppMessage(storeId, from, {
                                    type: 'text',
                                    text: { body: "I understand you're concerned about the price. Let me check with the store owner if we can offer you a discount. I'll get back to you shortly!" }
                                }, botConfig);
                                
                                // Add to conversation history
                                conversation.push({ role: 'assistant', content: "I understand you're concerned about the price. Let me check with the store owner if we can offer you a discount. I'll get back to you shortly!" });
                                
                                // Skip further processing for this message since we're handling it with the discount flow
                                keywordActionTaken = true;
                            } else {
                                console.log(`[storeId: ${storeId}] Failed to send discount approval request to owner. Falling back to normal discount flow.`);
                                // Will fall back to existing discount prompt approach below
                            }
                        }
                        
                        // If we couldn't send the interactive approval or no owner is configured,
                        // fall back to the original discount flow using campaigns
                        if (!keywordActionTaken) {
                            // Get discount prompt if active campaigns exist
                            const discountPromptMsg = await getDiscountPrompt(storeId, botConfig);
                            
                            if (discountPromptMsg) {
                                console.log(`[storeId: ${storeId}] Found active campaign. Adding discount prompt to conversation.`);
                                conversation.push(discountPromptMsg);
                                keywordActionTaken = true;
                            } else {
                                console.log(`[storeId: ${storeId}] No active campaigns found for discount.`);
                            }
                        }
                    }

                    // 1. Direct product mention detection
                    if (productKeywords.includes(normalizedMessage)) {
                        console.log(`[storeId: ${storeId}] User message contains product keyword. Triggering VIEW_MORE_PRODUCTS.`);
                        const actionResult = await processAction('VIEW_MORE_PRODUCTS', {}, context);
                        if (actionResult && actionResult.success && actionResult.messagePayload) {
                            if (Array.isArray(actionResult.messagePayload)) {
                                for (const msg of actionResult.messagePayload) {
                                    await sendWhatsAppMessage(storeId, from, msg, botConfig);
                                }
                            } else {
                                await sendWhatsAppMessage(storeId, from, actionResult.messagePayload, botConfig);
                            }
                            conversation.push({ role: 'assistant', content: `[Action processed: ${actionIdentifier}] ${actionResult.message}` });
                            keywordActionTaken = true; // Mark that an action was taken
                        }
                                        } else if ((normalizedMessage.startsWith('buy ') || normalizedMessage.startsWith('product ')) && normalizedMessage.split(' ').length > 1) {
                        const potentialProductName = currentMessageContent.split(' ').slice(1).join(' ').trim();
                        console.log(`[storeId: ${storeId}] User message starts with 'buy' or 'product'. Attempting to initiate purchase for: '${potentialProductName}'.`);

                        if (potentialProductName) {
                            const product = await getProductByName(storeId, potentialProductName);
                            if (product) {
                                const productId = product.product_id || product.id;
                                const interactiveMessage = {
                                    type: 'interactive',
                                    interactive: {
                                        type: 'button',
                                        header: product.image_url ? { type: 'image', image: { link: product.image_url } } : { type: 'text', text: product.name || 'Confirm Purchase' },
                                        body: { text: `Found *${product.name}*.\nPrice: ${product.currency || 'SGD'}${(parseFloat(product.price) || 0).toFixed(2)}\n\nReady to buy?` },
                                        action: {
                                            buttons: [{
                                                type: 'reply',
                                                reply: {
                                                    id: `buy_product_${productId}`,
                                                    title: '🛒 Buy Now'
                                                }
                                            }]
                                        }
                                    }
                                };
                                await sendWhatsAppMessage(storeId, from, interactiveMessage, botConfig);
                                conversation.push({ role: 'assistant', content: `[Action: Direct Purchase] Presented 'Buy Now' for ${product.name}.` });
                                keywordActionTaken = true;
                            } else {
                                // If product not found, let OpenAI handle it for a more natural response.
                                console.log(`[storeId: ${storeId}] Product '${potentialProductName}' not found directly. Falling back to OpenAI.`);
                            }
                        }
                    } else if (orderHistoryKeywords.some(keyword => normalizedMessage.includes(keyword))) {
                        console.log(`[storeId: ${storeId}] User message contains order history keyword. Triggering GET_ORDER_HISTORY.`);
                        const actionResult = await processAction('GET_ORDER_HISTORY', {}, context);
                        if (actionResult && actionResult.messagePayload) {
                            await sendWhatsAppMessage(storeId, from, actionResult.messagePayload, botConfig);
                            conversation.push({ role: 'assistant', content: `[Action processed: ${actionIdentifier}] ${actionResult.message}` });
                            keywordActionTaken = true; // Mark that an action was taken
                            conversation.push({ role: 'assistant', content: 'I have sent you your order history.' });
                            keywordActionTaken = true;
                        }
                    }
                    // --- End Keyword-based Triggers ---

                    // 3. Fallback to OpenAI if no keyword action was taken
                    if (!keywordActionTaken) {
                        console.log(`[storeId: ${storeId}] Processing text message through OpenAI`);
                        
                        let currentOpenAIMessage = await getOpenAIResponse(storeId, currentMessageContent, conversation, botConfig, businessContext);

                        while (currentOpenAIMessage.tool_calls && currentOpenAIMessage.tool_calls.length > 0) {
                            conversation.push(currentOpenAIMessage);
                            const toolCallResponses = [];
                            for (const toolCall of currentOpenAIMessage.tool_calls) {
                                const functionName = toolCall.function.name;
                                let toolResponseContent = "";
                                try {
                                    const functionArgs = JSON.parse(toolCall.function.arguments);
                                    console.log(`[storeId: ${storeId}] Executing tool: ${functionName}`, functionArgs);

                                    if (functionName === "display_product_info") {
                                        const { productId, introductoryText } = functionArgs;
                                        if (introductoryText) await sendWhatsAppMessage(storeId, from, { type: 'text', text: { body: introductoryText } }, botConfig);
                                        const displayResult = await displayProductInfo(storeId, productId, botConfig, context, conversation);
                                        toolResponseContent = displayResult.toolResponse || `Displayed product info for ${productId}.`;
                                    } else if (functionName === "get_store_products") {
                                        const products = await getStoreProducts(storeId, functionArgs.limit || 10);
                                        toolResponseContent = JSON.stringify(products);
                                    } else if (functionName === "execute_get_order_history") {
                                        const historyResult = await executeGetOrderHistory(storeId, from, botConfig);
                                        toolResponseContent = historyResult.toolResponse || "Order history processed.";
                                    } else if (functionName === "execute_get_invoice") {
                                        const invoiceResult = await executeGetInvoice(storeId, from, functionArgs.orderId, botConfig);
                                        toolResponseContent = invoiceResult.toolResponse || `Invoice for order ${functionArgs.orderId} processed.`;
                                    } else if (functionName === "suggest_view_all_products") {
                                        const actionResult = await processAction('VIEW_MORE_PRODUCTS', {}, context);
                                        if (actionResult && actionResult.messagePayload) {
                                            await sendWhatsAppMessage(storeId, from, actionResult.messagePayload, botConfig);
                                            toolResponseContent = "Successfully displayed the product list.";
                                        } else {
                                            toolResponseContent = "Attempted to display products, but an error occurred.";
                                        }
                                    } else if (functionName === "send_location_message") {
                                        const { latitude, longitude, name, address } = functionArgs;
                                        if (latitude && longitude && name && address) {
                                            await sendWhatsAppMessage(storeId, from, {
                                                type: 'location',
                                                location: { latitude, longitude, name, address }
                                            }, botConfig);
                                            toolResponseContent = "I've sent you the store's location.";
                                        } else {
                                            console.error(`[storeId: ${storeId}] Missing arguments for send_location_message:`, functionArgs);
                                            toolResponseContent = "I couldn't send the location as some details are missing.";
                                        }
                                    } else if (functionName === "initiate_purchase") {
                                        const { productName } = functionArgs;
                                        const product = await getProductByName(storeId, productName);

                                        if (product) {
                                            const productId = product.product_id || product.id;
                                            let detailText = `*${product.name || 'Product'}*\n`;
                                            if (product.description) {
                                              // Keep description brief for this context
                                              const shortDescription = product.description.length > 100 ? product.description.substring(0, 97) + '...' : product.description;
                                              detailText += `${shortDescription}\n\n`;
                                            }
                                            if (product.price !== undefined) {
                                              detailText += `*Price:* ${product.currency || botConfig?.currencyCode || 'SGD'}${(parseFloat(product.price) || 0).toFixed(2)}\n`;
                                            }

                                            const interactiveMessage = {
                                                type: 'interactive',
                                                interactive: {
                                                    type: 'button',
                                                    header: product.image_url
                                                        ? { type: 'image', image: { link: product.image_url } }
                                                        : { type: 'text', text: product.name || 'Product Details' },
                                                    body: { text: detailText.substring(0, 1024) }, // WhatsApp body text limit
                                                    action: {
                                                        buttons: [
                                                            {
                                                                type: 'reply',
                                                                reply: {
                                                                    id: `buy_product_${productId}`,
                                                                    title: '🛒 Buy Now'
                                                                }
                                                            }
                                                            // Optionally, add 'All Products' or 'Ask Question' buttons here later
                                                        ]
                                                    }
                                                }
                                            };

                                            await sendWhatsAppMessage(storeId, from, interactiveMessage, botConfig);
                                            toolResponseContent = `I've found ${product.name}. Please click 'Buy Now' if you'd like to purchase it.`;
                                        } else {
                                            toolResponseContent = `I couldn't find a product named '${productName}'. Please check the name or ask to see all products.`;
                                        }
                                    } else {
                                        toolResponseContent = `Unknown function ${functionName} was called.`;
                                    }
                                } catch (toolExecutionError) {
                                    console.error(`[storeId: ${storeId}] Error executing tool ${functionName}:`, toolExecutionError);
                                    toolResponseContent = `Error executing tool ${functionName}: ${toolExecutionError.message}`;
                                }
                                toolCallResponses.push({ role: "tool", tool_call_id: toolCall.id, name: functionName, content: toolResponseContent });
                            }
                            conversation.push(...toolCallResponses);
                            currentOpenAIMessage = await getOpenAIResponse(storeId, null, conversation, botConfig, businessContext);
                        }

                        // After processing all tool calls, or if there were no tool calls:
                        try {
                            if (currentOpenAIMessage && currentOpenAIMessage.content && currentOpenAIMessage.content.trim() !== '') {
                                // If there's a final text response from OpenAI, send it.
                                // Transform the regular text message into an interactive message with Today's Offer button
                                const messageToSend = createTodaysOfferMessage(currentOpenAIMessage.content);
                                await sendWhatsAppMessage(storeId, from, messageToSend, botConfig);
                                conversation.push(currentOpenAIMessage); // Save the final AI response
                            } else if (!keywordActionTaken && !(currentOpenAIMessage && currentOpenAIMessage.tool_calls && currentOpenAIMessage.tool_calls.length > 0)) {
                                // If no keyword action was taken, AND OpenAI didn't return tool_calls (which would have been handled above or resulted in content),
                                // AND there's no final text content, then send a fallback.
                                // This covers cases where OpenAI returns an empty response or something unexpected without tool_calls.
                                console.warn(`[storeId: ${storeId}] OpenAI response was empty or did not lead to a message. User: "${currentMessageContent}". Sending fallback.`);
                                await sendWhatsAppMessage(storeId, from, { type: 'text', text: { body: "I'm sorry, I encountered an issue trying to process that. Please try again shortly." } }, botConfig);
                                conversation.push({role: 'assistant', content: "[Fallback due to empty/unprocessed OpenAI response]"});
                            }
                        } catch (error) {
                            console.error(`[storeId: ${storeId}] Error processing message from ${from}:`, error);
                            await sendWhatsAppMessage(storeId, from, { type: 'text', text: { body: 'An internal error occurred. Please try again later.' } }, botConfig);
                        } finally {
                            conversation.push(currentOpenAIMessage); // Save the final AI response
                            conversation.push({role: 'assistant', content: "[Fallback due to empty/unprocessed OpenAI response]"});
                        }
                    } // End of 'if (!keywordActionTaken)'
                // END Fallback to OpenAI

                // 3. Handle Location Messages
                } else if (messageType === 'location' && message.location) {
                    console.log(`[storeId: ${storeId}] Processing location message`);
                    
                    // Special handling for DAILY DEAL VIRAL AGENCY (store ID: cmanyfn1e0001jl04j3k45mz5)
                    if (storeId === 'cmanyfn1e0001jl04j3k45mz5') {
                        console.log(`[DailyDeal] Detected DAILY DEAL AGENCY store, processing location message`);
                        
                        const response = await handleDailyDealMessage(
                            storeId,
                            from,
                            'location',
                            '',
                            null,
                            message.location,
                            botConfig,
                            session
                        );
                        
                        // ALWAYS handle viral agency messages exclusively - no fallback to other handlers
                        console.log(`[DailyDeal] Location message processed for ${from} (success: ${response.success})`);
                        
                        // Use updated session data from daily deal handler
                        const updatedSession = response.session || session;
                        updatedSession.lastInteraction = 'daily_deal_agency';
                        updatedSession.timestamp = Date.now();
                        await updateSession(storeId, from, updatedSession);
                        continue; // Skip ALL other message processing for viral agency
                    }
                    
                    // Special handling for Social Media Agency bot (store ID: viral_agency_main)
                    if (storeId === 'viral_agency_main') {
                        console.log(`[SocialAgency] Detected Social Media Agency store, processing location message`);
                        
                        const response = await handleSocialAgencyMessage(
                            storeId,
                            from,
                            'location',
                            '',
                            null,
                            message.location,
                            botConfig,
                            session
                        );
                        
                        if (response.success) {
                            console.log(`[SocialAgency] Location message handled successfully for ${from}`);
                            // Update session to track agency interaction
                            session.lastInteraction = 'social_agency';
                            session.timestamp = Date.now();
                            await updateSession(storeId, from, session);
                            continue; // Skip regular message processing
                        }
                    }
                    
                    // For other stores, treat location as unsupported
                    console.log(`[storeId: ${storeId}] Location message not supported for this store`);
                    const unsupportedMsg = { type: 'text', text: { body: "Sorry, I can only process text messages and button clicks at the moment." } };
                    await sendWhatsAppMessage(storeId, from, unsupportedMsg, botConfig);
                    conversation.push({ role: 'user', content: `[Sent location message]` });
                    conversation.push({ role: 'assistant', content: "Acknowledged location message." });
                
                // 4. Handle Image Messages (for Social Media Agency)
                } else if (messageType === 'image' && message.image) {
                    console.log(`[storeId: ${storeId}] Processing image message`);
                    
                    // Special handling for DAILY DEAL VIRAL AGENCY (store ID: cmanyfn1e0001jl04j3k45mz5)
                    if (storeId === 'cmanyfn1e0001jl04j3k45mz5') {
                        console.log(`[DailyDeal] Detected DAILY DEAL AGENCY store, processing image message`);
                        
                        const response = await handleDailyDealMessage(
                            storeId,
                            from,
                            'image',
                            '',
                            null,
                            null,
                            botConfig,
                            session
                        );
                        
                        // ALWAYS handle viral agency messages exclusively - no fallback to other handlers
                        console.log(`[DailyDeal] Image message processed for ${from} (success: ${response.success})`);
                        
                        // Use updated session data from daily deal handler
                        const updatedSession = response.session || session;
                        updatedSession.lastInteraction = 'daily_deal_agency';
                        updatedSession.timestamp = Date.now();
                        await updateSession(storeId, from, updatedSession);
                        continue; // Skip ALL other message processing for viral agency
                    } 
                    // Special handling for Social Media Agency bot (store ID: viral_agency_main)
                    else if (storeId === 'viral_agency_main') {
                        console.log(`[SocialAgency] Detected Social Media Agency store, processing image message`);
                        
                        const response = await handleSocialAgencyMessage(
                            storeId,
                            from,
                            'image',
                            '',
                            null,
                            null,
                            botConfig,
                            session
                        );
                        
                        if (response.success) {
                            console.log(`[SocialAgency] Image message handled successfully for ${from}`);
                            // Update session to track agency interaction
                            session.lastInteraction = 'social_agency';
                            session.timestamp = Date.now();
                            await updateSession(storeId, from, session);
                            continue; // Skip regular message processing
                        }
                    } else {
                        console.log(`[storeId: ${storeId}] Image message not supported for this store type`);
                        const unsupportedMsg = { type: 'text', text: { body: "Sorry, I can only process text messages and button clicks at the moment." } };
                        await sendWhatsAppMessage(storeId, from, unsupportedMsg, botConfig);
                    }
                    
                } else { // Handle Unsupported Message Types
                    console.log(`[storeId: ${storeId}] Received an unhandled or unsupported message type: ${messageType}.`);
                    const unsupportedMsg = { type: 'text', text: { body: "Sorry, I can only process text messages and button clicks at the moment." } };
                    await sendWhatsAppMessage(storeId, from, unsupportedMsg, botConfig);
                    conversation.push({ role: 'user', content: `[Sent unsupported message type: ${messageType}]` });
                    conversation.push({ role: 'assistant', content: "Acknowledged unsupported message." });
                }
                // --- END MAIN MESSAGE TYPE HANDLING ---
              } catch (messageProcessingError) {
                console.error(`[storeId: ${storeId}] Error processing individual message from ${from || 'unknown_sender'}:`, messageProcessingError);
                if (from && botConfig) {
                  try {
                    await sendWhatsAppMessage(storeId, from, { type: 'text', text: { body: 'An internal error occurred while processing your action. Our team has been notified. Please try again later.' } }, botConfig);
                  } catch (sendError) {
                    console.error(`[storeId: ${storeId}] Failed to send error message to user ${from}:`, sendError);
                  }
                }
                if (conversation && typeof conversation.push === 'function') {
                    conversation.push({ role: 'system', content: `Error during message processing: ${messageProcessingError.message}`, error: true, timestamp: Date.now() });
                }
              } finally {
                if (from && conversation) {
                  try {
                    await updateSession(storeId, from, conversation);
                    console.log(`[storeId: ${storeId}] Session updated for user ${from} after message processing/error.`);
                  } catch (sessionError) {
                    console.error(`[storeId: ${storeId}] CRITICAL: Failed to update session for user ${from} after message processing:`, sessionError);
                  }
                }
              }
            } // Closes `for (const change of entry.changes)`
          } // Closes `if (entry.changes)`
        } // Closes `for (const entry of body.entry)`
      } // Closes the try block started for JSON.parse and main POST logic
    } catch (postBodyProcessingError) {
      console.error(`[storeId: ${storeId}] Error processing POST request body:`, postBodyProcessingError);
      // For POST body processing errors, we typically don't message the user back via WhatsApp
      // as the error might be fundamental (e.g. bad JSON, no signature, etc.)
      // The webhook should return 200 OK to WhatsApp quickly; errors are for server logs.
    }
    // WhatsApp expects a 200 OK response quickly for POST requests.
    // Actual messages to the user are sent asynchronously via sendWhatsAppMessage.
    console.log(`[storeId: ${storeId}] Finished processing POST request. Sending 200 OK to WhatsApp.`);
    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'success', message: 'Webhook processed' })
    };
      }
    } else {
      // Handle unsupported HTTP methods
      const localStoreIdForElse = storeId || (event?.pathParameters?.storeId || 'UNKNOWN');
      console.log(`[storeId: ${localStoreIdForElse}] Unhandled HTTP method: ${httpMethod}`);
      return {
        statusCode: 405, // Method Not Allowed
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Method Not Allowed' })
      };
    }

  } catch (handlerError) {
    const errorStoreId = storeId || event?.pathParameters?.storeId || 'UNKNOWN_HANDLER_CATCH';
    console.error(`[storeId: ${errorStoreId}] Unhandled error in webhook handler:`, handlerError.message, handlerError.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: handlerError.message }),
    };
  } // Closes catch (handlerError)
}; // Closes export const handler