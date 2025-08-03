// src/handlers/actionProcessor.js
import {
    createOrder,
    updateProductStock,
    getOrderHistory as fetchOrderHistoryDb,
    fetchOrderFromFastAPI as fetchInvoiceDetailsDb,
    updateOrderStatus,
    initiateOrderPaymentViaFastAPI,
    confirmPaymentAndGenerateInvoice,

    getOrderById, // Added for quantity changes
    updateOrder, // Added for quantity changes
    fetchOrderFromFastAPI, // Added for viewing order details
    getStoreProducts,
    getStoreProduct  // Added for owner reply flow
} from '../utils/dynamoDbUtils.js';

// Import functions for owner dashboard customer list
import { getRecentCustomers, formatRecentCustomersMessage } from '../utils/ownerDashboard.js';
import { uploadToS3 } from '../utils/s3Utils.js';
import { generateInvoicePdfBuffer } from '../utils/pdfUtils.js';
import { sendWhatsAppMessage } from '../utils/whatsappUtils.js';
import crypto from 'crypto';



// --- Action Execution Functions ---

export async function executePlaceOrder(payload, context) {
    const { storeId, userPhone } = context;
    console.log(`[ActionProcessor] Executing PLACE_ORDER for store ${storeId}, user ${userPhone}:`, JSON.stringify(payload, null, 2));

    if (!payload || !payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
        console.error('[ActionProcessor] Invalid order payload: Items are missing or empty.');
        return {
            success: false,
            message: 'Invalid order payload: Items are missing or empty.',
            messagePayload: { type: 'text', text: { body: 'Sorry, I could not place the order. The items list was missing or empty.' } }
        };
    }

    const customerInfo = payload.customerInfo || { name: 'Walk-in Customer', address: 'N/A' };
    const customerNotes = payload.customerNotes || '';
    const orderId = `ORD-${storeId.slice(0, 4)}-${Date.now()}`;
    let orderTotal = 0;
    const order_lines = payload.items.map(item => {
        const unitPrice = parseFloat(item.price);
        const quantity = parseInt(item.quantity, 10);
        if (isNaN(unitPrice) || isNaN(quantity) || quantity <= 0) {
            throw new Error(`Invalid price or quantity for item ${item.productId || item.name}`);
        }
        const lineTotal = unitPrice * quantity;
        orderTotal += lineTotal;
        return { product_id: item.productId, product_name: item.name, quantity, unit_price: unitPrice, line_total: lineTotal };
    });

    const orderData = {
        order_id: orderId,
        user_phone: userPhone,
        customer_info: customerInfo,
        order_lines,
        total_amount: parseFloat(orderTotal.toFixed(2)),
        order_status: 'PENDING_CONFIRMATION',
        payment_status: 'UNPAID',
        customer_notes: customerNotes,
        currency: 'SGD',
    };

    try {
        await createOrder(storeId, orderData);
        console.log(`[ActionProcessor] Order ${orderId} created in DynamoDB.`);

        for (const item of order_lines) {
            try {
                await updateProductStock(storeId, item.product_id, -item.quantity);
            } catch (stockError) {
                console.error(`[ActionProcessor] Failed to update stock for product ${item.product_id}.`, stockError);
                await updateOrderStatus(storeId, orderId, 'STOCK_UPDATE_FAILED', `Failed for product: ${item.product_id}`);
                const partialFailureMessage = `Your order #${orderId} is received, but we had an issue with stock for some items. We will contact you to resolve this.`;
                return { success: false, orderId, message: 'Order placed with stock issues.', messagePayload: { type: 'text', text: { body: partialFailureMessage } } };
            }
        }

        const confirmationMessage = `Your order #${orderId} has been placed successfully! Total: ${orderData.total_amount}. We will confirm details shortly.`;
        return { success: true, orderId, message: 'Order placed successfully.', messagePayload: { type: 'text', text: { body: confirmationMessage } } };

    } catch (error) {
        console.error(`[ActionProcessor] Error in executePlaceOrder for order ${orderId}:`, error);
        return { success: false, message: `Failed to place order: ${error.message}`, messagePayload: { type: 'text', text: { body: 'Sorry, there was an unexpected issue placing your order.' } } };
    }
}

export async function executeGetOrderHistory(payload, context) {
    const { storeId, userPhone } = context;
    try {
        const orders = await fetchOrderHistoryDb(storeId, userPhone, 10);
        if (!orders || orders.length === 0) {
            return { success: true, history: [], message: 'No order history found.', messagePayload: { type: 'text', text: { body: "You don't have any past orders with us yet." } } };
        }

        const rows = orders.map(order => ({
            id: `view_order_detail_${order.order_id}`.substring(0, 256),
            title: `Order #${order.order_id.substring(0, 8)}`,
            description: `Status: ${order.order_status} | Total: ${order.currency} ${parseFloat(order.total_amount).toFixed(2)} | ${new Date(order.created_at).toLocaleDateString()}`.substring(0, 72),
        }));

        const interactiveMessage = {
            type: 'interactive',
            interactive: {
                type: 'list',
                header: { type: 'text', text: 'Your Recent Orders' },
                body: { text: 'Here are your recent orders. Select one for details.' },
                action: { button: 'View Orders', sections: [{ title: 'Recent Orders', rows }] }
            }
        };
        return { success: true, history: orders, message: 'Order history fetched.', messagePayload: interactiveMessage };
    } catch (error) {
        console.error(`[ActionProcessor] Error in executeGetOrderHistory for ${userPhone}:`, error);
        return { success: false, message: `Failed to get order history: ${error.message}`, messagePayload: { type: 'text', text: { body: "Sorry, I couldn't retrieve your order history." } } };
    }
}

export async function executeGetInvoice(payload, context) {
    const { storeId, botConfig } = context;
    const orderId = payload?.orderId;
    if (!orderId) {
        return { success: false, message: "Order ID missing.", messagePayload: { type: 'text', text: { body: "Please provide an Order ID to get the invoice." } } };
    }
    try {
        const invoiceData = await fetchInvoiceDetailsDb(storeId, orderId);
        if (!invoiceData) {
            return { success: false, message: `Invoice not found for order ${orderId}.`, messagePayload: { type: 'text', text: { body: `Sorry, I couldn't find an invoice for order ID ${orderId}.` } } };
        }

        const pdfBuffer = await generateInvoicePdfBuffer(invoiceData);
        const r2BucketName = botConfig.r2InvoiceBucketName;
        const r2PublicUrlPrefix = botConfig.r2PublicUrlPrefix;

        if (!r2BucketName || !r2PublicUrlPrefix) {
            console.error('[ActionProcessor] R2 invoice configuration missing.');
            return { success: false, message: 'R2 configuration missing.', messagePayload: { type: 'text', text: { body: `Sorry, the invoice system is not fully configured.` } } };
        }

        const invoiceKey = `invoices/${storeId}/${orderId}.pdf`;
        await uploadToS3(r2BucketName, invoiceKey, pdfBuffer, 'application/pdf');
        const publicInvoiceUrl = `${r2PublicUrlPrefix.replace(/\/$/, '')}/${invoiceKey}`;

        const invoiceMessagePayload = {
            type: 'document',
            link: publicInvoiceUrl,
            caption: `Invoice for Order ID: ${orderId}`,
            filename: `Invoice-${orderId}.pdf`
        };
        return { success: true, invoiceUrl: publicInvoiceUrl, message: 'Invoice PDF generated.', messagePayload: invoiceMessagePayload };
    } catch (error) {
        console.error(`[ActionProcessor] Error in executeGetInvoice for order ${orderId}:`, error);
        return { success: false, message: `Failed to get invoice: ${error.message}`, messagePayload: { type: 'text', text: { body: `Sorry, I couldn't retrieve the invoice for order ${orderId}.` } } };
    }
}

async function handleViewMoreProducts(payload, context) {
    const { storeId } = context;
    try {
        const products = await getStoreProducts(storeId, 5);
        if (!products || products.length === 0) {
            return { success: true, message: 'No products found.', messagePayload: { type: 'text', text: { body: 'Sorry, we currently do not have any products listed.' } } };
        }

        const productRows = products.map(product => ({
            id: `select_product_${product.product_id}`,
            title: (product.name || 'Unnamed Product').substring(0, 24),
            description: `${product.currency || 'SGD'}${(parseFloat(product.price) || 0).toFixed(2)} - ${(product.description || '').substring(0, 40)}`,
        }));

        const messagePayload = {
            type: 'interactive',
            interactive: {
                type: 'list',
                header: { type: 'text', text: 'Our Products' },
                body: { text: 'Here are some of our products.' },
                action: { button: 'View Products', sections: [{ title: 'Available Products', rows: productRows }] }
            }
        };
        return { success: true, message: 'Successfully fetched products.', messagePayload };
    } catch (error) {
        console.error(`[ActionProcessor] Error in handleViewMoreProducts for store ${storeId}:`, error);
        return { success: false, message: `Failed to fetch products: ${error.message}`, messagePayload: { type: 'text', text: { body: 'Sorry, there was an issue fetching our products.' } } };
    }
}

async function handleViewProductDetail(payload, context) {
    const { storeId } = context;
    const productId = payload.productId;

    if (!productId) {
        console.warn(`[ActionProcessor] handleViewProductDetail called without productId for store ${storeId}`);
        return { 
            success: false, 
            message: 'Product ID is missing.', 
            messagePayload: { type: 'text', text: { body: 'Sorry, I need a product ID to show details.' } } 
        };
    }

    console.log(`[ActionProcessor] Handling VIEW_PRODUCT_DETAIL for store ${storeId}, product ${productId}`);

    try {
        const product = await getStoreProduct(storeId, productId);

        if (!product) {
            console.warn(`[ActionProcessor] Product ${productId} not found in store ${storeId}.`);
            return { 
                success: false, 
                message: `Product ${productId} not found.`, 
                messagePayload: { type: 'text', text: { body: `Sorry, I couldn't find details for the selected product.` } } 
            };
        }

        let detailText = `*${product.name || 'Product'}*\n`;
        if (product.description) {
          detailText += `${product.description}\n\n`;
        }
        if (product.price !== undefined) {
          const currency = product.currency || 'SGD'; 
          detailText += `*Price:* ${currency} ${(parseFloat(product.price) || 0).toFixed(2)}\n`;
        }
        if (product.categoryName) {
          detailText += `*Category:* ${product.categoryName}\n`;
        }
        if (product.stockQuantity !== undefined) {
          detailText += `*Stock:* ${product.stockQuantity > 0 ? product.stockQuantity : 'Out of Stock'}\n`;
        }

        const interactiveMessage = {
          type: 'interactive',
          interactive: {
            type: 'button',
            header: product.image_url 
              ? { type: 'image', image: { link: product.image_url } } 
              : { type: 'text', text: product.name || 'Product Details' },
            body: { text: detailText.substring(0, 1024) }, 
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: {
                    id: `buy_product_${productId}`,
                    title: '🛒 Buy Now'
                  }
                },
                {
                  type: 'reply',
                  reply: {
                    id: 'initiate_view_products_list',
                    title: '🛍️ All Products'
                  }
                },
                {
                  type: 'reply',
                  reply: {
                    id: `ask_about_product_${productId}`,
                    title: '❓ Ask Question'
                  }
                }
              ]
            }
          }
        };

        return {
          success: true,
          message: `Details for product ${productId} prepared.`,
          messagePayload: interactiveMessage 
        };

    } catch (error) {
        console.error(`[ActionProcessor] Error in handleViewProductDetail for product ${productId}, store ${storeId}:`, error);
        const errorMessage = error.message || 'An unknown error occurred.';
        return {
          success: false,
          message: `Failed to fetch product details: ${errorMessage}`,
          messagePayload: { type: 'text', text: { body: 'Sorry, there was an issue fetching the product details.' } }
        };
    }
}


async function handleAskAboutProduct(payload, context) { 
  const { storeId, userPhone } = context; 
  const productId = payload.productId; 
  console.log(`[ActionProcessor] Handling ASK_ABOUT_PRODUCT for store ${storeId}, user ${userPhone}, product ${productId}:`, payload);
  
  let productContextText = "about the product you selected";
  if (productId) {
    try {
      const product = await getStoreProduct(storeId, productId);
      if (product && product.name) {
        productContextText = `about ${product.name}`;
      }
    } catch (e) {
      console.warn(`[ActionProcessor] Could not fetch product ${productId} for ASK_ABOUT_PRODUCT context: ${e.message}`);
    }
  }

  const promptMessage = `Sure, what would you like to know ${productContextText}? Please type your question.`;
  
  return {
    success: true,
    message: 'Sent prompt for user to ask a question about a product.',
    messagePayload: { type: 'text', text: { body: promptMessage } }
  };
}

async function handleBuyProduct(productId, context) {
  const { storeId, userPhone, botConfig } = context;
  console.log(`[ActionProcessor] BUY_PRODUCT action for product ${productId}, store ${storeId}, user ${userPhone}`);
  console.log(`[ActionProcessor] handleBuyProduct - Received productId: ${productId}`);

  const product = await getStoreProduct(storeId, productId);
  console.log(`[ActionProcessor] handleBuyProduct - Fetched product details:`, JSON.stringify(product, null, 2));

  if (!product) {
    console.warn(`[ActionProcessor] Product ${productId} not found for store ${storeId} in handleBuyProduct.`);
    return {
      success: false,
      message: `Product with ID ${productId} not found.`,
      messagePayload: { type: 'text', text: { body: `Sorry, I couldn't find the product you're trying to buy. Please try again or select another product.` } }
    };
  }

  const orderId = crypto.randomUUID();
  const quantity = 1; // Default quantity for initial "Buy Now" click
  const unitPrice = parseFloat(product.price); // Ensure price is a number
  const totalAmount = unitPrice * quantity;
  const currency = product.currency || botConfig?.currencyCode || 'SGD'; // Get currency from product or botConfig

  const orderData = {
    PK: `STORE#${storeId}`,
    SK: `ORDER#${orderId}`,
    orderId: orderId,
    storeId: storeId,
    customerPhone: userPhone,
    order_lines: [
      {
        productId: product.product_id || productId, // Use product_id from fetched product object
        productName: product.name,
        quantity: quantity,
        unitPrice: unitPrice,
        line_total: totalAmount,
        imageUrl: product.image_url || null // Optional: store image for quick invoice display
      }
    ],
    totalAmount: totalAmount,
    currency: currency,
    orderStatus: 'PENDING_CONFIRMATION', // Initial status
    createdAt: new Date().toISOString(),
    // Add other relevant fields like shippingAddress, paymentMethod later
  };
  console.log(`[ActionProcessor] handleBuyProduct - Constructed orderData before calling createOrder:`, JSON.stringify(orderData, null, 2));

  try {
    const createdOrderFromFastAPI = await createOrder(orderData, storeId);
    const confirmedOrderId = createdOrderFromFastAPI.order_id;
    console.log(`[ActionProcessor] Order ${confirmedOrderId} created via FastAPI for product ${productId} by user ${userPhone}`);

    const confirmationText = 
`You've got great taste! Here is your order summary for the *${product.name}*:

${product.description ? `${product.description}\n` : ''}-----------------------------------
Order ID: ${confirmedOrderId}
Quantity: ${quantity}
Price: ${currency} ${unitPrice.toFixed(2)}
Total: *${currency} ${totalAmount.toFixed(2)}*
-----------------------------------
Ready to make it yours?`;

    const confirmationPayload = {
      type: 'interactive',
      interactive: {
        type: 'button',
        header: product.image_url
          ? { type: 'image', image: { link: product.image_url } }
          : { type: 'text', text: 'Order Summary' },
        body: { text: confirmationText.substring(0, 1024) },
        footer: { text: `Order ID: ${confirmedOrderId}` },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `confirm_order_${confirmedOrderId}`, title: '✅ Confirm & Pay' } },
            { type: 'reply', reply: { id: `change_qty_${confirmedOrderId}_${productId}`, title: '✏️ Change Quantity' } },
            { type: 'reply', reply: { id: `cancel_order_${confirmedOrderId}`, title: '❌ Cancel Order' } }
          ]
        }
      }
    };

    return {
      success: true,
      message: `Order ${confirmedOrderId} created via FastAPI and confirmation sent for product ${productId}`,
      messagePayload: confirmationPayload,
      // Optional: Add state to context/session here if needed for next step
      // e.g., current_order_id: orderId, next_expected_action: 'order_confirmation_reply'
    };

  } catch (error) {
    console.error(`[ActionProcessor] Error creating order for product ${productId}:`, error);
    return {
      success: false,
      message: `Failed to create order for product ${productId}. Error: ${error.message}`,
      messagePayload: { type: 'text', text: { body: `I'm sorry, there was an issue creating your order for ${product.name}. Please try again in a moment.` } }
    };
  }
}

async function handleConfirmOrderForPayment(orderId, context) {
  let { storeId, userPhone, botConfig } = context;

  // --- TEMPORARY HARDCODING FOR DEBUGGING ---
  const HARDCODED_PAYMENT_NUMBER = "6581556801";
  const HARDCODED_PAYMENT_INSTRUCTIONS = "Pay to the PayNow number provided (HC)"; // HC for hardcoded
  
  if (!botConfig) {
    botConfig = {}; // Initialize if null/undefined
  }
  
  // Override with hardcoded values
  botConfig.paymentPayNowNumber = HARDCODED_PAYMENT_NUMBER;
  botConfig.paymentInstructions = HARDCODED_PAYMENT_INSTRUCTIONS;
  console.warn(`[ActionProcessor] USING HARDCODED paymentPayNowNumber: ${botConfig.paymentPayNowNumber} and paymentInstructions: ${botConfig.paymentInstructions} for store ${storeId}`);
  // --- END TEMPORARY HARDCODING ---

  console.log(`[ActionProcessor] CONFIRM_ORDER_FOR_PAYMENT for order ${orderId}, store ${storeId}, user ${userPhone}`);

  if (!botConfig || !botConfig.paymentPayNowNumber) {
    console.error(`[ActionProcessor] Payment PayNow number is missing in botConfig for store ${storeId}. botConfig received:`, JSON.stringify(botConfig));
    return {
      success: false,
      message: 'Payment processing is not configured correctly. Please contact support.',
      messagePayload: { type: 'text', text: { body: 'Sorry, we cannot process payments at the moment. Please contact support.' } }
    };
  }

  try {
    // Call FastAPI to update order status to AWAITING_PAYMENT and get fresh order details
    const updatedOrder = await initiateOrderPaymentViaFastAPI(storeId, orderId);
    // The initiateOrderPaymentViaFastAPI function will throw an error if it fails, which will be caught by the catch block.
    // If it succeeds, updatedOrder contains the order details with the new status.

    console.log(`[ActionProcessor] Order ${orderId} status updated to AWAITING_PAYMENT via FastAPI. Order details:`, updatedOrder);

    // Ensure updatedOrder has the necessary fields (currency, total_amount)
    // FastAPI should return these. If not, we might need a subsequent getOrderById or adjust FastAPI response.
    // For now, assume updatedOrder contains what we need from the FastAPI response schema (OrderInDB).
    if (!updatedOrder || typeof updatedOrder.total_amount === 'undefined' || !updatedOrder.currency) {
        console.error(`[ActionProcessor] Order ${orderId} details incomplete after payment initiation. Missing total_amount or currency.`, updatedOrder);
        return {
            success: false,
            message: `Failed to retrieve complete order details for payment instructions for order ${orderId}.`,
            messagePayload: { type: 'text', text: { body: 'Sorry, there was an issue preparing your payment instructions. Please contact support.' } }
        };
    }

    const paymentInstructionText = 
`Please complete your payment for order ${orderId}.

Total Amount: *SGD ${parseFloat(updatedOrder.total_amount).toFixed(2)}*
PayNow to: *${botConfig.paymentPayNowNumber}*

Once payment is made, please click the button below.`;

    const paymentPayload = {
      type: 'interactive',
      interactive: {
        type: 'button',
        header: { type: 'text', text: 'Complete Your Payment' },
        body: { text: paymentInstructionText.substring(0, 1024) },
        footer: { text: `Order ID: ${orderId}` },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `payment_done_${orderId}`, title: 'I Have Paid' } }
          ]
        }
      }
    };

    return {
      success: true,
      message: `Payment instructions sent for order ${orderId}`,
      messagePayload: paymentPayload
    };

  } catch (error) {
    console.error(`[ActionProcessor] Error in handleConfirmOrderForPayment for order ${orderId}:`, error);

    let userFacingErrorMessage = 'Sorry, there was an issue processing your payment confirmation. Please try again or contact support.';
    if (error && error.message) {
        // Use the specific error message if available (this will be the FastAPI detail)
        userFacingErrorMessage = error.message;
    }

    // Ensure the message is not too long for WhatsApp (body limit is 1024 chars)
    if (userFacingErrorMessage.length > 1024) {
        userFacingErrorMessage = userFacingErrorMessage.substring(0, 1021) + "..."; // Truncate and add ellipsis
    }

    return {
      success: false,
      message: `Error in handleConfirmOrderForPayment for order ${orderId}: ${error.message}`,
      messagePayload: { type: 'text', text: { body: userFacingErrorMessage } }
    };
  }
}

async function handleInitiateChangeQuantity(orderId, context) {
  const { storeId, userPhone } = context;
  console.log(`[ActionProcessor] INITIATE_CHANGE_QUANTITY for order ${orderId}, store ${storeId}, user ${userPhone}`);

  try {
    const order = await getOrderById(storeId, orderId);
    if (!order || !order.items || order.items.length === 0) {
      console.warn(`[ActionProcessor] Order ${orderId} not found or has no items when trying to change quantity.`);
      return {
        success: false,
        message: `Order ${orderId} not found or is empty.`,
        messagePayload: { type: 'text', text: { body: `Sorry, I couldn't find the item in your order (ID: ${orderId}) to change its quantity.` } }
      };
    }

    // Assuming the first item is the one to change quantity for, as per current simplified order structure
    const itemToChange = order.items[0];
    const productId = itemToChange.productId;
    const currentQuantity = itemToChange.quantity;
    const productName = itemToChange.productName || 'the product';

    const listTitle = `Change Quantity for ${productName}`.substring(0, 24);
    const bodyText = `Current quantity: ${currentQuantity}. Please select the new quantity:`;

    const rows = [];
    for (let i = 1; i <= 5; i++) {
      rows.push({
        id: `update_quantity_${orderId}_${productId}_${i}`,
        title: `${i} unit${i > 1 ? 's' : ''}`,
        description: i === currentQuantity ? 'Current quantity' : `Change to ${i}`
      });
    }
    // Optionally, add an option for 'Other quantity' or 'Cancel'
    // rows.push({ id: `cancel_change_quantity_${orderId}`, title: 'Cancel Change' });

    const quantityListMessage = {
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: listTitle },
        body: { text: bodyText.substring(0, 1024) },
        footer: { text: `Order ID: ${orderId}` },
        action: {
          button: 'Select Quantity',
          sections: [
            {
              title: 'Available Quantities',
              rows: rows
            }
          ]
        }
      }
    };

    return {
      success: true,
      message: `Sent quantity selection list for order ${orderId}, product ${productId}`,
      messagePayload: quantityListMessage
    };

  } catch (error) {
    console.error(`[ActionProcessor] Error in handleInitiateChangeQuantity for order ${orderId}:`, error);
    return {
      success: false,
      message: `Failed to initiate quantity change for order ${orderId}: ${error.message}`,
      messagePayload: { type: 'text', text: { body: 'Sorry, there was an issue changing the quantity. Please try again or contact support.' } }
    };
  }
}

async function handleUpdateOrderQuantity(actionIdentifier, context) {
  const { storeId, botConfig } = context;
  console.log(`[ActionProcessor] UPDATE_ORDER_QUANTITY triggered with ID: ${actionIdentifier}`);

  const parts = actionIdentifier.split('_');
  if (parts.length !== 5 || parts[0] !== 'update' || parts[1] !== 'quantity') {
    console.error(`[ActionProcessor] Invalid actionIdentifier format for quantity update: ${actionIdentifier}`);
    return { success: false, message: 'Invalid action format.', messagePayload: { type: 'text', text: { body: 'Sorry, there was an error updating the quantity.'}} };
  }
  const orderId = parts[2];
  const productIdToUpdate = parts[3];
  const newQuantity = parseInt(parts[4], 10);

  if (isNaN(newQuantity) || newQuantity <= 0) {
    console.error(`[ActionProcessor] Invalid new quantity: ${newQuantity} for order ${orderId}`);
    return { success: false, message: 'Invalid quantity.', messagePayload: { type: 'text', text: { body: 'Sorry, the selected quantity is not valid.'}} };
  }

  try {
    const order = await getOrderById(storeId, orderId); // Fetches from FastAPI
    if (!order || !order.order_lines || order.order_lines.length === 0) {
      console.warn(`[ActionProcessor] Order ${orderId} not found or has no order_lines when trying to update quantity. Order:`, order);
      return { success: false, message: `Order ${orderId} not found or is empty.`, messagePayload: { type: 'text', text: { body: `Sorry, I couldn't find your order (ID: ${orderId}) or it's empty.` } } };
    }

    const product = await getStoreProduct(storeId, productIdToUpdate); // Fetches from FastAPI
    if (!product) {
      console.warn(`[ActionProcessor] Product ${productIdToUpdate} not found for order ${orderId} during quantity update.`);
      return { success: false, message: `Product ${productIdToUpdate} not found.`, messagePayload: { type: 'text', text: { body: `Sorry, I couldn't find the product details to update the quantity.` } } };
    }

    let itemFound = false;
    let requiresUnitPriceFallback = false; // Flag if we had to use current product.price

    order.order_lines = order.order_lines.map(line => {
      if (line.product_id === productIdToUpdate) {
        itemFound = true;
        let pricePerUnitForCalc = parseFloat(line.price_per_unit);

        if (isNaN(pricePerUnitForCalc)) {
          console.warn(`[ActionProcessor] Order ${orderId}, product ${line.product_id} missing or invalid original price_per_unit ('${line.price_per_unit}'). Falling back to current product price from fetched product data.`);
          pricePerUnitForCalc = parseFloat(product.price); // product is already fetched for productIdToUpdate
          requiresUnitPriceFallback = true;
          if (isNaN(pricePerUnitForCalc)) {
            console.error(`[ActionProcessor] Critical: Fallback product price for ${productIdToUpdate} is also invalid: ${product.price}`);
            throw new Error(`Invalid price for product ${productIdToUpdate} in both order and product data.`);
          }
          line.price_per_unit = String(pricePerUnitForCalc); // Update line's price_per_unit to reflect the fallback price used
        }
        
        line.quantity = newQuantity;
        line.line_total = String(newQuantity * pricePerUnitForCalc);
      }
      return line;
    });

    if (requiresUnitPriceFallback) {
        console.warn(`[ActionProcessor] Order ${orderId} update for product ${productIdToUpdate} used a fallback price. Original order data might be inconsistent.`);
    }

    if (!itemFound) {
        console.error(`[ActionProcessor] Product ${productIdToUpdate} not found in order ${orderId} order_lines.`);
        return { success: false, message: 'Item not in order.', messagePayload: { type: 'text', text: { body: 'Sorry, the item was not found in your current order.'}} };
    }

    order.total_amount = String(order.order_lines.reduce((sum, line) => sum + parseFloat(line.line_total), 0)); // Ensure string for FastAPI
    // order.updated_at = new Date().toISOString(); // FastAPI will handle this

    const currency = order.currency_code || product.currency_code || botConfig?.currencyCode || 'SGD';

    const payloadForFastAPI = {
      order_lines: order.order_lines.map(line => ({
        product_id: line.product_id,
        quantity: line.quantity,
        price_per_unit: String(line.price_per_unit), // Ensure this is the original or fallback price used
        line_total: String(line.line_total)
      })),
      total_amount: String(order.total_amount),
      currency_code: currency, // Renamed from 'currency'
      customer_id: order.customer_id || undefined, // Preserve customer_id if present
      status: order.status || undefined, // Preserve status if present
    };

    const updatedOrderFromFastAPI = await updateOrder(storeId, orderId, payloadForFastAPI);
    if (!updatedOrderFromFastAPI) {
        console.error(`[ActionProcessor] Failed to update order ${orderId} via FastAPI call.`);
        throw new Error('Order update via FastAPI returned no data.');
    }

    console.log(`[ActionProcessor] Order ${orderId} quantity updated for product ${productIdToUpdate} to ${newQuantity}. New total: ${updatedOrderFromFastAPI.total_amount}`);

    const updatedLineItem = updatedOrderFromFastAPI.order_lines.find(line => line.product_id === productIdToUpdate);
    // Use product.name for display as order_lines might not have it, or ensure FastAPI returns it.
    const productNameForDisplay = product.name || updatedLineItem.product_name || 'Product'; 

    const displayCurrency = updatedOrderFromFastAPI.currency_code || currency;
    const confirmationText = 
`Your order has been updated:

*Product:* ${productNameForDisplay}
*Quantity:* ${updatedLineItem.quantity}
*Price per item:* ${displayCurrency}${parseFloat(updatedLineItem.price_per_unit || 0).toFixed(2)}
*New Item Total:* ${displayCurrency}${parseFloat(updatedLineItem.line_total || 0).toFixed(2)}
*New Order Total:* ${displayCurrency}${parseFloat(updatedOrderFromFastAPI.total_amount || 0).toFixed(2)}

You can view your updated order with /myorders or manage items further.`;

    const confirmationMessage = {
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: 'Order Updated Successfully'
        },
        body: { text: confirmationText.substring(0, 1024) },
        footer: { text: `Store ID: ${storeId}` },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `confirm_order_${orderId}`, title: '✅ Confirm & Pay' } },
            { type: 'reply', reply: { id: `change_quantity_${orderId}`, title: '🔄 Change Quantity' } }, // This button might need re-evaluation if it triggers this same complex flow.
            { type: 'reply', reply: { id: `cancel_order_${orderId}`, title: '❌ Cancel Order' } }
          ]
        }
      }
    };

    return {
      success: true,
      message: `Order ${orderId} quantity updated.`,
      messagePayload: confirmationMessage
    };

  } catch (error) {
    console.error(`[ActionProcessor] Error in handleUpdateOrderQuantity for order ${orderId}:`, error);
    let userMessage = 'Sorry, there was an error updating the quantity. Please try again.';
    if (error.message && error.message.includes('FastAPI order update failed')) {
        userMessage = 'There was an issue communicating with the order system. Please try again shortly.';
    }
    return {
      success: false,
      message: `Failed to update quantity for order ${orderId}: ${error.message}`,
      messagePayload: { type: 'text', text: { body: userMessage } }
    };
  }
}

async function handlePaymentDone(orderId, context) {
    const { storeId, userPhone, botConfig } = context;
    console.log(`[ActionProcessor] Handling PAYMENT_DONE for order ${orderId} from user ${userPhone}`);

    try {
        const order = await getOrderById(storeId, orderId);
        if (!order) {
            console.error(`[ActionProcessor] Order ${orderId} not found in handlePaymentDone.`);
            return { success: false, message: `Order ${orderId} not found.`, messagePayload: { type: 'text', text: { body: `Sorry, we couldn't find your order (${orderId}) to confirm payment.` } } };
        }
        
        const ownerPhoneNumber = '6598709487'; // Hardcoded owner number
        
        const ownerNotificationText = 
`*Payment Verification Required*
-----------------------------------
Order ID: ${orderId}
Customer: ${userPhone}
Total: ${order.currency || 'SGD'} ${parseFloat(order.total_amount).toFixed(2)}
-----------------------------------
Please confirm if you have received the payment.`;

        const ownerNotificationPayload = {
            type: 'interactive',
            interactive: {
                type: 'button',
                header: { type: 'text', text: 'Payment Verification' },
                body: { text: ownerNotificationText },
                footer: { text: `Order ID: ${orderId}` },
                action: {
                    buttons: [
                        { type: 'reply', reply: { id: `owner_confirm_payment_${orderId}`, title: '✅ Confirm Payment' } },
                        { type: 'reply', reply: { id: `owner_reject_payment_${orderId}`, title: '❌ Reject Payment' } }
                    ]
                }
            }
        };

        try {
            await sendWhatsAppMessage(storeId, ownerPhoneNumber, ownerNotificationPayload, botConfig);
            console.log(`[ActionProcessor] Sent payment verification request to owner for order ${orderId}.`);
        } catch (e) {
            console.error(`[ActionProcessor] CRITICAL: Failed to send payment verification to owner for order ${orderId}`, e);
            return { success: false, message: `Failed to notify store owner for order ${orderId}.`, messagePayload: { type: 'text', text: { body: `We're sorry, but there was a system error while trying to verify your payment for order ${orderId}. Please contact support directly.` } } };
        }

        const userAcknowledgementMessage = `Thank you! We have received your payment notification for order #${orderId.substring(0,8)}. We are verifying it now and will send a final confirmation shortly.`;

        return {
            success: true,
            message: `Owner notification sent for order ${orderId}. Awaiting owner confirmation.`,
            messagePayload: { type: 'text', text: { body: userAcknowledgementMessage } }
        };

    } catch (error) {
        console.error(`[ActionProcessor] Critical error in handlePaymentDone for order ${orderId}:`, error);
        let userMessage = 'Sorry, a critical error occurred. Please contact us about order ' + orderId + '.';
        return {
            success: false,
            message: `An unexpected error occurred while handling payment done for order ${orderId}.`,
            messagePayload: { type: 'text', text: { body: userMessage } }
        };
    }
}

async function handleOwnerConfirmPayment(orderId, context) {
    const { storeId, botConfig, userPhone: ownerPhone } = context; // The user in context is the owner
    console.log(`[ActionProcessor] Owner ${ownerPhone} is confirming payment for order ${orderId}`);

    try {
        // Step 1: Call the consolidated backend endpoint to confirm payment, generate invoice, and save the URL.
        const response = await confirmPaymentAndGenerateInvoice(storeId, orderId);

        if (!response.success || !response.data) {
            const errorDetail = response.error?.detail || 'Unknown error from backend.';
            console.error(`[ActionProcessor] Backend failed to confirm payment for order ${orderId}:`, errorDetail);
            throw new Error(errorDetail);
        }

        const finalOrder = response.data;
        const customerPhone = finalOrder.customer_id;
        const invoiceUrl = finalOrder.invoice_pdf_url;
        const orderNumber = orderId.substring(0, 8).toUpperCase();
        
        console.log(`[ActionProcessor] Order status updated to: ${finalOrder.status}`);
        console.log(`[ActionProcessor] Order data from API:`, JSON.stringify(finalOrder));

        if (!invoiceUrl) {
            // This case should be rare given the new backend logic, but handle it defensively.
            console.error(`[ActionProcessor] CRITICAL: Payment for order ${orderId} was confirmed but no invoice URL was returned.`);
            throw new Error('Payment confirmed, but invoice URL was not available. Please generate it manually.');
        }

        // Step 2: Notify the customer with a proper document message
        console.log(`[ActionProcessor] Customer phone from order data: '${customerPhone}', Invoice URL: '${invoiceUrl}'`);
        
        if (customerPhone) {
            // Format the customer phone number if needed
            const formattedCustomerPhone = customerPhone.startsWith('+') ? customerPhone : `+${customerPhone}`;
            console.log(`[ActionProcessor] Formatted customer phone: ${formattedCustomerPhone}`);
            
            const customerMessage = `Thank you! Your payment for order #${orderNumber} is confirmed. Please find your invoice attached.`;
            const customerMessagePayload = {
                type: 'document',
                document: {
                    link: invoiceUrl,
                    filename: `Invoice-${orderNumber}.pdf`,
                    caption: customerMessage
                }
            };

            try {
                // First send a text message to ensure the customer is reachable
                const textPayload = { type: 'text', text: { body: `Your payment for order #${orderNumber} is confirmed! Sending your invoice shortly...` } };
                await sendWhatsAppMessage(storeId, formattedCustomerPhone, textPayload, botConfig);
                console.log(`[ActionProcessor] Sent text confirmation to customer ${formattedCustomerPhone}`);
                
                // Then send the document
                await sendWhatsAppMessage(storeId, formattedCustomerPhone, customerMessagePayload, botConfig);
                console.log(`[ActionProcessor] Successfully sent invoice document to customer ${formattedCustomerPhone} for order ${orderId}.`);
            } catch (e) {
                console.error(`[ActionProcessor] CRITICAL ERROR: Failed to send invoice to customer ${formattedCustomerPhone} for order ${orderId}.`, e);
                throw new Error(`Failed to send invoice to customer: ${e.message}. Please try again or check customer phone number.`);
            }
        } else {
            console.error(`[ActionProcessor] CRITICAL: No customer phone found for order ${orderId}. Order data:`, JSON.stringify(finalOrder));
            throw new Error(`Cannot send invoice: No customer phone number found in order ${orderNumber}.`);
        }

        // Step 3: Get updated customer list to show to owner
        console.log(`[ActionProcessor] CRITICAL DEBUGGING: Fetching updated customer list after payment confirmation for storeId=${storeId}`);
        // Define customerMessage in the correct scope
        let customerMessage = "";
        
        try {
            // Ensure botConfig has the posFastapiBaseUrl set
            if (!botConfig.posFastapiBaseUrl) {
                botConfig.posFastapiBaseUrl = process.env.POS_FASTAPI_BASE_URL;
                console.log(`[ActionProcessor] Setting posFastapiBaseUrl from env: ${botConfig.posFastapiBaseUrl}`);
            }
            console.log(`[ActionProcessor] botConfig for customer fetch:`, JSON.stringify(botConfig));
            
            // Get recent orders
            const recentOrders = await getRecentCustomers(storeId, botConfig);
            console.log(`[ActionProcessor] CRITICAL DEBUGGING: Recent orders fetch result - count: ${recentOrders?.length || 0}`);
            
            if (recentOrders && recentOrders.length > 0) {
                console.log(`[ActionProcessor] Formatting ${recentOrders.length} recent orders`);
                customerMessage = formatRecentCustomersMessage(recentOrders);
                console.log(`[ActionProcessor] Customer message length: ${customerMessage.length}`);
            } else {
                console.log(`[ActionProcessor] WARNING: No recent orders found for storeId=${storeId}`);
                customerMessage = "No recent orders found after confirming payment.";
            }
        } catch (error) {
            console.error(`[ActionProcessor] ERROR fetching customer list:`, error);
            customerMessage = "Error fetching recent customer data.";
        }

        // Step 4: Notify the owner with a success message and the updated customer list
        const ownerMessageText = `✅ Payment confirmed for order #${orderNumber}.\nInvoice sent to customer.\nView Invoice: ${invoiceUrl}\n\n${customerMessage}`;
        
        // Create an interactive message with a "Send Greeting" button
        const ownerMessagePayload = {
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: ownerMessageText.substring(0, 1000) // WhatsApp has a length limit
                },
                action: {
                    buttons: [
                        {
                            type: 'reply',
                            reply: {
                                id: `owner_initiate_reply_${orderId}`,
                                title: 'Send Greeting'
                            }
                        }
                    ]
                }
            }
        };
        
        // If the message is too long for an interactive message, break it into two messages
        if (ownerMessageText.length > 1000) {
            // First send a text message with the complete information
            const textPayload = { type: 'text', text: { body: ownerMessageText } };
            await sendWhatsAppMessage(storeId, ownerPhone, textPayload, botConfig);
            
            // Then return a simple interactive message
            const shortMessagePayload = {
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: {
                        text: `✅ Payment confirmed for order #${orderNumber}.\nInvoice sent to customer.`
                    },
                    action: {
                        buttons: [
                            {
                                type: 'reply',
                                reply: {
                                    id: `owner_initiate_reply_${orderId}`,
                                    title: 'Send Greeting'
                                }
                            }
                        ]
                    }
                }
            };
            
            return {
                success: true,
                message: `Payment confirmed, invoice sent, and customer list updated for order ${orderId}.`,
                messagePayload: shortMessagePayload
            };
        }
        
        return {
            success: true,
            message: `Payment confirmed, invoice sent, and customer list updated for order ${orderId}.`,
            messagePayload: ownerMessagePayload
        };

    } catch (error) {
        console.error(`[ActionProcessor] Error in handleOwnerConfirmPayment for order ${orderId}:`, error);
        const errorMessage = `An error occurred while confirming payment for order #${orderId.substring(0, 8)}: ${error.message}`;
        return {
            success: false,
            message: errorMessage,
            messagePayload: { type: 'text', text: { body: `❌ Error confirming payment: ${error.message}` } }
        };
    }
}

async function handleOwnerRejectPayment(orderId, context) {
    const { storeId, botConfig } = context;
    console.log(`[ActionProcessor] Handling OWNER_REJECT_PAYMENT for order ${orderId}, store ${storeId}`);

    try {
        // 1. Update order status to 'PAYMENT_REJECTED'
        // For now, we'll log it and notify the customer.
        await updateOrderStatus(storeId, orderId, 'PAYMENT_REJECTED');

        const order = await getOrderById(storeId, orderId);
        const customerPhone = order.customer_phone || order.customerPhone;

        // Step 2: Notify customer
        if (customerPhone) {
            const customerMessage = `We're sorry, but there was an issue with the payment for your order #${orderId.substring(0,8)}. Please contact us directly to resolve this.`;
            await sendWhatsAppMessage(storeId, customerPhone, { type: 'text', text: { body: customerMessage } }, botConfig);
        } else {
            console.error(`[ActionProcessor] Could not find customer phone for order ${orderId} to send rejection notice.`);
        }

        // Step 3: Send confirmation back to the owner
        const ownerConfirmation = `Rejection notice sent to the customer for order ${orderId}.`;
        return { success: true, message: `Payment for order ${orderId} rejected and customer notified.`, messagePayload: { type: 'text', text: { body: ownerConfirmation } } };

    } catch (error) {
        console.error(`[ActionProcessor] Error in handleOwnerRejectPayment for order ${orderId}:`, error);
        const ownerErrorMessage = `An error occurred while rejecting payment for order ${orderId}: ${error.message}`;
        return { success: false, message: ownerErrorMessage, messagePayload: { type: 'text', text: { body: ownerErrorMessage } } };
    }
}

/**
 * Handles the owner initiating a greeting reply to a customer after payment confirmation
 * Now sends a direct greeting immediately rather than waiting for owner to type custom message
 * @param {string} orderId - The ID of the order 
 * @param {object} context - Context containing storeId, botConfig, userPhone (owner's phone), and businessContext
 * @returns {object} Response containing success, message, and messagePayload
 */
export async function handleInitiateOwnerReply(orderId, context) {
    const { storeId, userPhone: ownerPhone, businessContext } = context; // The user in context is the owner
    console.log(`[ActionProcessor] Owner ${ownerPhone} is sending a greeting for order ${orderId}`);

    try {
        // Get the order to retrieve customer phone and other details
        const order = await getOrderById(storeId, orderId);
        
        // Check multiple possible field names for customer phone
        const customerPhone = order?.customer_id || order?.customerPhone || order?.customer_phone;
        
        if (!order || !customerPhone) {
            console.error(`[ActionProcessor] Cannot send owner reply: no customer phone for order ${orderId}. Order data: ${JSON.stringify(order)}`);
            return { 
                success: false, 
                message: `Cannot send greeting: customer contact info not found.`, 
                messagePayload: { type: 'text', text: { body: `❌ Unable to send greeting: customer contact information not found.` } }
            };
        }

        const orderNumber = orderId.substring(0, 8).toUpperCase();
        
        // Extract store details from the business context text if available
        let location = "Please contact us for our store location.";
        let hours = "Mon-Sat: 10:00 AM - 8:00 PM";
        
        // Parse the businessContext if available
        if (businessContext) {
            console.log(`[ActionProcessor] Using business context for store info`);
            
            // Try to extract location information
            const locationMatch = businessContext.match(/(?:address|location|store\s+address|store\s+location):\s*([^\n]+)/i);
            if (locationMatch && locationMatch[1]) {
                location = locationMatch[1].trim();
                console.log(`[ActionProcessor] Found store location: ${location}`);
            }
            
            // Try to extract hours information
            const hoursMatch = businessContext.match(/(?:hours|timings|business\s+hours|operating\s+hours|opening\s+hours|collection\s+hours):\s*([^\n]+)/i);
            if (hoursMatch && hoursMatch[1]) {
                hours = hoursMatch[1].trim();
                console.log(`[ActionProcessor] Found store hours: ${hours}`);
            }
        } else {
            console.log(`[ActionProcessor] No business context available, using default store info`);
        }
        
        // Use extracted info or fallbacks
        const storeInfo = {
            location: order?.store_location || location,
            hours: order?.store_hours || hours
        };
        
        // Enhanced greeting message
        const defaultGreeting = `Thank you for your order #${orderNumber}. Your payment has been confirmed, and your order is being processed. You can collect your items at our store.`;
        
        console.log(`[ActionProcessor] Sending owner greeting to customer for order ${orderId}`);
        
        try {
            // Import sendOwnerMessageToCustomer function from ownerReplyManager
            const { sendOwnerMessageToCustomer } = await import('../utils/ownerReplyManager.js');
            
            // Get the bot config with WhatsApp credentials from DynamoDB
            const { getBotConfig } = await import('../utils/dynamoDbUtils.js');
            const botConfig = await getBotConfig(storeId);
            
            if (!botConfig || !botConfig.whatsappToken || !botConfig.whatsappPhoneNumberId) {
                console.error(`[ActionProcessor] Bot config or WhatsApp credentials missing for store ${storeId}`);
                return { 
                    success: false, 
                    message: `Cannot send greeting: WhatsApp credentials not configured.`, 
                    messagePayload: { type: 'text', text: { body: `❌ Unable to send greeting: WhatsApp API credentials not configured.` } }
                };
            }
            
            console.log(`[ActionProcessor] Using botConfig with token: ${botConfig.whatsappToken ? 'present' : 'missing'}, phone ID: ${botConfig.whatsappPhoneNumberId ? 'present' : 'missing'}`);
            
            // Send an interactive one-way message from owner to customer
            const success = await sendOwnerMessageToCustomer(
                storeId,
                customerPhone,
                defaultGreeting,
                orderId,
                orderNumber,
                botConfig,
                true, // Enable interactive message with button
                storeInfo // Pass store location and hours
            );
            
            if (success) {
                console.log(`[ActionProcessor] Successfully sent greeting to customer ${customerPhone}`);
                
                // Return success response to owner
                return {
                    success: true,
                    message: `Greeting sent to customer for order #${orderNumber}`,
                    messagePayload: { type: 'text', text: { body: `✅ Greeting message sent to customer for order #${orderNumber}.` } }
                };
            } else {
                console.error(`[ActionProcessor] Failed to send greeting to customer ${customerPhone}`);
                return { 
                    success: false, 
                    message: `Failed to send greeting to customer.`, 
                    messagePayload: { type: 'text', text: { body: `❌ Failed to send greeting to customer.` } }
                };
            }
            
        } catch (error) {
            console.error(`[ActionProcessor] Error sending greeting to customer ${customerPhone}: ${error}`);
            return { 
                success: false, 
                message: `Failed to send greeting: ${error.message}`, 
                messagePayload: { type: 'text', text: { body: `❌ Failed to send greeting due to an error.` } }
            };
        }
        
    } catch (error) {
        console.error(`[ActionProcessor] Error processing greeting for order ${orderId}: ${error}`);
        return { 
            success: false, 
            message: `Error processing greeting request: ${error.message}`, 
            messagePayload: { type: 'text', text: { body: `❌ Error processing greeting request.` } }
        };
    }
}

async function handleBuyProductByName(actionPayload, context) {
  const { productName } = actionPayload;
  const { storeId } = context;

  console.log(`[ActionProcessor] handleBuyProductByName called for product: '${productName}' in store ${storeId}`);

  if (!productName || productName.trim() === '') {
    return {
      success: false,
      message: 'Product name not provided.',
      messagePayload: { type: 'text', text: { body: 'Please specify a product name to buy.' } }
    };
  }

  try {
    const allProducts = await getStoreProducts(storeId);
    if (!allProducts || allProducts.length === 0) {
      return {
        success: false,
        message: 'No products found for the store.',
        messagePayload: { type: 'text', text: { body: 'Sorry, no products are available in this store right now.' } }
      };
    }

    const normalizedProductNameToBuy = productName.trim().toLowerCase();
    let matchedProducts = [];

    // 1. Exact match (case-insensitive)
    matchedProducts = allProducts.filter(p => p.name.toLowerCase() === normalizedProductNameToBuy);

    // 2. Partial match (case-insensitive 'includes') if no exact match
    if (matchedProducts.length === 0) {
      matchedProducts = allProducts.filter(p => p.name.toLowerCase().includes(normalizedProductNameToBuy));
    }

    // Now, handle the results
    if (matchedProducts.length === 1) {
      const productToBuy = matchedProducts[0];
      console.log(`[ActionProcessor] Found unique product match for '${productName}': ID ${productToBuy.product_id}, Name: ${productToBuy.name}`);
      // Call handleBuyProduct with the product ID and default quantity 1
      return handleBuyProduct(productToBuy.product_id, context, 1);
    } else if (matchedProducts.length > 1) {
      let responseText = `I found a few items matching '${productName}':\n`;
      matchedProducts.slice(0, 3).forEach(p => { // List up to 3 matches
        responseText += `\n- ${p.name}`;
      });
      if (matchedProducts.length > 3) {
        responseText += '\n...and more.';
      }
      responseText += "\n\nPlease be more specific, or you can say 'products' to see all items.";
      return {
        success: false,
        message: 'Multiple products matched.',
        messagePayload: { type: 'text', text: { body: responseText } }
      };
    } else { // matchedProducts.length === 0
      return {
        success: false,
        message: `Product '${productName}' not found.`,
        messagePayload: { type: 'text', text: { body: `Sorry, I couldn't find a product called '${productName}'. You can say 'products' to see all available items.` } }
      };
    }
  } catch (error) {
    console.error(`[ActionProcessor] Error in handleBuyProductByName for '${productName}':`, error);
    return {
      success: false,
      message: `Error processing your request to buy '${productName}': ${error.message}`,
      messagePayload: { type: 'text', text: { body: 'Sorry, there was an internal error trying to find that product.' } }
    };
  }
}

async function handleCancelOrder(orderId, context) {
  const { storeId, userPhone } = context;
  console.log(`[ActionProcessor] CANCEL_ORDER for order ${orderId}, store ${storeId}, user ${userPhone}`);

  try {
    const order = await getOrderById(storeId, orderId);
    if (!order) {
      console.warn(`[ActionProcessor] Order ${orderId} not found when trying to cancel.`);
      return {
        success: false,
        message: `Order ${orderId} not found.`,
        messagePayload: { type: 'text', text: { body: `Sorry, I couldn't find your order (ID: ${orderId}) to cancel.` } }
      };
    }

    // Check if order is already cancelled or completed
    if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'COMPLETED' || order.orderStatus === 'PAYMENT_RECEIVED') {
      return {
        success: true, // Or false if we want to indicate no action was taken
        message: `Order ${orderId} is already ${order.orderStatus.toLowerCase()} and cannot be cancelled now.`,
        messagePayload: { type: 'text', text: { body: `This order (ID: ${orderId}) is already ${order.orderStatus.toLowerCase()} and cannot be cancelled.` } }
      };
    }

    await updateOrderStatus(storeId, orderId, 'CANCELLED', { cancellationReason: 'User cancelled via WhatsApp bot' });
    console.log(`[ActionProcessor] Order ${orderId} status updated to CANCELLED.`);

    const cancellationMessage = `Your order (ID: ${orderId}) has been successfully cancelled.`;

    return {
      success: true,
      message: `Order ${orderId} cancelled successfully.`,
      messagePayload: { type: 'text', text: { body: cancellationMessage } }
    };

  } catch (error) {
    console.error(`[ActionProcessor] Error in handleCancelOrder for order ${orderId}:`, error);
    return {
      success: false,
      message: `Failed to cancel order ${orderId}: ${error.message}`,
      messagePayload: { type: 'text', text: { body: 'Sorry, there was an issue cancelling your order. Please try again or contact support.' } }
    };
  }
}

async function handleViewOrderDetail(actionPayload, context) {
  const { orderId } = actionPayload;
  const { storeId } = context;
  console.log(`[ActionProcessor] Handling VIEW_ORDER_DETAIL for order ${orderId}`);

  try {
    const order = await fetchOrderFromFastAPI(storeId, orderId);

    if (!order) {
      return {
        success: false,
        message: `Order ${orderId} not found.`,
        messagePayload: { type: 'text', text: { body: `Sorry, I couldn't find the details for order #${orderId.substring(0,8)}.` } }
      };
    }

    let messageBody = `*Order Details - #${order.order_id.substring(0, 8)}*\n\n`;
    messageBody += `*Status:* ${order.order_status}\n`;
    messageBody += `*Date:* ${new Date(order.created_at).toLocaleString()}\n`;
    messageBody += `*Total:* ${order.currency} ${parseFloat(order.total_amount).toFixed(2)}\n\n`;

    if (order.order_lines && order.order_lines.length > 0) {
      messageBody += '*Items:*\n';
      order.order_lines.forEach(item => {
        messageBody += `- ${item.product_name} (x${item.quantity}) - ${order.currency} ${parseFloat(item.unit_price).toFixed(2)}\n`;
      });
    } else {
      messageBody += '_This order has no items._\n';
    }

    const messages = [];

    // Send an image of the first product, if available and has a URL
    if (order.order_lines && order.order_lines.length > 0 && order.order_lines[0].image_url) {
      messages.push({
        type: 'image',
        image: { link: order.order_lines[0].image_url }
      });
    }

    messages.push({ type: 'text', text: { body: messageBody } });

    return {
      success: true,
      message: `Formatted details for order ${orderId}.`,
      messagePayload: messages
    };

  } catch (error) {
    console.error(`[ActionProcessor] Error in handleViewOrderDetail for order ${orderId}:`, error);
    return {
      success: false,
      message: `Failed to get details for order ${orderId}: ${error.message}`,
      messagePayload: { type: 'text', text: { body: `Sorry, an error occurred while fetching details for order #${orderId.substring(0,8)}.` } }
    };
  }
}

// --- Main Action Dispatcher ---
export async function processAction(actionIdentifier, actionPayload, context) {
  console.log(`[ActionProcessor] Received action: ${actionIdentifier} with payload:`, JSON.stringify(actionPayload, null, 2));
  console.log(`[ActionProcessor] Context: storeId=${context.storeId}, userPhone=${context.userPhone}`);

  try {
    // Handle simple, static string identifiers first
    switch (actionIdentifier) {
      case 'GET_ORDER_HISTORY':
        return executeGetOrderHistory(actionPayload, context);
      case 'initiate_view_products_list': // from product detail view
      case 'VIEW_MORE_PRODUCTS':
        return handleViewMoreProducts(actionPayload, context);
      case 'BUY_PRODUCT_BY_NAME':
        return handleBuyProductByName(actionPayload, context);
    }

    // Handle actions with dynamic parts (e.g., containing an ID)
    const parts = actionIdentifier.split('_');
    const action = parts[0];
    const entity = parts[1];

    if (action === 'buy' && entity === 'product') {
      const productId = actionIdentifier.substring('buy_product_'.length);
      return handleBuyProduct(productId, context);
    }
    if (action === 'select' && entity === 'product') {
      const productId = actionIdentifier.substring('select_product_'.length);
      // Correctly route to view details, not buy directly
      return handleViewProductDetail({ productId }, context);
    }
    if (action === 'ask' && entity === 'about') {
      const productId = actionIdentifier.substring('ask_about_product_'.length);
      return handleAskAboutProduct({ ...actionPayload, productId }, context);
    }
    if (action === 'confirm' && entity === 'order') {
      const orderId = actionIdentifier.substring('confirm_order_'.length);
      return handleConfirmOrderForPayment(orderId, context);
    }
    if (actionIdentifier.startsWith('payment_done_')) {
        const orderId = actionIdentifier.substring('payment_done_'.length);
        return await handlePaymentDone(orderId, context);
    }

    if (actionIdentifier.startsWith('owner_confirm_payment_')) {
        const orderId = actionIdentifier.substring('owner_confirm_payment_'.length);
        return await handleOwnerConfirmPayment(orderId, context);
    }

    if (actionIdentifier.startsWith('owner_reject_payment_')) {
        const orderId = actionIdentifier.substring('owner_reject_payment_'.length);
        return await handleOwnerRejectPayment(orderId, context);
    }
    
    if (actionIdentifier.startsWith('owner_initiate_reply_')) {
        const orderId = actionIdentifier.substring('owner_initiate_reply_'.length);
        return await handleInitiateOwnerReply(orderId, context);
    }
    if (action === 'change' && entity === 'qty') {
        const orderId = parts[2];
        return handleInitiateChangeQuantity(orderId, context); // Passes only orderId as needed
    }
    if (action === 'update' && entity === 'quantity') {
      return handleUpdateOrderQuantity(actionIdentifier, context);
    }
    if (action === 'view' && entity === 'order') {
      const orderId = actionIdentifier.substring('view_order_detail_'.length);
      return handleViewOrderDetail({ orderId }, context);
    }
    if (action === 'cancel' && entity === 'order') {
      const orderId = actionIdentifier.substring('cancel_order_'.length);
      return handleCancelOrder(orderId, context);
    }

    // Fallback for unhandled actions
    console.warn(`[ActionProcessor] Unhandled action: ${actionIdentifier}`);
    return {
      success: false,
      message: `Action ${actionIdentifier} is not recognized or handled.`,
      messagePayload: { type: 'text', text: { body: "I'm not sure how to handle that request. Can you try something else?" } }
    };
  } catch (error) {
    console.error(`[ActionProcessor] Critical error during action processing for '${actionIdentifier}':`, error);
    return {
      success: false,
      message: `Critical error processing action ${actionIdentifier}: ${error.message}`,
      messagePayload: { type: 'text', text: { body: 'A critical error occurred while processing your request. Please try again later.' } }
    };
  }
}
