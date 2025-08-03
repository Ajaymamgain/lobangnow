// WhatsApp Business Catalog Discovery Utility
// This utility helps find the correct catalog ID for your business account

/**
 * Discover available catalogs for the business account
 */
export async function discoverBusinessCatalogs(botConfig) {
    const accessToken = botConfig.whatsappToken;
    const businessId = '3686640811574591'; // Your business management ID
    
    if (!accessToken) {
        console.error('[CatalogDiscovery] No WhatsApp access token available');
        return null;
    }

    try {
        console.log('[CatalogDiscovery] Discovering catalogs for business:', businessId);
        
        // Method 1: Try to get catalogs from business account
        const businessCatalogsUrl = `https://graph.facebook.com/v18.0/${businessId}/owned_product_catalogs`;
        
        console.log('[CatalogDiscovery] Trying business catalogs endpoint:', businessCatalogsUrl);
        
        const businessResponse = await fetch(businessCatalogsUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (businessResponse.ok) {
            const businessData = await businessResponse.json();
            console.log('[CatalogDiscovery] Business catalogs response:', JSON.stringify(businessData, null, 2));
            
            if (businessData.data && businessData.data.length > 0) {
                console.log(`[CatalogDiscovery] Found ${businessData.data.length} catalogs via business endpoint`);
                return businessData.data;
            }
        } else {
            const businessError = await businessResponse.text();
            console.log('[CatalogDiscovery] Business catalogs endpoint failed:', businessError);
        }

        // Method 2: Try to get WhatsApp Business Account catalogs
        console.log('[CatalogDiscovery] Trying WhatsApp Business Account approach...');
        
        // First, get WhatsApp Business Accounts
        const wabsUrl = `https://graph.facebook.com/v18.0/${businessId}/client_whatsapp_business_accounts`;
        
        const wabsResponse = await fetch(wabsUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (wabsResponse.ok) {
            const wabsData = await wabsResponse.json();
            console.log('[CatalogDiscovery] WhatsApp Business Accounts:', JSON.stringify(wabsData, null, 2));
            
            if (wabsData.data && wabsData.data.length > 0) {
                // Try to get catalog from each WhatsApp Business Account
                for (const waba of wabsData.data) {
                    console.log(`[CatalogDiscovery] Checking WABA ${waba.id} for catalogs...`);
                    
                    const wabaCatalogUrl = `https://graph.facebook.com/v18.0/${waba.id}/product_catalogs`;
                    
                    const wabaCatalogResponse = await fetch(wabaCatalogUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (wabaCatalogResponse.ok) {
                        const wabaCatalogData = await wabaCatalogResponse.json();
                        console.log(`[CatalogDiscovery] WABA ${waba.id} catalogs:`, JSON.stringify(wabaCatalogData, null, 2));
                        
                        if (wabaCatalogData.data && wabaCatalogData.data.length > 0) {
                            console.log(`[CatalogDiscovery] Found ${wabaCatalogData.data.length} catalogs via WABA ${waba.id}`);
                            return wabaCatalogData.data;
                        }
                    } else {
                        const wabaError = await wabaCatalogResponse.text();
                        console.log(`[CatalogDiscovery] WABA ${waba.id} catalog check failed:`, wabaError);
                    }
                }
            }
        } else {
            const wabsError = await wabsResponse.text();
            console.log('[CatalogDiscovery] WhatsApp Business Accounts endpoint failed:', wabsError);
        }

        // Method 3: Try to create a new catalog if none exist
        console.log('[CatalogDiscovery] No existing catalogs found, attempting to create one...');
        
        const createCatalogUrl = `https://graph.facebook.com/v18.0/${businessId}/owned_product_catalogs`;
        
        const createResponse = await fetch(createCatalogUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'LobangLah Deals Catalog',
                vertical: 'commerce'
            })
        });

        if (createResponse.ok) {
            const createData = await createResponse.json();
            console.log('[CatalogDiscovery] Successfully created new catalog:', JSON.stringify(createData, null, 2));
            return [{ id: createData.id, name: 'LobangLah Deals Catalog' }];
        } else {
            const createError = await createResponse.text();
            console.log('[CatalogDiscovery] Failed to create catalog:', createError);
        }

        console.log('[CatalogDiscovery] No catalogs found and unable to create one');
        return null;
        
    } catch (error) {
        console.error('[CatalogDiscovery] Error discovering catalogs:', error);
        return null;
    }
}

/**
 * Test catalog access with a specific catalog ID
 */
export async function testCatalogAccess(catalogId, botConfig) {
    const accessToken = botConfig.whatsappToken;
    
    if (!accessToken) {
        console.error('[CatalogDiscovery] No WhatsApp access token available');
        return false;
    }

    try {
        console.log(`[CatalogDiscovery] Testing access to catalog: ${catalogId}`);
        
        const catalogUrl = `https://graph.facebook.com/v18.0/${catalogId}/products?limit=1`;
        
        const response = await fetch(catalogUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`[CatalogDiscovery] Catalog ${catalogId} is accessible:`, JSON.stringify(data, null, 2));
            return true;
        } else {
            const errorData = await response.text();
            console.log(`[CatalogDiscovery] Catalog ${catalogId} access failed:`, errorData);
            return false;
        }
        
    } catch (error) {
        console.error(`[CatalogDiscovery] Error testing catalog ${catalogId}:`, error);
        return false;
    }
}

/**
 * Get detailed information about a catalog
 */
export async function getCatalogInfo(catalogId, botConfig) {
    const accessToken = botConfig.whatsappToken;
    
    if (!accessToken) {
        console.error('[CatalogDiscovery] No WhatsApp access token available');
        return null;
    }

    try {
        console.log(`[CatalogDiscovery] Getting info for catalog: ${catalogId}`);
        
        const catalogUrl = `https://graph.facebook.com/v18.0/${catalogId}?fields=id,name,product_count,vertical`;
        
        const response = await fetch(catalogUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`[CatalogDiscovery] Catalog ${catalogId} info:`, JSON.stringify(data, null, 2));
            return data;
        } else {
            const errorData = await response.text();
            console.log(`[CatalogDiscovery] Failed to get catalog ${catalogId} info:`, errorData);
            return null;
        }
        
    } catch (error) {
        console.error(`[CatalogDiscovery] Error getting catalog ${catalogId} info:`, error);
        return null;
    }
}
