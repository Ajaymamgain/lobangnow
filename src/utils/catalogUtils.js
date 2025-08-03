// WhatsApp Business Catalog Utilities for Deals
import { createIndividualDealMessages } from './dealsUtils.js';

// Use the specific catalog ID requested by user: "Lobanglah Deals"
let WHATSAPP_CATALOG_ID = '1450842082483117';
const BUSINESS_MANAGEMENT_ID = '3686640811574591'; // Your business management ID

// Flag to track if catalog is accessible


/**
 * Discover and set the correct catalog ID for the business account
 */
async function discoverCatalogId(botConfig) {
    if (WHATSAPP_CATALOG_ID) {
        return WHATSAPP_CATALOG_ID; // Already discovered
    }
    
    try {
        const accessToken = botConfig.whatsappToken;
        if (!accessToken) {
            console.error('[Catalog] No WhatsApp access token available for catalog discovery');
            return null;
        }

        console.log('[Catalog] Discovering catalog ID for business:', BUSINESS_MANAGEMENT_ID);
        
        // Try to get catalogs from business account
        const businessCatalogsUrl = `https://graph.facebook.com/v18.0/${BUSINESS_MANAGEMENT_ID}/owned_product_catalogs`;
        
        const response = await fetch(businessCatalogsUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('[Catalog] Business catalogs response:', JSON.stringify(data, null, 2));
            
            if (data.data && data.data.length > 0) {
                // Prioritize "Lobanglah Deals" catalog (1450842082483117) if available
                let catalogId = data.data.find(catalog => catalog.id === '1450842082483117')?.id;
                if (!catalogId) {
                    // Fallback to first available catalog if Lobanglah Deals not found
                    catalogId = data.data[0].id;
                }
                console.log(`[Catalog] Found catalog ID: ${catalogId}`);
                console.log(`[Catalog] Catalog name: ${data.data.find(c => c.id === catalogId)?.name || 'Unknown'}`);
                
                // Test if this catalog is accessible
                const testUrl = `https://graph.facebook.com/v18.0/${catalogId}/products?limit=1`;
                const testResponse = await fetch(testUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (testResponse.ok) {
                    WHATSAPP_CATALOG_ID = catalogId;
                    console.log(`[Catalog] Successfully set catalog ID: ${catalogId}`);
                    return catalogId;
                } else {
                    const testError = await testResponse.text();
                    console.error(`[Catalog] Catalog ${catalogId} is not accessible:`, testError);
                }
            }
        } else {
            const errorData = await response.text();
            console.error('[Catalog] Failed to discover catalogs:', errorData);
        }
        
        console.log('[Catalog] No accessible catalog found, will need manual configuration');
        return null;
        
    } catch (error) {
        console.error('[Catalog] Error discovering catalog ID:', error);
        return null;
    }
}

/**
 * Add a deal to WhatsApp Business Catalog as a product
 */
export async function addDealToCatalog(deal, index, botConfig) {
    try {
        const accessToken = botConfig.whatsappToken;
        if (!accessToken) {
            console.error('[Catalog] WhatsApp access token not available');
            return null;
        }

        // Generate unique product retailer ID for this deal
        const productRetailerId = `deal_${Date.now()}_${index}`;
        
        // Extract deal information
        const businessName = deal.businessName || deal.restaurant || deal.store || deal.title || 'Deal';
        const offer = deal.offer || deal.discount || 'Special Deal';
        const address = deal.address || deal.location || 'Address not available';
        const description = deal.description || deal.fullDescription || 'Great deal available!';
        const dealImage = deal.image || deal.imageUrl || deal.img;
        
        // WhatsApp Catalog API requires image_url - skip deals without images
        if (!dealImage) {
            console.log(`[Catalog] Skipping deal ${index} - no image available (required by WhatsApp Catalog API)`);
            return null;
        }
        
        // Extract price from deal or use default
        const dealPrice = deal.price || deal.originalPrice || deal.cost || 'Free';
        // Convert price to number format for API (remove currency symbols and text)
        let priceValue = 0;
        if (typeof dealPrice === 'string') {
            const priceMatch = dealPrice.match(/([0-9]+\.?[0-9]*)/); 
            priceValue = priceMatch ? parseFloat(priceMatch[1]) * 100 : 100; // Convert to cents, default $1.00
        } else if (typeof dealPrice === 'number') {
            priceValue = dealPrice * 100; // Convert to cents
        } else {
            priceValue = 100; // Default $1.00 in cents
        }

        // Create product data for catalog
        const productData = {
            retailer_id: productRetailerId,
            name: businessName.length > 100 ? businessName.substring(0, 97) + '...' : businessName,
            description: `${offer}\n\n${description}\n\n📍 ${address}`.length > 9000 ? 
                `${offer}\n\n${description.substring(0, 8900)}...\n\n📍 ${address}` : 
                `${offer}\n\n${description}\n\n📍 ${address}`,
            category: 'deals',
            price: priceValue, // Price in cents as required by API
            currency: 'SGD',
            availability: 'in stock',
            condition: 'new'
        };

        // Add image if available
        if (dealImage) {
            productData.image_url = dealImage;
        }

        // Add product to catalog via WhatsApp Business API
        const catalogUrl = `https://graph.facebook.com/v18.0/${WHATSAPP_CATALOG_ID}/products`;
        
        const response = await fetch(catalogUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productData)
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`[Catalog] Failed to add product to catalog:`, errorData);
            return null;
        }

        const result = await response.json();
        console.log(`[Catalog] Successfully added deal to catalog:`, productRetailerId);
        
        return {
            productRetailerId,
            catalogProductId: result.id,
            dealData: deal
        };
        
    } catch (error) {
        console.error('[Catalog] Error adding deal to catalog:', error);
        return null;
    }
}

/**
 * Create a product list message using WhatsApp Business Catalog
 */
export function createProductListMessage(catalogProducts, category) {
    let categoryEmoji, categoryName;
    if (category === 'food') {
        categoryEmoji = '🍕';
        categoryName = 'Food';
    } else if (category === 'clothes') {
        categoryEmoji = '👕';
        categoryName = 'Fashion';
    } else if (category === 'groceries') {
        categoryEmoji = '🛒';
        categoryName = 'Groceries';
    } else {
        categoryEmoji = '🎯';
        categoryName = 'Deals';
    }
    
    if (!catalogProducts || catalogProducts.length === 0) {
        return {
            type: "text",
            text: {
                body: `😅 Sorry, I couldn't find any ${categoryName.toLowerCase()} deals right now. Please try again later!`
            }
        };
    }
    
    // Create product items for the catalog
    const productItems = catalogProducts.map(product => ({
        product_retailer_id: product.productRetailerId
    }));
    
    // Create the product list message
    const productListMessage = {
        type: "interactive",
        interactive: {
            type: "product_list",
            header: {
                type: "text",
                text: `${categoryEmoji} ${categoryName} Deals Found!`
            },
            body: {
                text: `🎉 Found ${catalogProducts.length} amazing ${categoryName.toLowerCase()} deals for you!\n\n✨ Tap on any deal below to view full details, get directions, and take action. Each deal includes business information, offers, and location details.\n\n🛍️ Happy deal hunting!`
            },
            footer: {
                text: "🔍 Sources: Instagram, Facebook, TikTok & Web | LobangLah 🎯"
            },
            action: {
                catalog_id: WHATSAPP_CATALOG_ID,
                sections: [{
                    title: "Available Deals",
                    product_items: productItems
                }]
            }
        },
        // Store catalog product data for reference
        catalogData: {
            catalogId: WHATSAPP_CATALOG_ID,
            products: catalogProducts,
            category: category
        }
    };
    
    return productListMessage;
}

/**
 * Test if catalog is accessible
 */
export async function testCatalogAccessibility(botConfig) {
    
    try {
        const accessToken = botConfig.whatsappToken;
        if (!accessToken) {
            console.log('[Catalog] No WhatsApp access token available');
            return false;
        }

        // First, try to discover the correct catalog ID
        const catalogId = await discoverCatalogId(botConfig);
        if (!catalogId) {
            console.log('[Catalog] No catalog ID available after discovery');
            return false;
        }

        // Test catalog access by trying to list products
        const catalogUrl = `https://graph.facebook.com/v18.0/${catalogId}/products?limit=1`;
        
        const response = await fetch(catalogUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log('[Catalog] Catalog is accessible');
            return true;
        } else {
            const errorData = await response.text();
            console.error(`[Catalog] Catalog access test failed with status ${response.status}:`, errorData);
            
            // Parse and explain common errors
            try {
                const errorObj = JSON.parse(errorData);
                if (errorObj.error) {
                    const errorType = errorObj.error.type;
                    const errorMessage = errorObj.error.message;
                    const errorCode = errorObj.error.code;
                    
                    console.error(`[Catalog] Error Details:`);
                    console.error(`  - Type: ${errorType}`);
                    console.error(`  - Code: ${errorCode}`);
                    console.error(`  - Message: ${errorMessage}`);
                    
                    // Explain common error causes
                    if (errorType === 'OAuthException' && errorCode === 190) {
                        console.error(`[Catalog] DIAGNOSIS: Invalid WhatsApp Business API token`);
                        console.error(`  - Token may be expired or invalid`);
                        console.error(`  - Token may not have catalog permissions`);
                        console.error(`  - Check botConfig.whatsappToken in DynamoDB`);
                    } else if (errorCode === 100) {
                        console.error(`[Catalog] DIAGNOSIS: Invalid catalog ID or permissions`);
                        console.error(`  - Catalog ID '${WHATSAPP_CATALOG_ID}' may not exist`);
                        console.error(`  - Token may not have access to this catalog`);
                    }
                }
            } catch (parseError) {
                console.error(`[Catalog] Could not parse error response:`, parseError.message);
            }
            
            return false;
        }
        
    } catch (error) {
        console.log('[Catalog] Error testing catalog access:', error.message);
        return false;
    }
}

/**
 * Create deals message using catalog with automatic fallback to interactive list
 */
export async function createCatalogDealsMessage(deals, category, botConfig) {
    try {
        console.log(`[Catalog] Creating deals message for ${deals.length} deals`);
        
        // First, test if catalog is accessible
        const isCatalogAccessible = await testCatalogAccessibility(botConfig);
        
        if (!isCatalogAccessible) {
            console.log('[Catalog] Catalog not accessible, using individual messages fallback');
            return createIndividualDealMessages(deals, category, []);
        }
        
        console.log('[Catalog] Catalog accessible, attempting to add deals to catalog');
        
        // Add each deal to the catalog
        const catalogProducts = [];
        
        for (let i = 0; i < Math.min(deals.length, 10); i++) {
            const deal = deals[i];
            const catalogProduct = await addDealToCatalog(deal, i, botConfig);
            
            if (catalogProduct) {
                catalogProducts.push(catalogProduct);
            } else {
                console.warn(`[Catalog] Failed to add deal ${i} to catalog, skipping`);
            }
            
            // Small delay to avoid rate limiting
            if (i < deals.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        if (catalogProducts.length === 0) {
            console.log('[Catalog] No deals could be added to catalog, falling back to individual messages');
            return createIndividualDealMessages(deals, category, []);
        }
        
        console.log(`[Catalog] Successfully added ${catalogProducts.length} deals to catalog`);
        
        // Create and return the product list message
        const productListMessage = createProductListMessage(catalogProducts, category);
        
        // Return as array for compatibility with existing code
        return [productListMessage];
        
    } catch (error) {
        console.error('[Catalog] Error creating catalog deals message:', error);
        // Fallback to individual messages if catalog approach fails
        console.log('[Catalog] Falling back to individual messages due to error');
        return createIndividualDealMessages(deals, category, []);
    }
}

/**
 * Clean up old deals from catalog to prevent clutter
 */
export async function cleanupOldDealsFromCatalog(botConfig, maxAge = 24 * 60 * 60 * 1000) {
    try {
        const accessToken = botConfig.whatsappToken;
        if (!accessToken) {
            console.error('[Catalog] WhatsApp access token not available for cleanup');
            return;
        }

        // Get all products from catalog
        const catalogUrl = `https://graph.facebook.com/v18.0/${WHATSAPP_CATALOG_ID}/products`;
        
        const response = await fetch(catalogUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('[Catalog] Failed to fetch catalog products for cleanup');
            return;
        }

        const result = await response.json();
        const products = result.data || [];
        
        // Filter products that are old deals (based on retailer_id pattern)
        const currentTime = Date.now();
        const oldDeals = products.filter(product => {
            if (!product.retailer_id || !product.retailer_id.startsWith('deal_')) {
                return false;
            }
            
            // Extract timestamp from retailer_id (format: deal_timestamp_index)
            const parts = product.retailer_id.split('_');
            if (parts.length < 2) return false;
            
            const timestamp = parseInt(parts[1]);
            return (currentTime - timestamp) > maxAge;
        });
        
        console.log(`[Catalog] Found ${oldDeals.length} old deals to cleanup`);
        
        // Delete old deals from catalog
        for (const oldDeal of oldDeals) {
            try {
                const deleteUrl = `https://graph.facebook.com/v18.0/${oldDeal.id}`;
                
                const deleteResponse = await fetch(deleteUrl, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                if (deleteResponse.ok) {
                    console.log(`[Catalog] Deleted old deal: ${oldDeal.retailer_id}`);
                } else {
                    console.warn(`[Catalog] Failed to delete old deal: ${oldDeal.retailer_id}`);
                }
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`[Catalog] Error deleting old deal ${oldDeal.retailer_id}:`, error);
            }
        }
        
    } catch (error) {
        console.error('[Catalog] Error during catalog cleanup:', error);
    }
}
