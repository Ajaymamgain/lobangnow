import axios from 'axios';
import { sendWhatsAppMessage } from './whatsappUtils';

/**
 * Check if a message indicates price sensitivity from the customer
 * @param {string} messageContent - The message from the customer
 * @returns {boolean} - Whether the message indicates price sensitivity
 */
function isPriceSensitive(messageContent) {
  if (!messageContent) return false;
  
  const message = messageContent.toLowerCase();
  const priceSensitivityKeywords = [
    'expensive', 
    'costly', 
    'price too high', 
    'too much', 
    'can\'t afford',
    'not affordable',
    'discount',
    'cheaper',
    'lower price',
    'too expensive',
    'not worth',
    'overpriced'
  ];
  
  return priceSensitivityKeywords.some(keyword => message.includes(keyword));
}

/**
 * Get active campaigns for a store
 * @param {string} storeId - The store ID
 * @param {object} botConfig - The bot configuration
 * @returns {Promise<Array>} - Active campaigns
 */
async function getActiveCampaigns(storeId, botConfig) {
  try {
    if (!botConfig || !botConfig.posFastapiBaseUrl) {
      console.error('[discountUtils] Missing posFastapiBaseUrl in botConfig');
      return [];
    }

    const campaignsEndpoint = `${botConfig.posFastapiBaseUrl}/stores/${storeId}/campaigns/?active_only=true`;
    console.log(`[discountUtils] Fetching active campaigns from: ${campaignsEndpoint}`);
    
    const response = await axios.get(campaignsEndpoint);
    
    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      console.log(`[discountUtils] Found ${response.data.length} active campaigns`);
      return response.data;
    }
    
    console.log('[discountUtils] No active campaigns found');
    return [];
  } catch (error) {
    console.error('[discountUtils] Error fetching active campaigns:', error);
    return [];
  }
}

/**
 * Generate discount suggestion prompt for OpenAI based on active campaigns
 * @param {string} storeId - The store ID
 * @param {object} botConfig - The bot configuration
 * @returns {Promise<object|null>} - OpenAI prompt message
 */
async function getDiscountPrompt(storeId, botConfig) {
  try {
    const campaigns = await getActiveCampaigns(storeId, botConfig);
    
    if (campaigns.length === 0) {
      return null;
    }
    
    // Get the first active campaign
    const campaign = campaigns[0];
    
    // Format dates for display
    const startDate = new Date(campaign.start_date).toLocaleDateString();
    const endDate = new Date(campaign.end_date).toLocaleDateString();
    
    return {
      role: "system",
      content: `The customer seems concerned about the price. Offer them our "${campaign.campaign_name}" promotion: 
      ${campaign.discount_type === 'percentage' ? `${campaign.discount_value}% discount` : `$${campaign.discount_value} off`}
      using coupon code "${campaign.coupon_code}" at checkout. 
      Mention this is a limited-time offer valid from ${startDate} to ${endDate}.
      ${campaign.minimum_order_value ? `Also mention that a minimum order value of $${campaign.minimum_order_value} is required.` : ''}`
    };
  } catch (error) {
    console.error('[discountUtils] Error generating discount prompt:', error);
    return null;
  }
}

/**
 * Validate and apply a coupon code to an order
 * @param {string} storeId - The store ID
 * @param {string} couponCode - The coupon code to validate
 * @param {Array} items - The order items
 * @param {number} currentTotal - The current order total
 * @param {object} botConfig - The bot configuration
 * @returns {Promise<object>} - The order with discount applied
 */
async function applyCouponToOrder(storeId, couponCode, items, currentTotal, botConfig) {
  try {
    if (!botConfig || !botConfig.posFastapiBaseUrl) {
      console.error('[discountUtils] Missing posFastapiBaseUrl in botConfig');
      throw new Error('Missing API configuration');
    }

    const applyCouponEndpoint = `${botConfig.posFastapiBaseUrl}/stores/${storeId}/campaigns/apply-coupon`;
    console.log(`[discountUtils] Applying coupon ${couponCode} at: ${applyCouponEndpoint}`);
    
    const response = await axios.post(applyCouponEndpoint, {
      coupon_code: couponCode,
      items: items,
      current_total: currentTotal
    });
    
    console.log('[discountUtils] Coupon application response:', JSON.stringify(response.data));
    
    if (response.data && response.data.valid_coupon) {
      return {
        success: true,
        ...response.data
      };
    }
    
    return {
      success: false,
      message: response.data.discount_message || 'Coupon could not be applied',
      ...response.data
    };
  } catch (error) {
    console.error('[discountUtils] Error applying coupon:', error);
    return {
      success: false,
      original_total: currentTotal,
      discount_amount: 0,
      final_total: currentTotal,
      discount_message: 'Error processing coupon. Please try again.',
      valid_coupon: false
    };
  }
}

/**
 * Send discount approval request to the store owner
 * @param {string} storeId - Store ID
 * @param {string} ownerNumber - Store owner's WhatsApp number
 * @param {string} customerNumber - Customer's WhatsApp number
 * @param {object} orderDetails - Order details to potentially discount
 * @param {object} botConfig - Bot configuration
 * @returns {Promise<boolean>} - Whether the message was sent successfully
 */
async function sendDiscountApprovalRequest(storeId, ownerNumber, customerNumber, orderDetails, botConfig) {
  try {
    if (!ownerNumber) {
      console.error(`[discountUtils] Missing owner number for store ${storeId}`); 
      return false;
    }

    const { sendWhatsAppMessage } = await import('./whatsappUtils.js');
    
    // Format order summary for the owner
    const orderTotal = orderDetails.total || calculateOrderTotal(orderDetails.items);
    const formattedItems = (orderDetails.items || []).map(item => 
      `- ${item.quantity}x ${item.name}: ${item.currency || 'SGD'} ${(parseFloat(item.price) * item.quantity).toFixed(2)}`
    ).join('\n');
    
    // Store the discount request in the session to reference later
    const { getSession, updateSession } = await import('../handlers/webhook.js');
    const ownerSessionId = `${storeId}:${ownerNumber}`;
    const ownerSession = await getSession(ownerSessionId) || { conversation: [] };
    
    // Store the information about this discount request
    ownerSession.pendingDiscountRequest = {
      customerNumber,
      orderDetails,
      timestamp: new Date().toISOString()
    };
    
    await updateSession(ownerSessionId, ownerSession);
    
    // Create interactive message with discount options
    const discountMessage = {
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: '🔔 Discount Approval Needed'
        },
        body: {
          text: `A customer (${customerNumber}) is price-sensitive and might need a discount.\n\n*Order Summary:*\n${formattedItems}\n\nTotal: SGD ${orderTotal.toFixed(2)}\n\nPlease select a discount to offer:`
        },
        footer: {
          text: 'Select a discount option below'
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `discount_10_${customerNumber}`,
                title: '10% Discount'
              }
            },
            {
              type: 'reply',
              reply: {
                id: `discount_25_${customerNumber}`,
                title: '25% Discount'
              }
            },
            {
              type: 'reply',
              reply: {
                id: `discount_50_${customerNumber}`,
                title: '50% Discount'
              }
            },
            {
              type: 'reply',
              reply: {
                id: `discount_0_${customerNumber}`,
                title: 'No Discount'
              }
            }
          ]
        }
      }
    };
    
    // Send the message to the owner
    await sendWhatsAppMessage(storeId, ownerNumber, discountMessage, botConfig);
    console.log(`[discountUtils] Sent discount approval request to owner ${ownerNumber} for customer ${customerNumber}`);
    
    return true;
  } catch (error) {
    console.error('[discountUtils] Error sending discount approval request:', error);
    return false;
  }
}

/**
 * Handle owner's response to a discount request
 * @param {string} storeId - Store ID
 * @param {string} ownerNumber - Store owner's WhatsApp number
 * @param {string} actionId - Action ID from button click (format: discount_PERCENTAGE_CUSTOMERNUMBER)
 * @param {object} botConfig - Bot configuration
 * @returns {Promise<object>} - Result of handling the discount response
 */
async function handleDiscountResponse(storeId, ownerNumber, actionId, botConfig) {
  try {
    if (!actionId.startsWith('discount_')) {
      return { success: false, message: 'Not a discount action' };
    }
    
    // Parse the action ID to get discount percentage and customer number
    const parts = actionId.split('_');
    if (parts.length < 3) {
      return { success: false, message: 'Invalid discount action format' };
    }
    
    const discountPercent = parseInt(parts[1], 10);
    const customerNumber = parts.slice(2).join('_'); // Rejoin in case there were underscores in the number
    
    const { getSession, updateSession } = await import('../handlers/webhook.js');
    const { sendWhatsAppMessage } = await import('./whatsappUtils.js');
    
    // Get the owner session to retrieve the pending discount request
    const ownerSessionId = `${storeId}:${ownerNumber}`;
    const ownerSession = await getSession(ownerSessionId);
    
    if (!ownerSession || !ownerSession.pendingDiscountRequest) {
      await sendWhatsAppMessage(storeId, ownerNumber, {
        type: 'text',
        text: { body: '❌ Error: Could not find the pending discount request. The request may have expired.' }
      }, botConfig);
      return { success: false, message: 'No pending discount request found' };
    }
    
    const { customerNumber: storedCustomerNumber, orderDetails } = ownerSession.pendingDiscountRequest;
    
    // Verify the customer number matches
    if (storedCustomerNumber !== customerNumber) {
      await sendWhatsAppMessage(storeId, ownerNumber, {
        type: 'text',
        text: { body: '❌ Error: Customer number mismatch in discount request.' }
      }, botConfig);
      return { success: false, message: 'Customer number mismatch' };
    }
    
    // Calculate the discounted total
    const originalTotal = orderDetails.total || calculateOrderTotal(orderDetails.items);
    const discountedTotal = discountPercent > 0 ? 
      originalTotal * (1 - (discountPercent / 100)) : 
      originalTotal;
    
    // Format the discounted order message for the customer
    let customerMessage;
    if (discountPercent > 0) {
      const formattedItems = (orderDetails.items || []).map(item => {
        const itemTotal = parseFloat(item.price) * item.quantity;
        const discountedItemTotal = itemTotal * (1 - (discountPercent / 100));
        return `- ${item.quantity}x ${item.name}: ${item.currency || 'SGD'} ${discountedItemTotal.toFixed(2)} _(${discountPercent}% off)_`;
      }).join('\n');
      
      customerMessage = {
        type: 'text',
        text: {
          body: `🎉 *Good news!* The store owner has approved a *${discountPercent}% discount* on your order!\n\n*Updated Order Summary:*\n${formattedItems}\n\n*Original Total:* SGD ${originalTotal.toFixed(2)}\n*Discount:* ${discountPercent}%\n*New Total:* SGD ${discountedTotal.toFixed(2)}\n\nPlease proceed to checkout with this special price.`
        }
      };
    } else {
      customerMessage = {
        type: 'text',
        text: {
          body: `Thank you for your interest in our products. Unfortunately, we cannot offer a discount at this time. Your order total remains SGD ${originalTotal.toFixed(2)}.`
        }
      };
    }
    
    // Send the message to the customer
    await sendWhatsAppMessage(storeId, customerNumber, customerMessage, botConfig);
    
    // Confirm to the owner
    await sendWhatsAppMessage(storeId, ownerNumber, {
      type: 'text',
      text: {
        body: `✅ ${discountPercent > 0 ? `${discountPercent}% discount` : 'No discount'} has been communicated to the customer (${customerNumber}).`
      }
    }, botConfig);
    
    // Clear the pending discount request
    delete ownerSession.pendingDiscountRequest;
    await updateSession(ownerSessionId, ownerSession);
    
    return { 
      success: true, 
      message: `${discountPercent > 0 ? `${discountPercent}% discount` : 'No discount'} sent to customer`,
      discountPercent,
      originalTotal,
      discountedTotal
    };
  } catch (error) {
    console.error('[discountUtils] Error handling discount response:', error);
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * Calculate order total from items array
 * @param {Array} items - Order items
 * @returns {number} - Order total
 */
function calculateOrderTotal(items) {
  if (!items || !Array.isArray(items)) return 0;
  
  return items.reduce((total, item) => {
    const price = parseFloat(item.price) || 0;
    const quantity = parseInt(item.quantity, 10) || 1;
    return total + (price * quantity);
  }, 0);
}

/**
 * Creates an interactive message with a "Today's Offer" button
 * @param {string} originalMessage - The original text message to include before the interactive button
 * @returns {Object} WhatsApp interactive message object with Today's Offer button
 */
function createTodaysOfferMessage(originalMessage) {
    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            body: {
                text: originalMessage
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: 'todays_offer',
                            title: '🎁 Today\'s Offer'
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Handle the Today's Offer button click - shows product selection to customer
 * @param {string} storeId - The store ID
 * @param {string} ownerNumber - The store owner's WhatsApp number
 * @param {string} customerNumber - The customer's WhatsApp number
 * @param {Object} botConfig - Bot configuration
 * @returns {Promise<Object>} Result indicating success or failure
 */
async function handleTodaysOfferClick(storeId, ownerNumber, customerNumber, botConfig) {
    try {
        console.log(`[storeId: ${storeId}] Customer ${customerNumber} clicked on Today's Offer button`);
        
        // Get base URL for POS FastAPI
        const baseUrl = botConfig?.posFastapiBaseUrl || process.env.POS_FASTAPI_BASE_URL;
        if (!baseUrl) {
            console.error(`[storeId: ${storeId}] Missing POS FastAPI base URL in both botConfig and environment variables`);
            // Don't show error to customer
            return {
                success: false,
                message: 'Configuration error: Missing API base URL'
            };
        }
        
        // Fetch products from the store
        const productsUrl = `${baseUrl}/stores/${storeId}/products/`;
        let products;
        try {
            const productsResponse = await axios.get(productsUrl);
            products = productsResponse.data.products || [];
            
            // If no products found, create default placeholder products
            if (products.length === 0) {
                console.log(`[storeId: ${storeId}] No products found, using placeholder products for discount flow`);
                products = [
                    {
                        id: 'placeholder_1',
                        name: 'Standard Package',
                        description: 'Our standard package with great value',
                        price: 10.00,
                        currency: 'USD'
                    },
                    {
                        id: 'placeholder_2',
                        name: 'Premium Package',
                        description: 'Our premium package with extra features',
                        price: 20.00,
                        currency: 'USD'
                    },
                    {
                        id: 'placeholder_3',
                        name: 'Deluxe Package',
                        description: 'Our comprehensive deluxe package',
                        price: 30.00,
                        currency: 'USD'
                    }
                ];
            }
        } catch (error) {
            console.error(`[storeId: ${storeId}] Error fetching products:`, error.response?.data || error.message);
            // Use placeholder products on API error
            products = [
                {
                    id: 'placeholder_1',
                    name: 'Standard Package',
                    description: 'Our standard package with great value',
                    price: 10.00,
                    currency: 'USD'
                },
                {
                    id: 'placeholder_2',
                    name: 'Premium Package',
                    description: 'Our premium package with extra features',
                    price: 20.00,
                    currency: 'USD'
                },
                {
                    id: 'placeholder_3',
                    name: 'Deluxe Package',
                    description: 'Our comprehensive deluxe package',
                    price: 30.00,
                    currency: 'USD'
                }
            ];
        }
        
        // Limit to 3 products max due to WhatsApp button limit
        const displayProducts = products.slice(0, 3);
        
        // Create interactive message with product selection buttons
        const buttons = displayProducts.map(product => ({
            type: 'reply',
            reply: {
                id: `select_product_${product.id}`,
                title: product.name
            }
        }));
        
        // Send product selection message to customer
        await sendWhatsAppMessage(storeId, customerNumber, {
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: `🎁 *Today's Special Offers*\n\nSelect a product to request a discount:`
                },
                action: {
                    buttons: buttons
                }
            }
        }, botConfig);
        
        return {
            success: true,
            message: 'Product selection sent to customer'
        };
    } catch (error) {
        console.error(`[storeId: ${storeId}] Error handling Today's Offer click:`, error);
        // Don't show error to customer
        return {
            success: false,
            message: `Error processing Today's Offer: ${error.message}`
        };
    }
}

/**
 * Handle when customer selects a product for discount
 * @param {string} storeId - The store ID
 * @param {string} ownerNumber - The store owner's WhatsApp number
 * @param {string} customerNumber - The customer's WhatsApp number
 * @param {string} productId - The selected product ID
 * @param {Object} botConfig - Bot configuration
 * @returns {Promise<Object>} Result indicating success or failure
 */
async function handleProductSelection(storeId, ownerNumber, customerNumber, productId, botConfig) {
    try {
        console.log(`[storeId: ${storeId}] Customer ${customerNumber} selected product ${productId} for discount`);
        
        // Get base URL for POS FastAPI
        const baseUrl = botConfig?.posFastapiBaseUrl || process.env.POS_FASTAPI_BASE_URL;
        if (!baseUrl) {
            console.error(`[storeId: ${storeId}] Missing POS FastAPI base URL in both botConfig and environment variables`);
            return { success: false, message: 'Configuration error: Missing API base URL' };
        }
        
        // Fetch the selected product details
        let productDetails;
        try {
            if (productId.startsWith('placeholder_')) {
                // Use placeholder product data
                const placeholderId = productId.split('_')[1];
                productDetails = {
                    id: productId,
                    name: placeholderId === '1' ? 'Standard Package' : 
                          placeholderId === '2' ? 'Premium Package' : 'Deluxe Package',
                    description: 'Special offer from this store',
                    price: placeholderId === '1' ? 10.00 : 
                            placeholderId === '2' ? 20.00 : 30.00,
                    currency: 'USD'
                };
            } else {
                // Fetch real product from API
                const productUrl = `${baseUrl}/stores/${storeId}/products/${productId}`;
                const productResponse = await axios.get(productUrl);
                productDetails = productResponse.data;
            }
        } catch (error) {
            console.error(`[storeId: ${storeId}] Error fetching product details:`, error.response?.data || error.message);
            return { success: false, message: 'Error fetching product details' };
        }
        
        // Send confirmation message to customer
        const customerMessage = {
            type: 'text',
            text: {
                body: `Thank you for your interest in ${productDetails.name}! I've notified the store owner, and they're preparing a special discount for you. Please wait for details.`
            }
        };
        await sendWhatsAppMessage(storeId, customerNumber, customerMessage, botConfig);
        
        // Send discount options to store owner
        if (ownerNumber) {
            const interactiveMessage = {
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: {
                        text: `🔔 Customer (${customerNumber}) is interested in ${productDetails.name} (${productDetails.price} ${productDetails.currency}). Select a discount to offer:`
                    },
                    action: {
                        buttons: [
                            {
                                type: 'reply',
                                reply: {
                                    id: `product_discount_10_${customerNumber}_${productId}`,
                                    title: '10% Discount'
                                }
                            },
                            {
                                type: 'reply',
                                reply: {
                                    id: `product_discount_25_${customerNumber}_${productId}`,
                                    title: '25% Discount'
                                }
                            },
                            {
                                type: 'reply',
                                reply: {
                                    id: `product_discount_0_${customerNumber}_${productId}`,
                                    title: 'No Discount'
                                }
                            }
                        ]
                    }
                }
            };
            await sendWhatsAppMessage(storeId, ownerNumber, interactiveMessage, botConfig);
        }
        
        return {
            success: true,
            message: 'Discount request sent to owner'
        };
    } catch (error) {
        console.error(`[storeId: ${storeId}] Error handling product selection:`, error);
        return {
            success: false,
            message: `Error processing product selection: ${error.message}`
        };
    }
}

/**
 * Handle the owner's selection of a discount for Today's Offer
 * @param {string} storeId - The store ID
 * @param {string} customerNumber - The customer's WhatsApp number
 * @param {number} discountPercentage - The discount percentage (10, 25, 50)
 * @param {Object} botConfig - Bot configuration
 * @returns {Promise<Object>} Result indicating success or failure
 */
async function handleTodaysOfferDiscount(storeId, customerNumber, discountPercentage, botConfig) {
    try {
        // Fetch products for the store (sample for creating an order)
        const baseUrl = botConfig?.posFastapiBaseUrl || process.env.POS_FASTAPI_BASE_URL;
        if (!baseUrl) {
            console.error(`[storeId: ${storeId}] Missing POS FastAPI base URL in both botConfig and environment variables`);
            return { success: false, message: 'Configuration error: Missing API base URL' };
        }
        const productsUrl = `${baseUrl}/stores/${storeId}/products/`;
        const productsResponse = await axios.get(productsUrl);
        let products = productsResponse.data.products || [];
        
        // If no products found, create a default placeholder product for discount flow
        if (products.length === 0) {
            console.log(`[storeId: ${storeId}] No products found, using placeholder product for discount flow`);
            // Use a placeholder product for stores without a product catalog
            products = [{
                id: 'placeholder_product',
                name: 'Store Special',
                description: 'Special offer from this store',
                price: 10.00,
                currency: 'USD'
            }];
        }
        
        // Select the first product for demo purposes
        const selectedProduct = products[0];
        const originalPrice = selectedProduct.price || 10;
        const discountedPrice = originalPrice * (1 - (discountPercentage / 100));
        
        // Note: In a real implementation, we would create an order in the database here
        // For now, we're just sending the offer details to the customer
        
        // Send message to customer with the discounted offer and interactive buy button
        const customerMessage = {
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: `🎉 Great news! The store owner has created a special offer for you:\n\n*${selectedProduct.name}*\nOriginal price: $${originalPrice.toFixed(2)}\n*Discounted price: $${discountedPrice.toFixed(2)}* ${discountPercentage > 0 ? `(${discountPercentage}% OFF)` : ''}`
                },
                action: {
                    buttons: [
                        {
                            type: 'reply',
                            reply: {
                                id: `accept_discount_offer_${selectedProduct.id}_${discountPercentage}`,
                                title: '🛒 Buy Now'
                            }
                        }
                    ]
                }
            }
        };
        
        await sendWhatsAppMessage(storeId, customerNumber, customerMessage, botConfig);
        
        return {
            success: true,
            product: selectedProduct,
            discount: discountPercentage,
            discountedPrice: discountedPrice
        };
    } catch (error) {
        console.error(`[storeId: ${storeId}] Error handling Today's Offer discount:`, error);
        return {
            success: false,
            message: `Error processing discount selection: ${error.message}`
        };
    }
}

/**
 * Handle customer's acceptance of a discount offer by creating an order
 * @param {string} storeId - The store ID
 * @param {string} customerNumber - The customer's WhatsApp number
 * @param {string} productId - The product ID to order
 * @param {number} discountPercentage - The discount percentage
 * @param {Object} botConfig - Bot configuration
 * @returns {Promise<Object>} Result indicating success or failure
 */
async function handleAcceptDiscountOffer(storeId, customerNumber, productId, discountPercentage, botConfig) {
    try {
        // Step 1: Fetch the specific product details
        const baseUrl = botConfig?.posFastapiBaseUrl || process.env.POS_FASTAPI_BASE_URL;
        if (!baseUrl) {
            console.error(`[storeId: ${storeId}] Missing POS FastAPI base URL in both botConfig and environment variables`);
            return { success: false, message: 'Configuration error: Missing API base URL' };
        }
        const productUrl = `${baseUrl}/stores/${storeId}/products/${productId}`;
        let productResponse;
        try {
            // For placeholder product, create a simulated response instead of API call
            if (productId === 'placeholder_product') {
                productResponse = {
                    data: {
                        id: 'placeholder_product',
                        name: 'Store Special',
                        description: 'Special offer from this store',
                        price: 10.00,
                        currency: 'USD'
                    }
                };
            } else {
                productResponse = await axios.get(productUrl);
            }
        } catch (error) {
            console.error(`[storeId: ${storeId}] Error fetching product details:`, error.response?.data || error.message);
            // If API fails, use a default placeholder product
            productResponse = {
                data: {
                    id: productId,
                    name: 'Store Product',
                    description: 'Special offer',
                    price: 10.00,
                    currency: 'USD'
                }
            };
            console.log(`[storeId: ${storeId}] Using fallback product data for ID: ${productId}`);
        }
        
        if (!productResponse?.data) {
            console.error(`[storeId: ${storeId}] No product data found for ID: ${productId}`);
            return { success: false, message: 'Product not found' };
        }
        
        const product = productResponse.data;
        const originalPrice = product.price || 10;
        const discountedPrice = originalPrice * (1 - (discountPercentage / 100));
        
        // Step 2: Create an order via FastAPI
        const orderData = {
            customer: {
                name: `WhatsApp Customer`,
                phone: customerNumber,
                email: ""
            },
            items: [
                {
                    product_id: product.id,
                    name: product.name,
                    quantity: 1,
                    unit_price: discountedPrice,
                    original_price: originalPrice
                }
            ],
            payment_method: "CASH",
            discount_code: discountPercentage > 0 ? `TODAYSOFFER${discountPercentage}` : "",
            discount_percentage: discountPercentage,
            notes: `Order created from Today's Offer with ${discountPercentage}% discount`
        };
        
        // Create the order
        const orderUrl = `${baseUrl}/stores/${storeId}/orders/`;
        let orderResponse;
        try {
            orderResponse = await axios.post(orderUrl, orderData);
        } catch (error) {
            console.error(`[storeId: ${storeId}] Error creating order:`, error);
            return { success: false, message: 'Failed to create order' };
        }
        
        const order = orderResponse.data;
        
        // Step 3: Send confirmation to customer
        const confirmationMessage = {
            type: 'text',
            text: {
                body: `👍 Order created successfully!\n\nOrder #${order.order_id}\n\nProduct: ${product.name}\n${discountPercentage > 0 ? `Discount: ${discountPercentage}% OFF\n` : ''}Price: $${discountedPrice.toFixed(2)}\n\nThank you for your purchase! The store owner has been notified.`
            }
        };
        
        await sendWhatsAppMessage(storeId, customerNumber, confirmationMessage, botConfig);
        
        // Step 4: Notify owner
        const ownerNumber = botConfig.whatsappOwnerNumber;
        if (ownerNumber) {
            const ownerMessage = {
                type: 'text',
                text: {
                    body: `💰 New order received! Order #${order.order_id}\n\nCustomer: ${customerNumber}\nProduct: ${product.name}\n${discountPercentage > 0 ? `Discount: ${discountPercentage}% OFF\n` : ''}Amount: $${discountedPrice.toFixed(2)}`
                }
            };
            
            await sendWhatsAppMessage(storeId, ownerNumber, ownerMessage, botConfig);
        }
        
        return {
            success: true,
            orderId: order.order_id,
            product: product.name,
            amount: discountedPrice
        };
    } catch (error) {
        console.error(`[storeId: ${storeId}] Error handling discount offer acceptance:`, error);
        return {
            success: false,
            message: `Error processing your order: ${error.message}`
        };
    }
}

export {
  isPriceSensitive,
  getDiscountPrompt,
  getActiveCampaigns,
  applyCouponToOrder,
  sendDiscountApprovalRequest,
  handleDiscountResponse,
  calculateOrderTotal,
  createTodaysOfferMessage,
  handleTodaysOfferClick,
  handleProductSelection,
  handleTodaysOfferDiscount,
  handleAcceptDiscountOffer
};
