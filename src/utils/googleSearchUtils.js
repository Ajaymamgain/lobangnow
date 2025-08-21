// Google Custom Search Engine utility for deal searching
import axios from 'axios';

/**
 * Search for deals using Google Custom Search Engine
 * @param {string} location - Location for search
 * @param {string} category - Category (food/fashion)
 * @param {string} apiKey - Google CSE API key
 * @param {string} cseId - Custom Search Engine ID
 * @returns {Promise<Array>} Array of search results
 */
export async function searchDealsWithGoogleCSE(location, category, apiKey, cseId = '6572826d51e2f4d78') {
    try {
        console.log(`[GoogleCSE] Searching for ${category} deals near ${location} using Google Custom Search`);
        
        if (!apiKey) {
            console.error('[GoogleCSE] Google CSE API key not provided');
            return [];
        }
        
        const locationStr = typeof location === 'object' 
            ? (location.description || location.address || 'Singapore')
            : location;
            
        const categoryName = category === 'food' ? 'food restaurant deals' : 'fashion clothing deals';
        
        // Construct search query for Singapore deals
        const searchQuery = `${categoryName} ${locationStr} Singapore discount offer promotion`;
        
        const searchUrl = 'https://www.googleapis.com/customsearch/v1';
        const params = {
            key: apiKey,
            cx: cseId,
            q: searchQuery,
            num: 10, // Get up to 10 results
            dateRestrict: 'm1', // Results from last month
            gl: 'sg', // Singapore geolocation
            hl: 'en', // English language
            cr: 'countrySG' // Country restrict to Singapore
        };
        
        console.log(`[GoogleCSE] Search query: ${searchQuery}`);
        
        const response = await axios.get(searchUrl, { params, timeout: 15000 });
        
        if (response.data && response.data.items) {
            const searchResults = response.data.items;
            console.log(`[GoogleCSE] Found ${searchResults.length} search results`);
            
            // Parse and format results into deal objects
            const deals = searchResults.slice(0, 5).map((item, index) => {
                const title = item.title || `Deal ${index + 1}`;
                const snippet = item.snippet || 'Great deal available';
                const link = item.link || '';
                
                // Extract potential discount information from snippet
                const discountMatch = snippet.match(/(\d+%\s*off|\d+%\s*discount|buy\s*\d+\s*get\s*\d+|1-for-1|BOGO)/i);
                const discount = discountMatch ? discountMatch[0] : 'Special Deal';
                
                // Try to extract address from snippet
                const addressMatch = snippet.match(/(?:address|located|at)\s*:?\s*([^.!?]+)/i);
                const address = addressMatch ? addressMatch[1].trim() : locationStr;
                
                return {
                    businessName: title.split(' - ')[0] || title.substring(0, 30),
                    title: title.length > 50 ? title.substring(0, 47) + '...' : title,
                    offer: discount,
                    address: address,
                    description: snippet.length > 100 ? snippet.substring(0, 97) + '...' : snippet,
                    validity: 'Check website for validity',
                    category: category,
                    socialMediaSource: 'Google Search',
                    source: 'Google Custom Search',
                    link: link,
                    // Additional fields for compatibility
                    location: address,
                    discount: discount,
                    restaurant: title.split(' - ')[0] || title.substring(0, 30),
                    store: title.split(' - ')[0] || title.substring(0, 30),
                    fullAddress: address,
                    fullDescription: snippet
                };
            });
            
            console.log(`[GoogleCSE] Successfully parsed ${deals.length} deals from Google search`);
            return deals;
            
        } else {
            console.log('[GoogleCSE] No search results found');
            return [];
        }
        
    } catch (error) {
        console.error('[GoogleCSE] Error searching with Google Custom Search:', error);
        return [];
    }
}

/**
 * Combine OpenAI and Google CSE results for better deal coverage
 * @param {Array} openaiDeals - Deals from OpenAI
 * @param {Array} googleDeals - Deals from Google CSE
 * @returns {Array} Combined and deduplicated deals
 */
export function combineSearchResults(openaiDeals = [], googleDeals = []) {
    try {
        console.log(`[SearchCombiner] Combining ${openaiDeals.length} OpenAI deals with ${googleDeals.length} Google deals`);
        
        // Start with OpenAI deals (higher priority)
        const combinedDeals = [...openaiDeals];
        
        // Add Google deals that don't duplicate OpenAI results
        for (const googleDeal of googleDeals) {
            const isDuplicate = combinedDeals.some(existingDeal => {
                const titleSimilarity = existingDeal.title.toLowerCase().includes(googleDeal.businessName.toLowerCase()) ||
                                      googleDeal.title.toLowerCase().includes(existingDeal.businessName.toLowerCase());
                const addressSimilarity = existingDeal.address && googleDeal.address &&
                                        (existingDeal.address.toLowerCase().includes(googleDeal.address.toLowerCase()) ||
                                         googleDeal.address.toLowerCase().includes(existingDeal.address.toLowerCase()));
                
                return titleSimilarity || addressSimilarity;
            });
            
            if (!isDuplicate) {
                combinedDeals.push(googleDeal);
            }
        }
        
        // Limit to 5 best deals
        const finalDeals = combinedDeals.slice(0, 5);
        console.log(`[SearchCombiner] Final result: ${finalDeals.length} unique deals`);
        
        return finalDeals;
        
    } catch (error) {
        console.error('[SearchCombiner] Error combining search results:', error);
        return openaiDeals.slice(0, 5); // Fallback to OpenAI results only
    }
}

/**
 * Find official social handles for a restaurant using Google CSE
 * Returns best-effort links constrained to Singapore context.
 */
export async function searchOfficialSocialHandles(restaurantName, apiKey, cseId = '6572826d51e2f4d78') {
    try {
        if (!apiKey || !restaurantName) return {};
        const axios = (await import('axios')).default;
        const searchUrl = 'https://www.googleapis.com/customsearch/v1';
        const mkParams = (q) => ({ key: apiKey, cx: cseId, q, num: 5, gl: 'sg', hl: 'en', cr: 'countrySG' });

        const queries = [
            `${restaurantName} official website Singapore`,
            `${restaurantName} instagram Singapore site:instagram.com`,
            `${restaurantName} facebook Singapore site:facebook.com`,
            `${restaurantName} tiktok Singapore site:tiktok.com`
        ];

        console.log(`[GoogleCSE] Enriching social handles for ${restaurantName}`);
        const results = await Promise.allSettled(queries.map(q => axios.get(searchUrl, { params: mkParams(q), timeout: 10000 })));

        const found = { website: '', instagram: '', facebook: '', tiktok: '' };
        for (const r of results) {
            if (r.status !== 'fulfilled' || !r.value?.data?.items) continue;
            for (const item of r.value.data.items) {
                const link = item.link || '';
                const lower = link.toLowerCase();
                // skip aggregator/directories
                if (/(quandoo|chope|hungrygowhere|tripadvisor|burpple|grabfood|foodpanda|deliveroo|google|yelp)/.test(lower)) {
                    continue;
                }
                if (!found.instagram && isValidInstagramUrl(lower)) found.instagram = link;
                if (!found.facebook && isValidFacebookUrl(lower)) found.facebook = link;
                if (!found.tiktok && isValidTiktokUrl(lower)) found.tiktok = link;
            }
        }
        console.log('[GoogleCSE] Social handles found:', found);
        return found;
    } catch (err) {
        console.error('[GoogleCSE] Error searching official social handles:', err);
        return {};
    }
}

function isValidInstagramUrl(url) {
    return /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?(\?.*)?$/.test(url);
}
function isValidFacebookUrl(url) {
    // exclude groups/events
    if (/facebook\.com\/(groups|events)\//.test(url)) return false;
    return /^https?:\/\/(www\.)?facebook\.com\/[A-Za-z0-9\.]+\/?(\?.*)?$/.test(url);
}
function isValidTiktokUrl(url) {
    return /^https?:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9_.]+\/?(\?.*)?$/.test(url);
}
