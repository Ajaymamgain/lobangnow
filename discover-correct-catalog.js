// Practical Catalog Discovery - Uses actual bot configuration
import { discoverBusinessCatalogs, testCatalogAccess, getCatalogInfo } from './src/utils/catalogDiscovery.js';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const STORE_ID = 'cmanyfn1e0001jl04j3k45mz5';

async function getBotConfig() {
    try {
        console.log('📡 Fetching bot configuration from DynamoDB...');
        
        const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        
        const getItemParams = {
            TableName: 'WhatsappStoreTokens',
            Key: {
                storeId: { S: STORE_ID }
            }
        };
        
        const command = new GetItemCommand(getItemParams);
        const result = await dynamoClient.send(command);
        
        if (result.Item) {
            const botConfig = unmarshall(result.Item);
            console.log('✅ Bot configuration loaded successfully');
            console.log('Available config keys:', Object.keys(botConfig));
            
            if (botConfig.whatsappToken) {
                console.log('✅ WhatsApp token found in configuration');
                return botConfig;
            } else {
                console.error('❌ No whatsappToken found in bot configuration');
                return null;
            }
        } else {
            console.error('❌ No configuration found for store ID:', STORE_ID);
            return null;
        }
        
    } catch (error) {
        console.error('❌ Error fetching bot configuration:', error.message);
        return null;
    }
}

async function discoverCorrectCatalog() {
    console.log('🔍 WhatsApp Business Catalog Discovery\n');
    console.log('Store ID:', STORE_ID);
    console.log('Business Management ID: 3686640811574591');
    console.log('Current (failing) Catalog ID: 1450842082483117\n');
    
    try {
        // Get actual bot configuration
        const botConfig = await getBotConfig();
        
        if (!botConfig) {
            console.log('❌ Cannot proceed without bot configuration');
            return;
        }
        
        console.log('📋 Step 1: Discovering available catalogs...');
        const catalogs = await discoverBusinessCatalogs(botConfig);
        
        if (catalogs && catalogs.length > 0) {
            console.log(`✅ Found ${catalogs.length} catalog(s):`);
            
            let accessibleCatalogs = [];
            
            for (let i = 0; i < catalogs.length; i++) {
                const catalog = catalogs[i];
                console.log(`\n--- Catalog ${i + 1} ---`);
                console.log(`ID: ${catalog.id}`);
                console.log(`Name: ${catalog.name || 'Unknown'}`);
                
                // Test access to this catalog
                console.log(`🔐 Testing access to catalog ${catalog.id}...`);
                const hasAccess = await testCatalogAccess(catalog.id, botConfig);
                
                if (hasAccess) {
                    console.log(`✅ Catalog ${catalog.id} is accessible!`);
                    accessibleCatalogs.push(catalog);
                    
                    // Get detailed info
                    console.log(`📊 Getting detailed info...`);
                    const info = await getCatalogInfo(catalog.id, botConfig);
                    
                    if (info) {
                        console.log(`  - Name: ${info.name}`);
                        console.log(`  - Product Count: ${info.product_count || 0}`);
                        console.log(`  - Vertical: ${info.vertical || 'Unknown'}`);
                    }
                } else {
                    console.log(`❌ Catalog ${catalog.id} is not accessible`);
                }
            }
            
            if (accessibleCatalogs.length > 0) {
                console.log(`\n🎯 SOLUTION FOUND!`);
                console.log(`Found ${accessibleCatalogs.length} accessible catalog(s):`);
                
                accessibleCatalogs.forEach((catalog, index) => {
                    console.log(`${index + 1}. Catalog ID: ${catalog.id} (${catalog.name || 'Unnamed'})`);
                });
                
                const recommendedCatalog = accessibleCatalogs[0];
                console.log(`\n📝 TO FIX THE ISSUE:`);
                console.log(`1. Update catalogUtils.js:`);
                console.log(`   Replace: const WHATSAPP_CATALOG_ID = '1450842082483117';`);
                console.log(`   With:    const WHATSAPP_CATALOG_ID = '${recommendedCatalog.id}';`);
                console.log(`2. Redeploy your application`);
                console.log(`3. Test the catalog functionality`);
                
            } else {
                console.log(`\n❌ No accessible catalogs found`);
                console.log(`All discovered catalogs are not accessible with your current token`);
            }
            
        } else {
            console.log('❌ No catalogs found for your business account');
            console.log('\n💡 POSSIBLE SOLUTIONS:');
            console.log('1. Create a catalog in Facebook Business Manager');
            console.log('2. Ensure your WhatsApp Business API token has catalog permissions');
            console.log('3. Verify the business management ID (3686640811574591) is correct');
            console.log('4. Check if the token has the required catalog_management permission');
        }
        
        // Test current failing catalog for comparison
        console.log('\n🔍 Testing current (failing) catalog ID...');
        const currentAccess = await testCatalogAccess('1450842082483117', botConfig);
        
        if (currentAccess) {
            console.log('✅ Current catalog ID is actually accessible (this would be unexpected!)');
        } else {
            console.log('❌ Current catalog ID confirmed not accessible (as expected from the error)');
        }
        
    } catch (error) {
        console.error('❌ Error during catalog discovery:', error.message);
        console.log('\n💡 Make sure you have:');
        console.log('1. Valid AWS credentials configured');
        console.log('2. Access to the WhatsappStoreTokens DynamoDB table');
        console.log('3. A valid WhatsApp Business API token with catalog permissions');
    }
}

// Run the discovery
discoverCorrectCatalog();
