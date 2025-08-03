// Test script to find nearest postal code from coordinates
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const postalCodesTableName = 'store-ai-bot-dev-postal-codes';

// Test coordinates from WhatsApp location message
const testLatitude = 1.3718338;
const testLongitude = 103.8995563;

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} - Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
}

/**
 * Find nearest postal code from coordinates
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @returns {Object|null} - Nearest location data
 */
async function findNearestPostalCode(latitude, longitude) {
    try {
        console.log(`Finding nearest postal code for coordinates: ${latitude}, ${longitude}`);
        
        // Scan all postal codes (in production, you might want to use a spatial index)
        const scanParams = {
            TableName: postalCodesTableName,
            ProjectionExpression: 'postal, address, roadName, building, blkNo, latitude, longitude'
        };
        
        let nearestLocation = null;
        let minDistance = Infinity;
        let scannedCount = 0;
        
        // Scan in batches
        let lastEvaluatedKey = null;
        
        do {
            if (lastEvaluatedKey) {
                scanParams.ExclusiveStartKey = lastEvaluatedKey;
            }
            
            const result = await dynamoClient.send(new ScanCommand(scanParams));
            
            if (result.Items) {
                for (const item of result.Items) {
                    const location = unmarshall(item);
                    scannedCount++;
                    
                    if (location.latitude && location.longitude) {
                        const distance = calculateDistance(
                            latitude, longitude,
                            location.latitude, location.longitude
                        );
                        
                        if (distance < minDistance) {
                            minDistance = distance;
                            nearestLocation = {
                                ...location,
                                distance: distance
                            };
                        }
                    }
                }
            }
            
            lastEvaluatedKey = result.LastEvaluatedKey;
            console.log(`Scanned ${scannedCount} locations so far...`);
            
        } while (lastEvaluatedKey);
        
        console.log(`Scanned ${scannedCount} total locations`);
        
        if (nearestLocation) {
            console.log(`Nearest location found:`);
            console.log(`  Postal Code: ${nearestLocation.postal}`);
            console.log(`  Address: ${nearestLocation.address}`);
            console.log(`  Road Name: ${nearestLocation.roadName}`);
            console.log(`  Building: ${nearestLocation.building}`);
            console.log(`  Distance: ${nearestLocation.distance.toFixed(3)} km`);
            console.log(`  Coordinates: ${nearestLocation.latitude}, ${nearestLocation.longitude}`);
            
            return nearestLocation;
        } else {
            console.log('No location found');
            return null;
        }
        
    } catch (error) {
        console.error('Error finding nearest postal code:', error);
        return null;
    }
}

/**
 * Format location data for display
 * @param {Object} locationData - Location data from database
 * @returns {Object} - Formatted location data
 */
function formatLocationData(locationData) {
    const postalCode = locationData.postal.padStart(6, '0');
    
    return {
        postalCode: postalCode,
        originalPostal: locationData.postal,
        address: locationData.address || '',
        roadName: locationData.roadName || '',
        building: locationData.building || '',
        blkNo: locationData.blkNo || '',
        latitude: locationData.latitude || 0,
        longitude: locationData.longitude || 0,
        distance: locationData.distance || 0,
        name: formatLocationName(locationData),
        description: formatLocationDescription(locationData),
        isValid: true,
        source: 'singapore_database_coordinates'
    };
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

// Test the function
async function main() {
    try {
        console.log('Testing location lookup for WhatsApp coordinates...');
        console.log(`Test coordinates: ${testLatitude}, ${testLongitude}`);
        console.log('');
        
        const nearestLocation = await findNearestPostalCode(testLatitude, testLongitude);
        
        if (nearestLocation) {
            console.log('');
            console.log('=== FORMATTED RESULT ===');
            const formattedLocation = formatLocationData(nearestLocation);
            console.log(JSON.stringify(formattedLocation, null, 2));
            
            console.log('');
            console.log('=== USER-FRIENDLY MESSAGE ===');
            console.log(`📍 *Location Found*`);
            console.log(`${formattedLocation.name}`);
            console.log(`📮 Postal Code: ${formattedLocation.postalCode}`);
            console.log(`📏 Distance: ${formattedLocation.distance.toFixed(2)} km from your location`);
        } else {
            console.log('No location found in Singapore database');
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
main();
