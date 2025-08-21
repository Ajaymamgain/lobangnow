/**
 * Check and setup WhatsappStoreTokens table in us-east-1
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const region = 'us-east-1';
const tableName = 'WhatsappStoreTokens';

const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

async function checkAndSetupUSEast1Table() {
    console.log('🔍 Checking WhatsappStoreTokens table in us-east-1...\n');

    try {
        // First, scan all items in the us-east-1 table
        console.log('📋 Scanning all items in us-east-1 WhatsappStoreTokens table...');
        const scanCommand = new ScanCommand({
            TableName: tableName
        });
        
        const scanResult = await docClient.send(scanCommand);
        console.log(`Found ${scanResult.Items?.length || 0} items in us-east-1 table:`);
        
        if (scanResult.Items && scanResult.Items.length > 0) {
            scanResult.Items.forEach((item, index) => {
                console.log(`\n${index + 1}. Item:`);
                console.log(`   Store ID: ${item.storeId}`);
                console.log(`   Phone Number ID: ${item.whatsappPhoneNumberId || item.phoneNumberId || 'Not found'}`);
                console.log(`   WhatsApp Token: ${item.whatsappToken?.substring(0, 20)}...`);
                console.log(`   Google Maps API Key: ${item.googleMapsApiKey ? 'Present' : 'Missing'}`);
                console.log(`   Bot Type: ${item.botType || 'Not specified'}`);
            });
        } else {
            console.log('❌ No items found in us-east-1 table!');
        }
        
        // Check if our Daily Deal Agency store exists
        console.log('\n🔍 Checking for Daily Deal Agency store...');
        const getCommand = new GetCommand({
            TableName: tableName,
            Key: { storeId: 'cmanyfn1e0001jl04j3k45mz5' }
        });
        
        const getResult = await docClient.send(getCommand);
        
        if (getResult.Item) {
            console.log('✅ Daily Deal Agency store found in us-east-1!');
            console.log(`   Phone Number ID: ${getResult.Item.whatsappPhoneNumberId || getResult.Item.phoneNumberId}`);
            console.log(`   WhatsApp Token: ${getResult.Item.whatsappToken?.substring(0, 20)}...`);
        } else {
            console.log('❌ Daily Deal Agency store NOT found in us-east-1!');
            console.log('\n🛠️  Creating Daily Deal Agency store configuration...');
            
            // Create the store configuration in us-east-1
            const storeConfig = {
                storeId: 'cmanyfn1e0001jl04j3k45mz5',
                whatsappPhoneNumberId: '479692671913549', // Using standard field name
                whatsappToken: 'EAAQZC9TZBD6JgBO1DGbZAOrmgZCbIQfaHUEx4kwX5D3WtJ40Wv4UB40KoQ2mig19Bh3AuqmuPDU3B4rrHLJ3A8AxfKjVPFdWO0FYrDZA4kov93dyA9TLPk1IW58MViqq2TE8vlPXWXxXRgvA5rPabIK77RpZCZAOB47zwv86f2PIRACbEkXDAHnjQZDZD',
                googleMapsApiKey: 'AIzaSyAEickHlx5T4alk1Cu5ks-EzF8xzyxoTDQ',
                openaiApiKey: 'sk-proj-BJ3f6JGlJfhYHkLgbXUKpJALDKqzJo-8Ow8WpLGhYJZLKnpDYHCTQ_JLsT3BlbkFJlJ7Fvto-8hUErhYQDo6p3yYCnJU0kKnpF3QdKnyj3dfrH0T-6FJzLo',
                replicateApiKey: 'r8_dummy-replicate-key',
                webhookSecret: 'your-webhook-secret-here',
                ownerNumber: '919711123199',
                botType: 'DAILY_DEAL_AGENCY',
                s3BucketName: 'whatsappstore-viral-content',
                awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummy-aws-key',
                awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummy-aws-secret',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            const putCommand = new PutCommand({
                TableName: tableName,
                Item: storeConfig
            });
            
            await docClient.send(putCommand);
            console.log('✅ Daily Deal Agency store created in us-east-1!');
        }
        
        // Test the lookup that the webhook uses
        console.log('\n🔍 Testing webhook lookup logic...');
        const testPhoneId = '479692671913549';
        
        const scanByPhoneCommand = new ScanCommand({
            TableName: tableName,
            FilterExpression: 'whatsappPhoneNumberId = :phoneId',
            ExpressionAttributeValues: {
                ':phoneId': testPhoneId
            }
        });
        
        const phoneResult = await docClient.send(scanByPhoneCommand);
        
        if (phoneResult.Items && phoneResult.Items.length > 0) {
            console.log(`✅ Webhook lookup test PASSED!`);
            console.log(`   Found store: ${phoneResult.Items[0].storeId}`);
            console.log(`   Phone ID: ${phoneResult.Items[0].whatsappPhoneNumberId}`);
        } else {
            console.log(`❌ Webhook lookup test FAILED!`);
            console.log(`   No store found for phone ID: ${testPhoneId}`);
        }
        
        console.log('\n🚀 Setup complete! Ready for testing.');
        
    } catch (error) {
        console.error('❌ Error checking us-east-1 table:', error);
    }
}

checkAndSetupUSEast1Table().catch(console.error);
