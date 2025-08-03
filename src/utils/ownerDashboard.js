import axios from 'axios';

/**
 * Fetches customers who placed orders in the last 24 hours
 * @param {string} storeId - Store ID
 * @param {object} botConfig - Bot configuration
 * @returns {Promise<Array>} - List of recent customer orders
 */
export const getRecentCustomers = async (storeId, botConfig) => {
  try {
    console.log(`[getRecentCustomers] DEBUGGING: Called for storeId: ${storeId}`);
    console.log(`[getRecentCustomers] DEBUGGING: botConfig:`, JSON.stringify(botConfig));
    
    const baseUrl = botConfig?.posFastapiBaseUrl || process.env.POS_FASTAPI_BASE_URL;
    if (!baseUrl) {
      console.error('[getRecentCustomers] ERROR: POS_FASTAPI_BASE_URL not configured');
      throw new Error('POS_FASTAPI_BASE_URL not configured');
    }

    // Set endpoint to standard orders endpoint instead of 'recent'
    // This gives us more control over filtering
    const endpoint = `${baseUrl}/stores/${storeId}/orders`;
    console.log(`[getRecentCustomers] DEBUGGING: Fetching recent customers from: ${endpoint}`);
    
    // Create timestamp for 24 hours ago - Using a longer window for testing
    // 3 days instead of 24 hours to ensure we catch more orders
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 3); // Look back 3 days instead of just 24 hours
    const timestamp = startDate.toISOString();
    
    console.log(`[getRecentCustomers] DEBUGGING: Using since date: ${timestamp}, Current time: ${new Date().toISOString()}`);
    
    const params = {
      limit: 15 // Increase limit to catch more orders
    };
    
    console.log(`[getRecentCustomers] DEBUGGING: Making API call with params:`, JSON.stringify(params));
    
    // Add date filter directly in the URL as an alternative way to filter
    const response = await axios.get(endpoint, { params });
    
    console.log(`[getRecentCustomers] DEBUGGING: Raw API response status:`, response.status);
    console.log(`[getRecentCustomers] DEBUGGING: Raw API response data:`, JSON.stringify(response.data));

    if (!response.data) {
      console.error('[getRecentCustomers] ERROR: No data in response');
      return [];
    }
    
    // Normalize the response data to handle different formats
    let orderItems = [];
    
    // Safely check for orders array in the response (as seen in the logs)
    if (response.data && response.data.orders && Array.isArray(response.data.orders)) {
      console.log('[getRecentCustomers] Found orders array with', response.data.orders.length, 'items');
      orderItems = response.data.orders;
    }
    // Safely check for items array in the response (original expected format)
    else if (response.data && response.data.items && Array.isArray(response.data.items)) {
      console.log('[getRecentCustomers] Found items array with', response.data.items.length, 'items');
      orderItems = response.data.items;
    }
    // Safely check if response itself is an array
    else if (response.data && Array.isArray(response.data)) {
      console.log('[getRecentCustomers] Response data itself is an array with', response.data.length, 'items');
      orderItems = response.data;
    }
    else {
      console.error('[getRecentCustomers] No valid order array found in response:', 
        response.data ? JSON.stringify(response.data) : 'undefined or null response data');
      return [];
    }
    
    console.log(`[getRecentCustomers] Successfully normalized order data, found ${orderItems.length} orders`);
    
    // Filter orders manually by created date - using a flexible approach to show today's orders only
    // Handle both camelCase (orderId) and snake_case (order_id) field names from DynamoDB
    try {
      if (!orderItems || !Array.isArray(orderItems)) {
        console.error(`[getRecentCustomers] orderItems is not an array:`, typeof orderItems);
        return [];
      }

      // Create today's date at midnight for comparison
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      console.log(`[getRecentCustomers] Filtering for orders from today (${todayStart.toISOString()})`);
      
      const recentOrders = orderItems.filter(order => {
        if (!order) {
          console.log(`[getRecentCustomers] Found null/undefined order in array, skipping`);
          return false;
        }
        
        // Check for created_at (snake_case) or createdAt (camelCase)
        const createdAtValue = order.created_at || order.createdAt;
        if (!createdAtValue) {
          console.log(`[getRecentCustomers] Order without creation date, skipping:`, JSON.stringify(order));
          return false;
        }
        
        try {
          const orderDate = new Date(createdAtValue);
          
          // Check if order date is from today
          const isToday = orderDate >= todayStart;
          const orderId = order.order_id || order.orderId || 'unknown';
          console.log(`[getRecentCustomers] Order ${orderId}: created ${createdAtValue}, is today: ${isToday}`);
          
          return isToday;
        } catch (err) {
          console.error(`[getRecentCustomers] Error parsing date ${createdAtValue}:`, err);
          return false;
        }
      });
      
      console.log(`[getRecentCustomers] Found ${recentOrders.length} orders from today`);
      return recentOrders;
    } catch (error) {
      console.error(`[getRecentCustomers] Error filtering orders:`, error);
      return [];
    }
  } catch (error) {
    console.error('[getRecentCustomers] Error fetching recent customers:', error.message);
    if (error.response) {
      console.error('[getRecentCustomers] Response status:', error.response.status);
      console.error('[getRecentCustomers] Response data:', error.response.data);
    }
    return [];
  }
};

/**
 * Formats recent customer orders into a WhatsApp message
 * @param {Array} recentOrders - List of recent orders
 * @returns {string} - Formatted message text
 */
export const formatRecentCustomersMessage = (recentOrders) => {
  console.log(`[formatRecentCustomersMessage] DEBUGGING: Called with ${recentOrders?.length || 0} orders`);
  console.log('[formatRecentCustomersMessage] DEBUGGING: Orders data:', JSON.stringify(recentOrders));
  
  if (!recentOrders || recentOrders.length === 0) {
    console.log('[formatRecentCustomersMessage] DEBUGGING: No orders to format');
    return 'No orders found for today.';
  }

  let message = '*Today\'s Orders*\n\n';
  
  recentOrders.forEach((order, index) => {
    console.log(`[formatRecentCustomersMessage] DEBUGGING: Processing order ${index}:`, JSON.stringify(order));
    
    // Format the phone number for display (use customer_id from DynamoDB)
    const phoneNumber = order.customer_id || order.whatsappNumber || 'Unknown';
    console.log(`[formatRecentCustomersMessage] DEBUGGING: Phone number: ${phoneNumber}`);
    
    // Format the order number - use first 8 characters and uppercase
    // Handle both order_id (snake_case) and orderId (camelCase)
    const orderIdValue = order.order_id || order.orderId;
    console.log(`[formatRecentCustomersMessage] DEBUGGING: Order ID: ${orderIdValue}`);
    const orderNumber = orderIdValue ? 
      `#${orderIdValue.substring(0, 8).toUpperCase()}` : 
      'Unknown';
    
    // Format the amount with currency symbol
    // Handle both total_amount (snake_case) and totalAmount (camelCase)
    const amountValue = order.total_amount !== undefined ? 
      order.total_amount : 
      (order.totalAmount !== undefined ? order.totalAmount : null);
    console.log(`[formatRecentCustomersMessage] DEBUGGING: Amount: ${amountValue}`);
    
    const amount = amountValue !== null ? 
      `$${parseFloat(amountValue).toFixed(2)}` : 
      'Unknown';
    
    // Format the date
    // Handle both created_at (snake_case) and createdAt (camelCase)
    const createdAtValue = order.created_at || order.createdAt;
    console.log(`[formatRecentCustomersMessage] DEBUGGING: Created at: ${createdAtValue}`);
    const orderDate = createdAtValue ? 
      new Date(createdAtValue).toLocaleString() : 
      'Unknown';
    
    // Add status if available
    const status = order.status || 'PROCESSING';
    console.log(`[formatRecentCustomersMessage] DEBUGGING: Status: ${status}`);
    
    message += `${index + 1}. *${phoneNumber}*\n`;
    message += `   Order: ${orderNumber}\n`;
    message += `   Amount: ${amount}\n`;
    message += `   Date: ${orderDate}\n`;
    message += `   Status: ${status}\n\n`;
  });
  
  console.log(`[formatRecentCustomersMessage] DEBUGGING: Final message length: ${message.length}`);
  console.log(`[formatRecentCustomersMessage] DEBUGGING: First 200 chars: ${message.substring(0, 200)}...`);

  return message;
};
