// Enhanced Interactive List Messages for Deals (Catalog Fallback)

/**
 * Create an enhanced interactive list message showing all deals in a single message
 */
export function createInteractiveDealsListMessage(deals, category) {
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
    
    if (!deals || deals.length === 0) {
        return {
            type: "text",
            text: {
                body: `😅 Sorry, I couldn't find any ${categoryName.toLowerCase()} deals right now. Please try again later!`
            }
        };
    }
    
    // Create interactive list rows for each deal
    const dealRows = deals.slice(0, 10).map((deal, index) => {
        const businessName = deal.businessName || deal.restaurant || deal.store || deal.title || 'Deal';
        const offer = deal.offer || deal.discount || 'Special Deal';
        const address = deal.address || deal.location || 'Address not available';
        
        // Truncate for list display limits (WhatsApp has character limits)
        const truncatedBusinessName = businessName.length > 24 ? businessName.substring(0, 21) + '...' : businessName;
        const truncatedOffer = offer.length > 20 ? offer.substring(0, 17) + '...' : offer;
        const truncatedAddress = address.length > 50 ? address.substring(0, 47) + '...' : address;
        
        return {
            id: `deal_select_${index}`,
            title: truncatedBusinessName,
            description: `💰 ${truncatedOffer} | 📍 ${truncatedAddress}`
        };
    });
    
    // Create message body with deals summary
    let messageBody = `🎉 Found ${Math.min(deals.length, 10)} amazing ${categoryName.toLowerCase()} deals for you!\n\n`;
    
    // Add brief summary of top deals
    deals.slice(0, 3).forEach((deal) => {
        const businessName = deal.businessName || deal.restaurant || deal.store || deal.title;
        const offer = deal.offer || deal.discount || 'Special Deal';
        messageBody += `${categoryEmoji} **${businessName}** - ${offer}\n`;
    });
    
    if (deals.length > 3) {
        messageBody += `\n...and ${deals.length - 3} more deals!\n`;
    }
    
    messageBody += `\n👆 Tap "View Deals" below to select any deal for full details, directions, and actions!`;
    
    // Create the interactive list message
    const interactiveListMessage = {
        type: "interactive",
        interactive: {
            type: "list",
            header: {
                type: "text",
                text: `${categoryEmoji} ${categoryName} Deals Found!`
            },
            body: {
                text: messageBody
            },
            footer: {
                text: "🔍 Sources: Instagram, Facebook, TikTok & Web | LobangLah 🎯"
            },
            action: {
                button: "View Deals",
                sections: [{
                    title: "Available Deals",
                    rows: dealRows
                }]
            }
        },
        // Store deal data for reference when user selects a deal
        dealsData: {
            deals: deals,
            category: category,
            totalDeals: deals.length
        }
    };
    
    return interactiveListMessage;
}

/**
 * Handle deal selection from interactive list
 */
export function createSelectedDealMessage(dealIndex, deals, category) {
    if (!deals || dealIndex >= deals.length || dealIndex < 0) {
        return {
            type: "text",
            text: {
                body: "❌ Sorry, I couldn't find that deal. Please try selecting another deal from the list."
            }
        };
    }
    
    const deal = deals[dealIndex];
    const categoryEmoji = category === 'food' ? '🍕' : category === 'clothes' ? '👕' : category === 'groceries' ? '🛒' : '🎯';
    
    // Extract deal information
    const businessName = deal.businessName || deal.restaurant || deal.store || deal.title;
    const offer = deal.offer || deal.discount || 'Special Deal';
    const address = deal.address || deal.location || 'Address not available';
    const validity = deal.validity || 'Limited time';
    const description = deal.fullDescription || deal.description || '';
    const dealImage = deal.image || deal.imageUrl || deal.img;
    
    // Create deal message body
    let dealText = `${categoryEmoji} **Selected Deal Details**\n\n`;
    dealText += `🏢 **${businessName}**\n`;
    dealText += `💰 **${offer}**\n`;
    dealText += `📍 ${address}\n`;
    dealText += `⏰ ${validity}\n`;
    
    // Add description if available
    if (description) {
        dealText += `\n📝 **Details:**\n${description}`;
    }
    
    // Add deal source/link if available
    const dealLink = deal.dealLink || deal.link || deal.source || deal.url;
    if (dealLink) {
        const linkWithUTM = dealLink.includes('?') 
            ? `${dealLink}&utm_source=LobangLah&utm_medium=whatsapp&utm_campaign=deals`
            : `${dealLink}?utm_source=LobangLah&utm_medium=whatsapp&utm_campaign=deals`;
        dealText += `\n\n🔗 **Source:** ${linkWithUTM}`;
    }
    
    // Add timestamp when deal was checked
    if (deal.checkedAt) {
        dealText += `\n\n⏰ **Verified:** ${deal.checkedAt} SGT`;
    }
    
    // Create interactive buttons for actions
    const buttons = [
        {
            type: "reply",
            reply: {
                id: `get_directions_${dealIndex}`,
                title: "📍 Directions"
            }
        },
        {
            type: "reply",
            reply: {
                id: `share_deal_${dealIndex}`,
                title: "📤 Share Deal"
            }
        },
        {
            type: "reply",
            reply: {
                id: "back_to_deals",
                title: "⬅️ Back to List"
            }
        }
    ];
    
    // Create deal message with image (if available) and interactive buttons
    let dealMessage;
    
    if (dealImage) {
        // Create media interactive message with image
        dealMessage = {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "image",
                    image: {
                        link: dealImage
                    }
                },
                body: {
                    text: dealText
                },
                footer: {
                    text: "🔍 LobangLah | Tap for actions"
                },
                action: {
                    buttons: buttons
                }
            },
            // Store deal data for later reference
            selectedDealData: {
                index: dealIndex,
                deal: deal,
                category: category
            }
        };
    } else {
        // Create regular interactive message without image
        dealMessage = {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: `${categoryEmoji} ${businessName}`
                },
                body: {
                    text: dealText
                },
                footer: {
                    text: "🔍 LobangLah | Tap for actions"
                },
                action: {
                    buttons: buttons
                }
            },
            // Store deal data for later reference
            selectedDealData: {
                index: dealIndex,
                deal: deal,
                category: category
            }
        };
    }
    
    return dealMessage;
}

/**
 * Create deals message using interactive list (fallback for catalog approach)
 */
export function createInteractiveListDealsMessage(deals, category) {
    console.log(`[InteractiveList] Creating interactive list deals message for ${deals.length} deals`);
    
    // Create and return the interactive list message
    const interactiveListMessage = createInteractiveDealsListMessage(deals, category);
    
    // Return as array for compatibility with existing code
    return [interactiveListMessage];
}
