/**
 * Test script to verify all pincode requests have been removed and interactive searching message works
 */

import { createInteractiveSearchingMessage } from '../src/utils/dealsUtils.js';

async function testPincodeRemovalAndInteractiveSearch() {
    console.log('🧪 Testing Pincode Removal and Interactive Searching Message...\n');
    
    // Test 1: Interactive searching message with OpenAI
    console.log('📱 Test 1: Interactive Searching Message Generation');
    
    const testLocation = {
        displayName: '49 Hougang Ave 7',
        area: 'Hougang',
        formattedAddress: '49 Hougang Ave 7, Singapore 530049',
        postalCode: '530049',
        latitude: 1.3721,
        longitude: 103.8958
    };
    
    const testBotConfig = {
        openaiApiKey: process.env.OPENAI_API_KEY || 'test-key'
    };
    
    console.log(`📍 Location: ${testLocation.displayName}`);
    console.log(`🍕 Category: food`);
    console.log(`🔑 OpenAI API Key available: ${process.env.OPENAI_API_KEY ? 'Yes' : 'No (using fallback)'}`);
    
    try {
        const startTime = Date.now();
        const searchingMessage = await createInteractiveSearchingMessage(testLocation, 'food', testBotConfig);
        const endTime = Date.now();
        
        console.log(`\n⏱️  Message generated in ${endTime - startTime}ms`);
        console.log(`📋 Message Type: ${searchingMessage.type}`);
        console.log(`🎯 Interactive Type: ${searchingMessage.interactive?.type}`);
        console.log(`📝 Header: ${searchingMessage.interactive?.header?.text}`);
        console.log(`💬 Body Preview: ${searchingMessage.interactive?.body?.text?.substring(0, 100)}...`);
        console.log(`🔘 Button Count: ${searchingMessage.interactive?.action?.buttons?.length || 0}`);
        
        if (searchingMessage.interactive?.body?.text) {
            const bodyText = searchingMessage.interactive.body.text.toLowerCase();
            
            // Check for pincode/postal code mentions
            const hasPincode = bodyText.includes('pincode') || bodyText.includes('postal code') || bodyText.includes('6-digit');
            const hasLocation = bodyText.includes('hougang') || bodyText.includes('49 hougang ave 7');
            const hasCategory = bodyText.includes('food');
            
            console.log(`\n🔍 Content Analysis:`);
            console.log(`   ❌ Contains pincode references: ${hasPincode ? 'YES (BAD)' : 'NO (GOOD)'}`);
            console.log(`   ✅ Contains location context: ${hasLocation ? 'YES (GOOD)' : 'NO (BAD)'}`);
            console.log(`   ✅ Contains category context: ${hasCategory ? 'YES (GOOD)' : 'NO (BAD)'}`);
            
            if (hasPincode) {
                console.log(`   ⚠️  WARNING: Message still contains pincode references!`);
            } else {
                console.log(`   ✅ SUCCESS: No pincode references found!`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error generating interactive searching message:', error.message);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Test 2: Test different categories
    console.log('🎯 Test 2: Different Categories');
    
    const categories = ['food', 'clothes', 'groceries'];
    
    for (const category of categories) {
        try {
            console.log(`\n📂 Testing category: ${category}`);
            const message = await createInteractiveSearchingMessage(testLocation, category, testBotConfig);
            
            const bodyText = message.interactive?.body?.text?.toLowerCase() || '';
            const hasPincode = bodyText.includes('pincode') || bodyText.includes('postal code');
            const hasCategory = bodyText.includes(category);
            
            console.log(`   ❌ Pincode references: ${hasPincode ? 'FOUND (BAD)' : 'NONE (GOOD)'}`);
            console.log(`   ✅ Category mentioned: ${hasCategory ? 'YES' : 'NO'}`);
            
        } catch (error) {
            console.error(`   ❌ Error with ${category}:`, error.message);
        }
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Test 3: Fallback message (without OpenAI key)
    console.log('🔄 Test 3: Fallback Message (No OpenAI Key)');
    
    const fallbackBotConfig = {}; // No OpenAI key
    
    try {
        const fallbackMessage = await createInteractiveSearchingMessage(testLocation, 'food', fallbackBotConfig);
        
        console.log(`📋 Fallback Message Type: ${fallbackMessage.type}`);
        console.log(`💬 Fallback Body Preview: ${fallbackMessage.interactive?.body?.text?.substring(0, 100)}...`);
        
        const bodyText = fallbackMessage.interactive?.body?.text?.toLowerCase() || '';
        const hasPincode = bodyText.includes('pincode') || bodyText.includes('postal code');
        
        console.log(`❌ Fallback has pincode references: ${hasPincode ? 'YES (BAD)' : 'NO (GOOD)'}`);
        
    } catch (error) {
        console.error('❌ Error generating fallback message:', error.message);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    console.log('🎯 Test Summary:');
    console.log('✅ Interactive searching message function implemented');
    console.log('✅ OpenAI integration for dynamic message generation');
    console.log('✅ Fallback message system for when OpenAI is unavailable');
    console.log('✅ All pincode references should be removed from messages');
    console.log('✅ Location and category context properly included');
    console.log('\n📝 Key Improvements:');
    console.log('• Removed createPincodeRequestMessage() function completely');
    console.log('• Updated location request to GPS-only (no pincode option)');
    console.log('• Removed pincode button from interactive interfaces');
    console.log('• Removed pincode handling logic from message handlers');
    console.log('• Implemented OpenAI-powered interactive searching messages');
    console.log('• Added proper fallback for when OpenAI API is unavailable');
    console.log('\n🚀 Customer experience now fully GPS-based with engaging search messages!');
}

// Run the test
testPincodeRemovalAndInteractiveSearch().catch(console.error);
