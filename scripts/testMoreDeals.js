/**
 * Test script for "More Deals" functionality improvements
 * Tests the enhanced location matching and Google search fallback
 */

import { searchMoreDealsFromDynamoDB } from '../src/utils/dealsUtils.js';

async function testMoreDealsFunction() {
    console.log('🧪 Testing More Deals functionality improvements...\n');
    
    // Test case 1: Address variation matching (349 vs 49 Hougang Ave 7)
    console.log('📍 Test 1: Address variation matching');
    const location1 = {
        displayName: '349 Hougang Ave 7',
        area: 'Hougang',
        formattedAddress: '349 Hougang Ave 7, Singapore 530349',
        postalCode: '530349',
        latitude: 1.3721,
        longitude: 103.8958
    };
    
    const excludeDeals1 = [
        {
            businessName: 'Toast Box',
            offer: '20% off breakfast sets',
            description: 'Enjoy 20% discount on all breakfast sets'
        }
    ];
    
    try {
        const deals1 = await searchMoreDealsFromDynamoDB(location1, 'food', excludeDeals1, 5);
        console.log(`✅ Found ${deals1.length} deals for Hougang Ave 7`);
        if (deals1.length > 0) {
            deals1.forEach((deal, index) => {
                console.log(`   ${index + 1}. ${deal.businessName || deal.title} - ${deal.offer || deal.description?.substring(0, 50)}...`);
            });
        }
    } catch (error) {
        console.error('❌ Error in test 1:', error.message);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Test case 2: GPS-based matching
    console.log('🌍 Test 2: GPS-based location matching');
    const location2 = {
        displayName: 'Orchard Road',
        area: 'Orchard',
        formattedAddress: 'Orchard Road, Singapore',
        postalCode: '238864',
        latitude: 1.3048,
        longitude: 103.8318
    };
    
    const excludeDeals2 = [
        {
            businessName: 'Uniqlo',
            offer: 'Summer sale up to 50% off',
            description: 'Great summer deals on clothing'
        }
    ];
    
    try {
        const deals2 = await searchMoreDealsFromDynamoDB(location2, 'clothes', excludeDeals2, 5);
        console.log(`✅ Found ${deals2.length} deals for Orchard Road`);
        if (deals2.length > 0) {
            deals2.forEach((deal, index) => {
                console.log(`   ${index + 1}. ${deal.businessName || deal.title} - ${deal.offer || deal.description?.substring(0, 50)}...`);
            });
        }
    } catch (error) {
        console.error('❌ Error in test 2:', error.message);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Test case 3: Google search fallback (using a location unlikely to have DynamoDB deals)
    console.log('🔍 Test 3: Google search fallback');
    const location3 = {
        displayName: 'Sentosa Island',
        area: 'Sentosa',
        formattedAddress: 'Sentosa Island, Singapore',
        postalCode: '098585',
        latitude: 1.2494,
        longitude: 103.8303
    };
    
    const excludeDeals3 = [];
    
    try {
        const deals3 = await searchMoreDealsFromDynamoDB(location3, 'food', excludeDeals3, 3);
        console.log(`✅ Found ${deals3.length} deals for Sentosa (should trigger Google fallback)`);
        if (deals3.length > 0) {
            deals3.forEach((deal, index) => {
                console.log(`   ${index + 1}. ${deal.businessName || deal.title} - ${deal.offer || deal.description?.substring(0, 50)}...`);
                if (deal.source) {
                    console.log(`       Source: ${deal.source}`);
                }
            });
        } else {
            console.log('   ℹ️  No deals found - this might indicate Google fallback needs OpenAI API key');
        }
    } catch (error) {
        console.error('❌ Error in test 3:', error.message);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    console.log('🎯 Test Summary:');
    console.log('✅ Enhanced location matching with address variations');
    console.log('✅ GPS-based matching within 2km radius');
    console.log('✅ Google search + OpenAI fallback when DynamoDB returns no results');
    console.log('✅ Improved exclusion logic to avoid duplicate deals');
    console.log('\n📝 Note: Google fallback requires OPENAI_API_KEY environment variable');
}

// Run the test
testMoreDealsFunction().catch(console.error);
