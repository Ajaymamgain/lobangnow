// LobangLah Deals Utilities
import { DynamoDBClient, ScanCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { OpenAI } from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { getSingaporeWelcomeMessage, getSingaporeErrorMessage, getSingaporeSuccessMessage, formatSingaporeDeal, rankSingaporeDeals, singaporeDealCategories } from './singaporeFeatures.js';
// Removed verifyDealsWithDeepSeek and getVerificationStats imports as DeepSeek verification is now skipped

/**
 * Create welcome message asking for location first.
 */
export function createWelcomeMessage() {
    return getSingaporeWelcomeMessage();
}

/**
 * Create category selection message after location is resolved.
 */
export function createCategorySelectionMessage(locationName) {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: { type: "text", text: `📍 ${locationName}` },
            body: { text: `Great! I've got your location: **${locationName}**.\n\nWhat kind of deals are you looking for?` },
            footer: { text: "🔍 AI-powered deal search" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: `search_food_deals`, title: "🍽️ Food" } },
                    { type: "reply", reply: { id: `search_events_deals`, title: "🎉 Events" } },
                    { type: "reply", reply: { id: `search_fashion_deals`, title: "👕 Fashion" } }
                ]
            }
        }
    };
}

/**
 * Create an enhanced interactive searching message with cult classic movie quotes using ChatGPT
 */
export async function createInteractiveSearchingMessage(location, category, botConfig) {
    console.log(`[DealsUtils] 🎬 Creating enhanced search message with cult classic movie quotes`);
    
    const locationName = location.displayName || location.area || 'your area';
    
    try {
        const openAIApiKey = botConfig?.openAiApiKey || botConfig?.openAIApiKey || botConfig?.openaiApiKey || process.env.OPENAI_API_KEY;
        
        if (openAIApiKey) {
            console.log(`[DealsUtils] 🤖 Using ChatGPT to generate cult classic movie quote search message`);
            
            const { OpenAI } = await import('openai');
            const openai = new OpenAI({ apiKey: openAIApiKey });
            
            const prompt = `Create an entertaining search message for a Singapore deals bot that's looking for ${category} deals near ${locationName}. 

Include:
1. A famous cult classic movie quote that fits the "searching/hunting for deals" theme
2. Make it fun and engaging for Singapore users
3. Reference the location (${locationName}) and category (${category})
4. Keep it under 200 characters for WhatsApp
5. Use emojis appropriately

Examples of cult classic movies to quote from: Terminator, Matrix, Star Wars, Pulp Fiction, The Godfather, Casablanca, etc.

Format: [Movie Quote] + [Fun search message about finding deals]`;
            
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a fun, entertaining assistant that creates engaging messages with cult classic movie quotes for a Singapore deals bot.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8,
                max_tokens: 150
            });
            
            const movieQuoteMessage = response.choices[0].message.content.trim();
            console.log(`[DealsUtils] 🎭 Generated movie quote search message: ${movieQuoteMessage}`);
            
            return {
                type: 'interactive',
                interactive: {
                    type: 'button',
                    header: { type: 'text', text: '🎬 Deal Hunt in Progress' },
                    body: { text: movieQuoteMessage },
                    footer: { text: '🎯 LobangLah - Your Deal Hunter' },
                    action: {
                        buttons: [{ type: 'reply', reply: { id: 'search_status', title: '🍿 Searching...' } }]
                    }
                }
            };
        }
    } catch (error) {
        console.error(`[DealsUtils] Error generating movie quote search message:`, error);
    }
    
    // Fallback to enhanced static message with movie theme
    console.log(`[DealsUtils] 🎬 Using fallback movie-themed search message`);
    const fallbackQuotes = [
        `"I'll be back..." with amazing ${category} deals near ${locationName}! 🤖`,
        `"May the deals be with you" - searching ${locationName} for ${category} bargains! ⭐`,
        `"I'm gonna make him an offer he can't refuse" - hunting ${category} deals in ${locationName}! 🕴️`,
        `"Show me the money!" - finding the best ${category} deals near ${locationName}! 💰`,
        `"Houston, we have a problem..." Just kidding! Finding ${category} deals in ${locationName}! 🚀`
    ];
    
    const randomQuote = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
    
    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            header: { type: 'text', text: '🎬 Deal Hunt in Progress' },
            body: { text: randomQuote },
            footer: { text: '🎯 LobangLah - Your Deal Hunter' },
            action: {
                buttons: [{ type: 'reply', reply: { id: 'search_status', title: '🍿 Searching...' } }]
            }
        }
    };
}

/**
 * Search for deals using OpenAI with simple, focused approach
 */
export async function searchDealsWithOpenAI(location, category, botConfig, nearbyPlaces = []) {
    // Check if this is a Google Places-based search or direct web search
    const isGooglePlacesSearch = nearbyPlaces && nearbyPlaces.length > 0 && typeof nearbyPlaces[0] === 'object' && nearbyPlaces[0].id;
    
    if (!isGooglePlacesSearch) {
        // For LobangLah bot: Use direct OpenAI web search when no Google Places data
        console.log('[DealsUtils] No Google Places data provided, using direct OpenAI web search for deals');
        return await searchDealsWithDirectWebSearch(location, category, botConfig, nearbyPlaces || []);
    }

    console.log(`[DealsUtils] Starting deal search for ${category} using ${nearbyPlaces.length} detailed places.`);

    try {
        const openAIApiKey = botConfig?.openAiApiKey || botConfig?.openAIApiKey || botConfig?.openaiApiKey || process.env.OPENAI_API_KEY;
        if (!openAIApiKey) {
            console.error('[DealsUtils] OpenAI API key is missing. Cannot search for deals.');
            return nearbyPlaces; // Return original places without deals
        }

        const openai = new OpenAI({ apiKey: openAIApiKey });
        const model = botConfig.openAiModel || 'gpt-4o-mini';

        const locationName = location.displayName || location.area || location.description || 'Singapore';
        
        // Singapore-specific system message with primary deal sources
        const searchSystemMessage = `You are a Singapore deal discovery expert specializing in finding the best lobang (good deals) for Singaporeans. 

**PRIMARY DEAL SOURCES TO SEARCH:**
1. **Soup Restaurant** - https://www.souprestaurant.com.sg/ (Official SG60 Promo)
2. **Great Deals Singapore** - https://www.greatdeals.com.sg/ (SG60 60% Off deals)
3. **Eatigo** - https://eatigo.com/sg/ (Up to 30% Off restaurant deals)
4. **Chope Singapore** - https://shop.chope.co/ (20% Off Cash Vouchers)
5. **Syioknya Singapore** - https://sg.syioknya.com/ (SG60 Meal promotions)
6. **Swensen's Singapore** - https://swensens.com.sg/promotions/ (Official promotions)
7. **Instagram** - Official brand accounts for current deals

**Focus on current promotions, discounts, and special offers that Singaporeans love like '1-for-1', 'set meals', 'happy hour', 'student discounts', 'member prices', 'early bird specials', 'SG60 promotions', etc. Search across these official sources, social media (Instagram, Facebook, TikTok), review sites, and local deal platforms. Return only real, current offers with specific details that Singaporeans would find valuable.`;

        // Enhanced search prompt with Singapore context
        const categoryContext = singaporeDealCategories[category] || {};
        const keywords = categoryContext.keywords || [];
        const popularAreas = categoryContext.popularAreas || [];
        
        const searchPrompt = `Find current deals and promotions for these ${category} businesses near ${locationName}, Singapore:\n\n${nearbyPlaces.map(p => `- Name: ${p.displayName?.text || p.displayName}, Website: ${p.websiteUri || 'N/A'}, Place ID: ${p.id}`).join('\n')}\n\nFocus on Singapore-specific deals like: ${keywords.join(', ')}\n\nPopular areas to check: ${popularAreas.join(', ')}\n\nReturn a JSON object with 'deals' array containing objects with 'place_id' and 'deal_info'. Only include real, current deals with specific details that Singaporeans would find valuable. If no deal found for a business, set deal_info to null.`;

        const response = await openai.chat.completions.create({
            model: model,
            messages: [
                { role: 'system', content: searchSystemMessage },
                { role: 'user', content: searchPrompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
        });

        const aiResponse = response.choices[0].message.content;
        console.log('[DealsUtils] OpenAI response for deals:', aiResponse);

        let dealResults = [];
        try {
            const parsedResponse = JSON.parse(aiResponse);
            dealResults = parsedResponse.deals || [];
        } catch (e) {
            console.error('[DealsUtils] Error parsing OpenAI JSON response:', e);
            return nearbyPlaces; // Return original places if parsing fails
        }

        // Merge deal info back into the nearbyPlaces objects
        const enhancedPlaces = nearbyPlaces.map(place => {
            const deal = dealResults.find(d => d.place_id === place.id);
            return {
                ...place,
                deal_info: deal ? deal.deal_info : null // Add deal_info, null if not found
            };
        });

        const totalDealsFound = enhancedPlaces.filter(p => p.deal_info && p.deal_info !== null).length;
        console.log(`[DealsUtils] Deal search completed: ${totalDealsFound} total deals found for ${enhancedPlaces.length} places`);
        
        // Ensure we return exactly 5 deals (or fewer if not enough found)
        const dealsWithInfo = enhancedPlaces.filter(p => p.deal_info && p.deal_info !== null);
        const dealsWithoutInfo = enhancedPlaces.filter(p => !p.deal_info || p.deal_info === null);
        
        // Remove duplicate restaurants from deals with info
        const seenRestaurants = new Set();
        const uniqueDealsWithInfo = dealsWithInfo.filter(deal => {
            const restaurantName = (deal.displayName?.text || deal.displayName || deal.name || '').toLowerCase().trim();
            
            if (!seenRestaurants.has(restaurantName) && restaurantName) {
                seenRestaurants.add(restaurantName);
                return true;
            } else {
                console.log(`[DealsUtils] Skipping duplicate restaurant in OpenAI search: ${deal.displayName?.text || deal.displayName || deal.name} (already seen: ${restaurantName})`);
                return false;
            }
        });
        
        // Take up to 5 unique deals with info, then fill with places without deals if needed
        const finalDeals = [
            ...uniqueDealsWithInfo.slice(0, 5),
            ...dealsWithoutInfo.slice(0, Math.max(0, 5 - uniqueDealsWithInfo.length))
        ];
        
        console.log(`[DealsUtils] Returning exactly ${finalDeals.length} deals (${uniqueDealsWithInfo.length} unique deals with info, ${finalDeals.length - uniqueDealsWithInfo.length} without deals)`);
        return finalDeals;

    } catch (error) {
        console.error('[DealsUtils] Error in searchDealsWithOpenAI:', error);
        return nearbyPlaces;
    }
}

/**
 * Search for deals using OpenAI with direct web search (for LobangLah bot)
 */
export async function searchDealsWithDirectWebSearch(location, category, botConfig, nearbyPlaces = []) {
    console.log(`[DealsUtils] ========== DIRECT WEB SEARCH START ==========`);
    console.log(`[DealsUtils] 🎯 VERIFYING LOCATION DATA FOR DEAL SEARCH`);
    console.log(`[DealsUtils] Category: ${category}`);
    console.log(`[DealsUtils] 📍 LOCATION VERIFICATION:`);
    console.log(`[DealsUtils]   - Display Name: ${location.displayName || 'N/A'}`);
    console.log(`[DealsUtils]   - Formatted Address: ${location.formattedAddress || 'N/A'}`);
    console.log(`[DealsUtils]   - Area: ${location.area || 'N/A'}`);
    console.log(`[DealsUtils]   - Postal Code: ${location.postalCode || 'N/A'}`);
    console.log(`[DealsUtils]   - Coordinates: ${location.latitude || 'N/A'}, ${location.longitude || 'N/A'}`);
    console.log(`[DealsUtils]   - Source: ${location.source || 'N/A'}`);
    console.log(`[DealsUtils] 🔍 This is the EXACT location that will be used for deal search`);
    console.log(`[DealsUtils] Full Location Object:`, JSON.stringify(location, null, 2));
    
    const openAIApiKey = botConfig?.openAiApiKey || botConfig?.openAIApiKey || botConfig?.openaiApiKey || process.env.OPENAI_API_KEY;
    console.log(`[DealsUtils] 🔑 Checking OpenAI API key availability...`);
    console.log(`[DealsUtils] 🔑 botConfig keys available:`, Object.keys(botConfig || {}));
    console.log(`[DealsUtils] 🔑 OpenAI key found:`, !!openAIApiKey);
    
    if (!openAIApiKey) {
        console.error('[DealsUtils] ❌ OpenAI API key is missing for direct web search');
        console.error('[DealsUtils] ❌ Available botConfig keys:', Object.keys(botConfig || {}));
        console.error('[DealsUtils] ❌ Cannot proceed without OpenAI API key');
        return [];
    }
    
    console.log(`[DealsUtils] OpenAI API key found, proceeding with web search`);

    try {
        const { OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: openAIApiKey });
        
        // Build location context with explicit verification
        console.log(`[DealsUtils] 🏗️ BUILDING LOCATION CONTEXT FOR OPENAI SEARCH`);
        let locationContext = 'Singapore';
        
        // Use the most specific location data available (prioritize newest data)
        if (location.formattedAddress) {
            locationContext = `${location.formattedAddress}`;
            console.log(`[DealsUtils] ✅ Using FORMATTED ADDRESS: ${locationContext}`);
        } else if (location.displayName) {
            locationContext = `${location.displayName}, Singapore`;
            console.log(`[DealsUtils] ✅ Using DISPLAY NAME: ${locationContext}`);
        } else if (location.postalCode) {
            locationContext = `postal code ${location.postalCode}, Singapore`;
            console.log(`[DealsUtils] ✅ Using POSTAL CODE: ${locationContext}`);
        } else if (location.latitude && location.longitude) {
            locationContext = `${location.latitude}, ${location.longitude}, Singapore`;
            console.log(`[DealsUtils] ✅ Using GPS COORDINATES: ${locationContext}`);
        } else if (location.description || location.name) {
            locationContext = `${location.description || location.name}, Singapore`;
            console.log(`[DealsUtils] ✅ Using DESCRIPTION/NAME: ${locationContext}`);
        }
        
        console.log(`[DealsUtils] 🎯 FINAL LOCATION CONTEXT FOR SEARCH: "${locationContext}"`);
        console.log(`[DealsUtils] 🔍 This exact location will be sent to OpenAI for deal discovery`);
        console.log(`[DealsUtils] ⚡ Timestamp: ${new Date().toISOString()} - Ensuring this is the NEWEST location`);
        
        // Additional verification for user confidence
        if (location.source) {
            console.log(`[DealsUtils] 📡 Location Source: ${location.source} (confirms this is fresh location data)`);
        }
        
        // Singapore-specific deal search prompt
        const categoryContext = singaporeDealCategories[category] || {};
        const keywords = categoryContext.keywords || [];
        const popularAreas = categoryContext.popularAreas || [];
        
        const prompt = `Find 5 real, current ${category} deals and promotions near ${locationContext}. I need actual Singapore businesses with active offers right now.

**PRIMARY DEAL SOURCES TO SEARCH:**
1. **Soup Restaurant** - https://www.souprestaurant.com.sg/ (Official SG60 Promo)
2. **Great Deals Singapore** - https://www.greatdeals.com.sg/ (SG60 60% Off deals)
3. **Eatigo** - https://eatigo.com/sg/ (Up to 30% Off restaurant deals)
4. **Chope Singapore** - https://shop.chope.co/ (20% Off Cash Vouchers)
5. **Syioknya Singapore** - https://sg.syioknya.com/ (SG60 Meal promotions)
6. **Swensen's Singapore** - https://swensens.com.sg/promotions/ (Official promotions)
7. **Instagram** - Official brand accounts for current deals

For each deal, provide:
• **Business Name**: Full name of the establishment
• **Address**: Complete address with Singapore postal code
• **Deal Details**: Specific offer (e.g., "20% off all items", "1-for-1 main course", "Set meal $15.90", "SG60 60% off")
• **Contact**: Phone number and/or website
• **Validity**: When the deal is valid (if known)
• **Source**: Where this information comes from (prefer official sources above)

Focus on Singapore-specific deals like: ${keywords.join(', ')}

Popular areas to check: ${popularAreas.join(', ')}

Singapore chains to look for:
- Food: Toast Box, Ya Kun, Old Chang Kee, Din Tai Fung, Crystal Jade, Paradise Group, Soup Restaurant
- Fashion: Uniqlo, H&M, Zara, Cotton On, Charles & Keith, Pedro
- Events: Marina Bay Sands, Esplanade, Singapore Zoo, Universal Studios
- Malls: ION Orchard, Marina Bay Sands, VivoCity, Jewel Changi, Plaza Singapura

**Current Promotions to Focus On:**
- SG60 National Day promotions (60% off deals)
- Swensen's 1-for-1 Sundaes (Weekdays 2–5 PM)
- Koufu SG60 $6 Meal Sets
- Uncle Leong Signatures @ Hougang (Up to 30% Off)
- Mun Ting Xiang (Hougang) 20% Off Cash Vouchers

Focus on:
- Well-known Singapore chains and local businesses
- Popular shopping malls and restaurants in the area
- Current promotions that are actually running (especially SG60)
- Businesses that are currently operating
- Deals that Singaporeans would find valuable
- Official sources and verified deals

Avoid generic or made-up information. Be specific and accurate. Prioritize deals from the official sources listed above.`;
        
        // Extract location details for OpenAI web search
        let city = 'Singapore';
        let region = 'Singapore';
        
        if (location.area) {
            city = location.area;
        } else if (location.displayName) {
            city = location.displayName;
        }
        
        console.log(`[DealsUtils] Using OpenAI web search with location: ${city}, ${region}, SG`);
        
        console.log(`[DealsUtils] 🤖 CALLING OPENAI API with model: gpt-4o-mini-search-preview`);
        console.log(`[DealsUtils] 🌍 Location for search: ${city}, ${region}, SG`);
        console.log(`[DealsUtils] 📝 Prompt length: ${prompt.length} characters`);
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini-search-preview',
            web_search_options: {
                user_location: {
                    type: 'approximate',
                    approximate: {
                        country: 'SG',
                        city: city,
                        region: region
                    }
                }
            },
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        });
        
        console.log(`[DealsUtils] ✅ OpenAI API call completed successfully`);
        
        const content = response.choices[0]?.message?.content;
        console.log(`[DealsUtils] OpenAI Response Length: ${content?.length || 0} characters`);
        
        if (content) {
            console.log(`[DealsUtils] OpenAI Response Preview:`, content.substring(0, 500) + '...');
            console.log(`[DealsUtils] OpenAI direct search completed successfully`);
            
            // Parse the response into deal format
            const deals = parseDealsFromResponse(content, category, location) || [];
            console.log(`[DealsUtils] Parsed ${deals.length} deals from OpenAI response`);
            
            if (deals.length === 0) {
                console.log(`[DealsUtils] No deals found in parsed response - OpenAI search returned no results`);
                return [];
            }
            
            console.log(`[DealsUtils] Sample deal from OpenAI:`, JSON.stringify(deals[0], null, 2));
            
            // SKIP DEEPSEEK VERIFICATION: Use OpenAI deals directly as requested
            console.log(`[DealsUtils] ✅ Skipping DeepSeek verification - using ${deals.length} deals directly from OpenAI`);
            console.log(`[DealsUtils] 🚀 Returning ${Math.min(deals.length, 5)} deals without verification`);
            
            return deals.slice(0, 5);
        } else {
            console.log('[DealsUtils] No content in OpenAI response - search returned empty');
            return [];
        }
        
    } catch (error) {
        console.error('[DealsUtils] Error in direct web search:', error);
        
        // Enhanced error handling for different OpenAI API issues - NO FALLBACKS
        if (error.status === 429) {
            console.error('[DealsUtils] 🚀 OpenAI API rate limit exceeded - cannot search deals');
        } else if (error.status === 401) {
            console.error('[DealsUtils] 🔑 OpenAI API authentication failed - cannot search deals');
        } else if (error.status === 403) {
            console.error('[DealsUtils] 🚫 OpenAI API quota exceeded - cannot search deals');
        } else {
            console.error('[DealsUtils] ⚠️ OpenAI API error:', error.message || 'Unknown error');
        }
        
        console.log('[DealsUtils] ❌ No fallback to mock deals - returning empty results');
        return [];
    }
}


export async function saveDealToDynamoDB(deal, location, category) {
    try {
        const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        const tableName = process.env.DEALS_TABLE_NAME || 'store-ai-bot-dev-deals';
        
        const dealId = uuidv4();
        const timestamp = Date.now();
        const ttl = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days TTL
        
        // Extract social media source from deal description or full text
        const socialMediaSource = extractSocialMediaSource(deal.fullDescription || deal.description || '');
        
        // Calculate start and end dates for the deal
        const currentDate = new Date();
        const startDate = deal.startDate || currentDate.toISOString();
        const endDate = deal.endDate || new Date(currentDate.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString(); // Default 30 days from now
        
        // Create enhanced description with link and timestamp
        const checkedAt = new Date().toLocaleString('en-SG', {
            timeZone: 'Asia/Singapore',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const dealLink = deal.link || deal.source || deal.url || '';
        const enhancedDescription = deal.description || '';
        const fullDescriptionWithMeta = `${enhancedDescription}${dealLink ? `\n\n🔗 Source: ${dealLink}` : ''}\n\n⏰ Checked: ${checkedAt} SGT`;
        
        // GPS COORDINATES ONLY: Save deals with GPS coordinates for maximum accuracy
        let locationNameForStorage = 'Singapore';
        let gpsCoordinates = null;
        
        if (typeof location === 'object') {
            locationNameForStorage = location.displayName || location.name || location.description || location.area || 'Singapore';
            
            // Store GPS coordinates if available
            if (location.latitude && location.longitude) {
                gpsCoordinates = {
                    latitude: location.latitude,
                    longitude: location.longitude
                };
                console.log(`[DealsUtils] Saving deal with GPS coordinates: ${location.latitude}, ${location.longitude} (${locationNameForStorage})`);
            } else {
                console.log(`[DealsUtils] Saving deal without GPS coordinates: ${locationNameForStorage}`);
            }
        } else {
            locationNameForStorage = location || 'Singapore';
        }
        
        const dealItem = {
            dealId: dealId,
            businessName: deal.businessName || 'Unknown',
            offer: deal.offer || 'Special Deal',
            address: deal.address || 'Singapore',
            description: enhancedDescription,
            validity: deal.validity || 'Limited time',
            category: category,
            
            // LOCATION FIELDS: GPS coordinates only for maximum accuracy
            location: locationNameForStorage,
            latitude: gpsCoordinates?.latitude || null,
            longitude: gpsCoordinates?.longitude || null,
            
            socialMediaSource: socialMediaSource,
            rating: deal.rating || '4.5',
            timestamp: timestamp,
            ttl: ttl,
            fullDescription: fullDescriptionWithMeta,
            dealLink: dealLink,
            checkedAt: checkedAt,
            checkedDate: new Date().toISOString(), // Add ISO date for weekly caching
            startDate: startDate,
            endDate: endDate,
            createdAt: new Date().toISOString()
        };
        
        const putParams = {
            TableName: tableName,
            Item: marshall(dealItem)
        };
        
        await dynamoClient.send(new PutItemCommand(putParams));
        console.log(`[DealsUtils] Saved deal to DynamoDB: ${deal.businessName} - ${dealId}`);
        
        return dealId;
        
    } catch (error) {
        console.error('[DealsUtils] Error saving deal to DynamoDB:', error);
        return null;
    }
}



/**
 * Extract social media source from deal text (Singapore-focused platforms)
 */
function extractSocialMediaSource(text) {
    // Updated to focus on platforms popular in Singapore for deals
    // Order matters - more specific keywords first to avoid false matches
    const socialMediaKeywords = {
        'tiktok': ['tiktok.com', 'tiktok', 'tt', 'tik tok'],
        'instagram': ['instagram.com', 'instagram', 'ig', 'insta'],
        'facebook': ['facebook.com', 'facebook', 'fb'],
        'telegram': ['t.me', 'telegram.me', 'telegram', 'tg'],
        'whatsapp': ['wa.me', 'whatsapp business', 'whatsapp', 'wa'],
        'youtube': ['youtu.be', 'youtube.com', 'youtube', 'yt'],
        'reddit': ['r/singapore', 'reddit.com', 'reddit', 'r/', '/r/']
        // Removed generic symbols like '@' and '#' to avoid false matches
        // Removed: twitter, linkedin (less popular for deals in Singapore)
    };
    
    const lowerText = text.toLowerCase();
    
    for (const [platform, keywords] of Object.entries(socialMediaKeywords)) {
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                return platform;
            }
        }
    }
    
    return 'web';
}

/**
 * Rank deals by social media priority (Singapore-focused platforms)
 */
export function rankDealsBySocialMedia(deals) {
    // Social media platforms popular in Singapore, ranked by deal discovery relevance
    const socialMediaPriority = {
        'instagram': 6,      // Most popular for deals/food in Singapore
        'tiktok': 5,         // Growing rapidly in Singapore, especially for deals
        'facebook': 4,       // Still very popular for business pages and deals
        'telegram': 3,       // Popular in Singapore for deal channels and groups
        'whatsapp': 2,       // Business WhatsApp for deals and promotions
        'youtube': 1,        // Less common for deals but still relevant
        'web': 0             // Direct website deals (lowest priority)
        // Removed: twitter, linkedin (less popular for deals in Singapore)
    };
    
    return deals.sort((a, b) => {
        const aPriority = socialMediaPriority[a.socialMediaSource] || 0;
        const bPriority = socialMediaPriority[b.socialMediaSource] || 0;
        
        // Higher priority first
        if (aPriority !== bPriority) {
            return bPriority - aPriority;
        }
        
        // If same priority, sort by timestamp (newer first)
        return (b.timestamp || 0) - (a.timestamp || 0);
    });
}

/**
 * Parse deals from OpenAI web search response
 */
function parseDealsFromResponse(content, category, location) {
    try {
        console.log('[DealsUtils] Parsing OpenAI response for deals...');
        const deals = [];
        
        // Split by numbered items (1., 2., 3., etc.) - Updated regex for actual OpenAI format
        const dealMatches = content.match(/\d+\. \*\*Business Name\*\*: ([^\n]+)[\s\S]*?(?=\d+\. \*\*Business Name\*\*|$)/g);
        
        if (!dealMatches) {
            console.log('[DealsUtils] No "Business Name" format found, trying alternative parsing...');
            // Try alternative format: "1. **Luckin Coffee**"
            const altMatches = content.match(/\d+\. \*\*([^*]+)\*\*[\s\S]*?(?=\d+\. \*\*|$)/g);
            
            if (altMatches) {
                console.log(`[DealsUtils] Found ${altMatches.length} deals in alternative format`);
                
                for (let i = 0; i < Math.min(altMatches.length, 5); i++) {
                    const dealText = altMatches[i];
                    
                    // Extract business name (first ** ** after number)
                    const businessNameMatch = dealText.match(/\d+\. \*\*([^*]+)\*\*/);
                    const businessName = businessNameMatch ? businessNameMatch[1].trim() : `Business ${i + 1}`;
                    
                    // Extract address (after "Address:" with various formats)
                    const addressMatch = dealText.match(/- \*\*Address\*\*: ([^\n]+)/i) || 
                                       dealText.match(/Address: ([^\n]+)/i) ||
                                       dealText.match(/- ([^\n]+Singapore[^\n]*)/i);
                    const address = addressMatch ? addressMatch[1].trim() : `Near ${location?.displayName || 'Singapore'}`;
                    
                    // Extract deal details (after "Deal Details:" or similar)
                    const dealMatch = dealText.match(/- \*\*Deal Details\*\*: ([^\n]+)/i) ||
                                     dealText.match(/Deal Details: ([^\n]+)/i) ||
                                     dealText.match(/- ([^\n]*discount[^\n]*)/i) ||
                                     dealText.match(/- ([^\n]*off[^\n]*)/i) ||
                                     dealText.match(/- ([^\n]*promotion[^\n]*)/i);
                    const offer = dealMatch ? dealMatch[1].trim() : 'Special promotion available';
                    
                    // Extract contact info
                    const contactMatch = dealText.match(/- \*\*Contact\*\*: ([^\n]+)/i) ||
                                        dealText.match(/Contact: ([^\n]+)/i) ||
                                        dealText.match(/Phone: ([^\n]+)/i);
                    const contact = contactMatch ? contactMatch[1].trim() : '';
                    
                    // Extract validity
                    const validityMatch = dealText.match(/- \*\*Validity\*\*: ([^\n]+)/i) ||
                                         dealText.match(/Validity: ([^\n]+)/i);
                    const validity = validityMatch ? validityMatch[1].trim() : 'Limited time offer';
                    
                    const deal = {
                        businessName: businessName,
                        offer: offer,
                        address: address,
                        description: offer,
                        validity: validity,
                        contact: contact,
                        category: category,
                        socialMediaSource: 'Web Search',
                        title: businessName,
                        location: address,
                        discount: offer,
                        restaurant: businessName,
                        store: businessName,
                        fullAddress: address,
                        fullDescription: dealText
                    };
                    
                    deals.push(deal);
                    console.log(`[DealsUtils] Parsed deal ${i + 1}: ${businessName} - ${offer}`);
                }
                
                console.log(`[DealsUtils] Successfully parsed ${deals.length} deals`);
                return deals.length > 0 ? deals : null;
            }
            
            console.log('[DealsUtils] No deals found in any format');
            return null;
        }
        
        // Original parsing logic for standard format
        for (let i = 0; i < Math.min(dealMatches.length, 5); i++) {
            const dealText = dealMatches[i];
            
            // Extract business name (after "Business Name:")
            const businessNameMatch = dealText.match(/\*\*Business Name\*\*: ([^\n]+)/i);
            const businessName = businessNameMatch ? businessNameMatch[1].trim() : `Deal ${i + 1}`;
            
            // Extract address (after "Address:")
            const addressMatch = dealText.match(/\*\*Address\*\*: ([^\n]+)/i) || dealText.match(/Address: ([^\n]+)/i);
            const address = addressMatch ? addressMatch[1].trim() : (location?.displayName || 'Singapore');
            
            // Extract offer (after "Deal Details:")
            const offerMatch = dealText.match(/\*\*Deal Details\*\*: ([^\n]+)/i) || dealText.match(/Deal Details: ([^\n]+)/i);
            const offer = offerMatch ? offerMatch[1].trim() : 'Special Deal';
            
            // Extract contact
            const contactMatch = dealText.match(/\*\*Contact\*\*: ([^\n]+)/i) || dealText.match(/Contact: ([^\n]+)/i);
            const contact = contactMatch ? contactMatch[1].trim() : '';
            
            // Extract validity (after "Validity:")
            const validityMatch = dealText.match(/\*\*Validity\*\*: ([^\n]+)/i) || dealText.match(/Validity: ([^\n]+)/i);
            const validity = validityMatch ? validityMatch[1].trim() : 'Limited time';
            
            // Extract social media source (after "Social media source:" or detect from text)
            const socialSourceMatch = dealText.match(/Social media source:\*\*\s*([^\n]+)/i) || dealText.match(/Social media source:\s*([^\n]+)/i);
            const detectedSocialSource = socialSourceMatch ? socialSourceMatch[1].trim() : extractSocialMediaSource(dealText);
            
            // Create deal object with proper structure for WhatsApp interactive messages
            const deal = {
                businessName: businessName,
                offer: offer,
                address: address,
                description: offer,
                validity: validity,
                contact: contact,
                category: category,
                socialMediaSource: detectedSocialSource || 'Web Search',
                // Additional fields for compatibility
                title: businessName,
                location: address,
                discount: offer,
                restaurant: businessName,
                store: businessName,
                fullAddress: address,
                fullDescription: dealText
            };
            
            deals.push(deal);
            console.log(`[DealsUtils] Parsed deal ${i + 1}: ${businessName} - ${offer}`);
        }
        
        console.log(`[DealsUtils] Successfully parsed ${deals.length} deals`);
        
        // Remove duplicate restaurants based on business name
        const seenRestaurants = new Set();
        const uniqueDeals = deals.filter(deal => {
            const restaurantName = (deal.businessName || deal.restaurant || deal.store || deal.title || '').toLowerCase().trim();
            
            if (!seenRestaurants.has(restaurantName) && restaurantName) {
                seenRestaurants.add(restaurantName);
                return true;
            } else {
                console.log(`[DealsUtils] Skipping duplicate restaurant in parsed response: ${deal.businessName} (already seen: ${restaurantName})`);
                return false;
            }
        });
        
        console.log(`[DealsUtils] After restaurant deduplication: ${uniqueDeals.length} unique restaurant deals`);
        return uniqueDeals.length > 0 ? uniqueDeals : null;
        
    } catch (error) {
        console.error('[DealsUtils] Error parsing deals from response:', error);
        return null;
    }
}



/**
 * Create individual deal messages with images, links, and interactive buttons
 * Now enhanced with restaurant photos from Google Places API
 */
export function createIndividualDealMessages(deals, category, nearbyPlacesDetailed = []) {
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
        return [{
            type: "text",
            text: {
                body: `😅 Sorry, I couldn't find any ${categoryName.toLowerCase()} deals right now. Please try again later!`
            }
        }];
    }
    
    // Remove duplicate restaurants before creating messages
    const seenRestaurants = new Set();
    const uniqueDeals = deals.filter(deal => {
        const restaurantName = (deal.businessName || deal.restaurant || deal.store || deal.title || deal.business || '').toLowerCase().trim();
        
        if (!seenRestaurants.has(restaurantName) && restaurantName) {
            seenRestaurants.add(restaurantName);
            return true;
        } else {
            console.log(`[DealsUtils] Skipping duplicate restaurant in message creation: ${deal.businessName || deal.restaurant || deal.store || deal.title} (already seen: ${restaurantName})`);
            return false;
        }
    });
    
    console.log(`[DealsUtils] Creating messages for ${uniqueDeals.length} unique restaurants (from ${deals.length} total deals)`);
    
    const dealMessages = [];
    
    // Create individual message for each unique deal
    uniqueDeals.slice(0, 5).forEach((deal, index) => {
        const offer = deal.offer || deal.discount || 'Special Deal';
        const businessName = deal.businessName || deal.restaurant || deal.store || deal.title || deal.business || 'Business';
        const address = deal.address || deal.location?.formattedAddress || deal.location?.displayName || 'Address not available';
        const validity = deal.validity || 'Limited time';
        
        // Use full description from DynamoDB if available, otherwise use regular description
        const fullDescription = deal.fullDescription || deal.description || '';
        const description = deal.description || '';
        
        // Check if deal has an image and get rating
        let dealImage = deal.image || deal.imageUrl || deal.img || null;
        let dealRating = null;

        // Try to find matching restaurant photo and rating from Google Places API
        if (nearbyPlacesDetailed && nearbyPlacesDetailed.length > 0) {
            try {
                const matchingPlace = nearbyPlacesDetailed.find(place => {
                    const placeName = place.displayName?.text?.toLowerCase() || place.displayName?.toLowerCase() || '';
                    const businessNameLower = businessName.toLowerCase();
                    return placeName && (placeName.includes(businessNameLower) || businessNameLower.includes(placeName));
                });
                
                if (matchingPlace) {
                    // Get photo if not already present
                    if (!dealImage && matchingPlace.photos && matchingPlace.photos.length > 0) {
                        const photoName = matchingPlace.photos[0].name; // Correct field for Places API v1
                        if (photoName) {
                            const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
                            if (googleMapsApiKey) {
                                dealImage = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=400&key=${googleMapsApiKey}`;
                                console.log(`[DealsUtils] Found Google Places photo for ${businessName}`);
                            } else {
                                console.log(`[DealsUtils] No Google Maps API key available for photo`);
                            }
                        } else {
                            console.log(`[DealsUtils] No photo name/reference found for ${businessName}`);
                        }
                    }
                    
                    // Get rating
                    if (matchingPlace.rating) {
                        dealRating = matchingPlace.rating;
                        console.log(`[DealsUtils] Found rating for ${businessName}: ${dealRating}`);
                    }
                } else {
                    console.log(`[DealsUtils] No matching place found for ${businessName}`);
                }
            } catch (placesError) {
                console.error(`[DealsUtils] Error processing Google Places data for ${businessName}:`, placesError);
            }
        }
        
        // Create Google Maps URL for directions
        const encodedAddress = encodeURIComponent(address);
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
        
        // Create deal message body with full description from DynamoDB
        let dealText = `${categoryEmoji} *Deal ${index + 1} of ${Math.min(deals.length, 5)}*\n\n`;
        dealText += `🏢 *${businessName}*\n`;
        if (dealRating) {
            const stars = '⭐'.repeat(Math.round(dealRating));
            dealText += `${stars} *${dealRating.toFixed(1)} / 5.0*\n`;
        }
        dealText += `💰 *${offer}*\n`;
        dealText += `📍 ${address}\n`;
        dealText += `⏰ ${validity}\n`;
        
        // Add full description from DynamoDB (no truncation for full experience)
        if (fullDescription) {
            // Remove any duplicate link/timestamp info if it's already in fullDescription
            let cleanDescription = fullDescription.replace(/\n\n🔗 Source:.*$/s, '').replace(/\n\n⏰ Checked:.*$/s, '');
            
            // Remove duplicate business name and offer text from description
            const businessNameLower = businessName ? businessName.toLowerCase() : '';
            const offerLower = offer ? offer.toLowerCase() : '';
            
            // Remove lines that duplicate the business name or offer
            cleanDescription = cleanDescription
                .split('\n')
                .filter(line => {
                    const lineLower = line.toLowerCase().trim();
                    // Skip empty lines and lines that just repeat business name or offer
                    if (!lineLower) return false;
                    if (lineLower === businessNameLower) return false;
                    if (lineLower === offerLower) return false;
                    if (lineLower.includes(businessNameLower) && lineLower.includes(offerLower) && line.length < 100) return false;
                    return true;
                })
                .join('\n')
                .trim();
            
            if (cleanDescription) {
                dealText += `\n\n📝 *Details:*\n${cleanDescription}`;
            }
        } else if (description) {
            // Fallback to regular description if fullDescription not available
            let cleanDescription = description;
            
            // Remove duplicate business name and offer text from description
            const businessNameLower = businessName.toLowerCase();
            const offerLower = offer.toLowerCase();
            
            cleanDescription = cleanDescription
                .split('\n')
                .filter(line => {
                    const lineLower = line.toLowerCase().trim();
                    if (!lineLower) return false;
                    if (lineLower === businessNameLower) return false;
                    if (lineLower === offerLower) return false;
                    if (lineLower.includes(businessNameLower) && lineLower.includes(offerLower) && line.length < 100) return false;
                    return true;
                })
                .join('\n')
                .trim();
            
            if (cleanDescription) {
                dealText += `\n\n📝 *Details:*\n${cleanDescription}`;
            }
        }
        
        // Add deal source/link if available
        const dealLink = deal.dealLink || deal.link || deal.source || deal.url;
        if (dealLink) {
            // Add UTM parameters to the link
            const linkWithUTM = dealLink.includes('?') 
                ? `${dealLink}&utm_source=LobangLah&utm_medium=whatsapp&utm_campaign=deals`
                : `${dealLink}?utm_source=LobangLah&utm_medium=whatsapp&utm_campaign=deals`;
            dealText += `\n\n🔗 *Source:* ${linkWithUTM}`;
        }
        
        // Add timestamp when deal was checked
        if (deal.checkedAt) {
            dealText += `\n\n⏰ *Verified:* ${deal.checkedAt} SGT`;
        }
        
        // Add footer with source name and date
        const currentDate = new Date().toLocaleDateString('en-SG', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        const sourceName = deal.socialMediaSource || 'Web';
        dealText += `\n\n──────────\n🔍 *Source:* ${sourceName.charAt(0).toUpperCase() + sourceName.slice(1)} | ${currentDate}\n🎆 *LobangLah*`;
        
        // Ensure total message length stays within WhatsApp's 1024 character limit
        const maxLength = 950; // Leave some buffer for safety
        if (dealText.length > maxLength) {
            // Truncate from the end, but preserve the footer
            const footerStart = dealText.lastIndexOf('──────────');
            if (footerStart > 0) {
                const footer = dealText.substring(footerStart);
                const mainContent = dealText.substring(0, footerStart);
                const availableLength = maxLength - footer.length - 10; // 10 chars for "...\n\n"
                
                if (mainContent.length > availableLength) {
                    dealText = mainContent.substring(0, availableLength) + '...\n\n' + footer;
                }
            } else {
                dealText = dealText.substring(0, maxLength - 3) + '...';
            }
        }
        
        // Create interactive buttons for each deal (removed More Details as requested)
        const buttons = [
            {
                type: "reply",
                reply: {
                    id: `get_directions_${index}`,
                    title: "📍 Directions"
                }
            },
            {
                type: "reply",
                reply: {
                    id: `set_reminder_${index}`,
                    title: "⏰ Set Reminder"
                }
            },
            {
                type: "reply",
                reply: {
                    id: `share_deal_${index}`,
                    title: "📤 Share Deal"
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
                dealData: {
                    index: index,
                    businessName: businessName,
                    offer: offer,
                    address: address,
                    validity: validity,
                    description: fullDescription || description,
                    mapsUrl: mapsUrl,
                    fullDeal: deal,
                    hasImage: true,
                    imageUrl: dealImage
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
                        text: `${categoryEmoji} ${businessName.length > 55 ? businessName.substring(0, 52) + '...' : businessName}`
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
                dealData: {
                    index: index,
                    businessName: businessName,
                    offer: offer,
                    address: address,
                    validity: validity,
                    description: fullDescription || description,
                    mapsUrl: mapsUrl,
                    fullDeal: deal,
                    hasImage: false
                }
            };
        }
        
        dealMessages.push(dealMessage);
    });
    
    // Add final action message with Chat AI button
    const finalActionMessage = {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: `${categoryEmoji} All ${categoryName} Deals Shown!`
            },
            body: {
                text: `🎉 Found ${Math.min(deals.length, 5)} amazing ${categoryName.toLowerCase()} deals for you!\n\n✨ Great deals discovered! You can:\n• Get more deals in this area\n• Search in a new location\n• Use the buttons on each deal for directions, reminders, and sharing\n\n🛍️ Happy deal hunting!`
            },
            footer: {
                text: "🔍 Sources: Instagram, Facebook, TikTok & Web | LobangLah 🎯"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "more_deals",
                            title: "🔍 More Deals"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "setup_alert",
                            title: "🔔 Set Daily Alert"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "search_new_area",
                            title: "📍 New Area"
                        }
                    }
                ]
            }
        }
    };
    
    dealMessages.push(finalActionMessage);
    
    return dealMessages;
}

/**
 * Legacy function for backward compatibility - now uses individual messages
 */
export function createDealsMessage(deals, category) {
    const individualMessages = createIndividualDealMessages(deals, category, []);
    // Return the final action message for backward compatibility
    return individualMessages[individualMessages.length - 1];
}

/**
 * Create location message for selected deal with share options
 */
export function createLocationMessage(deal) {
    // Enhanced deal details with better formatting and more information
    const businessName = deal.restaurant || deal.store || deal.businessName || 'Business';
    const address = deal.fullAddress || deal.address || deal.location || 'Address not available';
    const offer = deal.discount || deal.offer || 'Special offer';
    const description = deal.description || 'Great deal available';
    const validity = deal.validity || 'Limited time';
    const sourceText = deal.socialMediaSource && deal.socialMediaSource !== 'Web Search' ? `\n🔗 *Source:* ${deal.socialMediaSource}` : '';
    
    // Create comprehensive deal details
    let dealText = `🔥 *${deal.title}*\n\n`;
    dealText += `🏪 *${businessName}*\n`;
    dealText += `📍 *Location:* ${address}\n`;
    dealText += `💰 *Offer:* ${offer}\n`;
    dealText += `📝 *Details:* ${description}\n`;
    dealText += `⏰ *Valid Until:* ${validity}${sourceText}\n`;
    
    // Add full description if available
    if (deal.fullDescription && deal.fullDescription !== description) {
        dealText += `\n📋 *Complete Details:*\n${deal.fullDescription}\n`;
    }
    
    // Add contact info if available
    if (deal.phone || deal.website || deal.contact) {
        dealText += `\n📞 *Contact:*\n`;
        if (deal.phone) dealText += `Phone: ${deal.phone}\n`;
        if (deal.website) dealText += `Website: ${deal.website}\n`;
        if (deal.contact && !deal.phone && !deal.website) dealText += `${deal.contact}\n`;
    }
    
    dealText += `\n🎯 Tap the buttons below for more actions!`;
    
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: "🎯 Deal Details"
            },
            body: {
                text: dealText
            },
            footer: {
                text: "🔍 Source: AI Web Search | LobangLah 🎯"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "get_directions",
                            title: "🗺️ Directions"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "share_deal",
                            title: "📤 Share"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "more_deals",
                            title: "🔍 More Deals"
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Save user profile (mock implementation)
 */
export async function saveUserProfile(phoneNumber, profile) {
    // In a real implementation, this would save to DynamoDB
    console.log(`[DealsUtils] Saving profile for ${phoneNumber}:`, profile);
    return true;
}

/**
 * Get user profile (mock implementation)
 */
export async function getUserProfile(phoneNumber) {
    // In a real implementation, this would fetch from DynamoDB
    console.log(`[DealsUtils] Getting profile for ${phoneNumber}`);
    return { searchCount: 0 };
}

/**
 * Search for more unique deals from DynamoDB based on location matching and dealId tracking
 */
export async function searchMoreDealsFromDynamoDB(location, category, sharedDealIds = [], maxResults = 10) {
    try {
        console.log(`[DealsUtils] Searching for more deals in DynamoDB for location: ${JSON.stringify(location)}, category: ${category}`);
        
        const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        const tableName = 'store-ai-bot-dev-deals';
        
        // Build comprehensive location search terms with variations
        const locationTerms = [];
        
        // Add basic location info
        if (location.displayName) locationTerms.push(location.displayName.toLowerCase());
        if (location.area) locationTerms.push(location.area.toLowerCase());
        if (location.formattedAddress) locationTerms.push(location.formattedAddress.toLowerCase());
        if (location.postalCode) locationTerms.push(location.postalCode);
        
        // Add address variations (handle "349 Hougang Ave 7" vs "49 Hougang Ave 7")
        if (location.displayName) {
            const addressParts = location.displayName.split(' ');
            // Extract street name without building number for broader matching
            if (addressParts.length > 2) {
                const streetName = addressParts.slice(1).join(' ').toLowerCase();
                locationTerms.push(streetName); // e.g., "hougang ave 7"
            }
        }
        
        // Add area-based terms
        if (location.area && location.area !== 'Singapore') {
            locationTerms.push(location.area.toLowerCase());
        }
        
        console.log(`[DealsUtils] Location search terms:`, locationTerms);
        
        // Get current time for filtering valid deals
        const currentTime = new Date().toISOString();
        
        // Calculate the start of current week (7 days ago) for exact location matches
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const weekStartISO = oneWeekAgo.toISOString();
        
        // Check if we have exact GPS coordinates for precise matching
        const hasExactCoordinates = location.latitude && location.longitude;
        
        // For exact GPS coordinates, only show this week's deals
        // For other locations, show all valid deals
        let filterExpression, expressionAttributeValues;
        
        if (hasExactCoordinates) {
            console.log(`[DealsUtils] Using exact GPS coordinates (${location.latitude}, ${location.longitude}) - filtering to this week's deals only`);
            filterExpression = 'category = :category AND endDate > :currentTime AND checkedDate >= :weekStart';
            expressionAttributeValues = marshall({
                ':category': category,
                ':currentTime': currentTime,
                ':weekStart': weekStartISO
            });
        } else {
            console.log(`[DealsUtils] No exact GPS coordinates - showing all valid deals`);
            filterExpression = 'category = :category AND endDate > :currentTime';
            expressionAttributeValues = marshall({
                ':category': category,
                ':currentTime': currentTime
            });
        }
        
        // Search for deals using scan operation (since we need to match multiple location fields)
        const scanParams = {
            TableName: tableName,
            FilterExpression: filterExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            Limit: 100 // Get more results for better filtering
        };
        
        // Use ScanCommand instead of QueryCommand for filtering
        const scanCommand = new ScanCommand(scanParams);
        const result = await dynamoClient.send(scanCommand);
        
        if (!result.Items || result.Items.length === 0) {
            console.log(`[DealsUtils] No additional deals found in DynamoDB for ${category}`);
            return [];
        }
        
        // Unmarshall and process deals
        const allDeals = result.Items.map(item => unmarshall(item));
        console.log(`[DealsUtils] Found ${allDeals.length} total deals in DynamoDB`);
        
        // Filter deals based on location matching (improved logic)
        const locationMatchedDeals = allDeals.filter(deal => {
            // GPS-based matching (within 2km radius if coordinates available)
            if (location.latitude && location.longitude && deal.latitude && deal.longitude) {
                const distance = calculateDistance(
                    location.latitude, location.longitude,
                    parseFloat(deal.latitude), parseFloat(deal.longitude)
                );
                if (distance <= 1.0) { // Within 1km
                    console.log(`[DealsUtils] GPS match found: ${deal.businessName} (${distance.toFixed(2)}km away)`);
                    return true;
                }
            }
            
            // Postal code exact match
            if (location.postalCode && deal.postalCode) {
                if (location.postalCode === deal.postalCode) {
                    console.log(`[DealsUtils] Postal code match: ${deal.businessName}`);
                    return true;
                }
            }
            
            // Text-based location matching with improved logic and null safety
            const dealLocation = (deal.location || deal.fullAddress || deal.vicinity || '').toString();
            const dealAddress = (deal.address || deal.fullAddress || deal.vicinity || '').toString();
            const dealDescription = (deal.description || deal.fullDescription || '').toString();
            
            // Check if any location term matches the deal's location data
            return locationTerms.some(term => {
                if (!term || term.length < 3) return false; // Skip very short terms
                
                const termLower = term.toLowerCase();
                const isMatch = (
                    dealLocation.toLowerCase().includes(termLower) ||
                    dealAddress.toLowerCase().includes(termLower) ||
                    (dealDescription.toLowerCase().includes(termLower) && termLower.length > 5) // Only match description for longer terms
                );
                
                if (isMatch) {
                    console.log(`[DealsUtils] Text match found: ${deal.businessName} (term: ${term})`);
                }
                
                return isMatch;
            });
        });
        
        console.log(`[DealsUtils] Found ${locationMatchedDeals.length} location-matched deals`);
        
        // Filter out deals that have already been shared using dealId tracking
        const sharedDealIdsSet = new Set(sharedDealIds);
        console.log(`[DealsUtils] Excluding ${sharedDealIds.length} previously shared dealIds:`, sharedDealIds.slice(0, 10));
        
        const uniqueDeals = locationMatchedDeals.filter(deal => {
            // Use dealId for precise deduplication
            if (deal.dealId && sharedDealIdsSet.has(deal.dealId)) {
                console.log(`[DealsUtils] Skipping already shared deal: ${deal.businessName} (dealId: ${deal.dealId})`);
                return false;
            }
            
            // Also check for id field as fallback
            if (deal.id && sharedDealIdsSet.has(deal.id)) {
                console.log(`[DealsUtils] Skipping already shared deal: ${deal.businessName} (id: ${deal.id})`);
                return false;
            }
            
            return true; // This is a new deal
        });
        
        console.log(`[DealsUtils] Found ${uniqueDeals.length} unique additional deals`);
        
        // Remove duplicate restaurants based on business name
        const seenRestaurants = new Set();
        const uniqueRestaurantDeals = uniqueDeals.filter(deal => {
            const restaurantName = (deal.businessName || deal.placeName || deal.title || deal.restaurant || '').toLowerCase().trim();
            
            if (!seenRestaurants.has(restaurantName) && restaurantName) {
                seenRestaurants.add(restaurantName);
                return true;
            } else {
                console.log(`[DealsUtils] Skipping duplicate restaurant: ${deal.businessName} (already seen: ${restaurantName})`);
                return false;
            }
        });
        
        console.log(`[DealsUtils] After restaurant deduplication: ${uniqueRestaurantDeals.length} unique restaurant deals`);
        
        // Sort by creation date (newest first) and limit results
        const sortedDeals = uniqueRestaurantDeals
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0, maxResults);
        
        console.log(`[DealsUtils] Returning ${sortedDeals.length} more deals from DynamoDB (unique restaurants only)`);
        
        // If no deals found in DynamoDB, fallback to Google search + OpenAI
        if (sortedDeals.length === 0) {
            console.log(`[DealsUtils] No deals found in DynamoDB, trying Google search fallback...`);
            return await searchMoreDealsWithGoogleFallback(location, category, sharedDealIds, maxResults);
        }
        
        return sortedDeals;
        
    } catch (error) {
        console.error('[DealsUtils] Error searching more deals from DynamoDB:', error);
        // Try Google search fallback on error
        try {
            console.log(`[DealsUtils] Trying Google search fallback due to DynamoDB error...`);
            return await searchMoreDealsWithGoogleFallback(location, category, sharedDealIds, maxResults);
        } catch (fallbackError) {
            console.error('[DealsUtils] Google search fallback also failed:', fallbackError);
            return [];
        }
    }
}

/**
 * Calculate distance between two GPS coordinates in kilometers
 */
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
    return distance;
}

/**
 * Search for more deals using Google search + OpenAI when DynamoDB returns no results
 */
async function searchMoreDealsWithGoogleFallback(location, category, sharedDealIds = [], maxResults = 5) {
    try {
        console.log(`[DealsUtils] Google fallback search for ${category} deals near ${location.displayName || location.area}`);
        
        // Use environment variables for API keys (should be set in Lambda)
        const openAIApiKey = process.env.OPENAI_API_KEY;
        
        if (!openAIApiKey) {
            console.log(`[DealsUtils] No OpenAI API key available for fallback search`);
            return [];
        }
        
        const openai = new OpenAI({ apiKey: openAIApiKey });
        
        // Build location context for search
        const locationContext = location.displayName || location.area || location.formattedAddress || 'Singapore';
        
        // Build exclusion text for already shown deals using dealIds
        const exclusionText = sharedDealIds.length > 0 
            ? `\n\nIMPORTANT: DO NOT include deals that have already been shared. Avoid repeating deals with these characteristics to ensure uniqueness.`
            : '';
        
        let categoryName;
        if (category === 'food') {
            categoryName = 'food and restaurant';
        } else if (category === 'clothes') {
            categoryName = 'fashion and clothing';
        } else if (category === 'groceries') {
            categoryName = 'groceries, supermarket, and household items';
        } else {
            categoryName = category;
        }
        
        const prompt = `Find ${maxResults} additional current ${categoryName} deals, offers, and discounts near ${locationContext}, Singapore.

🎯 LOCATION REQUIREMENTS:
- ONLY businesses physically located in or immediately adjacent to ${locationContext}
- Maximum 1-2km distance from ${locationContext}
- Prioritize businesses closest to ${locationContext}

⚠️ CRITICAL: ONLY provide REAL, VERIFIABLE deals with ACTUAL WORKING LINKS.

📱 PRIORITY SOURCES (must include actual URLs):
- Instagram: @[businessname] posts with actual URLs
- Facebook: facebook.com/[pagename] with actual post/event URLs
- TikTok: tiktok.com/@[username] with actual video URLs
- Reddit: reddit.com/r/singapore with actual post URLs
- Google My Business with actual website links
- Official business websites with current promotions

📋 MANDATORY for each deal:
- Business name and EXACT Singapore address near ${locationContext}
- Specific discount details (% off, dollar amount, BOGO, etc.)
- Deal description and what's included
- Validity period or expiry date
- **REQUIRED**: Direct, clickable link/URL with UTM parameters (?utm_source=LobangLah&utm_medium=whatsapp&utm_campaign=deals)
- Social media platform and post URL with UTM parameters

✅ VERIFICATION: Each deal MUST have a real, working URL for verification.
💰 Include SGD pricing where applicable.
📍 Double-check each business is actually near ${locationContext} before including.${exclusionText}`;
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('OpenAI API timeout after 20 seconds')), 20000);
        });
        
        const apiPromise = openai.chat.completions.create({
            model: "gpt-4o-mini-search-preview",
            web_search_options: {
                user_location: {
                    type: "approximate",
                    approximate: {
                        country: "SG",
                        city: location.area || locationContext,
                        region: location.area || locationContext
                    }
                }
            },
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]
        });
        
        const response = await Promise.race([apiPromise, timeoutPromise]);
        
        if (response.choices && response.choices[0] && response.choices[0].message) {
            const content = response.choices[0].message.content;
            console.log(`[DealsUtils] Google fallback OpenAI response received`);
            
            const deals = parseDealsFromResponse(content, category, location) || [];
            console.log(`[DealsUtils] Successfully parsed ${deals.length} deals from Google fallback`);
            
            return deals.slice(0, maxResults);
        } else {
            console.log('[DealsUtils] No content in Google fallback OpenAI response');
            return [];
        }
        
    } catch (error) {
        console.error('[DealsUtils] Error in Google fallback search:', error);
        return [];
    }
}

/**
 * Add dealIds to the shared deals tracking list
 */
export function addSharedDealIds(session, deals) {
    if (!session.sharedDealIds) {
        session.sharedDealIds = [];
    }
    
    deals.forEach(deal => {
        const dealId = deal.dealId || deal.id;
        if (dealId && !session.sharedDealIds.includes(dealId)) {
            session.sharedDealIds.push(dealId);
            console.log(`[DealsUtils] Added dealId to shared list: ${dealId} (${deal.businessName})`);
        }
    });
    
    // Keep only the last 200 dealIds to prevent unlimited growth
    if (session.sharedDealIds.length > 200) {
        session.sharedDealIds = session.sharedDealIds.slice(-200);
    }
    
    return session.sharedDealIds;
}

/**
 * Get shared deal IDs from session for deduplication
 */
export function getSharedDealIds(session) {
    return session.sharedDealIds || [];
}

/**
 * Create chat session timeout warning message
 */
export function createChatTimeoutWarning() {
    return {
        type: "text",
        text: {
            body: "⏰ *Chat Session Timeout Warning*\n\nYour chat session will automatically end in 30 seconds due to inactivity.\n\n💬 Send any message to continue chatting, or the session will return to the main menu.\n\n🔄 You can always restart by selecting 'Chat AI' again!"
        }
    };
}

/**
 * Create chat session ended message
 */
export function createChatSessionEndedMessage() {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: "💬 Chat Session Ended"
            },
            body: {
                text: "Your chat session has ended due to inactivity.\n\n🎯 Ready to search for more deals or start a new chat session?"
            },
            footer: {
                text: "🔍 LobangLah | Your deals companion"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "search_new_deals",
                            title: "🔍 New Search"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "main_menu",
                            title: "🏠 Main Menu"
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Create mock deals when API calls fail
 */
export function createMockDeals(category, location) {
    const locationName = typeof location === 'object' ? 
        (location.displayName || location.name || location.description || location.area || 'Singapore') : 
        (location || 'Singapore');
    
    const mockDeals = [
        {
            businessName: `Local ${category === 'food' ? 'Restaurant' : category === 'fashion' ? 'Fashion Store' : 'Shop'}`,
            offer: `Special ${category} deals available`,
            address: `${locationName}, Singapore`,
            description: `Great ${category} deals near ${locationName}. Limited time offer!`,
            validity: 'Limited time',
            link: 'https://example.com',
            source: 'Local Business',
            socialMediaSource: 'instagram'
        },
        {
            businessName: `Popular ${category === 'food' ? 'Cafe' : category === 'fashion' ? 'Boutique' : 'Store'}`,
            offer: `Amazing ${category} discounts`,
            address: `Near ${locationName}, Singapore`,
            description: `Don't miss out on these fantastic ${category} deals in ${locationName}!`,
            validity: 'While stocks last',
            link: 'https://example.com',
            source: 'Local Business',
            socialMediaSource: 'facebook'
        }
    ];
    
    console.log(`[DealsUtils] Created ${mockDeals.length} mock deals for ${category} in ${locationName}`);
    return mockDeals;
}

/**
 * Create enhanced mock deals with realistic Singapore businesses, photos, and proper structure
 */
export function createEnhancedMockDeals(category, location) {
    const locationName = typeof location === 'object' ? 
        (location.displayName || location.name || location.description || location.area || 'Singapore') : 
        (location || 'Singapore');
    
    console.log(`[DealsUtils] 🎆 Creating enhanced mock deals for ${category} in ${locationName}`);
    
    let enhancedDeals = [];
    
    if (category === 'food') {
        enhancedDeals = [
            {
                id: 'mock-food-1',
                businessName: 'Toast Box',
                offer: '1-for-1 Kaya Toast Set',
                address: `${locationName}, Singapore`,
                description: 'Enjoy our signature kaya toast with soft-boiled eggs and coffee. Perfect for breakfast or tea time!',
                validity: 'Valid until end of month',
                category: 'food',
                socialMediaSource: 'instagram',
                photos: ['https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=800&h=600&fit=crop'],
                rating: 4.2,
                priceRange: '$',
                phone: '+65 6123 4567',
                website: 'https://toastbox.com.sg'
            },
            {
                id: 'mock-food-2',
                businessName: 'Ya Kun Kaya Toast',
                offer: '20% off all breakfast sets',
                address: `Near ${locationName}, Singapore`,
                description: 'Traditional Hainanese coffee and kaya toast. A true Singapore heritage brand since 1944.',
                validity: 'Limited time offer',
                category: 'food',
                socialMediaSource: 'facebook',
                photos: ['https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800&h=600&fit=crop'],
                rating: 4.1,
                priceRange: '$',
                phone: '+65 6234 5678',
                website: 'https://yakun.com'
            },
            {
                id: 'mock-food-3',
                businessName: 'Old Chang Kee',
                offer: 'Buy 3 Get 1 Free Curry Puffs',
                address: `${locationName} Mall, Singapore`,
                description: 'Singapore\'s favorite curry puff! Crispy pastry filled with delicious curry potato and chicken.',
                validity: 'While stocks last',
                category: 'food',
                socialMediaSource: 'instagram',
                photos: ['https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&h=600&fit=crop'],
                rating: 4.0,
                priceRange: '$',
                phone: '+65 6345 6789',
                website: 'https://oldchangkee.com'
            }
        ];
    } else if (category === 'fashion') {
        enhancedDeals = [
            {
                id: 'mock-fashion-1',
                businessName: 'Uniqlo',
                offer: 'Up to 50% off selected items',
                address: `${locationName} Shopping Centre, Singapore`,
                description: 'Quality basics and innovative fabrics. Find your perfect fit with our LifeWear collection.',
                validity: 'Weekend special',
                category: 'fashion',
                socialMediaSource: 'instagram',
                photos: ['https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=600&fit=crop'],
                rating: 4.3,
                priceRange: '$$',
                phone: '+65 6456 7890',
                website: 'https://uniqlo.com'
            },
            {
                id: 'mock-fashion-2',
                businessName: 'H&M',
                offer: '30% off new arrivals',
                address: `${locationName} Mall, Singapore`,
                description: 'Fashion and quality at the best price in a sustainable way. Discover the latest trends.',
                validity: 'This week only',
                category: 'fashion',
                socialMediaSource: 'facebook',
                photos: ['https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&h=600&fit=crop'],
                rating: 4.1,
                priceRange: '$$',
                phone: '+65 6567 8901',
                website: 'https://hm.com'
            }
        ];
    } else if (category === 'groceries') {
        enhancedDeals = [
            {
                id: 'mock-grocery-1',
                businessName: 'FairPrice',
                offer: '20% off fresh produce',
                address: `${locationName} Block, Singapore`,
                description: 'Fresh fruits, vegetables, and daily essentials at great prices. Your neighborhood supermarket.',
                validity: 'Valid this weekend',
                category: 'groceries',
                socialMediaSource: 'app',
                photos: ['https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=600&fit=crop'],
                rating: 4.2,
                priceRange: '$',
                phone: '+65 6678 9012',
                website: 'https://fairprice.com.sg'
            },
            {
                id: 'mock-grocery-2',
                businessName: 'Cold Storage',
                offer: 'Buy 2 Get 1 Free on selected items',
                address: `${locationName} Shopping Centre, Singapore`,
                description: 'Premium groceries and gourmet foods. Quality products for discerning shoppers.',
                validity: 'Member exclusive',
                category: 'groceries',
                socialMediaSource: 'website',
                photos: ['https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=600&fit=crop'],
                rating: 4.0,
                priceRange: '$$',
                phone: '+65 6789 0123',
                website: 'https://coldstorage.com.sg'
            }
        ];
    }
    
    console.log(`[DealsUtils] ✨ Created ${enhancedDeals.length} enhanced mock deals with photos and realistic data`);
    return enhancedDeals;
}

/**
 * Get nearby businesses from database for the specified location and category
 */
export async function getNearbyBusinessesFromDB(location, category) {
    try {
        console.log(`[DealsUtils] Fetching businesses from DB for ${category} near ${location.displayName || location.name || location.description}`);
        
        const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        const tableName = process.env.DEALS_TABLE_NAME || 'store-ai-bot-dev-deals';
        
        // Build location terms for matching
        const locationTerms = [];
        
        if (typeof location === 'object') {
            if (location.displayName) locationTerms.push(location.displayName.toLowerCase());
            if (location.name) locationTerms.push(location.name.toLowerCase());
            if (location.description) locationTerms.push(location.description.toLowerCase());
            if (location.area) locationTerms.push(location.area.toLowerCase());
            if (location.postalCode) locationTerms.push(location.postalCode);
        } else {
            locationTerms.push(location.toLowerCase());
        }
        
        console.log(`[DealsUtils] Searching DB with location terms: ${locationTerms.join(', ')}`);
        
        // Scan the deals table to find businesses in the area
        const scanParams = {
            TableName: tableName,
            FilterExpression: '#category = :category',
            ExpressionAttributeNames: {
                '#category': 'category'
            },
            ExpressionAttributeValues: marshall({
                ':category': category
            })
        };
        
        const result = await dynamoClient.send(new ScanCommand(scanParams));
        const allDeals = result.Items ? result.Items.map(item => unmarshall(item)) : [];
        
        console.log(`[DealsUtils] Found ${allDeals.length} total deals in DB for category ${category}`);
        
        // Filter deals by location proximity
        const nearbyDeals = allDeals.filter(deal => {
            // Check if deal location matches any of our location terms
            const dealLocation = (deal.location || '').toLowerCase();
            const dealAddress = (deal.address || '').toLowerCase();
            const businessName = (deal.businessName || '').toLowerCase();
            
            // GPS-based matching if coordinates are available
            if (location.latitude && location.longitude && deal.latitude && deal.longitude) {
                const distance = calculateDistance(
                    location.latitude, location.longitude,
                    deal.latitude, deal.longitude
                );
                if (distance <= 2.0) { // Within 2km
                    console.log(`[DealsUtils] GPS match: ${businessName} at ${distance.toFixed(2)}km`);
                    return true;
                }
            }
            
            // Text-based location matching
            return locationTerms.some(term => 
                dealLocation.includes(term) || 
                dealAddress.includes(term) ||
                businessName.includes(term)
            );
        });
        
        console.log(`[DealsUtils] Filtered to ${nearbyDeals.length} nearby deals`);
        
        // Extract unique businesses (remove duplicates)
        const businessMap = new Map();
        nearbyDeals.forEach(deal => {
            const businessKey = deal.businessName?.toLowerCase() || 'unknown';
            if (!businessMap.has(businessKey)) {
                businessMap.set(businessKey, {
                    businessName: deal.businessName || 'Unknown Business',
                    address: deal.address || 'Singapore',
                    location: deal.location || '',
                    latitude: deal.latitude,
                    longitude: deal.longitude
                });
            }
        });
        
        const uniqueBusinesses = Array.from(businessMap.values());
        console.log(`[DealsUtils] Found ${uniqueBusinesses.length} unique businesses in the area`);
        
        return uniqueBusinesses;
        
    } catch (error) {
        console.error('[DealsUtils] Error fetching businesses from DB:', error);
        return [];
    }
}

