// src/utils/dynamoDbUtils.js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import axios from 'axios';



import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION || process.env.TOKENS_TABLE_REGION || 'ap-southeast-1'; // More flexible region
const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

// --- Session Management ---
async function getSession(sessionId) {
  const tableName = process.env.SESSION_TABLE_NAME;
  if (!tableName) {
    console.error("SESSION_TABLE_NAME not set");
    return null;
  }
  const params = {
    TableName: tableName,
    Key: { sessionId },
  };
  try {
    const { Item } = await docClient.send(new GetCommand(params));
    console.log(Item ? `[DynamoDBUtils] Session found for ${sessionId}` : `[DynamoDBUtils] No session found for ${sessionId}`);
    return Item;
  } catch (error) {
    console.error(`[DynamoDBUtils] Error getting session ${sessionId}:`, error);
    return null;
  }
}

async function updateSession(sessionData) {
  const tableName = process.env.SESSION_TABLE_NAME;
  if (!tableName) {
    console.error("SESSION_TABLE_NAME not set");
    return false;
  }
  const params = {
    TableName: tableName,
    Item: sessionData, // Assumes sessionData includes sessionId and ttl
  };
  try {
    await docClient.send(new PutCommand(params));
    console.log(`[DynamoDBUtils] Session updated for ${sessionData.sessionId}`);
    return true;
  } catch (error) {
    console.error(`[DynamoDBUtils] Error updating session ${sessionData.sessionId}:`, error);
    return false;
  }
}

// --- Bot Configuration (from Tokens Table) ---
async function getBotConfig(storeId) {
  // Use hardcoded values if environment variables are not set
  const tableName = process.env.TOKENS_TABLE_NAME || 'WhatsappStoreTokens';
  const tableRegion = process.env.TOKENS_TABLE_REGION || 'us-east-1';
  
  console.log(`[DynamoDBUtils] Using tokens table: ${tableName} in region: ${tableRegion}`);
  
  // Re-initialize docClient if region is different for this specific table
  const specificDocClient = tableRegion === region ? docClient : DynamoDBDocumentClient.from(new DynamoDBClient({ region: tableRegion }));

  const params = {
    TableName: tableName,
    Key: { storeId: storeId }, // Corrected based on DynamoDB screenshot (Partition Key is 'storeId')
  };
  try {
    const { Item } = await specificDocClient.send(new GetCommand(params));
    if (Item) {
      console.log(`[DynamoDBUtils] Bot config found for ${storeId}. Raw Item:`, JSON.stringify(Item));
      if (Item.paymentPayNowNumber) {
        console.log(`[DynamoDBUtils] paymentPayNowNumber FOUND in Item for ${storeId}: ${Item.paymentPayNowNumber}`);
      } else {
        console.warn(`[DynamoDBUtils] paymentPayNowNumber MISSING in Item for ${storeId} even though Item was found.`);
      }
    } else {
      console.warn(`[DynamoDBUtils] No bot config (Item is null/undefined) found for ${storeId}.`);
    }
    return Item; // Contains openai_api_key, store_name etc.
  } catch (error) {
    console.error(`[DynamoDBUtils] Error getting bot config for ${storeId}:`, error);
    return null;
  }
}

// --- Audience Management ---
async function saveAudienceMember(storeId, phoneNumber, memberData) {
  const tableName = process.env.AUDIENCE_TABLE_NAME;
  if (!tableName) {
    console.error("AUDIENCE_TABLE_NAME not set");
    return false;
  }
  const itemToSave = {
    storeId,
    phoneNumber,
    ...memberData,
    updatedAt: new Date().toISOString(),
  };
  if (!memberData.createdAt) {
    itemToSave.createdAt = new Date().toISOString();
  }

  const params = {
    TableName: tableName,
    Item: itemToSave,
  };
  try {
    await docClient.send(new PutCommand(params));
    console.log(`[DynamoDBUtils] Audience member ${phoneNumber} for store ${storeId} saved/updated.`);
    return true;
  } catch (error) {
    console.error(`[DynamoDBUtils] Error saving audience member ${phoneNumber} for store ${storeId}:`, error);
    return false;
  }
}

// --- Product Catalog ---
async function getStoreProducts(storeId, limit = 20, lastKey = null) {
  // Construct the API URL
  let apiUrl = `${process.env.POS_FASTAPI_BASE_URL}/stores/${storeId}/products?limit=${limit}`;
  if (lastKey) {
    // Note: The FastAPI product list endpoint (/stores/{store_id}/products) currently doesn't explicitly accept 'last_key' in its path/query parameters for pagination.
    // It relies on the underlying CRUD operation which might support it internally if 'limit' is passed.
    // If the FastAPI endpoint is updated to accept a 'last_key' (e.g., as a query parameter),
    // this is where it would be added: e.g., apiUrl += `&last_key=${encodeURIComponent(JSON.stringify(lastKey))}`;
    console.warn(`[DynamoDBUtils/getStoreProducts] 'lastKey' parameter provided but the current FastAPI product list endpoint may not use it directly for pagination. Ensure the FastAPI endpoint handles pagination with 'limit'.`);
  }

  try {
    console.log(`[DynamoDBUtils/getStoreProducts] Fetching products for store ${storeId} from FastAPI: ${apiUrl}`);
    const response = await axios.get(apiUrl);
    
    // The FastAPI product list endpoint (/stores/{store_id}/products) is expected to return an array of products.
    if (response.data && Array.isArray(response.data)) {
      console.log(`[DynamoDBUtils/getStoreProducts] Successfully fetched ${response.data.length} products from FastAPI.`);
      // The current FastAPI endpoint returns a direct array. If it were to return a paginated structure like { items: [], last_evaluated_key: {} },
      // this function would need to adapt to return that structure or just response.data.items.
      // For now, returning the direct array is consistent with the FastAPI endpoint's behavior.
      return response.data; 
    } else {
      console.log(`[DynamoDBUtils/getStoreProducts] No products found or unexpected array response from FastAPI for storeId: ${storeId}. Response:`, response.data);
      return []; // Return empty array if no data or wrong format
    }
  } catch (error) {
    console.error(`[DynamoDBUtils/getStoreProducts] Error fetching products for storeId ${storeId} from FastAPI:`, error.response ? error.response.data : error.message);
    return []; // Return empty array on error
  }
}

async function getStoreProduct(storeId, productId) {
  const apiUrl = `${process.env.POS_FASTAPI_BASE_URL}/stores/${storeId}/products/${productId}`;
  try {
    console.log(`[DynamoDBUtils/getStoreProduct] Fetching product ${productId} for store ${storeId} from FastAPI: ${apiUrl}`);
    const response = await axios.get(apiUrl);
    // FastAPI's get product endpoint returns the product object directly on success (200 OK)
    // or a 404 if not found, which axios will throw as an error.
    if (response.data) { 
      console.log(`[DynamoDBUtils/getStoreProduct] Successfully fetched product ${productId} from FastAPI.`);
      return response.data;
    } else {
      // This path is less likely if FastAPI behaves as expected (404 for not found, data for success)
      console.log(`[DynamoDBUtils/getStoreProduct] Product ${productId} not found (empty response) via FastAPI for storeId: ${storeId}. Response:`, response.data);
      return null;
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`[DynamoDBUtils/getStoreProduct] Product ${productId} not found (404) for storeId ${storeId} from FastAPI.`);
    } else {
      console.error(`[DynamoDBUtils/getStoreProduct] Error fetching product ${productId} for storeId ${storeId} from FastAPI:`, error.response ? error.response.data : error.message);
    }
    return null; // Return null on error or if product not found
  }
}

async function getProductByName(storeId, productName) {
  console.log(`[DynamoDBUtils/getProductByName] Searching for product "${productName}" in store ${storeId}`);
  try {
    // Fetch all products for the store. Using a high limit to approximate getting all products.
    // A dedicated API endpoint would be better for performance in the long run.
    const allProducts = await getStoreProducts(storeId, 1000); 
    if (!allProducts || allProducts.length === 0) {
      console.log(`[DynamoDBUtils/getProductByName] No products found for store ${storeId} to search through.`);
      return null;
    }

    // Find the product by name (case-insensitive match)
    const foundProduct = allProducts.find(p => p.name && p.name.toLowerCase() === productName.toLowerCase());

    if (foundProduct) {
      console.log(`[DynamoDBUtils/getProductByName] Found product matching "${productName}":`, JSON.stringify(foundProduct));
      return foundProduct;
    } else {
      console.log(`[DynamoDBUtils/getProductByName] Product "${productName}" not found in the fetched list for store ${storeId}.`);
      return null;
    }
  } catch (error) {
    console.error(`[DynamoDBUtils/getProductByName] Error searching for product "${productName}":`, error);
    return null; // Return null on any error
  }
}

// --- Order Management (for Action Processor) ---

async function confirmPaymentAndGenerateInvoice(storeId, orderId) {
  const url = `${process.env.POS_FASTAPI_BASE_URL}/stores/${storeId}/orders/${orderId}/confirm-payment`;
  try {
    console.log(`[DynamoDBUtils/confirmPaymentAndGenerateInvoice] Calling FastAPI to confirm payment and generate invoice: POST ${url}`);
    const response = await axios.post(url, {}); // Empty payload, the action is in the URL
    console.log(`[DynamoDBUtils/confirmPaymentAndGenerateInvoice] Backend process for order ${orderId} completed successfully.`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`[DynamoDBUtils/confirmPaymentAndGenerateInvoice] Error during payment confirmation/invoice generation for order ${orderId} via FastAPI:`, error.response ? error.response.data : error.message);
    return { success: false, error: error.response ? error.response.data : { message: error.message } };
  }
}

async function initiateOrderPaymentViaFastAPI(storeId, orderId) {
  const apiUrl = `${process.env.POS_FASTAPI_BASE_URL}/stores/${storeId}/orders/${orderId}/initiate-payment`;
  try {
    console.log(`[DynamoDBUtils/initiateOrderPaymentViaFastAPI] Initiating payment for order ${orderId} via FastAPI: ${apiUrl}`);
    const response = await axios.put(apiUrl, {}, { // Empty payload for now, assuming status update is implicit
      headers: {
        // Add Authorization header if FastAPI endpoint requires it
        // e.g., 'Authorization': `Bearer ${process.env.FASTAPI_SERVICE_ACCOUNT_TOKEN}`
      }
    });
    
    if (response.data && response.status === 200) { // Expecting 200 OK for successful update
      console.log(`[DynamoDBUtils/initiateOrderPaymentViaFastAPI] Payment initiation successful for order ${orderId}. Response:`, response.data);
      return response.data; // Return the updated order object from FastAPI
    } else {
      console.error(`[DynamoDBUtils/initiateOrderPaymentViaFastAPI] Unexpected response from FastAPI: Status ${response.status}`, response.data);
      throw new Error(`Failed to initiate payment for order via FastAPI. Status: ${response.status}`);
    }
  } catch (error) {
    console.error(`[DynamoDBUtils/initiateOrderPaymentViaFastAPI] Error initiating payment for order ${orderId} via FastAPI:`, error.response ? error.response.data : error.message);
    if (error.response && error.response.data && error.response.data.detail) {
        throw new Error(error.response.data.detail); // Propagate FastAPI error message
    }
    throw error; // Rethrow original error if no specific detail
  }
}

async function createOrder(orderData, storeId) {
  const apiUrl = `${process.env.POS_FASTAPI_BASE_URL}/stores/${storeId}/orders/`;

  // Transform orderData to FastAPI's OrderCreate schema
  const payloadForFastAPI = {
    order_id: orderData.orderId, // Use orderId from input
    customer_id: orderData.customerPhone,
    currency: orderData.currency || "SGD", // Use currency from input or default to SGD
    status: orderData.orderStatus || 'PENDING_PAYMENT', // Use status from input or default
    order_lines: orderData.order_lines.map(item => ({
      product_id: item.productId,
      product_name: item.productName, // Ensure product name is passed
      quantity: item.quantity,
      unit_price: String(item.unitPrice),
    }))
    // paynow_ref and invoice_pdf_url are not set at initial creation by bot
  };

  try {
    console.log(`[DynamoDBUtils/createOrder] Creating order via FastAPI: ${apiUrl} with payload:`, JSON.stringify(payloadForFastAPI, null, 2));
    const response = await axios.post(apiUrl, payloadForFastAPI, {
      headers: {
        // Add Authorization header if FastAPI endpoint requires it for service accounts
        // e.g., 'Authorization': `Bearer ${process.env.FASTAPI_SERVICE_ACCOUNT_TOKEN}`
      }
    });
    
    if (response.data && response.status === 201) {
      console.log(`[DynamoDBUtils/createOrder] Order created successfully via FastAPI. Response:`, response.data);
      return response.data; // Return the created order object from FastAPI
    } else {
      console.error(`[DynamoDBUtils/createOrder] Unexpected response from FastAPI: Status ${response.status}`, response.data);
      throw new Error(`Failed to create order via FastAPI. Status: ${response.status}`);
    }
  } catch (error) {
    let errorMessage = error.message;
    if (error.response && error.response.data) {
      errorMessage = JSON.stringify(error.response.data);
      console.error(`[DynamoDBUtils/createOrder] Error creating order via FastAPI for store ${storeId}. Status: ${error.response.status}. Data:`, error.response.data);
    } else {
      console.error(`[DynamoDBUtils/createOrder] Error creating order via FastAPI for store ${storeId}:`, error.message);
    }
    // Re-throw a new error with potentially more details from FastAPI response
    throw new Error(`FastAPI order creation failed: ${errorMessage}`);
  }
}

async function getOrderById(storeId, orderId) {
  console.log(`[DynamoDBUtils/getOrderById] Now calling fetchOrderFromFastAPI for order ${orderId}, store ${storeId}`);
  // Delegate to fetchOrderFromFastAPI to ensure data comes from FastAPI
  return fetchOrderFromFastAPI(storeId, orderId);
}

async function updateOrder(storeId, orderId, payloadForFastAPI) {
  const apiUrl = `${process.env.POS_FASTAPI_BASE_URL}/stores/${storeId}/orders/${orderId}`;
  try {
    console.log(`[DynamoDBUtils/updateOrder] Updating order ${orderId} for store ${storeId} via FastAPI: ${apiUrl} with payload:`, JSON.stringify(payloadForFastAPI, null, 2));
    const response = await axios.put(apiUrl, payloadForFastAPI, {
      headers: {
        // Add Authorization header if FastAPI endpoint requires it
        // e.g., 'Authorization': `Bearer ${process.env.FASTAPI_SERVICE_ACCOUNT_TOKEN}`
      }
    });
    
    if (response.data && response.status === 200) { // Expecting 200 OK for successful update
      console.log(`[DynamoDBUtils/updateOrder] Order ${orderId} updated successfully via FastAPI. Response:`, response.data);
      return response.data; // Return the updated order object from FastAPI
    } else {
      console.error(`[DynamoDBUtils/updateOrder] Unexpected response from FastAPI: Status ${response.status}`, response.data);
      throw new Error(`Failed to update order ${orderId} via FastAPI. Status: ${response.status}`);
    }
  } catch (error) {
    let errorMessage = error.message;
    if (error.response && error.response.data) {
      errorMessage = JSON.stringify(error.response.data);
      console.error(`[DynamoDBUtils/updateOrder] Error updating order ${orderId} for store ${storeId} via FastAPI. Status: ${error.response.status}. Data:`, error.response.data);
    } else {
      console.error(`[DynamoDBUtils/updateOrder] Error updating order ${orderId} for store ${storeId} via FastAPI:`, error.message);
    }
    throw new Error(`FastAPI order update failed for order ${orderId}: ${errorMessage}`);
  }
}

async function updateProductStock(storeId, productId, quantityChange) {
  const tableName = process.env.DYNAMODB_PRODUCTS_TABLE_NAME;
  if (!tableName) {
    console.error("DYNAMODB_PRODUCTS_TABLE_NAME not set for stock update");
    throw new Error('Product table not configured for stock update');
  }
  const params = {
    TableName: tableName,
    Key: {
      PK: `STORE#${storeId}`,
      SK: `PRODUCT#${productId}`,
    },
    UpdateExpression: "SET stockQuantity = stockQuantity + :val",
    ExpressionAttributeValues: {
      ":val": quantityChange, // Use negative value to decrease stock
    },
    ReturnValues: "UPDATED_NEW",
  };
  try {
    const { Attributes } = await docClient.send(new UpdateCommand(params));
    console.log(`[DynamoDBUtils] Stock for product ${productId} in store ${storeId} updated. New stock: ${Attributes?.stockQuantity}`);
    return Attributes;
  } catch (error) {
    console.error(`[DynamoDBUtils] Error updating stock for product ${productId} in store ${storeId}:`, error);
    throw error;
  }
}

async function getOrderHistory(storeId, userPhone, limit = 10) {
  const apiUrl = `${process.env.POS_FASTAPI_BASE_URL}/stores/${storeId}/orders/?customer_id=${userPhone}&limit=${limit}`;
  try {
    console.log(`[DynamoDBUtils/getOrderHistory] Fetching order history for user ${userPhone}, store ${storeId} from FastAPI: ${apiUrl}`);
    const response = await axios.get(apiUrl);
    
    // The FastAPI endpoint returns an object like { orders: [...] }
    if (response.data && Array.isArray(response.data.orders)) {
      console.log(`[DynamoDBUtils/getOrderHistory] Successfully fetched ${response.data.orders.length} orders from FastAPI for user ${userPhone}.`);
      return response.data.orders; // Return the nested array of orders
    } else {
      console.log(`[DynamoDBUtils/getOrderHistory] No orders found or unexpected response format from FastAPI for user ${userPhone}, store ${storeId}. Response:`, response.data);
      return []; // Return empty array if no data or wrong format
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`[DynamoDBUtils/getOrderHistory] No order history found (404) for user ${userPhone}, store ${storeId} from FastAPI.`);
    } else {
      console.error(`[DynamoDBUtils/getOrderHistory] Error fetching order history for user ${userPhone}, store ${storeId} from FastAPI:`, error.response ? error.response.data : error.message);
    }
    return []; // Return empty array on error
  }
}

async function fetchOrderFromFastAPI(storeId, orderId) {
  const apiUrl = `${process.env.POS_FASTAPI_BASE_URL}/stores/${storeId}/orders/${orderId}`;
  try {
    console.log(`[DynamoDBUtils/fetchOrderFromFastAPI] Fetching order ${orderId} for store ${storeId} from FastAPI: ${apiUrl}`);
    const response = await axios.get(apiUrl);
    if (response.data) {
      console.log(`[DynamoDBUtils/fetchOrderFromFastAPI] Successfully fetched order ${orderId} from FastAPI.`);
      return response.data; // This should be the OrderInDB object with order_lines
    } else {
      console.log(`[DynamoDBUtils/fetchOrderFromFastAPI] Order ${orderId} not found (empty response) via FastAPI for storeId: ${storeId}. Response:`, response.data);
      return null;
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`[DynamoDBUtils/fetchOrderFromFastAPI] Order ${orderId} not found (404) for storeId ${storeId} from FastAPI.`);
    } else {
      console.error(`[DynamoDBUtils/fetchOrderFromFastAPI] Error fetching order ${orderId} for storeId ${storeId} from FastAPI:`, error.response ? error.response.data : error.message);
    }
    return null; // Ensure null is returned from catch block of fetchOrderFromFastAPI
  } // Closing brace for catch block of fetchOrderFromFastAPI
}

async function getInvoiceDetails(storeId, orderId) {
  console.log(`[DynamoDBUtils/getInvoiceDetails] Now calling fetchOrderFromFastAPI for order ${orderId}, store ${storeId} to get invoice data.`);
  // Delegate to fetchOrderFromFastAPI to ensure data comes from FastAPI
  // The full order object from FastAPI should contain all necessary invoice details.
  try {
    const orderData = await fetchOrderFromFastAPI(storeId, orderId);
    if (orderData) {
      console.log(`[DynamoDBUtils/getInvoiceDetails] Successfully fetched order data for invoice for order ${orderId}`);
      return orderData;
    } else {
      console.warn(`[DynamoDBUtils/getInvoiceDetails] No data returned from fetchOrderFromFastAPI for order ${orderId}`);
      return null;
    }
  } catch (error) {
    console.error(`[DynamoDBUtils/getInvoiceDetails] Error calling fetchOrderFromFastAPI for order ${orderId}:`, error);
    return null; 
  }
}

async function updateOrderStatus(storeId, orderId, newStatus, statusDetails = null) {
  const tableName = process.env.DYNAMODB_POS_ORDERS_TABLE_NAME;
  if (!tableName) {
    console.error("DYNAMODB_POS_ORDERS_TABLE_NAME not set for order status update");
    throw new Error('Order table not configured for status update');
  }
  const params = {
    TableName: tableName,
    Key: {
      PK: `STORE#${storeId}`,
      SK: `ORDER#${orderId}`,
    },
    UpdateExpression: "SET orderStatus = :status, updatedAt = :updatedAt",
    ExpressionAttributeValues: {
      ":status": newStatus,
      ":updatedAt": new Date().toISOString(),
    },
    ReturnValues: "UPDATED_NEW",
  };

  if (statusDetails) {
    // If statusDetails needs to be added to the item, modify params here.
    // For example, to add it as an attribute:
    // params.UpdateExpression += ", statusDetails = :statusDetailsVal";
    // params.ExpressionAttributeValues[":statusDetailsVal"] = statusDetails;
    console.log('[DynamoDBUtils/updateOrderStatus] statusDetails provided but current logic does not add it to DynamoDB item:', statusDetails);
  }

  try {
    const { Attributes } = await docClient.send(new UpdateCommand(params));
    console.log(`[DynamoDBUtils] Order ${orderId} status updated to ${newStatus}. Attributes:`, Attributes);
    return Attributes;
  } catch (error) {
    console.error(`[DynamoDBUtils] Error updating status for order ${orderId}:`, error);
    throw error;
  }
}

export {
  docClient, 
  getSession,
  updateSession,
  getBotConfig,
  saveAudienceMember,
  getStoreProducts,
  getStoreProduct,
  getProductByName,
  initiateOrderPaymentViaFastAPI,
  createOrder,
  getOrderById,
  updateOrder,
  updateProductStock,
  getOrderHistory, 
  fetchOrderFromFastAPI,
  getInvoiceDetails,
  updateOrderStatus,
  confirmPaymentAndGenerateInvoice
};
