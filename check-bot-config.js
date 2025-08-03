// Script to check bot configuration for LobangLah store
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const storeId = 'cmanyfn1e0001jl04j3k45mz5'; // LobangLah store ID

async function checkBotConfig() {
    try {
        const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
        
        const command = new GetItemCommand({
            TableName: 'WhatsappStoreTokens',
            Key: {
                storeId: { S: storeId }
            }
        });
        
        const result = await dynamoClient.send(command);
        
        if (result.Item) {
            const config = unmarshall(result.Item);
            console.log('✅ Bot config found for LobangLah store:');
            console.log('\n📋 Available configuration keys:');
            
            // Check for various token field names
            const tokenFields = [
                'whatsappAccessToken',
                'whatsapp_access_token', 
                'accessToken',
                'access_token',
                'replicateApiToken',
                'replicate_api_token',
                'openAiApiKey',
                'openai_api_key',
                'googleMapsApiKey',
                'google_maps_api_key'
            ];
            
            tokenFields.forEach(field => {
                if (config[field]) {
                    const value = config[field];
                    const maskedValue = typeof value === 'string' && value.length > 10 
                        ? value.substring(0, 10) + '...' 
                        : '[PRESENT]';
                    console.log(`  ✅ ${field}: ${maskedValue}`);
                } else {
                    console.log(`  ❌ ${field}: NOT FOUND`);
                }
            });
            
            console.log('\n🔍 All config keys:');
            Object.keys(config).forEach(key => {
                if (typeof config[key] === 'string' && config[key].length > 50) {
                    console.log(`  ${key}: [LONG_STRING]`);
                } else {
                    console.log(`  ${key}: ${config[key]}`);
                }
            });
            
        } else {
            console.log('❌ No bot config found for store ID:', storeId);
        }
        
    } catch (error) {
        console.error('❌ Error checking bot config:', error.message);
    }
}

checkBotConfig();
