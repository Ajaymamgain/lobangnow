// WhatsApp Template Message Utilities
import { getPlacePhotoUrl } from './googleLocationUtils.js';

/**
 * Create a media card carousel template for restaurant menu with multiple images
 * Based on WhatsApp Media Card Carousel Templates API
 */
export async function createRestaurantMenuCarousel(restaurant, deal, category, botConfig) {
    try {
        console.log(`[WhatsAppTemplateUtils] Creating menu carousel for ${restaurant.name}`);
        
        // Get multiple photos from Google Places API
        const photos = await getRestaurantPhotos(restaurant.placeId, botConfig.googleMapsApiKey);
        
        if (!photos || photos.length === 0) {
            console.log(`[WhatsAppTemplateUtils] No photos found for ${restaurant.name}, using fallback`);
            return createSimpleRestaurantMessage(restaurant, deal, category);
        }
        
        // Limit to 10 photos (WhatsApp carousel limit)
        const carouselPhotos = photos.slice(0, 10);
        
        // Create carousel cards
        const cards = carouselPhotos.map((photo, index) => ({
            components: [
                {
                    type: "header",
                    format: "image",
                    example: {
                        header_handle: [photo.url]
                    }
                },
                {
                    type: "buttons",
                    buttons: [
                        {
                            type: "quick_reply",
                            text: "🍽️ View Menu"
                        },
                        {
                            type: "url",
                            text: "📍 Directions",
                            url: `https://www.google.com/maps/search/?api=1&query=${restaurant.coordinates?.latitude},${restaurant.coordinates?.longitude}`
                        }
                    ]
                }
            ]
        }));
        
        // Create carousel template message
        const carouselMessage = {
            type: "template",
            template: {
                namespace: "lobanglah_deals",
                language: { 
                    policy: "deterministic", 
                    code: "en_US" 
                },
                name: "restaurant_menu_carousel",
                components: [
                    {
                        type: "body",
                        text: `🍽️ *${restaurant.name}* - ${category} Menu\n\n${deal.description || `Amazing ${category} deals!`}\n\n📍 ${restaurant.address}\n⭐ ${restaurant.rating || 'N/A'} rating\n💰 ${deal.price || 'Check for prices'}\n\n🎯 *Deal Details:*\n${deal.details || 'Limited time offer!'}`,
                        example: {
                            body_text: [
                                [
                                    restaurant.name,
                                    category,
                                    deal.description || `Amazing ${category} deals!`,
                                    restaurant.address,
                                    restaurant.rating || 'N/A',
                                    deal.price || 'Check for prices',
                                    deal.details || 'Limited time offer!'
                                ]
                            ]
                        }
                    },
                    {
                        type: "carousel",
                        cards: cards
                    }
                ]
            }
        };
        
        console.log(`[WhatsAppTemplateUtils] Created carousel with ${cards.length} cards for ${restaurant.name}`);
        return carouselMessage;
        
    } catch (error) {
        console.error(`[WhatsAppTemplateUtils] Error creating menu carousel:`, error);
        return createSimpleRestaurantMessage(restaurant, deal, category);
    }
}

/**
 * Get multiple photos for a restaurant from Google Places API
 */
async function getRestaurantPhotos(placeId, googleMapsApiKey) {
    try {
        if (!placeId || !googleMapsApiKey) {
            console.log('[WhatsAppTemplateUtils] Missing placeId or Google Maps API key');
            return [];
        }
        
        // Get place details with photos
        const placeDetailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${googleMapsApiKey}`;
        
        const response = await fetch(placeDetailsUrl);
        const data = await response.json();
        
        if (data.status !== 'OK' || !data.result.photos) {
            console.log(`[WhatsAppTemplateUtils] No photos found for place ${placeId}`);
            return [];
        }
        
        // Convert photos to URLs
        const photos = data.result.photos.map((photo, index) => ({
            url: getPlacePhotoUrl(photo.photo_reference, 400),
            width: photo.width,
            height: photo.height,
            index: index
        }));
        
        console.log(`[WhatsAppTemplateUtils] Found ${photos.length} photos for place ${placeId}`);
        return photos;
        
    } catch (error) {
        console.error(`[WhatsAppTemplateUtils] Error fetching restaurant photos:`, error);
        return [];
    }
}

/**
 * Create a simple restaurant message as fallback
 */
function createSimpleRestaurantMessage(restaurant, deal, category) {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: `🍽️ ${restaurant.name}`
            },
            body: {
                text: `${deal.description || `Amazing ${category} deals!`}\n\n📍 ${restaurant.address}\n⭐ ${restaurant.rating || 'N/A'} rating\n💰 ${deal.price || 'Check for prices'}`
            },
            footer: {
                text: "Choose an option"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "view_menu",
                            title: "🍽️ View Menu"
                        }
                    },
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
                            id: "more_deals",
                            title: "🎯 More Deals"
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Create a WhatsApp template message for restaurant deals
 */
export function createRestaurantTemplateMessage(restaurant, deal, category) {
    try {
        // Get restaurant photo URL
        const photoUrl = restaurant.photos && restaurant.photos.length > 0 
            ? getPlacePhotoUrl(restaurant.photos[0].photoReference, 400)
            : null;

        // Create deal description
        const dealDescription = deal.description || `Amazing ${category} deals at ${restaurant.name}!`;
        
        // Create buttons
        const buttons = [];
        
        // Directions button
        if (restaurant.coordinates) {
            const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${restaurant.coordinates.latitude},${restaurant.coordinates.longitude}`;
            buttons.push({
                type: "URL",
                text: "📍 Directions",
                url: directionsUrl
            });
        }
        
        // Menu button (replaces call button)
        if (restaurant.placeId) {
            buttons.push({
                type: "reply",
                reply: {
                    id: `menu_${restaurant.placeId}`,
                    title: "🍽️ Menu"
                }
            });
        } else if (restaurant.website) {
            buttons.push({
                type: "URL",
                text: "🍽️ Menu",
                url: restaurant.website
            });
        } else if (restaurant.menu) {
            buttons.push({
                type: "URL",
                text: "🍽️ Menu",
                url: restaurant.menu
            });
        }

        // Create template message
        const templateMessage = {
            type: "template",
            template: {
                namespace: "lobanglah_deals",
                language: { 
                    policy: "deterministic", 
                    code: "en_US" 
                },
                name: "restaurant_deal_promo",
                components: []
            }
        };

        // Add header with restaurant photo
        if (photoUrl) {
            templateMessage.template.components.push({
                type: "HEADER",
                format: "IMAGE",
                example: {
                    header_handle: [photoUrl]
                }
            });
        }

        // Add body with deal information
        templateMessage.template.components.push({
            type: "BODY",
            text: `🍽️ *${restaurant.name}*\n\n${dealDescription}\n\n📍 ${restaurant.address}\n⭐ ${restaurant.rating || 'N/A'} rating\n💰 ${deal.price || 'Check for prices'}\n\n🎯 *Deal Details:*\n${deal.details || 'Limited time offer!'}`,
            example: {
                body_text: [
                    [
                        restaurant.name,
                        dealDescription,
                        restaurant.address,
                        restaurant.rating || 'N/A',
                        deal.price || 'Check for prices',
                        deal.details || 'Limited time offer!'
                    ]
                ]
            }
        });

        // Add footer with source
        templateMessage.template.components.push({
            type: "FOOTER",
            text: `Source: LobangLah AI Deal Hunter | ${new Date().toLocaleDateString('en-SG')}`
        });

        // Add buttons
        if (buttons.length > 0) {
            templateMessage.template.components.push({
                type: "BUTTONS",
                buttons: buttons
            });
        }

        return templateMessage;

    } catch (error) {
        console.error('[WhatsAppTemplateUtils] Error creating restaurant template message:', error);
        return null;
    }
}

/**
 * Create a simple interactive message as fallback
 */
export function createSimpleInteractiveMessage(restaurant, deal, category, googleMapsApiKey = null) {
    try {
        const buttons = [];
        
        // Directions button
        if (restaurant.coordinates) {
            const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${restaurant.coordinates.latitude},${restaurant.coordinates.longitude}`;
            buttons.push({
                type: "reply",
                reply: {
                    id: `directions_${restaurant.placeId}`,
                    title: "📍 Directions"
                }
            });
        }
        
        // Call button
        if (restaurant.phone) {
            buttons.push({
                type: "reply",
                reply: {
                    id: `call_${restaurant.placeId}`,
                    title: "📞 Call"
                }
            });
        }
        
        // Menu button
        if (restaurant.website || restaurant.menu) {
            buttons.push({
                type: "reply",
                reply: {
                    id: `menu_${restaurant.placeId}`,
                    title: "🍽️ Menu"
                }
            });
        }

        // Create base message
        const message = {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: `🍽️ ${restaurant.name}`
                },
                body: {
                    text: `${deal.description || `Amazing ${category} deals!`}\n\n📍 ${restaurant.address}\n⭐ ${restaurant.rating || 'N/A'} rating\n💰 ${deal.price || 'Check for prices'}\n\n🎯 ${deal.details || 'Limited time offer!'}`
                },
                footer: {
                    text: `Source: LobangLah AI | ${new Date().toLocaleDateString('en-SG')}`
                },
                action: {
                    buttons: buttons
                }
            }
        };

        // Add photo if available
        if (restaurant.photos && restaurant.photos.length > 0) {
            const photo = restaurant.photos[0];
            const photoReference = photo.photo_reference || photo.name; // Handle both old and new API formats
            const photoUrl = getPlacePhotoUrl(photoReference, 400, googleMapsApiKey);
            if (photoUrl) {
                message.interactive.header = {
                    type: "image",
                    image: {
                        link: photoUrl
                    }
                };
                console.log(`[WhatsAppTemplateUtils] Added photo header for ${restaurant.name}: ${photoUrl.substring(0, 50)}...`);
            } else {
                console.log(`[WhatsAppTemplateUtils] Could not generate photo URL for ${restaurant.name}`);
            }
        } else {
            console.log(`[WhatsAppTemplateUtils] No photos available for ${restaurant.name}`);
        }

        return message;

    } catch (error) {
        console.error('[WhatsAppTemplateUtils] Error creating simple interactive message:', error);
        return null;
    }
}

/**
 * Create a location confirmation message
 */
export function createLocationConfirmationMessage(location, weather) {
    try {
        const weatherText = weather ? `\n🌤️ ${weather.displayText}` : '';
        
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: "📍 Location Confirmed!"
                },
                body: {
                    text: `Perfect! I found you at:\n\n🏢 *${location.displayName}*\n📍 ${location.formattedAddress}${weatherText}\n\nWhat type of deals are you looking for?`
                },
                footer: {
                    text: "Choose your preferred category"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "search_food_deals",
                                title: "🍽️ Food"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "search_events_deals",
                                title: "🎉 Events"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "search_fashion_deals",
                                title: "👕 Fashion"
                            }
                        }
                    ]
                }
            }
        };

    } catch (error) {
        console.error('[WhatsAppTemplateUtils] Error creating location confirmation message:', error);
        return null;
    }
}

/**
 * Create a deal summary message
 */
export function createDealSummaryMessage(deals, category, location) {
    try {
        const dealCount = deals.length;
        const totalSavings = deals.reduce((sum, deal) => sum + (deal.savings || 0), 0);
        
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: `🎉 Found ${dealCount} ${category} Deals!`
                },
                body: {
                    text: `Steady lah! Found ${dealCount} amazing ${category} deals near ${location.displayName}!\n\n💰 Total potential savings: $${totalSavings}\n🎯 Best deals selected for you\n\nTap below to see all deals:`
                },
                footer: {
                    text: "Your personal deal hunter at work! 🕵️"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "view_all_deals",
                                title: "👀 View All Deals"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "search_more_deals",
                                title: "🔍 Search More"
                            }
                        }
                    ]
                }
            }
        };

    } catch (error) {
        console.error('[WhatsAppTemplateUtils] Error creating deal summary message:', error);
        return null;
    }
} 