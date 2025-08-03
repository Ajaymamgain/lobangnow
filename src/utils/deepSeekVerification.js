// DeepSeek Deal Verification Utility
// Verifies OpenAI deals for authenticity and relevance to user location
import axios from 'axios';

const DEEPSEEK_API_KEY = 'sk-bf253363d9e4407d8186367dfd368011';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * Verify deals using DeepSeek AI for authenticity and location relevance
 * @param {Array} deals - Array of deals from OpenAI
 * @param {Object} location - User's location data
 * @param {Array} nearbyPlaces - Nearby places from Google Places API
 * @returns {Array} - Verified deals that pass authenticity check
 */
export async function verifyDealsWithDeepSeek(deals, location, nearbyPlaces = []) {
    if (!deals || deals.length === 0) {
        console.log('[DeepSeekVerification] No deals to verify');
        return [];
    }

    console.log(`[DeepSeekVerification] Verifying ${deals.length} deals for location: ${location.displayName}`);
    
    try {
        // Create verification prompt
        const verificationPrompt = createVerificationPrompt(deals, location, nearbyPlaces);
        
        console.log(`[DeepSeekVerification] Calling DeepSeek API for deal verification...`);
        
        const response = await axios.post(DEEPSEEK_API_URL, {
            model: 'deepseek-chat',
            messages: [
                {
                    role: 'system',
                    content: 'You are a deal verification expert. Your job is to verify if deals are authentic, relevant to the specified location, and not hallucinated. Respond with a JSON array of verified deals.'
                },
                {
                    role: 'user',
                    content: verificationPrompt
                }
            ],
            temperature: 0.1, // Low temperature for consistent verification
            max_tokens: 2000
        }, {
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.choices && response.data.choices[0]) {
            const verificationResult = response.data.choices[0].message.content;
            console.log(`[DeepSeekVerification] DeepSeek verification completed`);
            console.log(`[DeepSeekVerification] Verification result length: ${verificationResult.length} characters`);
            
            // Parse verification result
            const verifiedDeals = parseVerificationResult(verificationResult, deals);
            
            console.log(`[DeepSeekVerification] ✅ ${verifiedDeals.length}/${deals.length} deals verified as authentic`);
            
            // Log verification summary
            const rejectedCount = deals.length - verifiedDeals.length;
            if (rejectedCount > 0) {
                console.log(`[DeepSeekVerification] ⚠️ ${rejectedCount} deals rejected by verification`);
            }
            
            return verifiedDeals;
        } else {
            console.log('[DeepSeekVerification] Invalid response from DeepSeek API');
            return deals; // Return original deals if verification fails
        }
        
    } catch (error) {
        console.error('[DeepSeekVerification] Error verifying deals with DeepSeek:', error.message);
        if (error.response) {
            console.error('[DeepSeekVerification] DeepSeek API error:', error.response.status, error.response.data);
        }
        
        // Return original deals if verification fails (graceful fallback)
        console.log('[DeepSeekVerification] Falling back to original deals due to verification error');
        return deals;
    }
}

/**
 * Create verification prompt for DeepSeek
 * @param {Array} deals - Deals to verify
 * @param {Object} location - User location
 * @param {Array} nearbyPlaces - Nearby places
 * @returns {string} - Verification prompt
 */
function createVerificationPrompt(deals, location, nearbyPlaces) {
    const nearbyPlaceNames = nearbyPlaces.map(p => p.name).join(', ');
    
    const prompt = `
TASK: Verify the authenticity and location relevance of these food deals.

USER LOCATION: ${location.displayName}, ${location.formattedAddress}
COORDINATES: ${location.latitude}, ${location.longitude}
AREA: ${location.area}

NEARBY PLACES FROM GOOGLE PLACES API:
${nearbyPlaceNames || 'No nearby places provided'}

DEALS TO VERIFY:
${deals.map((deal, i) => `
${i + 1}. Business: ${deal.businessName}
   Address: ${deal.address}
   Offer: ${deal.offer}
   Contact: ${deal.contact}
   Validity: ${deal.validity}
`).join('')}

VERIFICATION CRITERIA:
1. Is the business name realistic and not obviously fake?
2. Is the address actually near the user's location (within reasonable distance)?
3. Does the offer sound realistic and not too good to be true?
4. Is the business type appropriate for the location area?
5. Does the deal information seem complete and authentic?

INSTRUCTIONS:
- Verify each deal against the criteria above
- Only approve deals that seem authentic and location-relevant
- Reject deals that seem hallucinated, too far from location, or unrealistic
- Return ONLY the deals that pass verification
- Respond with a JSON array of verified deals in the same format
- If no deals pass verification, return an empty array []

RESPONSE FORMAT:
[
  {
    "businessName": "verified business name",
    "address": "verified address",
    "offer": "verified offer",
    "contact": "verified contact",
    "validity": "verified validity",
    "verificationReason": "brief reason why this deal is authentic"
  }
]
`;

    return prompt;
}

/**
 * Parse DeepSeek verification result
 * @param {string} verificationResult - Raw response from DeepSeek
 * @param {Array} originalDeals - Original deals for fallback
 * @returns {Array} - Parsed verified deals
 */
function parseVerificationResult(verificationResult, originalDeals) {
    try {
        // Try to extract JSON from the response
        const jsonMatch = verificationResult.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const verifiedDeals = JSON.parse(jsonMatch[0]);
            
            if (Array.isArray(verifiedDeals)) {
                console.log(`[DeepSeekVerification] Successfully parsed ${verifiedDeals.length} verified deals`);
                
                // Add verification metadata to deals
                const enhancedDeals = verifiedDeals.map(deal => ({
                    ...deal,
                    verified: true,
                    verifiedBy: 'deepseek',
                    verificationTimestamp: new Date().toISOString()
                }));
                
                return enhancedDeals;
            }
        }
        
        console.log('[DeepSeekVerification] Could not parse verification result as JSON');
        return originalDeals; // Fallback to original deals
        
    } catch (error) {
        console.error('[DeepSeekVerification] Error parsing verification result:', error.message);
        return originalDeals; // Fallback to original deals
    }
}

/**
 * Get verification statistics
 * @param {Array} originalDeals - Original deals before verification
 * @param {Array} verifiedDeals - Deals after verification
 * @returns {Object} - Verification statistics
 */
export function getVerificationStats(originalDeals, verifiedDeals) {
    const originalCount = originalDeals?.length || 0;
    const verifiedCount = verifiedDeals?.length || 0;
    const rejectedCount = originalCount - verifiedCount;
    const verificationRate = originalCount > 0 ? (verifiedCount / originalCount * 100).toFixed(1) : 0;
    
    return {
        originalCount,
        verifiedCount,
        rejectedCount,
        verificationRate: `${verificationRate}%`,
        hasVerification: verifiedDeals?.some(deal => deal.verified) || false
    };
}
