// Enhanced Deal Message Utilities with Google Places Photos and AI Poster Generation
import { getPlacePhotoUrl, findMatchingPlace } from './googleLocationUtils.js';
import { singaporeSlang, formatSingaporeDeal, rankSingaporeDeals } from './singaporeFeatures.js';
import { getOrCreateRestaurantFromPlaces, saveRestaurantDetails } from './restaurantUtils.js';
import { createRestaurantTemplateMessage, createSimpleInteractiveMessage } from './whatsappTemplateUtils.js';
// Removed canvas-dependent poster utilities to avoid native module build

/**
 * Enhance individual deal messages with Google Places photos
 * @param {Array} deals - Array of deal objects
 * @param {Array} nearbyPlacesDetailed - Array of detailed place objects from Google Places API
 * @param {string} googleMapsApiKey - Google Maps API key for photo URLs
 * @returns {Array} - Enhanced deals with photo URLs
 */
export async function enhanceDealsWithPhotos(deals, nearbyPlacesDetailed, googleMapsApiKey) {
    if (!deals || !googleMapsApiKey) {
        console.log('[EnhancedDeals] Missing deals or API key, returning original deals');
        return deals;
    }
    if (!nearbyPlacesDetailed || nearbyPlacesDetailed.length === 0) {
        console.log('[EnhancedDeals] No nearby places provided, cannot enhance with photos.');
        return deals;
    }

    console.log(`[EnhancedDeals] Starting photo enhancement for ${deals.length} deals.`);
    console.log(`[EnhancedDeals] Nearby places available: ${JSON.stringify(nearbyPlacesDetailed.map(p => p.name))}`);

    const enhancedDeals = [];
    
    for (const deal of deals) {
        console.log(`\n[EnhancedDeals] --- Processing Deal: "${deal.businessName || deal.title}" ---`);
        try {
            const businessName = extractBusinessName(deal);
            if (!businessName) {
                console.log(`[EnhancedDeals] Could not extract business name. Skipping photo enhancement.`);
                enhancedDeals.push(deal);
                continue;
            }

            const matchingPlace = findMatchingPlace(businessName, nearbyPlacesDetailed);

            if (!matchingPlace) {
                console.log(`[EnhancedDeals] No matching place found for "${businessName}".`);
                enhancedDeals.push(deal);
                continue;
            }

            console.log(`[EnhancedDeals] Matched "${businessName}" with place: "${matchingPlace.name}".`);
            console.log(`[EnhancedDeals] Place has photos: ${!!matchingPlace.photos && matchingPlace.photos.length > 0}`);

            const photoUrl = getBestPhotoUrl(matchingPlace, googleMapsApiKey);

            // Save restaurant details to DynamoDB
            try {
                const restaurantData = {
                    placeId: matchingPlace.placeId,
                    name: matchingPlace.name,
                    category: deal.category || 'restaurant',
                    address: matchingPlace.vicinity,
                    phone: matchingPlace.phone,
                    website: matchingPlace.website,
                    rating: matchingPlace.rating,
                    priceLevel: matchingPlace.priceLevel,
                    openingHours: matchingPlace.openingHours,
                    photos: matchingPlace.photos || [],
                    coordinates: {
                        latitude: matchingPlace.geometry?.location?.lat,
                        longitude: matchingPlace.geometry?.location?.lng
                    },
                    deals: [deal]
                };
                
                await saveRestaurantDetails(restaurantData);
                console.log(`[EnhancedDeals] Saved restaurant details for: ${matchingPlace.name}`);
                
            } catch (error) {
                console.error(`[EnhancedDeals] Error saving restaurant details:`, error);
            }

            if (photoUrl) {
                console.log(`[EnhancedDeals] SUCCESS: Found photo URL for "${matchingPlace.name}".`);
                enhancedDeals.push({ 
                    ...deal, 
                    photoUrl, 
                    placeName: matchingPlace.name, 
                    placeRating: matchingPlace.rating, 
                    placeVicinity: matchingPlace.vicinity,
                    placeId: matchingPlace.placeId
                });
            } else {
                console.log(`[EnhancedDeals] No usable photo URL found for "${matchingPlace.name}".`);
                // Still return place details even if no photo
                enhancedDeals.push({ 
                    ...deal, 
                    placeName: matchingPlace.name, 
                    placeRating: matchingPlace.rating, 
                    placeVicinity: matchingPlace.vicinity,
                    placeId: matchingPlace.placeId
                });
            }
        } catch (error) {
            console.error(`[EnhancedDeals] Error enhancing deal: "${deal.title}"`, error);
            enhancedDeals.push(deal);
        }
    }

    const dealsWithPhotos = enhancedDeals.filter(deal => deal.photoUrl).length;
    console.log(`[EnhancedDeals] --- Enhancement Complete: ${dealsWithPhotos} of ${deals.length} deals have photos ---`);

    return enhancedDeals;
}

/**
 * Extract business name from deal object
 * @param {Object} deal - Deal object
 * @returns {string|null} - Business name or null
 */
function extractBusinessName(deal) {
    // Try different fields where business name might be stored
    if (deal.businessName) return deal.businessName;
    if (deal.business) return deal.business;
    if (deal.store) return deal.store;
    if (deal.merchant) return deal.merchant;
    if (deal.vendor) return deal.vendor;
    
    // Try to extract from title or description
    if (deal.title) {
        // Look for patterns like "Business Name - Deal" or "Deal at Business Name"
        const titleMatch = deal.title.match(/^([^-]+?)\s*-\s*/) || 
                          deal.title.match(/at\s+([^,]+?)(?:\s*[,.]|$)/i) ||
                          deal.title.match(/from\s+([^,]+?)(?:\s*[,.]|$)/i);
        if (titleMatch) return titleMatch[1].trim();
    }
    
    if (deal.description) {
        // Look for business names in description
        const descMatch = deal.description.match(/at\s+([^,]+?)(?:\s*[,.]|$)/i) ||
                         deal.description.match(/from\s+([^,]+?)(?:\s*[,.]|$)/i);
        if (descMatch) return descMatch[1].trim();
    }
    
    return null;
}

/**
 * Get the best photo URL for a place
 * @param {Object} place - Place object with photos array
 * @param {string} googleMapsApiKey - Google Maps API key
 * @returns {string|null} - Photo URL or null
 */
function getBestPhotoUrl(place, googleMapsApiKey) {
    if (!place.photos || place.photos.length === 0) {
        return null;
    }
    
    // Sort photos by size (larger is better) and get the first one
    const sortedPhotos = place.photos.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const bestPhoto = sortedPhotos[0];
    
    // Handle both old and new API formats
    const photoReference = bestPhoto.photo_reference || bestPhoto.name;
    return getPlacePhotoUrl(photoReference, 400, googleMapsApiKey);
}

/**
 * Create enhanced WhatsApp messages with photos for individual deals
 * @param {Array} enhancedDeals - Deals enhanced with photo URLs
 * @param {string} category - Deal category
 * @returns {Array} - Array of WhatsApp message objects
 */
export function createEnhancedDealMessages(enhancedDeals, category, googleMapsApiKey = null) {
    if (!enhancedDeals || enhancedDeals.length === 0) {
        return [];
    }

    console.log(`[EnhancedDeals] Creating enhanced messages for ${enhancedDeals.length} ${category} deals`);

    // Rank deals using Singapore-specific criteria
    const rankedDeals = rankSingaporeDeals(enhancedDeals, category);
    console.log(`[EnhancedDeals] Ranked ${rankedDeals.length} deals using Singapore criteria`);

    // Get category-specific emoji
    const categoryEmoji = {
        'food': '🍽️',
        'fashion': '👗',
        'events': '🎉',
        'groceries': '🛒',
        'beauty': '💄',
        'electronics': '📱',
        'home': '🏠'
    }[category.toLowerCase()] || '🎯';

    const messages = rankedDeals.map((deal, index) => {
        try {
            // Format deal with Singapore-specific context
            const singaporeDeal = formatSingaporeDeal(deal, category);
            
            // Create restaurant object for template
            const restaurant = {
                placeId: deal.placeId,
                name: deal.placeName || deal.businessName || 'Restaurant',
                address: deal.placeVicinity || deal.address || 'Location available',
                phone: deal.phone,
                website: deal.website,
                rating: deal.placeRating,
                coordinates: deal.coordinates,
                photos: deal.photos || []
            };
            
            // Try to create template message first
            const templateMessage = createRestaurantTemplateMessage(restaurant, singaporeDeal, category);
            
            if (templateMessage) {
                return templateMessage;
            }
            
            // Fallback to simple interactive message
            return createSimpleInteractiveMessage(restaurant, singaporeDeal, category, googleMapsApiKey);
        } catch (error) {
            console.error(`[EnhancedDeals] Error creating message for deal ${index}:`, error);
            return {
                type: 'text',
                text: {
                    body: `🎯 ${deal.title || deal.offer || 'Great Deal Available!'}`
                }
            };
        }
    });

    const messagesWithPhotos = messages.filter(msg => msg.interactive && msg.interactive.header && msg.interactive.header.type === 'image').length;
    const interactiveMessages = messages.filter(msg => msg.type === 'interactive').length;
    console.log(`[EnhancedDeals] Created ${messages.length} interactive messages: ${messagesWithPhotos} with photos, ${interactiveMessages} total interactive`);

    return messages;
}

/**
 * Create AI-generated poster for deals using Flux Schnell
 * @param {Array} deals - Array of deal objects
 * @param {Object} botConfig - Bot configuration with API keys
 * @param {Object} options - Poster generation options
 * @returns {Array} - Array of poster data objects
 */
export async function createDealPosters(deals, botConfig, options = {}) {
    if (!deals || deals.length === 0) {
        console.log('[EnhancedDeals] No deals provided for poster generation');
        return [];
    }

    console.log(`[EnhancedDeals] Creating AI posters for ${deals.length} deals`);
    const posters = [];

    // Limit to top 3 deals for poster generation (cost optimization)
    const topDeals = deals.slice(0, 3);
    
    for (const [index, deal] of topDeals.entries()) {
        try {
            console.log(`[EnhancedDeals] Generating poster ${index + 1}/${topDeals.length} for: ${deal.businessName || deal.title}`);
            
            // Select style based on deal category
            const posterStyle = selectPosterStyle(deal);
            
            const posterData = await generateDealPoster(deal, botConfig, {
                style: posterStyle,
                aspectRatio: options.aspectRatio || "9:16",
                ...options
            });
            
            if (posterData) {
                posters.push({
                    ...posterData,
                    dealIndex: index,
                    dealId: deal.dealId || `deal_${index}`,
                    businessName: deal.businessName || deal.title
                });
                console.log(`[EnhancedDeals] ✅ Poster generated for ${deal.businessName || deal.title}`);
            } else {
                console.log(`[EnhancedDeals] ❌ Failed to generate poster for ${deal.businessName || deal.title}`);
            }
            
        } catch (error) {
            console.error(`[EnhancedDeals] Error generating poster for deal ${index}:`, error.message);
        }
    }
    
    console.log(`[EnhancedDeals] Successfully generated ${posters.length} posters out of ${topDeals.length} deals`);
    return posters;
}

/**
 * Select appropriate poster style based on deal characteristics
 */
function selectPosterStyle(deal) {
    const category = deal.category?.toLowerCase() || '';
    const businessName = (deal.businessName || deal.title || '').toLowerCase();
    
    // Singapore-specific businesses get singapore style
    if (businessName.includes('hawker') || businessName.includes('kopitiam') || businessName.includes('mrt') || 
        businessName.includes('singapore') || deal.location?.toLowerCase().includes('singapore')) {
        return 'singapore';
    }
    
    // Style mapping by category
    const styleMapping = {
        food: 'vibrant',
        fashion: 'elegant', 
        events: 'modern',
        shopping: 'vibrant',
        services: 'modern',
        entertainment: 'vibrant'
    };
    
    return styleMapping[category] || 'modern';
}

/**
 * Enhanced deal messages with AI poster integration
 * @param {Array} deals - Array of deal objects
 * @param {string} category - Deal category
 * @param {Object} botConfig - Bot configuration
 * @param {Object} options - Options including poster generation
 * @returns {Object} - Enhanced messages with poster URLs
 */
export async function createEnhancedDealMessagesWithPosters(deals, category, botConfig, options = {}) {
    const results = {
        messages: [],
        posters: [],
        success: false
    };
    
    try {
        // Generate regular enhanced messages
        const enhancedMessages = await createEnhancedDealMessages(deals, [], null, category);
        results.messages = enhancedMessages;
        
        // Generate AI posters if enabled
        if (options.generatePosters && botConfig.replicateApiToken) {
            console.log('[EnhancedDeals] Generating AI posters for deals...');
            const posters = await createDealPosters(deals, botConfig, options);
            results.posters = posters;
            
            // Add poster information to messages if available
            if (posters.length > 0) {
                console.log(`[EnhancedDeals] Adding ${posters.length} poster references to messages`);
                results.messages = enhancedMessages.map((message, index) => {
                    const matchingPoster = posters.find(p => p.dealIndex === index);
                    if (matchingPoster) {
                        return {
                            ...message,
                            posterUrl: matchingPoster.url,
                            posterStyle: matchingPoster.style
                        };
                    }
                    return message;
                });
            }
        }
        
        results.success = true;
        console.log(`[EnhancedDeals] Successfully created enhanced messages with ${results.posters.length} posters`);
        
    } catch (error) {
        console.error('[EnhancedDeals] Error creating enhanced messages with posters:', error.message);
        results.messages = deals.map(deal => ({
            type: 'text',
            text: { body: `🎯 ${deal.title || deal.offer || 'Great Deal Available!'}` }
        }));
    }
    
    return results;
}

/**
 * Send AI-generated deal poster for a specific deal
 * @param {string} storeId - Store identifier
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} deal - Deal object
 * @param {Object} botConfig - Bot configuration
 * @param {Object} options - Poster options
 * @returns {boolean} - Success status
 */
export async function sendDealPosterToUser(storeId, phoneNumber, deal, botConfig, options = {}) {
    try {
        console.log(`[EnhancedDeals] Sending AI poster for: ${deal.businessName || deal.title} to ${phoneNumber}`);
        
        const posterStyle = options.style || selectPosterStyle(deal);
        
        const success = await generateAndSendDealPoster(storeId, phoneNumber, deal, botConfig, {
            style: posterStyle,
            aspectRatio: "9:16",
            ...options
        });
        
        if (success) {
            console.log(`[EnhancedDeals] ✅ Successfully sent poster for ${deal.businessName || deal.title}`);
            return true;
        } else {
            console.log(`[EnhancedDeals] ❌ Failed to send poster for ${deal.businessName || deal.title}`);
            return false;
        }
        
    } catch (error) {
        console.error(`[EnhancedDeals] Error sending deal poster:`, error.message);
        return false;
    }
}
