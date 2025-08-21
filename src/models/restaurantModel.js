import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamodb = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-southeast-1'
});

const TABLE_NAME = 'Restaurants';

export class RestaurantModel {
    /**
     * Save restaurant details to DynamoDB
     */
    static async saveRestaurant(restaurantData) {
        const timestamp = new Date().toISOString();
        const restaurantId = restaurantData.id || uuidv4();

        const item = {
            id: restaurantId,
            name: restaurantData.name,
            address: restaurantData.address,
            phone: restaurantData.phone,
            website: restaurantData.website,
            rating: restaurantData.rating,
            placeId: restaurantData.placeId,
            openingHours: restaurantData.openingHours,
            socialMedia: restaurantData.socialMedia,
            description: restaurantData.description,
            images: restaurantData.images,
            s3Images: restaurantData.s3Images,
            createdAt: timestamp,
            updatedAt: timestamp
        };

        const params = {
            TableName: TABLE_NAME,
            Item: item
        };

        try {
            await dynamodb.put(params).promise();
            return item;
        } catch (error) {
            console.error('[RestaurantModel] Error saving restaurant:', error);
            throw error;
        }
    }

    /**
     * Get restaurant by ID
     */
    static async getRestaurant(restaurantId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                id: restaurantId
            }
        };

        try {
            const result = await dynamodb.get(params).promise();
            return result.Item;
        } catch (error) {
            console.error('[RestaurantModel] Error getting restaurant:', error);
            throw error;
        }
    }

    /**
     * Get restaurant by Google Places ID
     */
    static async getRestaurantByPlaceId(placeId) {
        const params = {
            TableName: TABLE_NAME,
            IndexName: 'PlaceIdIndex',
            KeyConditionExpression: 'placeId = :placeId',
            ExpressionAttributeValues: {
                ':placeId': placeId
            }
        };

        try {
            const result = await dynamodb.query(params).promise();
            return result.Items?.[0];
        } catch (error) {
            console.error('[RestaurantModel] Error getting restaurant by placeId:', error);
            throw error;
        }
    }

    /**
     * Update restaurant images
     */
    static async updateRestaurantImages(restaurantId, images) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                id: restaurantId
            },
            UpdateExpression: 'set s3Images = :images, updatedAt = :timestamp',
            ExpressionAttributeValues: {
                ':images': images,
                ':timestamp': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        try {
            const result = await dynamodb.update(params).promise();
            return result.Attributes;
        } catch (error) {
            console.error('[RestaurantModel] Error updating restaurant images:', error);
            throw error;
        }
    }
}

export default RestaurantModel;
