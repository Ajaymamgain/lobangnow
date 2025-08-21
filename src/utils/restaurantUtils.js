// Restaurant Details Management Utilities
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});

/**
 * Save restaurant details to DynamoDB
 */
export async function saveRestaurantDetails(restaurantData) {
    try {
        const tableName = process.env.RESTAURANT_TABLE_NAME || 'store-ai-bot-dev-restaurants';
        
        const restaurant = {
            placeId: restaurantData.placeId,
            name: restaurantData.name,
            category: restaurantData.category || 'restaurant',
            address: restaurantData.address || restaurantData.formattedAddress,
            phone: restaurantData.phone,
            website: restaurantData.website,
            rating: restaurantData.rating,
            priceLevel: restaurantData.priceLevel,
            openingHours: restaurantData.openingHours,
            photos: restaurantData.photos || [],
            menu: restaurantData.menu,
            deals: restaurantData.deals || [],
            coordinates: {
                latitude: restaurantData.latitude,
                longitude: restaurantData.longitude
            },
            lastUpdated: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days TTL
            source: restaurantData.source || 'google_places'
        };

        const command = new PutCommand({
            TableName: tableName,
            Item: restaurant
        });

        await docClient.send(command);
        console.log(`[RestaurantUtils] Saved restaurant: ${restaurant.name} (${restaurant.placeId})`);
        
        return restaurant;
        
    } catch (error) {
        console.error('[RestaurantUtils] Error saving restaurant details:', error);
        throw error;
    }
}

/**
 * Get restaurant details by place ID
 */
export async function getRestaurantDetails(placeId) {
    try {
        const tableName = process.env.RESTAURANT_TABLE_NAME || 'store-ai-bot-dev-restaurants';
        
        const command = new GetCommand({
            TableName: tableName,
            Key: { placeId }
        });

        const response = await docClient.send(command);
        
        if (response.Item) {
            console.log(`[RestaurantUtils] Retrieved restaurant: ${response.Item.name}`);
            return response.Item;
        } else {
            console.log(`[RestaurantUtils] Restaurant not found: ${placeId}`);
            return null;
        }
        
    } catch (error) {
        console.error('[RestaurantUtils] Error getting restaurant details:', error);
        throw error;
    }
}

/**
 * Search restaurants by name
 */
export async function searchRestaurantsByName(name) {
    try {
        const tableName = process.env.RESTAURANT_TABLE_NAME || 'store-ai-bot-dev-restaurants';
        
        const command = new QueryCommand({
            TableName: tableName,
            IndexName: 'NameIndex',
            KeyConditionExpression: '#name = :name',
            ExpressionAttributeNames: {
                '#name': 'name'
            },
            ExpressionAttributeValues: {
                ':name': name
            }
        });

        const response = await docClient.send(command);
        
        console.log(`[RestaurantUtils] Found ${response.Items?.length || 0} restaurants with name: ${name}`);
        return response.Items || [];
        
    } catch (error) {
        console.error('[RestaurantUtils] Error searching restaurants by name:', error);
        throw error;
    }
}

/**
 * Get restaurants by category
 */
export async function getRestaurantsByCategory(category, limit = 10) {
    try {
        const tableName = process.env.RESTAURANT_TABLE_NAME || 'store-ai-bot-dev-restaurants';
        
        const command = new QueryCommand({
            TableName: tableName,
            IndexName: 'CategoryIndex',
            KeyConditionExpression: '#category = :category',
            ExpressionAttributeNames: {
                '#category': 'category'
            },
            ExpressionAttributeValues: {
                ':category': category
            },
            ScanIndexForward: false, // Most recent first
            Limit: limit
        });

        const response = await docClient.send(command);
        
        console.log(`[RestaurantUtils] Found ${response.Items?.length || 0} restaurants in category: ${category}`);
        return response.Items || [];
        
    } catch (error) {
        console.error('[RestaurantUtils] Error getting restaurants by category:', error);
        throw error;
    }
}

/**
 * Update restaurant deals
 */
export async function updateRestaurantDeals(placeId, deals) {
    try {
        const tableName = process.env.RESTAURANT_TABLE_NAME || 'store-ai-bot-dev-restaurants';
        
        const command = new UpdateCommand({
            TableName: tableName,
            Key: { placeId },
            UpdateExpression: 'SET deals = :deals, lastUpdated = :lastUpdated',
            ExpressionAttributeValues: {
                ':deals': deals,
                ':lastUpdated': Date.now()
            }
        });

        await docClient.send(command);
        console.log(`[RestaurantUtils] Updated deals for restaurant: ${placeId}`);
        
    } catch (error) {
        console.error('[RestaurantUtils] Error updating restaurant deals:', error);
        throw error;
    }
}

/**
 * Get or create restaurant details from Google Places data
 */
export async function getOrCreateRestaurantFromPlaces(placesData, category = 'restaurant') {
    try {
        // Check if restaurant already exists
        let restaurant = await getRestaurantDetails(placesData.placeId);
        
        if (!restaurant) {
            // Create new restaurant record
            const restaurantData = {
                placeId: placesData.placeId,
                name: placesData.name,
                category: category,
                address: placesData.formattedAddress || placesData.vicinity,
                phone: placesData.phone,
                website: placesData.website,
                rating: placesData.rating,
                priceLevel: placesData.priceLevel,
                openingHours: placesData.openingHours,
                photos: placesData.photos || [],
                coordinates: {
                    latitude: placesData.latitude,
                    longitude: placesData.longitude
                },
                source: 'google_places'
            };
            
            restaurant = await saveRestaurantDetails(restaurantData);
        }
        
        return restaurant;
        
    } catch (error) {
        console.error('[RestaurantUtils] Error getting or creating restaurant:', error);
        throw error;
    }
}

/**
 * Batch save multiple restaurants
 */
export async function batchSaveRestaurants(restaurants) {
    try {
        const tableName = process.env.RESTAURANT_TABLE_NAME || 'store-ai-bot-dev-restaurants';
        
        const promises = restaurants.map(restaurant => {
            const command = new PutCommand({
                TableName: tableName,
                Item: {
                    ...restaurant,
                    lastUpdated: Date.now(),
                    ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
                }
            });
            return docClient.send(command);
        });
        
        await Promise.all(promises);
        console.log(`[RestaurantUtils] Batch saved ${restaurants.length} restaurants`);
        
    } catch (error) {
        console.error('[RestaurantUtils] Error batch saving restaurants:', error);
        throw error;
    }
} 