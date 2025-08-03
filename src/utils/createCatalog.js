// WhatsApp Business Catalog Creation Utility

/**
 * Create a WhatsApp Business Catalog
 */
export async function createWhatsAppCatalog(botConfig) {
    try {
        const accessToken = botConfig.whatsappToken;
        if (!accessToken) {
            console.error('[Catalog] WhatsApp access token not available');
            return null;
        }

        // Get the WhatsApp Business Account ID from the token or config
        const wbaId = botConfig.whatsappBusinessAccountId;
        if (!wbaId) {
            console.error('[Catalog] WhatsApp Business Account ID not available');
            return null;
        }

        // Create catalog data
        const catalogData = {
            name: "LobangLah Deals Catalog",
            vertical: "commerce"
        };

        // Create catalog via WhatsApp Business API
        const catalogUrl = `https://graph.facebook.com/v18.0/${wbaId}/owned_product_catalogs`;
        
        const response = await fetch(catalogUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(catalogData)
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`[Catalog] Failed to create catalog:`, errorData);
            return null;
        }

        const result = await response.json();
        console.log(`[Catalog] Successfully created catalog:`, result.id);
        
        return {
            catalogId: result.id,
            name: catalogData.name,
            vertical: catalogData.vertical
        };
        
    } catch (error) {
        console.error('[Catalog] Error creating catalog:', error);
        return null;
    }
}

/**
 * List existing WhatsApp Business Catalogs
 */
export async function listWhatsAppCatalogs(botConfig) {
    try {
        const accessToken = botConfig.whatsappToken;
        if (!accessToken) {
            console.error('[Catalog] WhatsApp access token not available');
            return null;
        }

        // Get the WhatsApp Business Account ID from the token or config
        const wbaId = botConfig.whatsappBusinessAccountId;
        if (!wbaId) {
            console.error('[Catalog] WhatsApp Business Account ID not available');
            return null;
        }

        // List catalogs via WhatsApp Business API
        const catalogUrl = `https://graph.facebook.com/v18.0/${wbaId}/owned_product_catalogs`;
        
        const response = await fetch(catalogUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`[Catalog] Failed to list catalogs:`, errorData);
            return null;
        }

        const result = await response.json();
        console.log(`[Catalog] Found ${result.data?.length || 0} catalogs`);
        
        return result.data || [];
        
    } catch (error) {
        console.error('[Catalog] Error listing catalogs:', error);
        return null;
    }
}

/**
 * Test catalog access and permissions
 */
export async function testCatalogAccess(catalogId, botConfig) {
    try {
        const accessToken = botConfig.whatsappToken;
        if (!accessToken) {
            console.error('[Catalog] WhatsApp access token not available');
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

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`[Catalog] Catalog access test failed:`, errorData);
            return false;
        }

        const result = await response.json();
        console.log(`[Catalog] Catalog access test successful. Found ${result.data?.length || 0} products`);
        
        return true;
        
    } catch (error) {
        console.error('[Catalog] Error testing catalog access:', error);
        return false;
    }
}
