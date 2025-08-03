// Fix LobangLah Bot Configuration - Add missing API keys and credentials to DynamoDB
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const storeId = 'cmanyfn1e0001jl04j3k45mz5'; // LobangLah store ID
const tableName = 'WhatsappStoreTokens';
const tableRegion = 'us-east-1';

// Configuration with proper API keys
const botConfiguration = {
    // WhatsApp Configuration (REQUIRED for stickers and messages)
    whatsappToken: 'YOUR_WHATSAPP_ACCESS_TOKEN', // Replace with actual token
    whatsappPhoneNumberId: 'YOUR_WHATSAPP_PHONE_NUMBER_ID', // Replace with actual phone number ID
    whatsappAppSecret: 'YOUR_WHATSAPP_APP_SECRET', // Replace with actual app secret
    verifyToken: 'pasarnext',
    
    // OpenAI Configuration (REQUIRED for deals search)
    openaiApiKey: 'YOUR_OPENAI_API_KEY', // Replace with actual OpenAI API key
    
    // Google APIs Configuration (REQUIRED for location resolution)
    googleMapsApiKey: 'YOUR_GOOGLE_MAPS_API_KEY', // Replace with actual Google Maps API key
    googleCSEApiKey: 'YOUR_GOOGLE_CSE_API_KEY', // Replace with actual Google CSE API key
    googleCSEId: '6572826d51e2f4d78', // Google CSE ID as provided by user
    
    // Replicate Configuration (REQUIRED for stickers)
    replicateApiToken: 'r8_BYNZbnbXneg5HJUQWqSr4AyoFi10C0D4KuaiC', // User provided token
    
    // Store Configuration
    storeId: storeId,
    storeName: 'LobangLah',
    ownerNumber: '+6591234567', // Replace with actual owner number
    
    // Additional Configuration
    s3ContextBucket: null,
    s3ContextKey: null,
    posFastapiBaseUrl: 'https://i5vux53zk8.execute-api.ap-southeast-1.amazonaws.com/dev'
};

async function fixBotConfiguration() {
    console.log('🔧 Fixing LobangLah Bot Configuration');
    console.log('=' .repeat(50));
    
    try {
        const dynamoClient = new DynamoDBClient({ region: tableRegion });
        
        // Step 1: Check current configuration
        console.log('\n1. Checking current configuration...');
        const getParams = {
            TableName: tableName,
            Key: marshall({ storeId })
        };
        
        const { Item } = await dynamoClient.send(new GetItemCommand(getParams));
        
        if (Item) {
            const currentConfig = unmarshall(Item);
            console.log('Current configuration found:');
            console.log('- WhatsApp Token:', currentConfig.whatsappToken ? '✅ Set' : '❌ Missing');
            console.log('- WhatsApp Phone ID:', currentConfig.whatsappPhoneNumberId ? '✅ Set' : '❌ Missing');
            console.log('- OpenAI API Key:', currentConfig.openaiApiKey ? '✅ Set' : '❌ Missing');
            console.log('- Google Maps API Key:', currentConfig.googleMapsApiKey ? '✅ Set' : '❌ Missing');
            console.log('- Google CSE API Key:', currentConfig.googleCSEApiKey ? '✅ Set' : '❌ Missing');
            console.log('- Replicate API Token:', currentConfig.replicateApiToken ? '✅ Set' : '❌ Missing');
            
            // Step 2: Update configuration with missing keys
            console.log('\n2. Updating configuration with missing API keys...');
            
            const updateExpression = [];
            const expressionAttributeNames = {};
            const expressionAttributeValues = {};
            
            // Add missing keys
            Object.keys(botConfiguration).forEach((key, index) => {
                if (!currentConfig[key] || currentConfig[key] === 'test-key') {
                    updateExpression.push(`#${key} = :${key}`);
                    expressionAttributeNames[`#${key}`] = key;
                    expressionAttributeValues[`:${key}`] = botConfiguration[key];
                }
            });
            
            if (updateExpression.length > 0) {
                const updateParams = {
                    TableName: tableName,
                    Key: marshall({ storeId }),
                    UpdateExpression: `SET ${updateExpression.join(', ')}`,
                    ExpressionAttributeNames: expressionAttributeNames,
                    ExpressionAttributeValues: marshall(expressionAttributeValues)
                };
                
                await dynamoClient.send(new UpdateItemCommand(updateParams));
                console.log('✅ Configuration updated successfully!');
            } else {
                console.log('✅ Configuration is already complete!');
            }
            
        } else {
            // Step 2: Create new configuration
            console.log('No configuration found. Creating new configuration...');
            
            const putParams = {
                TableName: tableName,
                Item: marshall(botConfiguration)
            };
            
            await dynamoClient.send(new PutItemCommand(putParams));
            console.log('✅ New configuration created successfully!');
        }
        
        // Step 3: Verify final configuration
        console.log('\n3. Verifying final configuration...');
        const { Item: finalItem } = await dynamoClient.send(new GetItemCommand(getParams));
        
        if (finalItem) {
            const finalConfig = unmarshall(finalItem);
            console.log('Final configuration:');
            console.log('- WhatsApp Token:', finalConfig.whatsappToken ? '✅ Set' : '❌ Missing');
            console.log('- WhatsApp Phone ID:', finalConfig.whatsappPhoneNumberId ? '✅ Set' : '❌ Missing');
            console.log('- OpenAI API Key:', finalConfig.openaiApiKey ? '✅ Set' : '❌ Missing');
            console.log('- Google Maps API Key:', finalConfig.googleMapsApiKey ? '✅ Set' : '❌ Missing');
            console.log('- Google CSE API Key:', finalConfig.googleCSEApiKey ? '✅ Set' : '❌ Missing');
            console.log('- Replicate API Token:', finalConfig.replicateApiToken ? '✅ Set' : '❌ Missing');
            
            // Step 4: Instructions for user
            console.log('\n4. Next Steps:');
            console.log('🔑 Please replace the placeholder values with your actual API keys:');
            console.log('   - YOUR_WHATSAPP_ACCESS_TOKEN: Get from Meta Developer Console');
            console.log('   - YOUR_WHATSAPP_PHONE_NUMBER_ID: Get from Meta Developer Console');
            console.log('   - YOUR_WHATSAPP_APP_SECRET: Get from Meta Developer Console');
            console.log('   - YOUR_OPENAI_API_KEY: Get from OpenAI Dashboard');
            console.log('   - YOUR_GOOGLE_MAPS_API_KEY: Get from Google Cloud Console');
            console.log('   - YOUR_GOOGLE_CSE_API_KEY: Get from Google Cloud Console');
            console.log('');
            console.log('📝 After updating the API keys, run the test again to verify functionality.');
        }
        
    } catch (error) {
        console.error('❌ Error fixing bot configuration:', error);
    }
}

// Create a test script with proper API keys
async function createTestWithProperConfig() {
    console.log('\n5. Creating test script with proper configuration...');
    
    const testScript = `// Test LobangLah Bot with Proper Configuration
import { handleLobangLahMessage } from './src/handlers/lobangLahHandler.js';
import { generateAndSendSticker } from './src/utils/stickerUtils.js';
import { searchDealsWithOpenAI } from './src/utils/dealsUtils.js';
import { resolveLocationAndWeather } from './src/utils/googleLocationUtils.js';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const testStoreId = '${storeId}';
const testPhoneNumber = '+6591234567';

async function testWithProperConfig() {
    console.log('🧪 Testing LobangLah Bot with Proper Configuration');
    console.log('=' .repeat(50));
    
    try {
        // Get bot configuration from DynamoDB
        const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
        const { Item } = await dynamoClient.send(new GetItemCommand({
            TableName: 'WhatsappStoreTokens',
            Key: marshall({ storeId: testStoreId })
        }));
        
        if (!Item) {
            console.error('❌ Bot configuration not found in DynamoDB');
            return;
        }
        
        const botConfig = unmarshall(Item);
        console.log('✅ Bot configuration loaded from DynamoDB');
        
        // Test 1: Location Resolution
        console.log('\\n1. Testing Location Resolution...');
        const testLocation = {
            latitude: 1.3521,
            longitude: 103.8198,
            name: 'Singapore',
            address: 'Singapore'
        };
        
        const locationResult = await resolveLocationAndWeather(testLocation, botConfig);
        console.log('Location Result:', {
            isValid: locationResult.isValid,
            displayName: locationResult.displayName,
            area: locationResult.area,
            weather: locationResult.weather?.description || 'No weather data'
        });
        
        // Test 2: Deals Search
        console.log('\\n2. Testing Deals Search...');
        const mockLocation = {
            latitude: 1.3521,
            longitude: 103.8198,
            displayName: 'Singapore',
            area: 'Central',
            postalCode: '018956'
        };
        
        const deals = await searchDealsWithOpenAI(mockLocation, 'food', botConfig, []);
        console.log(\`Found \${deals.length} deals\`);
        deals.slice(0, 3).forEach((deal, index) => {
            console.log(\`Deal \${index + 1}: \${deal.businessName} - \${deal.offer}\`);
        });
        
        // Test 3: Sticker Generation
        console.log('\\n3. Testing Sticker Generation...');
        const stickerResult = await generateAndSendSticker(
            testStoreId,
            testPhoneNumber,
            'welcome',
            botConfig,
            { description: 'sunny', temperature: 28 },
            { displayName: 'Singapore', area: 'Central' }
        );
        console.log('Sticker Result:', stickerResult ? '✅ Success' : '❌ Failed');
        
        // Test 4: Full Message Handler
        console.log('\\n4. Testing Full Message Handler...');
        const result = await handleLobangLahMessage(
            testStoreId,
            testPhoneNumber,
            'Hi, I want to find food deals',
            'text',
            botConfig
        );
        console.log('Handler Result:', result ? '✅ Success' : '❌ Failed');
        
    } catch (error) {
        console.error('❌ Test Error:', error.message);
    }
}

testWithProperConfig().catch(console.error);`;
    
    // Write the test script
    const fs = await import('fs');
    fs.writeFileSync('./test-with-proper-config.js', testScript);
    console.log('✅ Test script created: test-with-proper-config.js');
}

// Run the fix
fixBotConfiguration()
    .then(() => createTestWithProperConfig())
    .catch(console.error);
