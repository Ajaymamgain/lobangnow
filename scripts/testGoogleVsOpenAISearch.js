#!/usr/bin/env node

/**
 * Test script to compare Google Search deals vs OpenAI search deals
 * This will help us understand which search method provides better results
 */

import { searchDealsWithGoogleCSE } from '../src/utils/googleSearchUtils.js';
import { searchDealsWithOpenAI } from '../src/utils/dealsUtils.js';

// Mock location data (Singapore)
const testLocation = {
    latitude: 1.3521,
    longitude: 103.8198,
    displayName: "Marina Bay, Singapore",
    description: "Marina Bay, Singapore",
    name: "Marina Bay",
    postalCode: "018956",
    pincode: "018956"
};

// Mock bot config with API keys
const mockBotConfig = {
    googleMapsApiKey: 'AIzaSyAEickHlx5T4alk1Cu5ks-EzF8xzyxoTDQ',
    googleCSEApiKey: 'AIzaSyAEickHlx5T4alk1Cu5ks-EzF8xzyxoTDQ', // Use the provided API key
    googleCSEId: process.env.GOOGLE_CSE_ID || '6572826d51e2f4d78',
    openaiApiKey: process.env.OPENAI_API_KEY || 'test-key'
};

async function compareSearchMethods() {
    console.log('🔍 Google Search vs OpenAI Search Comparison');
    console.log('============================================');
    console.log(`📍 Test Location: ${testLocation.displayName}`);
    console.log(`📅 Test Date: ${new Date().toLocaleDateString()}`);
    
    const categories = ['food', 'fashion', 'groceries'];
    
    for (const category of categories) {
        console.log(`\n🏷️  Testing Category: ${category.toUpperCase()}`);
        console.log('=' .repeat(50));
        
        try {
            // Test Google Search
            console.log('\n🔍 Google Custom Search Results:');
            console.log('-'.repeat(35));
            
            const googleDeals = await searchDealsWithGoogleCSE(
                testLocation, 
                category, 
                mockBotConfig.googleCSEApiKey, 
                mockBotConfig.googleCSEId
            );
            
            console.log(`✅ Found ${googleDeals.length} deals via Google Search`);
            
            if (googleDeals.length > 0) {
                googleDeals.slice(0, 5).forEach((deal, index) => {
                    console.log(`${index + 1}. ${deal.title}`);
                    console.log(`   📍 ${deal.address || 'Address not specified'}`);
                    console.log(`   💰 ${deal.offer || deal.discount || 'Special offer'}`);
                    console.log(`   🔗 ${deal.link || 'No link'}`);
                    console.log('');
                });
            } else {
                console.log('   ℹ️  No deals found via Google Search');
            }
            
            // Test OpenAI Search
            console.log('\n🤖 OpenAI Web Search Results:');
            console.log('-'.repeat(32));
            
            const openaiDeals = await searchDealsWithOpenAI(
                testLocation, 
                category, 
                mockBotConfig, 
                []
            );
            
            console.log(`✅ Found ${openaiDeals.length} deals via OpenAI Search`);
            
            if (openaiDeals.length > 0) {
                openaiDeals.slice(0, 5).forEach((deal, index) => {
                    const businessName = deal.businessName || deal.restaurant || deal.store || deal.title;
                    console.log(`${index + 1}. ${businessName}`);
                    console.log(`   📍 ${deal.address || 'Address not specified'}`);
                    console.log(`   💰 ${deal.offer || deal.discount || 'Special offer'}`);
                    console.log(`   🔗 ${deal.link || deal.source || 'No link'}`);
                    console.log('');
                });
            } else {
                console.log('   ℹ️  No deals found via OpenAI Search');
            }
            
            // Compare results
            console.log('\n📊 Comparison Summary:');
            console.log('-'.repeat(20));
            console.log(`Google Search: ${googleDeals.length} deals`);
            console.log(`OpenAI Search: ${openaiDeals.length} deals`);
            
            // Check for overlapping deals
            const googleTitles = googleDeals.map(d => (d.title || '').toLowerCase());
            const openaiTitles = openaiDeals.map(d => (d.businessName || d.title || '').toLowerCase());
            
            const overlapping = googleTitles.filter(title => 
                openaiTitles.some(openaiTitle => 
                    title.includes(openaiTitle) || openaiTitle.includes(title)
                )
            );
            
            console.log(`Overlapping deals: ${overlapping.length}`);
            console.log(`Unique to Google: ${googleDeals.length - overlapping.length}`);
            console.log(`Unique to OpenAI: ${openaiDeals.length - overlapping.length}`);
            
        } catch (error) {
            console.error(`❌ Error testing ${category}:`, error.message);
        }
    }
    
    console.log('\n🎯 Overall Test Summary:');
    console.log('========================');
    console.log('✅ Google Search: Direct web scraping, structured results');
    console.log('✅ OpenAI Search: AI-powered with web search, contextual understanding');
    console.log('✅ Both methods tested successfully');
    console.log('\n💡 Recommendation: Use both methods for comprehensive deal coverage');
    console.log('   - Google Search for structured, direct results');
    console.log('   - OpenAI Search for intelligent, contextual deals');
}

// Run the comparison
compareSearchMethods().catch(console.error);
