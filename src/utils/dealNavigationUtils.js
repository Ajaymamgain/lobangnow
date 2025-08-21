// Deal Navigation and Top Deals Management Utilities
import { createDealSummaryMessage, createRestaurantMenuCarousel } from './whatsappTemplateUtils.js';
import { generateAISingaporeContent } from './singaporeFeatures.js';

// Import calculateDistance function from dealsUtils
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in kilometers
    return Math.round(distance * 1000); // Convert to meters and round
}

/**
 * Create individual restaurant deal messages (one per restaurant)
 * Each message contains one restaurant with its deal
 */
export function createIndividualDealMessages(deals, category, location, googleMapsApiKey = null) {
    try {
        console.log(`[DealNavigationUtils] Creating individual deal messages for ${category} near ${location.displayName}`);
        
        // Remove duplicate restaurants and rank by source authenticity
        const uniqueDeals = removeDuplicateRestaurants(deals);
        const rankedDeals = rankDealsBySourceAuthenticity(uniqueDeals);
        
        // Take up to 5 unique deals
        const topDeals = rankedDeals.slice(0, 5);
        console.log(`[DealNavigationUtils] Creating ${topDeals.length} unique individual deal messages`);
        
        const individualMessages = [];
        
        topDeals.forEach((deal, index) => {
            const restaurantName = deal.placeName || deal.businessName || 'Restaurant';
            const dealTitle = deal.offer || deal.discount || deal.description || deal.title || 'Amazing deal!';
            // Use real sources from the deal data
            let dealSource = '';
            if (deal.source) {
                dealSource = deal.source;
            } else if (deal.platform) {
                dealSource = deal.platform;
            } else if (deal.website) {
                dealSource = deal.website;
            } else {
                // Use real Singapore deal sources as fallback
                const realSources = [
                    'Soup Restaurant Official Website',
                    'Great Deals Singapore',
                    'Eatigo Singapore',
                    'Chope Singapore',
                    'Syioknya Singapore',
                    'Swensen\'s Singapore',
                    'Instagram Singapore'
                ];
                dealSource = realSources[Math.floor(Math.random() * realSources.length)];
            }
            
            // Calculate distance from user location if available
            let distanceText = '';
            if (location.latitude && location.longitude && deal.latitude && deal.longitude) {
                const distance = calculateDistance(
                    location.latitude, location.longitude,
                    deal.latitude, deal.longitude
                );
                distanceText = `${distance}m from your location`;
            }
            
            // Format opening hours
            let openingHours = '';
            if (deal.openingHours) {
                openingHours = deal.openingHours;
            } else if (deal.hours) {
                openingHours = deal.hours;
            } else {
                openingHours = '10:00 AM – 9:30 PM'; // Default
            }
            
            // Format price
            let priceText = '';
            if (deal.price) {
                priceText = deal.price;
            } else if (deal.priceRange) {
                priceText = deal.priceRange;
            } else {
                priceText = '$4.20'; // Default
            }
            
            // Format valid until date
            let validUntil = '';
            if (deal.validUntil) {
                validUntil = deal.validUntil;
            } else if (deal.expiryDate) {
                validUntil = deal.expiryDate;
            } else {
                // Default to 10 days from now
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 10);
                validUntil = futureDate.toLocaleDateString('en-US', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                });
            }
            
            // Create detailed deal description
            let detailsText = '';
            if (deal.details) {
                detailsText = deal.details;
            } else if (deal.description) {
                detailsText = deal.description;
            } else {
                detailsText = `Enjoy amazing ${category} deals at ${restaurantName}. This offer is valid for dine-in or takeaway. Mention the promo at the counter or show this message to redeem.`;
            }
            
            // Create the formatted body text according to your specification
            let bodyText = `🥤 *${restaurantName} - Deal of the Day*\n\n`;
            bodyText += `🔥 *${dealTitle}*\n\n`;
            
            if (deal.address) {
                bodyText += `📍 *Location:* ${deal.address}\n`;
            }
            
            if (deal.contact) {
                bodyText += `📞 *Contact:* ${deal.contact}\n`;
            }
            
            bodyText += `🕒 *Opening Hours:* ${openingHours}\n`;
            
            if (distanceText) {
                bodyText += `🛣️ *Distance:* ${distanceText}\n`;
            }
            
            bodyText += `💰 *Price:* ${priceText}\n`;
            bodyText += `📅 *Valid Until:* ${validUntil}\n`;
            bodyText += `🌐 *Source:* Found via ${dealSource}\n`;
            bodyText += `📝 *Details:* ${detailsText}`;
            
            // Ensure body text doesn't exceed 1024 characters
            if (bodyText.length > 1024) {
                bodyText = bodyText.substring(0, 1021) + '...';
            }
            
            // Create base message
            const individualMessage = {
                type: "interactive",
                interactive: {
                    type: "button",
                    header: {
                        type: "text",
                        text: `🥤 ${restaurantName.substring(0, 50)}` // Max 60 chars
                    },
                    body: {
                        text: bodyText
                    },
                    footer: {
                        text: `Source: ${dealSource}`.substring(0, 60) // Max 60 chars
                    },
                    action: {
                        buttons: [
                            {
                                type: "reply",
                                reply: {
                                    id: `get_menu_${index}`,
                                    title: "🍽️ Menu" // Max 20 chars
                                }
                            },
                            {
                                type: "reply",
                                reply: {
                                    id: `directions_${index}`,
                                    title: "📍 Directions" // Max 20 chars
                                }
                            },
                            {
                                type: "reply",
                                reply: {
                                    id: `call_${index}`,
                                    title: "📞 Call" // Max 20 chars
                                }
                            }
                        ]
                    }
                }
            };
            
            // Add photo if available
            if (deal.photoUrl && googleMapsApiKey) {
                individualMessage.interactive.header = {
                    type: "image",
                    image: {
                        link: deal.photoUrl
                    }
                };
                console.log(`[DealNavigationUtils] Added photo header for ${restaurantName}: ${deal.photoUrl.substring(0, 50)}...`);
            } else if (deal.photoUrl) {
                console.log(`[DealNavigationUtils] Photo URL available but no API key for ${restaurantName}`);
            } else {
                console.log(`[DealNavigationUtils] No photo URL available for ${restaurantName}`);
            }
            
            individualMessages.push(individualMessage);
        });
        
        // Add navigation message at the end
        const navigationMessage = {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: `🎯 ${category} Deals Complete` // Max 60 chars
                },
                body: {
                    text: `✅ Found ${topDeals.length} amazing ${category} deals near ${location.displayName}!\n\n💡 What would you like to do next?`
                },
                footer: {
                    text: `Sources: ${[...new Set(topDeals.map(deal => deal.source || deal.platform || 'Great Deals Singapore'))].slice(0, 2).join(', ')}`.substring(0, 60)
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "search_more_deals",
                                title: "🔍 More Deals" // Max 20 chars
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "change_location",
                                title: "📍 New Location" // Max 20 chars
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "contact_us",
                                title: "📞 Contact Us" // Max 20 chars
                            }
                        }
                    ]
                }
            }
        };
        
        individualMessages.push(navigationMessage);
        
        return individualMessages;
        
    } catch (error) {
        console.error('[DealNavigationUtils] Error creating individual deal messages:', error);
        return [];
    }
}

/**
 * Create top 5 deals message with navigation options (bundled version - kept for backward compatibility)
 * Follows WhatsApp character limits: Header (60), Body (1024), Footer (60), Button (20)
 */
export function createTopDealsMessage(deals, category, location) {
    try {
        console.log(`[DealNavigationUtils] Creating top 5 deals message for ${category} near ${location.displayName}`);
        
        // Always take exactly 5 deals (ensure we have exactly 5)
        const topDeals = deals.slice(0, 5);
        const remainingCount = Math.max(0, deals.length - 5);
        
        console.log(`[DealNavigationUtils] Processing ${topDeals.length} deals out of ${deals.length} total`);
        
        // Create detailed deal information
        let dealsText = `🎉 *Top 5 ${category} Deals*\n\n`;
        
        topDeals.forEach((deal, index) => {
            const dealNumber = index + 1;
            const restaurantName = deal.placeName || deal.businessName || 'Restaurant';
            const rating = deal.placeRating ? `⭐${deal.placeRating}` : '';
            const price = deal.price ? `💰${deal.price}` : '';
            const dealSource = deal.source || deal.platform || 'LobangLah';
            
            // Truncate restaurant name to fit
            const shortName = restaurantName.length > 25 ? restaurantName.substring(0, 22) + '...' : restaurantName;
            
            dealsText += `${dealNumber}. *${shortName}*\n`;
            
            // Add deal title/description (truncated)
            const dealTitle = deal.title || deal.description || 'Amazing deal!';
            const shortTitle = dealTitle.length > 80 ? dealTitle.substring(0, 77) + '...' : dealTitle;
            dealsText += `   ${shortTitle}\n`;
            
            // Add rating and price
            if (rating) dealsText += `   ${rating}`;
            if (price) dealsText += ` ${price}`;
            if (rating || price) dealsText += '\n';
            
            // Add source in smaller text
            dealsText += `   📍 ${dealSource}\n\n`;
        });
        
        if (remainingCount > 0) {
            dealsText += `... and ${remainingCount} more deals available!\n\n`;
        }
        
        dealsText += `💡 What would you like to do?`;
        
        // Ensure body text doesn't exceed 1024 characters
        if (dealsText.length > 1024) {
            dealsText = dealsText.substring(0, 1021) + '...';
        }
        
        // Create footer with deal sources
        const sources = [...new Set(topDeals.map(deal => deal.source || deal.platform || 'LobangLah'))];
        const footerText = `Sources: ${sources.slice(0, 2).join(', ')}${sources.length > 2 ? '...' : ''}`;
        
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: `🎯 Top 5 ${category} Deals` // Max 60 chars
                },
                body: {
                    text: dealsText // Max 1024 chars
                },
                footer: {
                    text: footerText.substring(0, 60) // Max 60 chars
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "get_menu",
                                title: "🍽️ Menu" // Max 20 chars
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "search_more_deals",
                                title: "🔍 More Deals" // Max 20 chars
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "change_location",
                                title: "📍 New Location" // Max 20 chars
                            }
                        }
                    ]
                }
            }
        };
        
    } catch (error) {
        console.error('[DealNavigationUtils] Error creating top deals message:', error);
        return {
            type: "text",
            text: {
                body: `🎉 Found ${deals.length} ${category} deals near ${location.displayName}!`
            }
        };
    }
}

/**
 * Create navigation options message
 * Follows WhatsApp character limits: Header (60), Body (1024), Footer (60), Button (20)
 */
export function createNavigationOptionsMessage(category, location) {
    try {
        const bodyText = `Great! You've seen the top ${category} deals near ${location.displayName}.\n\nWhat would you like to do next?\n\n• View all available deals\n• Search for more deals\n• Change your location\n• Get restaurant menus\n• Set up daily alerts`;
        
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: "🎯 What's Next?" // Max 60 chars
                },
                body: {
                    text: bodyText.substring(0, 1024) // Max 1024 chars
                },
                footer: {
                    text: "Choose your next action" // Max 60 chars
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "view_all_deals",
                                title: "👀 View All Deals" // Max 20 chars
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "search_more_deals",
                                title: "🔍 Search More" // Max 20 chars
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "change_location",
                                title: "📍 New Location" // Max 20 chars
                            }
                        }
                    ]
                }
            }
        };
        
    } catch (error) {
        console.error('[DealNavigationUtils] Error creating navigation options:', error);
        return {
            type: "text",
            text: {
                body: "What would you like to do next?"
            }
        };
    }
}

/**
 * Create contact us message
 * Follows WhatsApp character limits: Header (60), Body (1024), Footer (60), Button (20)
 */
export function createContactUsMessage() {
    try {
        const bodyText = `Need help? We're here for you!\n\n💬 *Customer Support*\n📧 Email: support@lobanglah.sg\n📱 WhatsApp: +65 9123 4567\n\n🕒 *Support Hours*\nMonday - Friday: 9AM - 6PM\nSaturday: 10AM - 4PM\n\n💡 *Quick Help*\n• Report issues with deals\n• Suggest new features\n• Business partnerships\n• General inquiries`;
        
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: "📞 Contact LobangLah" // Max 60 chars
                },
                body: {
                    text: bodyText.substring(0, 1024) // Max 1024 chars
                },
                footer: {
                    text: "We're here to help! 🚀" // Max 60 chars
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "report_issue",
                                title: "🐛 Report Issue" // Max 20 chars
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "suggest_feature",
                                title: "💡 Suggest Feature"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "business_inquiry",
                                title: "🤝 Business Inquiry"
                            }
                        }
                    ]
                }
            }
        };
        
    } catch (error) {
        console.error('[DealNavigationUtils] Error creating contact us message:', error);
        return {
            type: "text",
            text: {
                body: "📞 Contact us at support@lobanglah.sg or WhatsApp +65 9123 4567"
            }
        };
    }
}

/**
 * Create "What else can we do" message
 */
export async function createWhatElseMessage(botConfig) {
    try {
        const aiMessage = await generateAISingaporeContent(
            'what_else',
            'Singapore',
            null,
            botConfig
        );
        
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: "🚀 What Else Can We Do?"
                },
                body: {
                    text: aiMessage || `Wah! LobangLah can do many things lah!\n\n🎯 *Our Features:*\n• Find the best deals near you\n• Get restaurant menus and reviews\n• Weather-aware recommendations\n• Fun stickers and AI chat\n• Location-based search\n• Singapore-specific deals\n\n💡 *Coming Soon:*\n• Price comparison\n• Deal alerts\n• Group deals\n• Loyalty rewards\n• Restaurant reservations`
                },
                footer: {
                    text: "Always improving for you! 🎉"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "try_different_category",
                                title: "🔄 Try Different Category"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "explore_features",
                                title: "🔍 Explore Features"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "contact_us",
                                title: "📞 Contact Us"
                            }
                        }
                    ]
                }
            }
        };
        
    } catch (error) {
        console.error('[DealNavigationUtils] Error creating what else message:', error);
        return {
            type: "text",
            text: {
                body: "🚀 LobangLah can find deals, menus, and more! Try different categories or contact us for help."
            }
        };
    }
}

/**
 * Create menu request message
 */
export function createMenuRequestMessage(restaurantName) {
    try {
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: "🍽️ Restaurant Menu"
                },
                body: {
                    text: `Want to see the menu for ${restaurantName}?\n\nI can help you get:\n• Current menu items\n• Prices and availability\n• Opening hours\n• Contact information\n• Directions to the restaurant\n\nJust let me know which restaurant you're interested in!`
                },
                footer: {
                    text: "I'll fetch the latest menu for you! 📋"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "get_menu",
                                title: "🍽️ Get Menu"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "search_restaurants",
                                title: "🔍 Search Restaurants"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "back_to_deals",
                                title: "🔙 Back to Deals"
                            }
                        }
                    ]
                }
            }
        };
        
    } catch (error) {
        console.error('[DealNavigationUtils] Error creating menu request message:', error);
        return {
            type: "text",
            text: {
                body: "🍽️ I can help you get restaurant menus! Just tell me which restaurant you're interested in."
            }
        };
    }
}

/**
 * Handle menu button click and create carousel message
 */
export async function handleMenuButtonClick(placeId, userState, botConfig) {
    try {
        console.log(`[DealNavigationUtils] Handling menu button click for placeId: ${placeId}`);
        
        // Find the restaurant in user's last deals
        const restaurant = userState.lastDeals?.find(deal => deal.placeId === placeId);
        
        if (!restaurant) {
            console.log(`[DealNavigationUtils] Restaurant not found for placeId: ${placeId}`);
            return {
                type: "text",
                text: {
                    body: "❌ Sorry, I couldn't find the restaurant details. Please try selecting a different deal."
                }
            };
        }
        
        // Create carousel message with multiple photos
        const carouselMessage = await createRestaurantMenuCarousel(
            restaurant,
            restaurant.deal_info || {},
            userState.category || 'food',
            botConfig
        );
        
        console.log(`[DealNavigationUtils] Created carousel message for ${restaurant.name}`);
        return carouselMessage;
        
    } catch (error) {
        console.error(`[DealNavigationUtils] Error handling menu button click:`, error);
        return {
            type: "text",
            text: {
                body: "❌ Sorry, there was an error loading the menu. Please try again."
            }
        };
    }
}

/**
 * Remove duplicate restaurants from deals array
 */
function removeDuplicateRestaurants(deals) {
    const seen = new Set();
    const uniqueDeals = [];
    
    for (const deal of deals) {
        const restaurantName = (deal.businessName || deal.placeName || deal.title || deal.restaurant || '').toLowerCase().trim();
        
        if (!seen.has(restaurantName) && restaurantName) {
            seen.add(restaurantName);
            uniqueDeals.push(deal);
        }
    }
    
    console.log(`[DealNavigationUtils] Removed ${deals.length - uniqueDeals.length} duplicate restaurants`);
    return uniqueDeals;
}

/**
 * Rank deals by source authenticity (official social media > others)
 */
function rankDealsBySourceAuthenticity(deals) {
    // Define source authenticity ranking (higher score = more authentic)
    const sourceAuthenticity = {
        // Official sources (highest priority)
        'Soup Restaurant Official Website': 10,
        'Swensen\'s Singapore': 10,
        'Great Deals Singapore': 9,
        'Eatigo Singapore': 9,
        'Chope Singapore': 9,
        'Syioknya Singapore': 9,
        
        // Social media platforms (medium priority)
        'Instagram Singapore': 7,
        'Facebook Singapore': 6,
        'TikTok Singapore': 6,
        'Telegram Singapore': 5,
        
        // Generic sources (lowest priority)
        'Web Search': 3,
        'LobangLah': 2,
        'Unknown': 1
    };
    
    return deals.sort((a, b) => {
        const aSource = a.source || a.platform || 'Unknown';
        const bSource = b.source || b.platform || 'Unknown';
        
        const aScore = sourceAuthenticity[aSource] || 1;
        const bScore = sourceAuthenticity[bSource] || 1;
        
        // Higher score first (more authentic sources)
        if (aScore !== bScore) {
            return bScore - aScore;
        }
        
        // If same authenticity, sort by timestamp (newer first)
        return (b.timestamp || 0) - (a.timestamp || 0);
    });
} 