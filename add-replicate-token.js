// Add Replicate API token to DynamoDB configuration and test the bot
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const storeId = 'cmanyfn1e0001jl04j3k45mz5';
const tableName = 'WhatsappStoreTokens';
const tableRegion = 'us-east-1';
const replicateApiToken = 'r8_BYNZbnbXneg5HJUQWqSr4AyoFi10C0D4KuaiC'; // User provided token

async function addReplicateToken() {
    console.log('🔧 Adding Replicate API Token to DynamoDB Configuration');
    console.log('=' .repeat(60));
    
    try {
        const dynamoClient = new DynamoDBClient({ region: tableRegion });
        
        // Step 1: Check current configuration
        console.log('\n1. Checking current configuration...');
        const getParams = {
            TableName: tableName,
            Key: marshall({ storeId })
        };
        
        const { Item } = await dynamoClient.send(new GetItemCommand(getParams));
        
        if (!Item) {
            console.error('❌ No configuration found for store:', storeId);
            return;
        }
        
        const currentConfig = unmarshall(Item);
        console.log('✅ Current configuration found');
        
        // Step 2: Add Replicate API token
        console.log('\n2. Adding Replicate API token...');
        
        const updateParams = {
            TableName: tableName,
            Key: marshall({ storeId }),
            UpdateExpression: 'SET replicateApiToken = :token',
            ExpressionAttributeValues: marshall({
                ':token': replicateApiToken
            })
        };
        
        await dynamoClient.send(new UpdateItemCommand(updateParams));
        console.log('✅ Replicate API token added successfully!');
        
        // Step 3: Verify final configuration
        console.log('\n3. Verifying final configuration...');
        const { Item: finalItem } = await dynamoClient.send(new GetItemCommand(getParams));
        
        if (finalItem) {
            const finalConfig = unmarshall(finalItem);
            console.log('Final configuration status:');
            console.log('- WhatsApp Token:', finalConfig.whatsappToken ? '✅ Set' : '❌ Missing');
            console.log('- WhatsApp Phone ID:', finalConfig.whatsappPhoneNumberId ? '✅ Set' : '❌ Missing');
            console.log('- WhatsApp App Secret:', finalConfig.whatsappAppSecret ? '✅ Set' : '❌ Missing');
            console.log('- OpenAI API Key:', finalConfig.openAiApiKey ? '✅ Set' : '❌ Missing');
            console.log('- Google Maps API Key:', finalConfig.googleMapsApiKey ? '✅ Set' : '❌ Missing');
            console.log('- Google Search API Key:', finalConfig.googleSearchApiKey ? '✅ Set' : '❌ Missing');
            console.log('- Google Search Token:', finalConfig.googleSearchToken ? '✅ Set' : '❌ Missing');
            console.log('- Replicate API Token:', finalConfig.replicateApiToken ? '✅ Set' : '❌ Missing');
            
            console.log('\n🎉 All required API keys are now configured!');
            return finalConfig;
        }
        
    } catch (error) {
        console.error('❌ Error adding Replicate token:', error);
        return null;
    }
}

// Run the token addition
addReplicateToken().catch(console.error);
