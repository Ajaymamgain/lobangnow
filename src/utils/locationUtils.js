// Location resolution utilities using Google APIs
import axios from 'axios';

/**
 * Resolve Singapore postal code to location name using Google Custom Search Engine (CSE)
 * @param {string} postalCode - Singapore postal code (6 digits)
 * @param {string} cseApiKey - Google Custom Search API key
 * @param {string} cseId - Google Custom Search Engine ID (default: 6572826d51e2f4d78)
 * @returns {Promise<Object>} Location object with resolved name
 */
export async function resolvePostalCodeToLocation(postalCode, cseApiKey, cseId = '6572826d51e2f4d78') {
    try {
        console.log(`[LocationUtils] Resolving postal code ${postalCode} to location name using Google CSE`);
        
        if (!cseApiKey) {
            console.log('[LocationUtils] No Google CSE API key, using fallback');
            return {
                type: 'postal_code',
                postalCode: postalCode,
                description: `Singapore ${postalCode}`,
                name: `Singapore ${postalCode}`,
                country: 'SG',
                city: 'Singapore'
            };
        }
        
        // Use Google Custom Search Engine to find location information for the postal code
        const searchUrl = 'https://www.googleapis.com/customsearch/v1';
        const searchQuery = `"${postalCode}" Singapore location area neighborhood district`;
        const params = {
            key: cseApiKey,
            cx: cseId,
            q: searchQuery,
            num: 5, // Get top 5 results
            gl: 'sg', // Geolocation: Singapore
            hl: 'en', // Language: English
            lr: 'lang_en' // Language restrict: English
        };
        
        console.log(`[LocationUtils] Searching Google CSE for: "${searchQuery}"`);
        const response = await axios.get(searchUrl, { params, timeout: 10000 });
        
        if (response.data && response.data.items && response.data.items.length > 0) {
            console.log(`[LocationUtils] Found ${response.data.items.length} search results for postal code ${postalCode}`);
            
            // Extract location names from search results
            let extractedLocationName = null;
            
            for (const item of response.data.items) {
                const title = item.title || '';
                const snippet = item.snippet || '';
                
                console.log(`[LocationUtils] Analyzing result: ${title}`);
                
                // Look for Singapore area/neighborhood names in the results
                const locationPatterns = [
                    // Common Singapore area patterns
                    /(?:in|at|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)(?:\s+(?:Singapore|area|district|estate|town|mall|center|centre))/gi,
                    // Direct area mentions
                    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)\s+(?:Singapore|area|district|estate|town)/gi,
                    // Shopping mall or landmark patterns
                    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)\s+(?:Mall|Plaza|Centre|Center|Hub|Point)/gi,
                    // MRT station patterns
                    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)\s+(?:MRT|Station)/gi
                ];
                
                const textToSearch = `${title} ${snippet}`;
                
                for (const pattern of locationPatterns) {
                    const matches = [...textToSearch.matchAll(pattern)];
                    if (matches.length > 0) {
                        const potentialLocation = matches[0][1].trim();
                        // Filter out common non-location words
                        if (!['Singapore', 'Postal', 'Code', 'Location', 'Address', 'Map', 'Google'].includes(potentialLocation)) {
                            extractedLocationName = potentialLocation;
                            console.log(`[LocationUtils] Extracted location name: ${extractedLocationName}`);
                            break;
                        }
                    }
                }
                
                if (extractedLocationName) break;
            }
            
            const locationName = extractedLocationName || `Singapore ${postalCode}`;
            
            console.log(`[LocationUtils] Resolved postal code ${postalCode} to: ${locationName}`);
            
            return {
                type: 'postal_code',
                postalCode: postalCode,
                description: locationName,
                name: locationName,
                country: 'SG',
                city: 'Singapore',
                searchResults: response.data.items.slice(0, 3) // Store top 3 results for reference
            };
            
        } else {
            console.log(`[LocationUtils] No geocoding results for ${postalCode}, using fallback`);
            return {
                type: 'postal_code',
                postalCode: postalCode,
                description: `Singapore ${postalCode}`,
                name: `Singapore ${postalCode}`,
                country: 'SG',
                city: 'Singapore'
            };
        }
        
    } catch (error) {
        console.error('[LocationUtils] Error resolving postal code:', error);
        return {
            type: 'postal_code',
            postalCode: postalCode,
            description: `Singapore ${postalCode}`,
            name: `Singapore ${postalCode}`,
            country: 'SG',
            city: 'Singapore'
        };
    }
}

/**
 * Resolve GPS coordinates to location name using Google Reverse Geocoding API
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise<Object>} Location object with resolved name
 */
export async function resolveCoordinatesToLocation(latitude, longitude, apiKey) {
    try {
        console.log(`[LocationUtils] Resolving coordinates ${latitude}, ${longitude} to location name`);
        
        if (!apiKey) {
            console.log('[LocationUtils] No Google Maps API key, using fallback');
            return {
                type: 'coordinates',
                latitude: latitude,
                longitude: longitude,
                description: `Singapore (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
                name: `Singapore Location`,
                country: 'SG',
                city: 'Singapore'
            };
        }
        
        // Use Google Reverse Geocoding API
        const geocodeUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
        const params = {
            latlng: `${latitude},${longitude}`,
            key: apiKey,
            language: 'en'
        };
        
        const response = await axios.get(geocodeUrl, { params, timeout: 10000 });
        
        if (response.data && response.data.results && response.data.results.length > 0) {
            const result = response.data.results[0];
            const addressComponents = result.address_components;
            
            // Extract neighborhood/area name from address components
            let areaName = null;
            let sublocality = null;
            let postalCode = null;
            
            for (const component of addressComponents) {
                if (component.types.includes('neighborhood') || component.types.includes('sublocality')) {
                    areaName = component.long_name;
                } else if (component.types.includes('sublocality_level_1')) {
                    sublocality = component.long_name;
                } else if (component.types.includes('postal_code')) {
                    postalCode = component.long_name;
                }
            }
            
            const locationName = areaName || sublocality || `Singapore Location`;
            
            console.log(`[LocationUtils] Resolved coordinates to: ${locationName}`);
            
            return {
                type: 'coordinates',
                latitude: latitude,
                longitude: longitude,
                postalCode: postalCode,
                description: locationName,
                name: locationName,
                country: 'SG',
                city: 'Singapore',
                fullAddress: result.formatted_address
            };
            
        } else {
            console.log(`[LocationUtils] No reverse geocoding results, using fallback`);
            return {
                type: 'coordinates',
                latitude: latitude,
                longitude: longitude,
                description: `Singapore Location`,
                name: `Singapore Location`,
                country: 'SG',
                city: 'Singapore'
            };
        }
        
    } catch (error) {
        console.error('[LocationUtils] Error resolving coordinates:', error);
        return {
            type: 'coordinates',
            latitude: latitude,
            longitude: longitude,
            description: `Singapore Location`,
            name: `Singapore Location`,
            country: 'SG',
            city: 'Singapore'
        };
    }
}

/**
 * Check if a string is a valid Singapore postal code
 * @param {string} text - Text to check
 * @returns {string|null} Postal code if valid, null otherwise
 */
export function extractSingaporePostalCode(text) {
    // Singapore postal codes are 6 digits
    const postalCodeMatch = text.match(/\b(\d{6})\b/);
    
    if (postalCodeMatch) {
        const code = postalCodeMatch[1];
        // Singapore postal codes range from 010000 to 999999
        const codeNum = parseInt(code);
        if (codeNum >= 10000 && codeNum <= 999999) {
            return code;
        }
    }
    
    return null;
}
