// Enhanced Deal Message Utilities with Google Places Photos
import { getPlacePhotoUrl, findMatchingPlace } from './googleLocationUtils.js';

/**
 * Enhance individual deal messages with Google Places photos
 * @param {Array} deals - Array of deal objects
 * @param {Array} nearbyPlacesDetailed - Array of detailed place objects from Google Places API
 * @param {string} googleMapsApiKey - Google Maps API key for photo URLs
 * @returns {Array} - Enhanced deals with photo URLs
 */
export function enhanceDealsWithPhotos(deals, nearbyPlacesDetailed, googleMapsApiKey) {
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

    const enhancedDeals = deals.map(deal => {
        console.log(`\n[EnhancedDeals] --- Processing Deal: "${deal.businessName || deal.title}" ---`);
        try {
            const businessName = extractBusinessName(deal);
            if (!businessName) {
                console.log(`[EnhancedDeals] Could not extract business name. Skipping photo enhancement.`);
                return deal;
            }

            const matchingPlace = findMatchingPlace(businessName, nearbyPlacesDetailed);

            if (!matchingPlace) {
                console.log(`[EnhancedDeals] No matching place found for "${businessName}".`);
                return deal;
            }

            console.log(`[EnhancedDeals] Matched "${businessName}" with place: "${matchingPlace.name}".`);
            console.log(`[EnhancedDeals] Place has photos: ${!!matchingPlace.photos && matchingPlace.photos.length > 0}`);

            const photoUrl = getBestPhotoUrl(matchingPlace, googleMapsApiKey);

            if (photoUrl) {
                console.log(`[EnhancedDeals] SUCCESS: Found photo URL for "${matchingPlace.name}".`);
                return { 
                    ...deal, 
                    photoUrl, 
                    placeName: matchingPlace.name, 
                    placeRating: matchingPlace.rating, 
                    placeVicinity: matchingPlace.vicinity 
                };
            } else {
                console.log(`[EnhancedDeals] No usable photo URL found for "${matchingPlace.name}".`);
                // Still return place details even if no photo
                return { 
                    ...deal, 
                    placeName: matchingPlace.name, 
                    placeRating: matchingPlace.rating, 
                    placeVicinity: matchingPlace.vicinity 
                };
            }
        } catch (error) {
            console.error(`[EnhancedDeals] Error enhancing deal: "${deal.title}"`, error);
            return deal;
        }
    });

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
    
    return getPlacePhotoUrl(bestPhoto.photo_reference, 400, googleMapsApiKey);
}

/**
 * Create enhanced WhatsApp messages with photos for individual deals
 * @param {Array} enhancedDeals - Deals enhanced with photo URLs
 * @param {string} category - Deal category
 * @returns {Array} - Array of WhatsApp message objects
 */
export function createEnhancedDealMessages(enhancedDeals, category) {
    if (!enhancedDeals || enhancedDeals.length === 0) {
        return [];
    }

    console.log(`[EnhancedDeals] Creating enhanced messages for ${enhancedDeals.length} ${category} deals`);

    // Get category-specific emoji
    const categoryEmoji = {
        'food': '🍽️',
        'fashion': '👗',
        'groceries': '🛒',
        'beauty': '💄',
        'electronics': '📱',
        'home': '🏠'
    }[category.toLowerCase()] || '🎯';

    const messages = enhancedDeals.map((deal, index) => {
        try {
            // Create an engaging header with emojis and formatting
            let messageText = `${categoryEmoji} *AMAZING ${category.toUpperCase()} DEAL!* ${categoryEmoji}\n\n`;
            
            // Add fun title with emoji
            messageText += `🎯 *${deal.title || deal.offer}*\n\n`;
            
            if (deal.description) {
                // Add description with some formatting
                messageText += `${deal.description}\n\n`;
            }
            
            // Add place information if available with enhanced formatting
            if (deal.placeName) {
                messageText += `📍 *${deal.placeName}*`;
                if (deal.placeRating) {
                    const starCount = Math.round(parseFloat(deal.placeRating));
                    const stars = '⭐'.repeat(Math.min(starCount, 5));
                    messageText += ` ${stars} (${deal.placeRating})`;
                }
                if (deal.placeVicinity) {
                    messageText += `\n📍 ${deal.placeVicinity}`;
                }
                messageText += '\n\n';
            }
            
            if (deal.price) {
                messageText += `💰 *${deal.price}*\n\n`;
            }
            
            if (deal.validUntil) {
                messageText += `⏰ Valid until: ${deal.validUntil}\n\n`;
            }
            
            if (deal.url) {
                messageText += `🔗 *Get this deal:* ${deal.url}\n\n`;
            }

            // Add fun call to action at the end
            const callToActions = [
                "Don't miss out! 🏃‍♂️💨",
                "Grab it while it lasts! ⚡",
                "Limited time offer! ⏰",
                "Share with friends! 👥",
                "Your wallet will thank you! 👛"
            ];
            const randomCta = callToActions[Math.floor(Math.random() * callToActions.length)];
            messageText += randomCta;

            // Create interactive buttons for all deals
            let buttons = [];
            
            // Direction button if we have location info
            if (deal.placeName && deal.placeVicinity) {
                buttons.push({
                    type: "reply",
                    reply: {
                        id: `get_directions_${index}`,
                        title: "📍 Directions"
                    }
                });
            }
            
            // Share button
            buttons.push({
                type: "reply",
                reply: {
                    id: `share_deal_${index}`,
                    title: "📤 Share"
                }
            });
            
            // Call button if contact info available
            if (deal.contact || deal.phone) {
                buttons.push({
                    type: "reply",
                    reply: {
                        id: `call_business_${index}`,
                        title: "📞 Call"
                    }
                });
            }
            
            // Ensure we have at most 3 buttons (WhatsApp limit)
            buttons = buttons.slice(0, 3);

            // Always create interactive message
            const interactiveMessage = {
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: {
                        text: messageText
                    },
                    footer: {
                        text: "🎯 LobangLah | Tap for actions"
                    },
                    action: {
                        buttons: buttons
                    }
                },
                dealData: {
                    index: index,
                    businessName: deal.businessName || deal.placeName,
                    address: deal.address || deal.placeVicinity,
                    contact: deal.contact || deal.phone,
                    coordinates: deal.coordinates,
                    url: deal.url,
                    placeName: deal.placeName,
                    placeRating: deal.placeRating
                }
            };

            // Add photo to header if available
            if (deal.photoUrl) {
                interactiveMessage.interactive.header = {
                    type: 'image',
                    image: {
                        link: deal.photoUrl
                    }
                };
            }

            return interactiveMessage;
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
