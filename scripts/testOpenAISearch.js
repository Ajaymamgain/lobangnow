#!/usr/bin/env node

/**
 * Test script to verify OpenAI API integration is working after removing deprecated parameters
 */

import { searchDealsWithOpenAI } from '../src/utils/dealsUtils.js';

async function testOpenAISearch() {
    console.log('🧪 Testing OpenAI API integration after fixing deprecated parameter...\n');
    
    // Test configuration
    const testLocation = {
        latitude: 1.3329,
        longitude: 103.8503,
        displayName: 'Toa Payoh Central',
        area: 'Toa Payoh',
        address: 'Toa Payoh Central, Singapore'
    };
    
    const testCategory = 'food';
    
    const botConfig = {
        openaiApiKey: process.env.OPENAI_API_KEY || 'test-key-not-set',
        googleSearchApiKey: process.env.GOOGLE_CSE_API_KEY || null,
        googleCSEId: process.env.GOOGLE_CSE_ID || '6572826d51e2f4d78'
    };
    
    console.log('📍 Test Parameters:');
    console.log(`   Location: ${testLocation.displayName} (${testLocation.latitude}, ${testLocation.longitude})`);
    console.log(`   Category: ${testCategory}`);
    console.log(`   OpenAI API Key: ${botConfig.openaiApiKey ? '✅ Available' : '❌ Missing'}`);
    console.log(`   Google CSE Key: ${botConfig.googleSearchApiKey ? '✅ Available' : '❌ Missing'}\n`);
    
    if (!botConfig.openaiApiKey || botConfig.openaiApiKey === 'test-key-not-set') {
        console.log('⚠️  Warning: No OpenAI API key found. Set OPENAI_API_KEY environment variable.');
        console.log('   This test will use mock data or Google CSE only.\n');
    }
    
    try {
        console.log('🔍 Starting OpenAI search test...');
        const startTime = Date.now();
        
        const deals = await searchDealsWithOpenAI(
            testLocation,
            testCategory,
            botConfig,
            [] // excludeDeals
        );
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log(`\n✅ Search completed in ${duration}ms`);
        console.log(`📊 Results: ${deals ? deals.length : 0} deals found\n`);
        
        if (deals && deals.length > 0) {
            console.log('🎯 Sample deals:');
            deals.slice(0, 3).forEach((deal, index) => {
                console.log(`\n   ${index + 1}. ${deal.businessName || deal.title || 'Unknown Business'}`);
                console.log(`      Offer: ${deal.offer || deal.description || 'No description'}`);
                console.log(`      Address: ${deal.address || 'No address'}`);
                console.log(`      Source: ${deal.socialMediaSource || 'Unknown'}`);
                if (deal.dealLink) {
                    console.log(`      Link: ${deal.dealLink}`);
                }
            });
        } else {
            console.log('❌ No deals found. This could indicate:');
            console.log('   - OpenAI API issues');
            console.log('   - Network connectivity problems');
            console.log('   - API key issues');
            console.log('   - Search location/category issues');
        }
        
        console.log('\n🎉 Test completed successfully - No API errors detected!');
        
    } catch (error) {
        console.error('\n❌ Test failed with error:');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        
        if (error.message.includes('web_search_options')) {
            console.error('\n🚨 CRITICAL: Still using deprecated OpenAI parameter!');
            console.error('   The fix was not applied correctly.');
        } else if (error.message.includes('400')) {
            console.error('\n🚨 OpenAI API Error (400):');
            console.error('   Check if API key is valid and has proper permissions.');
        } else if (error.message.includes('timeout')) {
            console.error('\n⏰ Timeout Error:');
            console.error('   OpenAI API took too long to respond.');
        } else {
            console.error('\n🔍 Other Error:');
            console.error('   Check network connectivity and API configuration.');
        }
        
        console.error('\nFull error details:');
        console.error(error);
        
        process.exit(1);
    }
}

// Run the test
testOpenAISearch().catch(error => {
    console.error('Unhandled error in test:', error);
    process.exit(1);
});
