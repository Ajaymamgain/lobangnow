// Test script to use Google Maps reverse geocoding for coordinates
import axios from 'axios';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const postalCodesTableName = 'store-ai-bot-dev-postal-codes';

// Test coordinates from WhatsApp location message
const testLatitude = 1.3718338;
const testLongitude = 103.8995563;

// Google Maps API key (you'll need to provide this)
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY';

/**
 * Use Google Maps reverse geocoding to get location details from coordinates
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @returns {Object|null} - Location data from Google
 */
async function reverseGeocodeWithGoogle(latitude, longitude) {
    try {
        console.log(`Using Google Maps reverse geocoding for: ${latitude}, ${longitude}`);
        
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
        
        const response = await axios.get(url);
        
        if (response.data.status === 'OK' && response.data.results.length > 0) {
            const result = response.data.results[0];
            
            console.log('Google reverse geocoding result:');
            console.log(`  Formatted Address: ${result.formatted_address}`);
            
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
            
            console.log(`  Postal Code: ${postalCode}`);
            console.log(`  Country: ${country}`);
            console.log(`  Locality: ${locality}`);
            console.log(`  Route: ${route}`);
            
            // Check if it's in Singapore
            if (country !== 'Singapore') {
                return {
                    isValid: false,
                    error: 'Location is not in Singapore',
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
            console.log(`Google reverse geocoding failed: ${response.data.status}`);
            return {
                isValid: false,
                error: `Google reverse geocoding failed: ${response.data.status}`,
                source: 'google_reverse_geocoding'
            };
        }
        
    } catch (error) {
        console.error('Error with Google reverse geocoding:', error.message);
        return {
            isValid: false,
            error: `Google reverse geocoding error: ${error.message}`,
            source: 'google_reverse_geocoding'
        };
    }
}

/**
 * Validate postal code against Singapore database
 * @param {string} postalCode - Postal code from Google
 * @returns {Object|null} - Database validation result
 */
async function validatePostalCodeInDatabase(postalCode) {
    try {
        if (!postalCode) {
            return {
                isValid: false,
                error: 'No postal code found in Google result',
                source: 'database_validation'
            };
        }
        
        // Normalize postal code (remove leading zeros for database lookup)
        const normalizedPostalCode = postalCode.replace(/^0+/, '') || '0';
        
        console.log(`Validating postal code in database: ${postalCode} (normalized: ${normalizedPostalCode})`);
        
        const params = {
            TableName: postalCodesTableName,
            Key: marshall({
                postal: normalizedPostalCode
            })
        };
        
        const result = await dynamoClient.send(new GetItemCommand(params));
        
        if (result.Item) {
            const locationData = unmarshall(result.Item);
            console.log(`Found in database: ${locationData.address}`);
            
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
            console.log(`Postal code ${postalCode} not found in Singapore database`);
            return {
                isValid: false,
                error: `Postal code ${postalCode} not found in Singapore database`,
                source: 'database_validation'
            };
        }
        
    } catch (error) {
        console.error('Error validating postal code in database:', error);
        return {
            isValid: false,
            error: `Database validation error: ${error.message}`,
            source: 'database_validation'
        };
    }
}

/**
 * Format location name from database record
 */
function formatLocationName(locationData) {
    const parts = [];
    
    if (locationData.blkNo && locationData.blkNo !== 'NIL') {
        parts.push(`Blk ${locationData.blkNo}`);
    }
    
    if (locationData.roadName) {
        parts.push(locationData.roadName);
    }
    
    if (locationData.building && locationData.building !== 'NIL') {
        parts.push(`(${locationData.building})`);
    }
    
    return parts.join(' ') || `Singapore ${locationData.postal}`;
}

/**
 * Format location description from database record
 */
function formatLocationDescription(locationData) {
    const parts = [];
    
    if (locationData.blkNo && locationData.blkNo !== 'NIL') {
        parts.push(locationData.blkNo);
    }
    
    if (locationData.roadName) {
        parts.push(locationData.roadName);
    }
    
    parts.push('Singapore');
    
    if (locationData.postal) {
        parts.push(locationData.postal.padStart(6, '0'));
    }
    
    return parts.join(' ');
}

/**
 * Complete workflow: Google reverse geocoding + Singapore database validation
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @returns {Object} - Complete location resolution result
 */
async function resolveLocationFromCoordinates(latitude, longitude) {
    console.log('=== STEP 1: Google Reverse Geocoding ===');
    const googleResult = await reverseGeocodeWithGoogle(latitude, longitude);
    
    if (!googleResult.isValid) {
        return googleResult;
    }
    
    console.log('\n=== STEP 2: Singapore Database Validation ===');
    const databaseResult = await validatePostalCodeInDatabase(googleResult.postalCode);
    
    if (!databaseResult.isValid) {
        // If postal code not in database, return Google result with warning
        return {
            isValid: true,
            postalCode: googleResult.postalCode,
            formattedAddress: googleResult.formattedAddress,
            country: googleResult.country,
            locality: googleResult.locality,
            route: googleResult.route,
            name: googleResult.formattedAddress,
            description: googleResult.formattedAddress,
            warning: 'Postal code not found in Singapore database, using Google data',
            source: 'google_only'
        };
    }
    
    // Combine Google and database results
    return {
        ...databaseResult,
        formattedAddress: googleResult.formattedAddress,
        googleData: {
            country: googleResult.country,
            locality: googleResult.locality,
            route: googleResult.route
        }
    };
}

// Test the complete workflow
async function main() {
    try {
        console.log('Testing Google reverse geocoding + Singapore database validation...');
        console.log(`Test coordinates: ${testLatitude}, ${testLongitude}`);
        console.log('');
        
        const result = await resolveLocationFromCoordinates(testLatitude, testLongitude);
        
        console.log('\n=== FINAL RESULT ===');
        console.log(JSON.stringify(result, null, 2));
        
        if (result.isValid) {
            console.log('\n=== USER-FRIENDLY MESSAGE ===');
            console.log(`📍 *Location Found*`);
            console.log(`${result.name || result.formattedAddress}`);
            if (result.postalCode) {
                console.log(`📮 Postal Code: ${result.postalCode}`);
            }
            if (result.warning) {
                console.log(`⚠️ ${result.warning}`);
            }
        } else {
            console.log('\n=== ERROR MESSAGE ===');
            console.log(`❌ ${result.error}`);
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
main();
