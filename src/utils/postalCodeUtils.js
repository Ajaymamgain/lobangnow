// Singapore Postal Code Database Utilities
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import axios from 'axios';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const postalCodesTableName = 'store-ai-bot-dev-postal-codes';

/**
 * Validate and resolve Singapore postal code using DynamoDB database
 * @param {string} postalCode - 5 or 6 digit Singapore postal code
 * @returns {Object|null} - Location data or null if not found
 */
export async function validateAndResolvePostalCode(postalCode) {
    try {
        // Clean and validate postal code format
        const cleanPostalCode = postalCode.toString().trim().padStart(6, '0');
        
        // Singapore postal codes are 6 digits, but we store them as 5 digits (without leading zero)
        const searchPostalCode = cleanPostalCode.substring(1); // Remove leading zero for lookup
        
        console.log(`[PostalCodeUtils] Looking up postal code: ${cleanPostalCode} (search: ${searchPostalCode})`);
        
        const getItemParams = {
            TableName: postalCodesTableName,
            Key: marshall({
                postal: searchPostalCode
            })
        };
        
        const result = await dynamoClient.send(new GetItemCommand(getItemParams));
        
        if (result.Item) {
            const locationData = unmarshall(result.Item);
            
            console.log(`[PostalCodeUtils] Found location data for ${cleanPostalCode}:`, locationData);
            
            // Format the response with comprehensive location information
            return {
                postalCode: cleanPostalCode,
                originalPostal: searchPostalCode,
                address: locationData.address || '',
                roadName: locationData.roadName || '',
                building: locationData.building || '',
                blkNo: locationData.blkNo || '',
                latitude: locationData.latitude || 0,
                longitude: locationData.longitude || 0,
                x: locationData.x || 0,
                y: locationData.y || 0,
                name: formatLocationName(locationData),
                description: formatLocationDescription(locationData),
                isValid: true,
                source: 'singapore_database'
            };
        } else {
            console.log(`[PostalCodeUtils] Postal code ${cleanPostalCode} not found in Singapore database`);
            return null;
        }
        
    } catch (error) {
        console.error('[PostalCodeUtils] Error validating postal code:', error);
        return null;
    }
}

/**
 * Format location name from database record
 * @param {Object} locationData - Database record
 * @returns {string} - Formatted location name
 */
function formatLocationName(locationData) {
    const parts = [];
    
    // Add block number if available
    if (locationData.blkNo && locationData.blkNo !== 'NIL') {
        parts.push(`Blk ${locationData.blkNo}`);
    }
    
    // Add road name
    if (locationData.roadName) {
        parts.push(locationData.roadName);
    }
    
    // Add building name if available and not NIL
    if (locationData.building && locationData.building !== 'NIL') {
        parts.push(`(${locationData.building})`);
    }
    
    return parts.join(' ') || `Singapore ${locationData.postal}`;
}

/**
 * Format location description from database record
 * @param {Object} locationData - Database record
 * @returns {string} - Formatted location description
 */
function formatLocationDescription(locationData) {
    const parts = [];
    
    // Start with block number and road name
    if (locationData.blkNo && locationData.blkNo !== 'NIL') {
        parts.push(locationData.blkNo);
    }
    
    if (locationData.roadName) {
        parts.push(locationData.roadName);
    }
    
    // Add Singapore
    parts.push('Singapore');
    
    // Add postal code
    if (locationData.postal) {
        parts.push(locationData.postal.padStart(6, '0'));
    }
    
    return parts.join(' ');
}

/**
 * Extract Singapore postal code from message text
 * Enhanced version that handles various formats
 * @param {string} text - Input text
 * @returns {string|null} - Extracted postal code or null
 */
export function extractSingaporePostalCode(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }
    
    // Remove all non-digit characters and get potential postal codes
    const numbers = text.replace(/\D/g, '');
    
    // Singapore postal codes are 6 digits
    // Look for 6-digit numbers
    const sixDigitMatch = numbers.match(/\d{6}/);
    if (sixDigitMatch) {
        const postalCode = sixDigitMatch[0];
        // Singapore postal codes typically start with 0-8
        if (postalCode[0] >= '0' && postalCode[0] <= '8') {
            return postalCode;
        }
    }
    
    // Look for 5-digit numbers (missing leading zero)
    const fiveDigitMatch = numbers.match(/\d{5}/);
    if (fiveDigitMatch) {
        const postalCode = '0' + fiveDigitMatch[0]; // Add leading zero
        return postalCode;
    }
    
    return null;
}

/**
 * Resolve coordinates to location using reverse lookup
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {Object|null} - Location data or null if not found
 */
export async function resolveCoordinatesToLocation(latitude, longitude) {
    try {
        console.log(`[PostalCodeUtils] Reverse lookup for coordinates: ${latitude}, ${longitude}`);
        
        // For now, return a generic Singapore location
        // In a full implementation, you could do a spatial query or find nearest postal code
        return {
            postalCode: '000000',
            address: `Location near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            roadName: 'Singapore',
            building: '',
            blkNo: '',
            latitude: latitude,
            longitude: longitude,
            x: 0,
            y: 0,
            name: 'Singapore Location',
            description: `Singapore (Coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
            isValid: true,
            source: 'coordinates'
        };
        
    } catch (error) {
        console.error('[PostalCodeUtils] Error resolving coordinates:', error);
        return null;
    }
}

/**
 * Check if a postal code is valid Singapore format
 * @param {string} postalCode - Postal code to validate
 * @returns {boolean} - True if valid format
 */
export function isValidSingaporePostalCodeFormat(postalCode) {
    if (!postalCode || typeof postalCode !== 'string') {
        return false;
    }
    
    const cleaned = postalCode.replace(/\D/g, '');
    
    // Must be 5 or 6 digits
    if (cleaned.length !== 5 && cleaned.length !== 6) {
        return false;
    }
    
    // First digit should be 0-8 for Singapore
    const firstDigit = cleaned[0];
    return firstDigit >= '0' && firstDigit <= '8';
}



/**
 * Use Google Maps reverse geocoding to resolve coordinates to postal code
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @param {string} googleMapsApiKey - Google Maps API key
 * @returns {Object} - Location resolution result
 */
export async function resolveCoordinatesToPostalCode(latitude, longitude, googleMapsApiKey) {
    try {
        console.log(`[PostalCode] Resolving coordinates to postal code: ${latitude}, ${longitude}`);
        
        // Step 1: Use Google reverse geocoding
        const googleResult = await reverseGeocodeWithGoogle(latitude, longitude, googleMapsApiKey);
        
        if (!googleResult.isValid) {
            return googleResult;
        }
        
        // Step 2: Validate postal code in Singapore database
        const databaseResult = await validatePostalCodeInDatabase(googleResult.postalCode);
        
        if (databaseResult.isValid) {
            // Combine Google and database results for best accuracy
            return {
                ...databaseResult,
                formattedAddress: googleResult.formattedAddress,
                googleData: {
                    country: googleResult.country,
                    locality: googleResult.locality,
                    route: googleResult.route
                },
                source: 'google_plus_database'
            };
        } else {
            // Use Google data if not in database
            return {
                isValid: true,
                postalCode: googleResult.postalCode,
                formattedAddress: googleResult.formattedAddress,
                country: googleResult.country,
                locality: googleResult.locality,
                route: googleResult.route,
                name: googleResult.formattedAddress,
                description: googleResult.formattedAddress,
                latitude: latitude,
                longitude: longitude,
                warning: 'Postal code not found in Singapore database, using Google data',
                source: 'google_only'
            };
        }
        
    } catch (error) {
        console.error('[PostalCode] Error resolving coordinates to postal code:', error);
        return {
            isValid: false,
            error: 'Unable to process location. Please try again or provide a postal code.',
            source: 'coordinate_error'
        };
    }
}

/**
 * Use Google Maps reverse geocoding to get location details from coordinates
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @param {string} googleMapsApiKey - Google Maps API key
 * @returns {Object} - Location data from Google
 */
async function reverseGeocodeWithGoogle(latitude, longitude, googleMapsApiKey) {
    try {
        console.log(`[PostalCode] Using Google Maps reverse geocoding for: ${latitude}, ${longitude}`);
        
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleMapsApiKey}`;
        
        const response = await axios.get(url);
        
        if (response.data.status === 'OK' && response.data.results.length > 0) {
            const result = response.data.results[0];
            
            console.log(`[PostalCode] Google reverse geocoding result: ${result.formatted_address}`);
            
            // Extract postal code from address components
            let postalCode = null;
            let country = null;
            let locality = null;
            let route = null;
            
            for (const component of result.address_components) {
                if (component.types.includes('postal_code')) {
                    postalCode = component.long_name;
                }
                if (component.types.includes('country')) {
                    country = component.long_name;
                }
                if (component.types.includes('locality')) {
                    locality = component.long_name;
                }
                if (component.types.includes('route')) {
                    route = component.long_name;
                }
            }
            
            // Check if it's in Singapore
            if (country !== 'Singapore') {
                console.log(`[PostalCode] Location not in Singapore: ${country}`);
                return {
                    isValid: false,
                    error: 'Location is not in Singapore. Please provide a location within Singapore.',
                    source: 'google_reverse_geocoding'
                };
            }
            
            if (!postalCode) {
                console.log(`[PostalCode] No postal code found in Google result`);
                return {
                    isValid: false,
                    error: 'No postal code found for this location. Please provide a postal code.',
                    source: 'google_reverse_geocoding'
                };
            }
            
            return {
                isValid: true,
                postalCode: postalCode,
                formattedAddress: result.formatted_address,
                country: country,
                locality: locality,
                route: route,
                geometry: result.geometry,
                source: 'google_reverse_geocoding'
            };
            
        } else {
            console.log(`[PostalCode] Google reverse geocoding failed: ${response.data.status}`);
            return {
                isValid: false,
                error: `Unable to resolve location: ${response.data.status}`,
                source: 'google_reverse_geocoding'
            };
        }
        
    } catch (error) {
        console.error('[PostalCode] Error with Google reverse geocoding:', error.message);
        return {
            isValid: false,
            error: `Location resolution error: ${error.message}`,
            source: 'google_reverse_geocoding'
        };
    }
}

/**
 * Validate postal code against Singapore database
 * @param {string} postalCode - Postal code from Google
 * @returns {Object} - Database validation result
 */
async function validatePostalCodeInDatabase(postalCode) {
    try {
        if (!postalCode) {
            return {
                isValid: false,
                error: 'No postal code provided for validation',
                source: 'database_validation'
            };
        }
        
        // Normalize postal code (remove leading zeros for database lookup)
        const normalizedPostalCode = postalCode.replace(/^0+/, '') || '0';
        
        console.log(`[PostalCode] Validating postal code in database: ${postalCode} (normalized: ${normalizedPostalCode})`);
        
        const params = {
            TableName: postalCodesTableName,
            Key: marshall({
                postal: normalizedPostalCode
            })
        };
        
        const result = await dynamoClient.send(new GetItemCommand(params));
        
        if (result.Item) {
            const locationData = unmarshall(result.Item);
            console.log(`[PostalCode] Found in database: ${locationData.address}`);
            
            return {
                isValid: true,
                postalCode: postalCode.padStart(6, '0'),
                originalPostal: locationData.postal,
                address: locationData.address || '',
                roadName: locationData.roadName || '',
                building: locationData.building || '',
                blkNo: locationData.blkNo || '',
                latitude: locationData.latitude || 0,
                longitude: locationData.longitude || 0,
                name: formatLocationName(locationData),
                description: formatLocationDescription(locationData),
                source: 'singapore_database_validated'
            };
        } else {
            console.log(`[PostalCode] Postal code ${postalCode} not found in Singapore database`);
            return {
                isValid: false,
                error: `Postal code ${postalCode} not found in Singapore database`,
                source: 'database_validation'
            };
        }
        
    } catch (error) {
        console.error('[PostalCode] Error validating postal code in database:', error);
        return {
            isValid: false,
            error: `Database validation error: ${error.message}`,
            source: 'database_validation'
        };
    }
}

/**
 * Get location suggestions for partial postal codes (for autocomplete)
 * @param {string} _partialPostalCode - Partial postal code (unused for now)
 * @returns {Array} - Array of suggestions
 */
export async function getPostalCodeSuggestions(_partialPostalCode) {
    // This would require a scan operation in DynamoDB
    // For now, return empty array
    // In production, you might want to implement this with ElasticSearch or similar
    return [];
}
