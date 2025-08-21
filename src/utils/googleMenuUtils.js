// Google Menu Integration Utilities
import axios from 'axios';

/**
 * Get restaurant menu from Google Places API
 */
export async function getRestaurantMenu(placeId, googleMapsApiKey) {
    try {
        console.log(`[GoogleMenuUtils] Fetching menu for place ID: ${placeId}`);
        
        const detailsUrl = 'https://maps.googleapis.com/maps/api/place/details/json';
        const params = {
            place_id: placeId,
            key: googleMapsApiKey,
            fields: 'name,menu,editorial_summary,reviews,photos,formatted_address,phone,website,opening_hours,price_level,rating'
        };
        
        const response = await axios.get(detailsUrl, { params });
        
        if (response.data.status === 'OK' && response.data.result) {
            const place = response.data.result;
            
            // Extract menu information
            const menuData = {
                placeId: placeId,
                name: place.name,
                address: place.formatted_address,
                phone: place.phone,
                website: place.website,
                rating: place.rating,
                priceLevel: place.price_level,
                openingHours: place.opening_hours?.weekday_text || [],
                menu: place.menu || null,
                editorialSummary: place.editorial_summary?.overview || null,
                photos: place.photos || []
            };
            
            console.log(`[GoogleMenuUtils] Successfully fetched menu for: ${place.name}`);
            return menuData;
            
        } else {
            console.log(`[GoogleMenuUtils] No menu data found for place ID: ${placeId}`);
            return null;
        }
        
    } catch (error) {
        console.error('[GoogleMenuUtils] Error fetching restaurant menu:', error);
        return null;
    }
}

/**
 * Create menu message for WhatsApp
 */
export function createMenuMessage(menuData) {
    try {
        if (!menuData) {
            return {
                type: "text",
                text: {
                    body: "❌ Sorry lah! Menu not available for this restaurant."
                }
            };
        }
        
        let menuText = `🍽️ *${menuData.name}*\n\n`;
        
        // Add address
        if (menuData.address) {
            menuText += `📍 ${menuData.address}\n`;
        }
        
        // Add rating
        if (menuData.rating) {
            const stars = '⭐'.repeat(Math.min(Math.round(menuData.rating), 5));
            menuText += `${stars} ${menuData.rating}\n`;
        }
        
        // Add price level
        if (menuData.priceLevel) {
            const priceLevels = ['', '💰', '💰💰', '💰💰💰', '💰💰💰💰'];
            menuText += `${priceLevels[menuData.priceLevel] || ''}\n`;
        }
        
        menuText += '\n';
        
        // Add opening hours
        if (menuData.openingHours && menuData.openingHours.length > 0) {
            menuText += `🕒 *Opening Hours:*\n`;
            menuData.openingHours.forEach(hour => {
                menuText += `${hour}\n`;
            });
            menuText += '\n';
        }
        
        // Add editorial summary if available
        if (menuData.editorialSummary) {
            menuText += `📝 *About:*\n${menuData.editorialSummary}\n\n`;
        }
        
        // Add menu information
        if (menuData.menu) {
            menuText += `📋 *Menu Available*\n`;
            menuText += `Check their website or call for current menu items.\n\n`;
        } else {
            menuText += `📋 *Menu Information*\n`;
            menuText += `Menu details not available online.\n\n`;
        }
        
        // Add contact information
        if (menuData.phone) {
            menuText += `📞 Call: ${menuData.phone}\n`;
        }
        
        if (menuData.website) {
            menuText += `🌐 Website: ${menuData.website}\n`;
        }
        
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: `🍽️ ${menuData.name}`
                },
                body: {
                    text: menuText
                },
                footer: {
                    text: "Source: Google Places"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "get_directions",
                                title: "📍 Directions"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "call_restaurant",
                                title: "📞 Call"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "visit_website",
                                title: "🌐 Website"
                            }
                        }
                    ]
                }
            }
        };
        
    } catch (error) {
        console.error('[GoogleMenuUtils] Error creating menu message:', error);
        return {
            type: "text",
            text: {
                body: "❌ Sorry lah! Couldn't load the menu right now."
            }
        };
    }
}

/**
 * Search for restaurants with menu availability
 */
export async function searchRestaurantsWithMenu(latitude, longitude, category, googleMapsApiKey) {
    try {
        console.log(`[GoogleMenuUtils] Searching for ${category} restaurants with menu near (${latitude}, ${longitude})`);
        
        const nearbyUrl = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
        const params = {
            location: `${latitude},${longitude}`,
            radius: 2000,
            type: category === 'food' ? 'restaurant' : 'establishment',
            key: googleMapsApiKey,
            rankby: 'rating'
        };
        
        const response = await axios.get(nearbyUrl, { params });
        
        if (response.data.status === 'OK' && response.data.results) {
            const restaurants = response.data.results.slice(0, 10).map(place => ({
                placeId: place.place_id,
                name: place.name,
                address: place.vicinity,
                rating: place.rating,
                priceLevel: place.price_level,
                photos: place.photos || [],
                types: place.types || []
            }));
            
            console.log(`[GoogleMenuUtils] Found ${restaurants.length} restaurants with potential menu access`);
            return restaurants;
            
        } else {
            console.log(`[GoogleMenuUtils] No restaurants found for ${category}`);
            return [];
        }
        
    } catch (error) {
        console.error('[GoogleMenuUtils] Error searching restaurants with menu:', error);
        return [];
    }
} 